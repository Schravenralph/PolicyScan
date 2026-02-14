/**
 * Database Cleanup Admin Routes
 * 
 * Provides admin endpoints for database cleanup operations:
 * - Manual cleanup trigger
 * - Cleanup statistics
 * - Collection size monitoring
 * - TTL index management
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { logger } from '../../utils/logger.js';
import { sanitizeInput, auditMiddleware } from './shared/middleware.js';
import { getDatabaseCleanupOrchestrator } from '../../services/monitoring/DatabaseCleanupOrchestrator.js';
import { getCollectionSizeMonitoringService } from '../../services/monitoring/CollectionSizeMonitoringService.js';

/**
 * Register database cleanup admin routes
 */
export function registerDatabaseCleanupRoutes(router: Router): void {
  /**
   * GET /api/admin/database-cleanup/status
   * Check if cleanup is currently running and get last cleanup information
   */
  router.get(
    '/database-cleanup/status',
    asyncHandler(async (_req: Request, res: Response) => {
      const orchestrator = getDatabaseCleanupOrchestrator();
      const status = await orchestrator.getCleanupStatus();

      res.json({
        success: true,
        isRunning: status.isRunning,
        startTime: status.startTime?.toISOString() || null,
        elapsedMinutes: status.elapsedMinutes,
        currentProgress: status.currentProgress?.map(p => ({
          collection: p.collection,
          deletedCount: p.deletedCount,
          truncatedCount: p.truncatedCount,
          status: p.status,
          error: p.error || undefined,
        })),
        lastCleanupTime: status.lastCleanupTime?.toISOString() || null,
        lastCleanupDurationMs: status.lastCleanupDurationMs,
        lastCleanupDeleted: status.lastCleanupDeleted,
        message: status.isRunning
          ? `Cleanup operation is currently in progress (started ${status.elapsedMinutes} minutes ago)`
          : status.lastCleanupTime
            ? `No cleanup operation is currently running. Last cleanup: ${status.lastCleanupTime.toISOString()}`
            : 'No cleanup operation is currently running. No previous cleanup recorded.',
      });
    })
  );

  /**
   * GET /api/admin/database-cleanup/statistics
   * Get cleanup statistics for all collections
   */
  router.get(
    '/database-cleanup/statistics',
    asyncHandler(async (_req: Request, res: Response) => {
      const orchestrator = getDatabaseCleanupOrchestrator();
      const statistics = await orchestrator.getCleanupStatistics();

      res.json({
        scrapingProgress: statistics.scrapingProgress,
        progress: statistics.progress,
      });
    })
  );

  /**
   * GET /api/admin/database-cleanup/collection-sizes
   * Get collection size report
   */
  router.get(
    '/database-cleanup/collection-sizes',
    asyncHandler(async (_req: Request, res: Response) => {
      const monitoring = getCollectionSizeMonitoringService();
      const report = await monitoring.getCollectionSizes();

      res.json({
        timestamp: report.timestamp.toISOString(),
        databaseStats: {
          dataSizeGB: report.databaseStats.dataSize / 1024 / 1024 / 1024,
          storageSizeGB: report.databaseStats.storageSize / 1024 / 1024 / 1024,
          totalIndexSizeGB: report.databaseStats.totalIndexSize / 1024 / 1024 / 1024,
          collections: report.databaseStats.collections,
        },
        topCollections: report.topCollections.map((c) => ({
          collection: c.collection,
          documentCount: c.documentCount,
          sizeMB: c.storageSize / 1024 / 1024,
          sizeGB: c.storageSize / 1024 / 1024 / 1024,
          averageDocumentSizeKB: c.averageDocumentSize / 1024,
        })),
        collectionsOverThreshold: report.collectionsOverThreshold.map((c) => ({
          collection: c.collection,
          sizeMB: c.storageSize / 1024 / 1024,
          documentCount: c.documentCount,
        })),
      });
    })
  );

  /**
   * GET /api/admin/database-cleanup/thresholds
   * Check collection size thresholds
   */
  router.get(
    '/database-cleanup/thresholds',
    asyncHandler(async (_req: Request, res: Response) => {
      const monitoring = getCollectionSizeMonitoringService();
      const { warnings, criticals } = await monitoring.checkThresholds();

      res.json({
        warnings: warnings.map((w) => ({
          collection: w.collection,
          sizeMB: w.sizeMB,
          thresholdMB: w.thresholdMB,
        })),
        criticals: criticals.map((c) => ({
          collection: c.collection,
          sizeMB: c.sizeMB,
          thresholdMB: c.thresholdMB,
        })),
      });
    })
  );

  /**
   * POST /api/admin/database-cleanup/run
   * Manually trigger database cleanup
   */
  router.post(
    '/database-cleanup/run',
    sanitizeInput,
    auditMiddleware({
      action: 'system_config_changed' as const,
      targetType: 'system',
      getDetails: (req) => ({
        operation: 'database_cleanup',
        options: req.body,
      }),
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const options = req.body as {
        scrapingProgressRetentionDays?: number;
        progressRetentionDays?: number;
        testRunsRetentionDays?: number;
        workflowHistoryRetentionDays?: number;
        truncateProgressEvents?: boolean;
        skipScrapingProgress?: boolean;
        skipProgress?: boolean;
        skipTestRuns?: boolean;
        skipWorkflowHistory?: boolean;
        skipAuditLogs?: boolean;
      };

      const orchestrator = getDatabaseCleanupOrchestrator();
      const summary = await orchestrator.runCleanup(options);

      logger.info(
        {
          totalDeleted: summary.totalDeleted,
          totalTruncated: summary.totalTruncated,
          successfulCleanups: summary.successfulCleanups,
          failedCleanups: summary.failedCleanups,
        },
        'Database cleanup completed via admin endpoint'
      );

      res.json({
        success: true,
        message: 'Database cleanup completed',
        summary: {
          timestamp: summary.timestamp.toISOString(),
          totalCollections: summary.totalCollections,
          successfulCleanups: summary.successfulCleanups,
          failedCleanups: summary.failedCleanups,
          totalDeleted: summary.totalDeleted,
          totalTruncated: summary.totalTruncated,
          totalDurationMs: summary.totalDurationMs,
          results: summary.results.map((r) => ({
            collection: r.collection,
            success: r.success,
            deletedCount: r.deletedCount,
            truncatedCount: r.truncatedCount,
            error: r.error,
            durationMs: r.durationMs,
          })),
          verification: summary.verification
            ? {
                passed: summary.verification.passed,
                checks: summary.verification.checks.map((c) => ({
                  collection: c.collection,
                  check: c.check,
                  passed: c.passed,
                  message: c.message,
                })),
              }
            : undefined,
        },
      });
    })
  );

  /**
   * POST /api/admin/database-cleanup/ensure-indexes
   * Ensure TTL indexes are in place
   */
  router.post(
    '/database-cleanup/ensure-indexes',
    sanitizeInput,
    auditMiddleware({
      action: 'system_config_changed' as const,
      targetType: 'system',
      getDetails: () => ({ operation: 'ensure_ttl_indexes' }),
    }),
    asyncHandler(async (_req: Request, res: Response) => {
      const orchestrator = getDatabaseCleanupOrchestrator();
      const result = await orchestrator.ensureAllTTLIndexes();

      logger.info({ result }, 'TTL indexes ensured via admin endpoint');

      res.json({
        success: true,
        message: 'TTL indexes verified/created',
        indexes: {
          scrapingProgress: {
            indexName: result.scrapingProgress.indexName,
            created: result.scrapingProgress.indexCreated,
          },
          progress: {
            indexName: result.progress.indexName,
            created: result.progress.indexCreated,
          },
        },
      });
    })
  );

  /**
   * GET /api/admin/database-cleanup/summary
   * Get summary statistics for dashboard
   */
  router.get(
    '/database-cleanup/summary',
    asyncHandler(async (_req: Request, res: Response) => {
      const monitoring = getCollectionSizeMonitoringService();
      const summary = await monitoring.getSummary();

      res.json({
        totalSizeGB: summary.totalSizeGB,
        totalCollections: summary.totalCollections,
        largestCollection: summary.largestCollection,
        largestCollectionSizeGB: summary.largestCollectionSizeGB,
        collectionsOver100MB: summary.collectionsOver100MB,
        collectionsOver1GB: summary.collectionsOver1GB,
      });
    })
  );

  /**
   * GET /api/admin/database-cleanup/metrics
   * Get cleanup metrics history for trend analysis
   */
  router.get(
    '/database-cleanup/metrics',
    asyncHandler(async (req: Request, res: Response) => {
      const { getDB } = await import('../../config/database.js');
      const db = getDB();
      const collection = db.collection('database_cleanup_metrics');

      // Parse query parameters
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const days = parseInt((req.query.days as string) || '30', 10);
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Query metrics
      const metrics = await collection
        .find({
          timestamp: { $gte: startDate },
        })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      // Calculate aggregate statistics
      const totalCleanups = metrics.length;
      const successfulCleanups = metrics.filter((m) => m.verificationPassed).length;
      const totalDeleted = metrics.reduce((sum, m) => sum + (m.totalDeleted || 0), 0);
      const totalTruncated = metrics.reduce((sum, m) => sum + (m.totalTruncated || 0), 0);
      const avgDurationMs =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + (m.totalDurationMs || 0), 0) / metrics.length
          : 0;
      const avgSizeReductionGB =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + (m.sizeReductionGB || 0), 0) / metrics.length
          : 0;

      res.json({
        period: {
          startDate: startDate.toISOString(),
          days,
          limit,
        },
        summary: {
          totalCleanups,
          successfulCleanups,
          successRate: totalCleanups > 0 ? (successfulCleanups / totalCleanups) * 100 : 0,
          totalDeleted,
          totalTruncated,
          avgDurationMs: Math.round(avgDurationMs),
          avgSizeReductionGB: Math.round(avgSizeReductionGB * 100) / 100,
        },
        metrics: metrics.map((m) => ({
          timestamp: m.timestamp,
          totalDeleted: m.totalDeleted,
          totalTruncated: m.totalTruncated,
          totalDurationMs: m.totalDurationMs,
          databaseSizeGBBefore: m.databaseSizeGBBefore,
          databaseSizeGBAfter: m.databaseSizeGBAfter,
          sizeReductionGB: m.sizeReductionGB,
          sizeReductionPercent: m.sizeReductionPercent,
          verificationPassed: m.verificationPassed,
          successfulCleanups: m.successfulCleanups,
          failedCleanups: m.failedCleanups,
        })),
      });
    })
  );
}
