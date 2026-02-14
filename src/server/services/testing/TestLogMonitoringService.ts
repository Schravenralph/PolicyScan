import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { TestLogDocument } from '../../models/TestLog.js';

const COLLECTION_NAME = 'test_logs';

/**
 * Test Log Monitoring Service
 * 
 * Provides monitoring and verification capabilities for test log collection:
 * - Collection size statistics
 * - TTL index verification
 * - Size threshold checking
 */
export class TestLogMonitoringService {
  private static instance: TestLogMonitoringService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): TestLogMonitoringService {
    if (!TestLogMonitoringService.instance) {
      TestLogMonitoringService.instance = new TestLogMonitoringService();
    }
    return TestLogMonitoringService.instance;
  }

  /**
   * Get test logs collection statistics
   */
  async getCollectionStats(): Promise<{
    totalLogs: number;
    totalSize: number; // bytes
    oldestLog: Date | null;
    newestLog: Date | null;
    logsOlderThan30Days: number;
  }> {
    const db = getDB();
    const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      const [stats, oldLogsCount] = await Promise.all([
        collection
          .aggregate([
            {
              $group: {
                _id: null,
                totalLogs: { $sum: 1 },
                oldestLog: { $min: '$createdAt' },
                newestLog: { $max: '$createdAt' },
              },
            },
          ])
          .toArray(),
        collection.countDocuments({ createdAt: { $lt: thirtyDaysAgo } }),
      ]);

      const statsResult = stats[0] || {
        totalLogs: 0,
        oldestLog: null,
        newestLog: null,
      };

      // Calculate total size using database command
      const db = collection.db;
      const collectionStats = await db.command({ collStats: collection.collectionName });
      const totalSize = (collectionStats.size as number) || 0;

      return {
        totalLogs: statsResult.totalLogs,
        totalSize,
        oldestLog: statsResult.oldestLog,
        newestLog: statsResult.newestLog,
        logsOlderThan30Days: oldLogsCount,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get test logs collection statistics');
      throw error;
    }
  }

  /**
   * Verify TTL index is working correctly
   */
  async verifyTTL(): Promise<{
    ttlIndexExists: boolean;
    logsOlderThan30Days: number;
    isWorking: boolean;
    message: string;
  }> {
    const db = getDB();
    const collection = db.collection<TestLogDocument>(COLLECTION_NAME);

    try {
      // Check if TTL index exists
      const indexes = await collection.indexes();
      const ttlIndex = indexes.find((idx) => idx.name === 'ttl_expiresAt');
      const ttlIndexExists = !!ttlIndex;

      // Check for logs older than 30 days (should be 0 if TTL is working)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const oldLogsCount = await collection.countDocuments({
        createdAt: { $lt: thirtyDaysAgo },
      });

      const isWorking = ttlIndexExists && oldLogsCount === 0;

      let message = '';
      if (!ttlIndexExists) {
        message =
          'TTL index does not exist - logs will not be automatically deleted';
      } else if (oldLogsCount > 0) {
        message = `TTL index exists but ${oldLogsCount} logs older than 30 days found - TTL may not be working correctly`;
      } else {
        message =
          'TTL index is working correctly - no logs older than 30 days';
      }

      return {
        ttlIndexExists,
        logsOlderThan30Days: oldLogsCount,
        isWorking,
        message,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to verify TTL index');
      throw error;
    }
  }

  /**
   * Check if collection size exceeds threshold
   */
  async checkSizeThreshold(thresholdMB: number = 50): Promise<{
    exceedsThreshold: boolean;
    currentSizeMB: number;
    thresholdMB: number;
    message: string;
  }> {
    try {
      const stats = await this.getCollectionStats();
      const currentSizeMB = stats.totalSize / (1024 * 1024);
      const exceedsThreshold = currentSizeMB > thresholdMB;

      let message = '';
      if (exceedsThreshold) {
        message = `Collection size (${currentSizeMB.toFixed(2)}MB) exceeds threshold (${thresholdMB}MB) - investigate TTL or increase threshold`;
      } else {
        message = `Collection size (${currentSizeMB.toFixed(2)}MB) is within threshold (${thresholdMB}MB)`;
      }

      return {
        exceedsThreshold,
        currentSizeMB,
        thresholdMB,
        message,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to check collection size threshold');
      throw error;
    }
  }
}

/**
 * Get the singleton instance of TestLogMonitoringService
 */
export function getTestLogMonitoringService(): TestLogMonitoringService {
  return TestLogMonitoringService.getInstance();
}

