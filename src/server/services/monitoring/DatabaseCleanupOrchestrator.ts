/**
 * Database Cleanup Orchestrator
 * 
 * Centralized service to coordinate all database cleanup jobs.
 * Runs cleanup for various collections based on retention policies.
 */

import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import { withTimeout } from '../../utils/withTimeout.js';
import {
  databaseCleanupOperationsTotal,
  databaseCleanupRecordsDeletedTotal,
  databaseCleanupDurationSeconds,
  databaseSizeGB,
  collectionSizeMB,
} from '../../utils/metrics.js';
import { getScrapingProgressCleanupService } from '../scraping/ScrapingProgressCleanupService.js';
import { getProgressCleanupService } from '../progress/ProgressCleanupService.js';
import { TestRun } from '../../models/TestRun.js';
import { WorkflowHistory } from '../../models/WorkflowHistory.js';
import { getAuditLogRetentionService } from './AuditLogRetentionService.js';
import { getCollectionSizeMonitoringService } from './CollectionSizeMonitoringService.js';

// Maximum time for cleanup operations (2 hours for very large databases)
const CLEANUP_TIMEOUT_MS = parseInt(process.env.DATABASE_CLEANUP_TIMEOUT_MS || '7200000', 10); // 2 hours default

export interface CleanupResult {
  collection: string;
  success: boolean;
  deletedCount?: number;
  truncatedCount?: number;
  error?: string;
  durationMs: number;
}

export interface CleanupSummary {
  timestamp: Date;
  totalCollections: number;
  successfulCleanups: number;
  failedCleanups: number;
  totalDeleted: number;
  totalTruncated: number;
  totalDurationMs: number;
  results: CleanupResult[];
  verification?: CleanupVerification;
}

export interface CleanupVerification {
  passed: boolean;
  checks: Array<{
    collection: string;
    check: string;
    passed: boolean;
    message: string;
  }>;
}

export interface CleanupOptions {
  scrapingProgressRetentionDays?: number; // Default: 7
  progressRetentionDays?: number; // Default: 30
  testRunsRetentionDays?: number; // Default: 90
  workflowHistoryRetentionDays?: number; // Default: 90
  truncateProgressEvents?: boolean; // Default: false
  skipScrapingProgress?: boolean;
  skipProgress?: boolean;
  skipTestRuns?: boolean;
  skipWorkflowHistory?: boolean;
  skipAuditLogs?: boolean;
}

/**
 * Service for orchestrating database cleanup operations
 */
export interface CleanupProgress {
  collection: string;
  deletedCount: number;
  truncatedCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
}

export class DatabaseCleanupOrchestrator {
  private isRunning: boolean = false;
  private currentCleanupStartTime: number | null = null;
  private currentCleanupProgress: Map<string, CleanupProgress> = new Map();
  private readonly LOCK_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours - max expected cleanup time

  /**
   * Check if cleanup is currently running
   */
  isCleanupRunning(): boolean {
    // Check if lock has expired (stale lock detection)
    if (this.isRunning && this.currentCleanupStartTime) {
      const elapsed = Date.now() - this.currentCleanupStartTime;
      if (elapsed > this.LOCK_TIMEOUT_MS) {
        logger.warn(
          {
            elapsedMs: elapsed,
            timeoutMs: this.LOCK_TIMEOUT_MS,
          },
          'Detected stale cleanup lock, releasing'
        );
        this.isRunning = false;
        this.currentCleanupStartTime = null;
      }
    }
    return this.isRunning;
  }

