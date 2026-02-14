/**
 * Scraping Progress Cleanup Service
 * 
 * Provides cleanup functionality for scraping_progress collection to prevent database bloat.
 * Removes old completed/failed scraping progress records based on retention policy.
 */

import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { handleDatabaseOperation } from '../../utils/databaseErrorHandler.js';
import { ScrapingProgress } from './ScrapingRecoveryService.js';

const SCRAPING_PROGRESS_COLLECTION = 'scraping_progress';
const DEFAULT_RETENTION_DAYS = 7; // Keep completed/failed progress for 7 days
// Safety limit: maximum number of records to delete in a single cleanup operation
// This prevents accidental mass deletions
// Can be overridden via environment variable SCRAPING_CLEANUP_MAX_DELETION_LIMIT
const MAX_DELETION_LIMIT = parseInt(
  process.env.SCRAPING_CLEANUP_MAX_DELETION_LIMIT || '1000000',
  10
);
const WARNING_THRESHOLD = MAX_DELETION_LIMIT * 0.8; // Warn at 80% of limit

/**
 * Service for cleaning up old scraping progress records
 */
export class ScrapingProgressCleanupService {
  /**
   * Clean up old completed/failed scraping progress records
   * 
   * @param retentionDays - Number of days to retain completed/failed records (default: 7)
   * @returns Statistics about the cleanup operation
   * @throws Error if retentionDays is invalid (negative or too large)
   */
  async cleanupOldProgress(retentionDays: number = DEFAULT_RETENTION_DAYS): Promise<{
    deletedCount: number;
    cutoffDate: Date;
    retentionDays: number;
    inProgressPreserved: number;
  }> {
    // Validate retention days
    if (retentionDays < 0) {
      throw new Error(`Invalid retentionDays: ${retentionDays}. Must be >= 0`);
    }
    if (retentionDays > 365) {
      logger.warn(
        { retentionDays },
        'Retention period exceeds 1 year - this may be unintentional'
      );
    }

    const startTime = Date.now();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      // Count records to be deleted (for logging and safety check)
      const countToDelete = await collection.countDocuments({
        status: { $in: ['completed', 'failed'] },
        updatedAt: { $lt: cutoffDate },
      });

      // Warning if approaching safety limit
      if (countToDelete > WARNING_THRESHOLD && countToDelete <= MAX_DELETION_LIMIT) {
        logger.warn(
          {
            countToDelete,
            maxLimit: MAX_DELETION_LIMIT,
            percentage: ((countToDelete / MAX_DELETION_LIMIT) * 100).toFixed(1),
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
          },
          'Large cleanup operation detected - approaching safety limit'
        );
      }

      // Safety check: prevent accidental mass deletion
      if (countToDelete > MAX_DELETION_LIMIT) {
        const errorMessage = `Safety limit exceeded: ${countToDelete.toLocaleString()} records would be deleted (limit: ${MAX_DELETION_LIMIT.toLocaleString()}). This may indicate a configuration error. Consider adjusting retention period or running cleanup more frequently.`;
        logger.error(
          {
            countToDelete,
            maxLimit: MAX_DELETION_LIMIT,
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
          },
          errorMessage
        );
        throw new Error(errorMessage);
      }

      // Count in-progress records that will be preserved
      const inProgressCount = await collection.countDocuments({
        status: 'in_progress',
      });

      if (countToDelete === 0) {
        logger.debug(
          {
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
            inProgressPreserved: inProgressCount,
          },
          'No old scraping progress records to clean up'
        );
        return {
          deletedCount: 0,
          cutoffDate,
          retentionDays,
          inProgressPreserved: inProgressCount,
        };
      }

      // Delete old completed/failed records in batches to avoid memory issues and timeouts with large datasets
      // Use cursor-based approach to process in batches of 1000
      const BATCH_SIZE = 1000;
      let deletedCount = 0;
      let hasMore = true;

      while (hasMore) {
        // Find a batch of IDs to delete (with retry for transient errors)
        const batchIds = await handleDatabaseOperation(
          async () => {
            return await collection
              .find(
                {
                  status: { $in: ['completed', 'failed'] },
                  updatedAt: { $lt: cutoffDate },
                },
                { projection: { _id: 1 } }
              )
              .limit(BATCH_SIZE)
              .map(doc => doc._id)
              .toArray();
          },
          'ScrapingProgressCleanupService.findBatchIds',
          { maxRetries: 2, retryDelay: 1000 }
        );

        if (batchIds.length === 0) {
          hasMore = false;
          break;
        }

        // Delete this batch (with retry for transient errors)
        const batchDeleted = await handleDatabaseOperation(
          async () => {
            const batchResult = await collection.deleteMany({
              _id: { $in: batchIds },
            });
            return batchResult.deletedCount || 0;
          },
          'ScrapingProgressCleanupService.deleteBatch',
          { maxRetries: 2, retryDelay: 1000 }
        );
        deletedCount += batchDeleted;

        // Log progress for large cleanups
        if (deletedCount > 0 && deletedCount % 5000 === 0) {
          logger.info(
            { deletedCount, cutoffDate: cutoffDate.toISOString() },
            'Cleanup progress: deleted records so far'
          );
        }

        // If we got fewer than requested, we're done
        if (batchIds.length < BATCH_SIZE) {
          hasMore = false;
        }
      }
      const duration = Date.now() - startTime;

      logger.info(
        {
          deletedCount,
          cutoffDate: cutoffDate.toISOString(),
          retentionDays,
          inProgressPreserved: inProgressCount,
          durationMs: duration,
        },
        'Cleaned up old scraping progress records'
      );

      return {
        deletedCount,
        cutoffDate,
        retentionDays,
        inProgressPreserved: inProgressCount,
      };
    } catch (error) {
      logger.error(
        { error, retentionDays, cutoffDate: cutoffDate.toISOString() },
        'Failed to cleanup old scraping progress records'
      );
      throw error;
    }
  }

  /**
   * Ensure TTL index exists for automatic cleanup
   * 
   * Note: MongoDB TTL indexes work on date fields and automatically delete documents
   * after the expiration time. However, we need a conditional TTL that only applies
   * to completed/failed records. Since MongoDB doesn't support conditional TTL directly,
   * we'll use a scheduled cleanup job instead, but still create a regular index for performance.
   * 
   * @returns Whether the index was created or already exists
   */
  async ensureIndexes(): Promise<{ indexCreated: boolean; indexName: string }> {
    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      // Create index on updatedAt for efficient cleanup queries
      const indexName = 'updatedAt_1';
      const indexes = await collection.indexes();
      const indexExists = indexes.some((idx) => idx.name === indexName);

      if (!indexExists) {
        await collection.createIndex({ updatedAt: 1 }, { name: indexName });
        logger.info({ indexName }, 'Created index on scraping_progress.updatedAt');
        return { indexCreated: true, indexName };
      }

      logger.debug({ indexName }, 'Index on scraping_progress.updatedAt already exists');
      return { indexCreated: false, indexName };
    } catch (error) {
      logger.error({ error }, 'Failed to ensure indexes on scraping_progress collection');
      throw error;
    }
  }

  /**
   * Get statistics about scraping progress collection
   */
  async getStatistics(): Promise<{
    totalRecords: number;
    completedRecords: number;
    failedRecords: number;
    inProgressRecords: number;
    oldCompletedRecords: number; // Older than retention period
    oldFailedRecords: number; // Older than retention period
    estimatedSizeMB: number;
  }> {
    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_RETENTION_DAYS);

      const [
        totalRecords,
        completedRecords,
        failedRecords,
        inProgressRecords,
        oldCompletedRecords,
        oldFailedRecords,
        collStats,
      ] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ status: 'completed' }),
        collection.countDocuments({ status: 'failed' }),
        collection.countDocuments({ status: 'in_progress' }),
        collection.countDocuments({
          status: 'completed',
          updatedAt: { $lt: cutoffDate },
        }),
        collection.countDocuments({
          status: 'failed',
          updatedAt: { $lt: cutoffDate },
        }),
        db.command({ collStats: SCRAPING_PROGRESS_COLLECTION }),
      ]);

      const estimatedSizeMB = ((collStats.size as number) || 0) / 1024 / 1024;

      return {
        totalRecords,
        completedRecords,
        failedRecords,
        inProgressRecords,
        oldCompletedRecords,
        oldFailedRecords,
        estimatedSizeMB,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get scraping progress statistics');
      throw error;
    }
  }
}

// Singleton instance
let scrapingProgressCleanupServiceInstance: ScrapingProgressCleanupService | null = null;

/**
 * Get the singleton instance of ScrapingProgressCleanupService
 */
export function getScrapingProgressCleanupService(): ScrapingProgressCleanupService {
  if (!scrapingProgressCleanupServiceInstance) {
    scrapingProgressCleanupServiceInstance = new ScrapingProgressCleanupService();
  }
  return scrapingProgressCleanupServiceInstance;
}
