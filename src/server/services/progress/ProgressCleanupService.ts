/**
 * Progress Cleanup Service
 * 
 * Provides cleanup functionality for job_progress collection to prevent database bloat.
 * Removes old completed/failed progress records and optionally truncates events arrays.
 */

import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { handleDatabaseOperation } from '../../utils/databaseErrorHandler.js';
import type { AnyBulkWriteOperation } from 'mongodb';
import type { ProgressDocument, JobProgressStatus } from '../../types/progress.js';

const PROGRESS_COLLECTION = 'job_progress';
const DEFAULT_RETENTION_DAYS = 30; // Keep completed/failed progress for 30 days
const MAX_EVENTS_TO_KEEP = 10; // Keep last N events when truncating
// Safety limit: maximum number of records to delete in a single cleanup operation
// This prevents accidental mass deletions
// Can be overridden via environment variable PROGRESS_CLEANUP_MAX_DELETION_LIMIT
const MAX_DELETION_LIMIT = parseInt(
  process.env.PROGRESS_CLEANUP_MAX_DELETION_LIMIT || '1000000',
  10
);
const WARNING_THRESHOLD = MAX_DELETION_LIMIT * 0.8; // Warn at 80% of limit

/**
 * Service for cleaning up old progress records
 */
export class ProgressCleanupService {
  /**
   * Clean up old completed/failed progress records
   * 
   * @param retentionDays - Number of days to retain completed/failed records (default: 30)
   * @param truncateEvents - Whether to truncate events array in old documents instead of deleting (default: false)
   * @returns Statistics about the cleanup operation
   */
  async cleanupOldProgress(
    retentionDays: number = DEFAULT_RETENTION_DAYS,
    truncateEvents: boolean = false
  ): Promise<{
    deletedCount: number;
    truncatedCount: number;
    cutoffDate: Date;
    retentionDays: number;
    activePreserved: number;
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
      const collection = db.collection<ProgressDocument>(PROGRESS_COLLECTION);

      // Find old completed/failed records
      const oldRecordsQuery = {
        status: { $in: ['completed', 'failed', 'cancelled'] as JobProgressStatus[] },
        $or: [
          { completedAt: { $lt: cutoffDate } },
          { updatedAt: { $lt: cutoffDate } },
        ],
      };

      // Count records to be processed
      const countToProcess = await collection.countDocuments(oldRecordsQuery);

      // Warning if approaching safety limit
      if (countToProcess > WARNING_THRESHOLD && countToProcess <= MAX_DELETION_LIMIT) {
        logger.warn(
          {
            countToProcess,
            maxLimit: MAX_DELETION_LIMIT,
            percentage: ((countToProcess / MAX_DELETION_LIMIT) * 100).toFixed(1),
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
          },
          'Large cleanup operation detected - approaching safety limit'
        );
      }

      // Safety check: prevent accidental mass deletion
      if (countToProcess > MAX_DELETION_LIMIT) {
        const errorMessage = `Safety limit exceeded: ${countToProcess.toLocaleString()} records would be deleted (limit: ${MAX_DELETION_LIMIT.toLocaleString()}). This may indicate a configuration error. Consider adjusting retention period or running cleanup more frequently.`;
        logger.error(
          {
            countToProcess,
            maxLimit: MAX_DELETION_LIMIT,
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
          },
          errorMessage
        );
        throw new Error(errorMessage);
      }

      // Count active records that will be preserved
      const activeCount = await collection.countDocuments({
        status: { $in: ['queued', 'active', 'paused'] as JobProgressStatus[] },
      });

      if (countToProcess === 0) {
        logger.debug(
          {
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
            activePreserved: activeCount,
          },
          'No old progress records to clean up'
        );
        return {
          deletedCount: 0,
          truncatedCount: 0,
          cutoffDate,
          retentionDays,
          activePreserved: activeCount,
        };
      }

      let deletedCount = 0;
      let truncatedCount = 0;

      if (truncateEvents) {
        // Truncate events array in old documents instead of deleting
        // Process in batches using keyset pagination (sort by _id) to safely iterate
        // while modifying records, avoiding "processing same record twice" issues
        // caused by records still matching the query after update.
        const BATCH_SIZE = 1000;
        let lastId: any = null;
        let hasMore = true;

        while (hasMore) {
          // Fetch a batch of records that need processing
          const query = lastId
            ? { ...oldRecordsQuery, _id: { $gt: lastId } }
            : oldRecordsQuery;

          const batch = await collection
            .find(query)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .toArray();

          if (batch.length === 0) {
            hasMore = false;
            break;
          }

          // Update lastId for next iteration
          lastId = batch[batch.length - 1]._id;

          const bulkOperations: AnyBulkWriteOperation<ProgressDocument>[] = [];

          for (const record of batch) {
            if (record.events && record.events.length > MAX_EVENTS_TO_KEEP) {
              // Keep only the last N events
              const truncatedEvents = record.events.slice(-MAX_EVENTS_TO_KEEP);

              bulkOperations.push({
                updateOne: {
                  filter: { _id: record._id },
                  update: {
                    $set: {
                      events: truncatedEvents,
                      updatedAt: new Date(),
                    },
                  },
                },
              });

              truncatedCount++;
            } else {
              // If events array is small or doesn't exist, delete the record
              bulkOperations.push({
                deleteOne: {
                  filter: { _id: record._id },
                },
              });
              deletedCount++;
            }
          }

          if (bulkOperations.length > 0) {
            await collection.bulkWrite(bulkOperations);
          }

          // If we fetched fewer than batch size, we are done
          if (batch.length < BATCH_SIZE) {
            hasMore = false;
          }
        }
      } else {
        // Delete old records in batches to avoid memory issues and timeouts with large datasets
        const BATCH_SIZE = 1000;
        let hasMore = true;

        while (hasMore) {
          // Find a batch of IDs to delete (with retry for transient errors)
          const batchIds = await handleDatabaseOperation(
            async () => {
              return await collection
                .find(oldRecordsQuery, { projection: { _id: 1 } })
                .limit(BATCH_SIZE)
                .map(doc => doc._id)
                .toArray();
            },
            'ProgressCleanupService.findBatchIds',
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
            'ProgressCleanupService.deleteBatch',
            { maxRetries: 2, retryDelay: 1000 }
          );
          deletedCount += batchDeleted;

          // Log progress for large cleanups
          if (deletedCount > 0 && deletedCount % 5000 === 0) {
            logger.info(
              { deletedCount, cutoffDate: cutoffDate.toISOString() },
              'Progress cleanup: deleted records so far'
            );
          }

          // If we got fewer than requested, we're done
          if (batchIds.length < BATCH_SIZE) {
            hasMore = false;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        {
          deletedCount,
          truncatedCount,
          cutoffDate: cutoffDate.toISOString(),
          retentionDays,
          activePreserved: activeCount,
          durationMs: duration,
        },
        'Cleaned up old progress records'
      );

      return {
        deletedCount,
        truncatedCount,
        cutoffDate,
        retentionDays,
        activePreserved: activeCount,
      };
    } catch (error) {
      logger.error(
        { error, retentionDays, cutoffDate: cutoffDate.toISOString() },
        'Failed to cleanup old progress records'
      );
      throw error;
    }
  }

  /**
   * Ensure TTL index exists for automatic cleanup
   * 
   * Creates a TTL index on completedAt field for automatic deletion of old records.
   * Note: TTL indexes only work on date fields, so we use completedAt when available,
   * otherwise fall back to updatedAt.
   * 
   * @param expireAfterSeconds - Number of seconds after which documents expire (default: 30 days)
   * @returns Whether the index was created or already exists
   */
  async ensureTTLIndex(expireAfterSeconds: number = DEFAULT_RETENTION_DAYS * 24 * 60 * 60): Promise<{
    indexCreated: boolean;
    indexName: string;
  }> {
    try {
      const db = getDB();
      const collection = db.collection<ProgressDocument>(PROGRESS_COLLECTION);

      // Try to create TTL index on completedAt first (more accurate)
      const completedAtIndexName = 'completedAt_1_ttl';
      const indexes = await collection.indexes();
      const completedAtIndexExists = indexes.some((idx) => idx.name === completedAtIndexName);

      if (!completedAtIndexExists) {
        // Create TTL index on completedAt, but only for completed/failed records
        // Since MongoDB TTL doesn't support conditional indexes directly,
        // we'll create a partial index that only applies to completed/failed records
        await collection.createIndex(
          { completedAt: 1 },
          {
            name: completedAtIndexName,
            expireAfterSeconds,
            partialFilterExpression: {
              status: { $in: ['completed', 'failed', 'cancelled'] },
              completedAt: { $exists: true },
            },
          }
        );
        logger.info(
          { indexName: completedAtIndexName, expireAfterSeconds },
          'Created TTL index on job_progress.completedAt'
        );
        return { indexCreated: true, indexName: completedAtIndexName };
      }

      // Also ensure updatedAt index exists for efficient queries
      const updatedAtIndexName = 'updatedAt_1';
      const updatedAtIndexExists = indexes.some((idx) => idx.name === updatedAtIndexName);

      if (!updatedAtIndexExists) {
        await collection.createIndex({ updatedAt: 1 }, { name: updatedAtIndexName });
        logger.info({ indexName: updatedAtIndexName }, 'Created index on job_progress.updatedAt');
      }

      logger.debug({ indexName: completedAtIndexName }, 'TTL index on job_progress.completedAt already exists');
      return { indexCreated: false, indexName: completedAtIndexName };
    } catch (error) {
      logger.error({ error }, 'Failed to ensure TTL index on job_progress collection');
      throw error;
    }
  }

  /**
   * Get statistics about progress collection
   */
  async getStatistics(): Promise<{
    totalRecords: number;
    completedRecords: number;
    failedRecords: number;
    cancelledRecords: number;
    activeRecords: number;
    oldCompletedRecords: number; // Older than retention period
    oldFailedRecords: number; // Older than retention period
    recordsWithManyEvents: number; // Records with > MAX_EVENTS_TO_KEEP events
    estimatedSizeMB: number;
    averageEventsPerRecord: number;
  }> {
    try {
      const db = getDB();
      const collection = db.collection<ProgressDocument>(PROGRESS_COLLECTION);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_RETENTION_DAYS);

      const [
        totalRecords,
        completedRecords,
        failedRecords,
        cancelledRecords,
        activeRecords,
        oldCompletedRecords,
        oldFailedRecords,
        collStats,
        recordsWithManyEvents,
        totalEvents,
      ] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ status: 'completed' }),
        collection.countDocuments({ status: 'failed' }),
        collection.countDocuments({ status: 'cancelled' }),
        collection.countDocuments({
          status: { $in: ['queued', 'active', 'paused'] },
        }),
        collection.countDocuments({
          status: 'completed',
          $or: [
            { completedAt: { $lt: cutoffDate } },
            { updatedAt: { $lt: cutoffDate } },
          ],
        }),
        collection.countDocuments({
          status: 'failed',
          $or: [
            { completedAt: { $lt: cutoffDate } },
            { updatedAt: { $lt: cutoffDate } },
          ],
        }),
        db.command({ collStats: PROGRESS_COLLECTION }),
        collection.countDocuments({
          $expr: { $gt: [{ $size: { $ifNull: ['$events', []] } }, MAX_EVENTS_TO_KEEP] },
        }),
        collection
          .aggregate([
            {
              $project: {
                eventCount: { $size: { $ifNull: ['$events', []] } },
              },
            },
            {
              $group: {
                _id: null,
                totalEvents: { $sum: '$eventCount' },
              },
            },
          ])
          .toArray(),
      ]);

      const estimatedSizeMB = ((collStats.size as number) || 0) / 1024 / 1024;
      const totalEventsCount = totalEvents[0]?.totalEvents || 0;
      const averageEventsPerRecord = totalRecords > 0 ? totalEventsCount / totalRecords : 0;

      return {
        totalRecords,
        completedRecords,
        failedRecords,
        cancelledRecords,
        activeRecords,
        oldCompletedRecords,
        oldFailedRecords,
        recordsWithManyEvents,
        estimatedSizeMB,
        averageEventsPerRecord,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get progress statistics');
      throw error;
    }
  }
}

// Singleton instance
let progressCleanupServiceInstance: ProgressCleanupService | null = null;

/**
 * Get the singleton instance of ProgressCleanupService
 */
export function getProgressCleanupService(): ProgressCleanupService {
  if (!progressCleanupServiceInstance) {
    progressCleanupServiceInstance = new ProgressCleanupService();
  }
  return progressCleanupServiceInstance;
}