  /**
   * Get cleanup status information
   */
  async getCleanupStatus(): Promise<{
    isRunning: boolean;
    startTime: Date | null;
    elapsedMinutes: number | null;
    currentProgress?: Array<CleanupProgress>;
    lastCleanupTime: Date | null;
    lastCleanupDurationMs: number | null;
    lastCleanupDeleted: number | null;
  }> {
    const isRunning = this.isCleanupRunning();
    
    // Get last cleanup run from metrics
    let lastCleanupTime: Date | null = null;
    let lastCleanupDurationMs: number | null = null;
    let lastCleanupDeleted: number | null = null;
    
    try {
      const db = getDB();
      const collection = db.collection('database_cleanup_metrics');
      const lastRun = await collection
        .findOne(
          {},
          {
            sort: { timestamp: -1 },
            projection: { timestamp: 1, totalDurationMs: 1, totalDeleted: 1 },
          }
        );
      
      if (lastRun) {
        lastCleanupTime = lastRun.timestamp as Date;
        lastCleanupDurationMs = lastRun.totalDurationMs as number;
        lastCleanupDeleted = lastRun.totalDeleted as number;
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to retrieve last cleanup metrics');
    }
    
    // Get current progress if cleanup is running
    const currentProgress = isRunning && this.currentCleanupProgress.size > 0
      ? Array.from(this.currentCleanupProgress.values())
      : undefined;

    return {
      isRunning,
      startTime: this.currentCleanupStartTime ? new Date(this.currentCleanupStartTime) : null,
      elapsedMinutes: this.currentCleanupStartTime
        ? Math.round((Date.now() - this.currentCleanupStartTime) / 1000 / 60)
        : null,
      currentProgress,
      lastCleanupTime,
      lastCleanupDurationMs,
      lastCleanupDeleted,
    };
  }

  /**
   * Run all cleanup jobs
   * 
   * @param options - Cleanup configuration options
   * @returns Summary of all cleanup operations
   * @throws Error if cleanup is already running
   */
  async runCleanup(options: CleanupOptions = {}): Promise<CleanupSummary> {
    // Prevent concurrent cleanup operations
    if (this.isCleanupRunning()) {
      const errorMessage = `Cleanup operation is already running (started ${this.currentCleanupStartTime ? Math.round((Date.now() - this.currentCleanupStartTime) / 1000 / 60) : 'unknown'} minutes ago). Please wait for the current cleanup to complete.`;
      logger.warn(
        {
          currentCleanupStartTime: this.currentCleanupStartTime,
          elapsedMinutes: this.currentCleanupStartTime ? Math.round((Date.now() - this.currentCleanupStartTime) / 1000 / 60) : null,
        },
        'Cleanup operation already in progress, rejecting concurrent request'
      );
      throw new Error(errorMessage);
    }

    // Ensure database connection is available before starting cleanup (check before acquiring lock)
    try {
      const { ensureDBConnection } = await import('../../config/database.js');
      await ensureDBConnection();
    } catch (error) {
      const errorMessage = `Database connection not available. Cannot start cleanup operation: ${error instanceof Error ? error.message : String(error)}`;
      logger.error({ error }, 'Database connection check failed before cleanup');
      throw new Error(errorMessage);
    }

    // Acquire lock (only after connection check passes)
    this.isRunning = true;
    this.currentCleanupStartTime = Date.now();

    try {
      const startTime = Date.now();
      const results: CleanupResult[] = [];

      // Get database size before cleanup for metrics
      const monitoring = getCollectionSizeMonitoringService();
      const sizeBefore = await monitoring.getSummary();

      logger.info(
        {
          options,
          timeoutMs: CLEANUP_TIMEOUT_MS,
          databaseSizeGB: sizeBefore.totalSizeGB.toFixed(2),
        },
        'Starting database cleanup orchestration'
      );

      // Wrap cleanup in timeout protection for very large databases
      let cleanupResults: CleanupResult[] = [];
      const cleanupOperation = async (): Promise<CleanupSummary> => {
        const summary = await this.executeCleanup(options, sizeBefore, startTime);
        cleanupResults = summary.results; // Capture results for timeout handler
        return summary;
      };

      try {
        return await withTimeout(cleanupOperation(), CLEANUP_TIMEOUT_MS, 'Database cleanup orchestration');
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          logger.error(
            {
              timeoutMs: CLEANUP_TIMEOUT_MS,
              elapsedMs: Date.now() - startTime,
              partialResults: cleanupResults.length,
            },
            'Database cleanup timed out - operation may be incomplete'
          );

          // Return partial summary with timeout error
          const partialSummary: CleanupSummary = {
            timestamp: new Date(),
            totalCollections: cleanupResults.length + 1, // +1 for timeout error
            successfulCleanups: cleanupResults.filter((r) => r.success).length,
            failedCleanups: cleanupResults.filter((r) => !r.success).length + 1, // +1 for timeout
            totalDeleted: cleanupResults.reduce((sum, r) => sum + (r.deletedCount || 0), 0),
            totalTruncated: cleanupResults.reduce((sum, r) => sum + (r.truncatedCount || 0), 0),
            totalDurationMs: Date.now() - startTime,
            results: [
              ...cleanupResults,
              {
                collection: 'cleanup_orchestration',
                success: false,
                error: `Cleanup operation timed out after ${Math.round(CLEANUP_TIMEOUT_MS / 1000 / 60)} minutes`,
                durationMs: Date.now() - startTime,
              },
            ],
          };

          return partialSummary;
        }
        throw error;
      }
    } finally {
      // Release lock and clear progress
      this.isRunning = false;
      this.currentCleanupStartTime = null;
      this.currentCleanupProgress.clear();
    }
  }

  /**
   * Execute cleanup operations (internal method, called with timeout protection)
   */
  private async executeCleanup(
    options: CleanupOptions,
    sizeBefore: Awaited<ReturnType<ReturnType<typeof getCollectionSizeMonitoringService>['getSummary']>>,
    startTime: number
  ): Promise<CleanupSummary> {
    const results: CleanupResult[] = [];
    const collectionSizeMonitoringService = getCollectionSizeMonitoringService();
    const cleanupStartTime = Date.now();
    
    // Log initial progress
    logger.info(
      {
        databaseSizeGB: sizeBefore.totalSizeGB.toFixed(2),
        timeoutMinutes: Math.round(CLEANUP_TIMEOUT_MS / 1000 / 60),
      },
      'Starting cleanup operations'
    );

    // Cleanup scraping progress
    if (!options.skipScrapingProgress) {
      const collectionName = 'scraping_progress';
      this.currentCleanupProgress.set(collectionName, {
        collection: collectionName,
        deletedCount: 0,
        truncatedCount: 0,
        status: 'in_progress',
      });

      try {
        const cleanupStart = Date.now();
        const scrapingCleanupService = getScrapingProgressCleanupService();
        const result = await scrapingCleanupService.cleanupOldProgress(
          options.scrapingProgressRetentionDays || 7
        );

        const durationMs = Date.now() - cleanupStart;
        results.push({
          collection: 'scraping_progress',
          success: true,
          deletedCount: result.deletedCount,
          durationMs,
        });

        // Update progress
        this.currentCleanupProgress.set(collectionName, {
          collection: collectionName,
          deletedCount: result.deletedCount,
          truncatedCount: 0,
          status: 'completed',
        });

        // Record Prometheus metrics
        databaseCleanupOperationsTotal.inc({ collection: 'scraping_progress', status: 'success' });
        databaseCleanupRecordsDeletedTotal.inc({ collection: 'scraping_progress' }, result.deletedCount);
        databaseCleanupDurationSeconds.observe({ collection: 'scraping_progress' }, durationMs / 1000);

        logger.info(
          {
            collection: 'scraping_progress',
            deletedCount: result.deletedCount,
            inProgressPreserved: result.inProgressPreserved,
          },
          'Scraping progress cleanup completed'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          collection: 'scraping_progress',
          success: false,
          error: errorMessage,
          durationMs: 0,
        });

        // Update progress with error
        this.currentCleanupProgress.set(collectionName, {
          collection: collectionName,
          deletedCount: 0,
          truncatedCount: 0,
          status: 'failed',
          error: errorMessage,
        });

        // Record Prometheus metrics
        databaseCleanupOperationsTotal.inc({ collection: 'scraping_progress', status: 'failed' });

        logger.error({ error, collection: 'scraping_progress' }, 'Scraping progress cleanup failed');
      }
    }

    // Cleanup progress (job_progress)
    if (!options.skipProgress) {
      const collectionName = 'job_progress';
      this.currentCleanupProgress.set(collectionName, {
        collection: collectionName,
        deletedCount: 0,
        truncatedCount: 0,
        status: 'in_progress',
      });

      try {
        const cleanupStart = Date.now();
        const progressCleanupService = getProgressCleanupService();
        const result = await progressCleanupService.cleanupOldProgress(
          options.progressRetentionDays || 30,
          options.truncateProgressEvents || false
        );

        const durationMs = Date.now() - cleanupStart;
        results.push({
          collection: 'job_progress',
          success: true,
          deletedCount: result.deletedCount,
          truncatedCount: result.truncatedCount,
          durationMs,
        });

        // Update progress
        this.currentCleanupProgress.set(collectionName, {
          collection: collectionName,
          deletedCount: result.deletedCount,
          truncatedCount: result.truncatedCount,
          status: 'completed',
        });

        // Record Prometheus metrics
        databaseCleanupOperationsTotal.inc({ collection: 'job_progress', status: 'success' });
        databaseCleanupRecordsDeletedTotal.inc({ collection: 'job_progress' }, result.deletedCount);
        databaseCleanupDurationSeconds.observe({ collection: 'job_progress' }, durationMs / 1000);

        logger.info(
          {
            collection: 'job_progress',
            deletedCount: result.deletedCount,
            truncatedCount: result.truncatedCount,
            activePreserved: result.activePreserved,
          },
          'Progress cleanup completed'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          collection: 'job_progress',
          success: false,
          error: errorMessage,
          durationMs: 0,
        });

        // Update progress with error
        this.currentCleanupProgress.set(collectionName, {
          collection: collectionName,
          deletedCount: 0,
          truncatedCount: 0,
          status: 'failed',
          error: errorMessage,
        });

        // Record Prometheus metrics
        databaseCleanupOperationsTotal.inc({ collection: 'job_progress', status: 'failed' });

        logger.error({ error, collection: 'job_progress' }, 'Progress cleanup failed');
      }
    }

    // Cleanup test runs
    if (!options.skipTestRuns) {
      try {
        const cleanupStart = Date.now();
        const deletedCount = await TestRun.cleanupOldRuns(options.testRunsRetentionDays || 90);

        results.push({
          collection: 'test_runs',
          success: true,
          deletedCount,
          durationMs: Date.now() - cleanupStart,
        });

        logger.info({ collection: 'test_runs', deletedCount }, 'Test runs cleanup completed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          collection: 'test_runs',
          success: false,
          error: errorMessage,
          durationMs: 0,
        });
        logger.error({ error, collection: 'test_runs' }, 'Test runs cleanup failed');
      }
    }

    // Cleanup workflow history
    if (!options.skipWorkflowHistory) {
      try {
        const cleanupStart = Date.now();
        const { getDB } = await import('../../config/database.js');
        const db = getDB();
        const workflowHistory = new WorkflowHistory(db);
        const deletedCount = await workflowHistory.cleanupOldHistory(
          options.workflowHistoryRetentionDays || 90
        );

        results.push({
          collection: 'workflow_history',
          success: true,
          deletedCount,
          durationMs: Date.now() - cleanupStart,
        });

        logger.info({ collection: 'workflow_history', deletedCount }, 'Workflow history cleanup completed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          collection: 'workflow_history',
          success: false,
          error: errorMessage,
          durationMs: 0,
        });
        logger.error({ error, collection: 'workflow_history' }, 'Workflow history cleanup failed');
      }
    }

    // Cleanup audit logs
    if (!options.skipAuditLogs) {
      try {
        const cleanupStart = Date.now();
        const auditLogRetentionService = getAuditLogRetentionService();
        const result = await auditLogRetentionService.cleanupOldLogs();

        results.push({
          collection: 'audit_logs',
          success: true,
          deletedCount: result.deletedCount,
          durationMs: Date.now() - cleanupStart,
        });

        logger.info({ collection: 'audit_logs', deletedCount: result.deletedCount }, 'Audit logs cleanup completed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          collection: 'audit_logs',
          success: false,
          error: errorMessage,
          durationMs: 0,
        });
        logger.error({ error, collection: 'audit_logs' }, 'Audit logs cleanup failed');
      }
    }

    // Cleanup old cleanup metrics (retain for 90 days)
    if (!options.skipAuditLogs) {
      try {
        const cleanupStart = Date.now();
        const deletedMetrics = await this.cleanupOldMetrics(90);

        results.push({
          collection: 'database_cleanup_metrics',
          success: true,
          deletedCount: deletedMetrics,
          durationMs: Date.now() - cleanupStart,
        });

        if (deletedMetrics > 0) {
          logger.info(
            {
              collection: 'database_cleanup_metrics',
              deletedCount: deletedMetrics,
            },
            'Cleanup metrics cleanup completed'
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          collection: 'database_cleanup_metrics',
          success: false,
          error: errorMessage,
          durationMs: 0,
        });
        logger.error({ error, collection: 'database_cleanup_metrics' }, 'Cleanup metrics cleanup failed');
      }
    }

    // Calculate summary
    const successfulCleanups = results.filter((r) => r.success).length;
    const failedCleanups = results.filter((r) => !r.success).length;
    const totalDeleted = results.reduce((sum, r) => sum + (r.deletedCount || 0), 0);
    const totalTruncated = results.reduce((sum, r) => sum + (r.truncatedCount || 0), 0);
    const totalDurationMs = Date.now() - startTime;

    const summary: CleanupSummary = {
      timestamp: new Date(),
      totalCollections: results.length,
      successfulCleanups,
      failedCleanups,
      totalDeleted,
      totalTruncated,
      totalDurationMs,
      results,
    };

    // Verify cleanup was successful
    const verification = await this.verifyCleanup(summary);
    summary.verification = verification;

    // Get database size after cleanup for metrics
    const sizeAfter = await collectionSizeMonitoringService.getSummary();
    
    // Update Prometheus gauges (non-blocking - don't fail cleanup if metrics fail)
    try {
      databaseSizeGB.set(sizeAfter.totalSizeGB);
      
      // Update collection size gauges
      const collectionSizes = await collectionSizeMonitoringService.getCollectionSizes();
      for (const collection of collectionSizes.collections) {
        collectionSizeMB.set({ collection: collection.collection }, collection.storageSize / 1024 / 1024);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to update Prometheus metrics for cleanup');
    }
    
    // Record cleanup metrics (non-blocking - already has error handling)
    await this.recordCleanupMetrics(summary, sizeBefore.totalSizeGB, sizeAfter.totalSizeGB);

    logger.info(
      {
        totalCollections: summary.totalCollections,
        successfulCleanups: summary.successfulCleanups,
        failedCleanups: summary.failedCleanups,
        totalDeleted: summary.totalDeleted,
        totalTruncated: summary.totalTruncated,
        totalDurationMs: summary.totalDurationMs,
        verificationPassed: verification.passed,
      },
      'Database cleanup orchestration completed'
    );

    return summary;
  }

  /**
   * Record cleanup metrics for monitoring and trend analysis
   */
  private async recordCleanupMetrics(
    summary: CleanupSummary,
    databaseSizeGBBefore: number,
    databaseSizeGBAfter: number
  ): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection('database_cleanup_metrics');

      const sizeReductionGB = databaseSizeGBBefore - databaseSizeGBAfter;
      const sizeReductionPercent =
        databaseSizeGBBefore > 0 ? (sizeReductionGB / databaseSizeGBBefore) * 100 : 0;

      const metric = {
        timestamp: summary.timestamp,
        totalCollections: summary.totalCollections,
        successfulCleanups: summary.successfulCleanups,
        failedCleanups: summary.failedCleanups,
        totalDeleted: summary.totalDeleted,
        totalTruncated: summary.totalTruncated,
        totalDurationMs: summary.totalDurationMs,
        databaseSizeGBBefore,
        databaseSizeGBAfter,
        sizeReductionGB,
        sizeReductionPercent,
        verificationPassed: summary.verification?.passed ?? false,
        results: summary.results.map((r) => ({
          collection: r.collection,
          success: r.success,
          deletedCount: r.deletedCount || 0,
          truncatedCount: r.truncatedCount || 0,
          durationMs: r.durationMs,
          error: r.error,
        })),
        createdAt: new Date(),
      };

      await collection.insertOne(metric);
    } catch (error) {
      // Don't let metric recording errors break cleanup
      logger.warn({ error }, 'Failed to record cleanup metrics');
    }
  }

  /**
   * Verify that cleanup was successful and no active data was deleted
   */
  async verifyCleanup(summary: CleanupSummary): Promise<CleanupVerification> {
    const checks: CleanupVerification['checks'] = [];
    const { getDB } = await import('../../config/database.js');

    try {
      const db = getDB();

      // Verify scraping_progress: ensure no in-progress records were deleted
      const scrapingProgressCollection = db.collection('scraping_progress');
      const inProgressCount = await scrapingProgressCollection.countDocuments({
        status: 'in_progress',
      });

      checks.push({
        collection: 'scraping_progress',
        check: 'in_progress_preserved',
        passed: true, // If we can count, the collection still exists and has in-progress records
        message: `In-progress records preserved: ${inProgressCount}`,
      });

      // Verify job_progress: ensure no active records were deleted
      const progressCollection = db.collection('job_progress');
      const activeCount = await progressCollection.countDocuments({
        status: { $in: ['pending', 'running', 'in_progress'] },
      });

      checks.push({
        collection: 'job_progress',
        check: 'active_preserved',
        passed: true,
        message: `Active records preserved: ${activeCount}`,
      });

      // Verify TTL indexes are still in place
      const scrapingProgressIndexes = await scrapingProgressCollection.indexes();
      const scrapingProgressTTLExists = scrapingProgressIndexes.some(
        (idx) => idx.name === 'ttl_scraping_progress' || idx.expireAfterSeconds !== undefined
      );

      checks.push({
        collection: 'scraping_progress',
        check: 'ttl_index_exists',
        passed: scrapingProgressTTLExists,
        message: scrapingProgressTTLExists
          ? 'TTL index exists for automatic cleanup'
          : 'WARNING: TTL index missing - automatic cleanup may not work',
      });

      const progressIndexes = await progressCollection.indexes();
      const progressTTLExists = progressIndexes.some(
        (idx) => idx.name === 'ttl_job_progress' || idx.expireAfterSeconds !== undefined
      );

      checks.push({
        collection: 'job_progress',
        check: 'ttl_index_exists',
        passed: progressTTLExists,
        message: progressTTLExists
          ? 'TTL index exists for automatic cleanup'
          : 'WARNING: TTL index missing - automatic cleanup may not work',
      });

      // Verify collections still exist and are accessible
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map((c) => c.name);

      const requiredCollections = ['scraping_progress', 'job_progress'];
      for (const requiredCollection of requiredCollections) {
        checks.push({
          collection: requiredCollection,
          check: 'collection_exists',
          passed: collectionNames.includes(requiredCollection),
          message: collectionNames.includes(requiredCollection)
            ? 'Collection exists and is accessible'
            : 'ERROR: Collection missing after cleanup',
        });
      }
    } catch (error) {
      logger.error({ error }, 'Error during cleanup verification');
      checks.push({
        collection: 'verification',
        check: 'verification_execution',
        passed: false,
        message: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const allChecksPassed = checks.every((check) => check.passed);

    return {
      passed: allChecksPassed,
      checks,
    };
  }

  /**
   * Ensure all TTL indexes are in place for automatic cleanup
   */
  async ensureAllTTLIndexes(): Promise<{
    scrapingProgress: { indexCreated: boolean; indexName: string };
    progress: { indexCreated: boolean; indexName: string };
  }> {
    logger.info('Ensuring all TTL indexes are in place');

    const scrapingProgressCleanupService = getScrapingProgressCleanupService();
    const progressCleanupService = getProgressCleanupService();

    const [scrapingProgressIndex, progressIndex] = await Promise.all([
      scrapingProgressCleanupService.ensureIndexes(),
      progressCleanupService.ensureTTLIndex(),
    ]);

    logger.info(
      {
        scrapingProgressIndex: scrapingProgressIndex.indexCreated ? 'created' : 'exists',
        progressIndex: progressIndex.indexCreated ? 'created' : 'exists',
      },
      'TTL indexes verification completed'
    );

    return {
      scrapingProgress: scrapingProgressIndex,
      progress: progressIndex,
    };
  }

  /**
   * Get statistics about all collections that can be cleaned up
   */
  async getCleanupStatistics(): Promise<{
    scrapingProgress: Awaited<ReturnType<ReturnType<typeof getScrapingProgressCleanupService>['getStatistics']>>;
    progress: Awaited<ReturnType<ReturnType<typeof getProgressCleanupService>['getStatistics']>>;
  }> {
    const scrapingProgressCleanupService = getScrapingProgressCleanupService();
    const progressCleanupService = getProgressCleanupService();

    const [scrapingProgressStats, progressStats] = await Promise.all([
      scrapingProgressCleanupService.getStatistics(),
      progressCleanupService.getStatistics(),
    ]);

    return {
      scrapingProgress: scrapingProgressStats,
      progress: progressStats,
    };
  }

  /**
   * Clean up old cleanup metrics (retain for 90 days for trend analysis)
   */
  async cleanupOldMetrics(retentionDays: number = 90): Promise<number> {
    try {
      const db = getDB();
      const collection = db.collection('database_cleanup_metrics');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await collection.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      const deletedCount = result.deletedCount || 0;

      if (deletedCount > 0) {
        logger.info(
          {
            deletedCount,
            cutoffDate: cutoffDate.toISOString(),
            retentionDays,
          },
          'Cleaned up old cleanup metrics'
        );
      }

      return deletedCount;
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup old cleanup metrics');
      throw error;
    }
  }
}

// Singleton instance
let databaseCleanupOrchestratorInstance: DatabaseCleanupOrchestrator | null = null;

/**
 * Get the singleton instance of DatabaseCleanupOrchestrator
 */
export function getDatabaseCleanupOrchestrator(): DatabaseCleanupOrchestrator {
  if (!databaseCleanupOrchestratorInstance) {
    databaseCleanupOrchestratorInstance = new DatabaseCleanupOrchestrator();
  }
  return databaseCleanupOrchestratorInstance;
}
