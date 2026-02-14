/**
 * Canonical Document Monitoring Service
 * 
 * Monitors performance, errors, and operational metrics for canonical document operations.
 * Integrates with existing monitoring infrastructure (PerformanceMonitoringService, ErrorMonitoringService).
 * 
 * @see WI-MON-003: Set Up Canonical Document Monitoring and Observability
 */

import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';
import { getPerformanceMonitoringService } from './PerformanceMonitoringService.js';
import { getErrorMonitoringService } from './ErrorMonitoringService.js';
import type { DocumentSource } from '../../contracts/types.js';

export interface CanonicalDocumentOperationMetric {
  _id?: ObjectId;
  operation: 'upsert' | 'findById' | 'findByQuery' | 'textSearch' | 'findByIds' | 'count' | 'bulkUpdate';
  source?: DocumentSource;
  responseTimeMs: number;
  success: boolean;
  errorType?: string;
  documentCount?: number;
  queryComplexity?: 'simple' | 'complex';
  timestamp: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface CanonicalDocumentPerformanceStats {
  operation: string;
  totalOperations: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  p50: number;
  p95: number;
  p99: number;
  averageResponseTime: number;
  totalDocumentsProcessed: number;
  bySource?: Record<string, {
    count: number;
    avgResponseTime: number;
    errorRate: number;
  }>;
}

export interface CanonicalDocumentErrorStats {
  totalErrors: number;
  byOperation: Record<string, number>;
  byErrorType: Record<string, number>;
  bySource: Record<string, number>;
  recentErrors: Array<{
    operation: string;
    errorType: string;
    source?: string;
    timestamp: Date;
    message: string;
  }>;
}

const COLLECTION_NAME = 'canonical_document_metrics';
const RETENTION_DAYS = 30; // Keep metrics for 30 days

/**
 * Canonical Document Monitoring Service
 */
export class CanonicalDocumentMonitoringService {
  /**
   * Record a canonical document operation metric
   */
  async recordOperation(metric: Omit<CanonicalDocumentOperationMetric, '_id' | 'timestamp' | 'createdAt'>): Promise<void> {
    try {
      const db = getDB();
      const now = new Date();

      // Record in canonical document metrics collection
      await db.collection<CanonicalDocumentOperationMetric>(COLLECTION_NAME).insertOne({
        ...metric,
        timestamp: now,
        createdAt: now,
      });

      // Also record in general performance monitoring if it's a slow operation
      if (metric.responseTimeMs > 1000) {
        const perfService = getPerformanceMonitoringService();
        // Note: PerformanceMonitoringService expects endpoint/method format
        // We'll log this as a service operation
        logger.debug(
          {
            operation: metric.operation,
            responseTimeMs: metric.responseTimeMs,
            source: metric.source,
          },
          'Slow canonical document operation detected'
        );
      }

      // Log errors to error monitoring service
      if (!metric.success && metric.errorType) {
        const errorService = getErrorMonitoringService();
        const error = new Error(`Canonical document operation failed: ${metric.operation}`);
        await errorService.captureError(error, {
          component: 'database',
          metadata: {
            operation: metric.operation,
            source: metric.source,
            errorType: metric.errorType,
            ...metric.metadata,
          },
        });
      }

      // Structured logging for canonical operations
      const logLevel = metric.success ? 'info' : 'error';
      logger[logLevel](
        {
          operation: metric.operation,
          source: metric.source,
          responseTimeMs: metric.responseTimeMs,
          success: metric.success,
          errorType: metric.errorType,
          documentCount: metric.documentCount,
          ...metric.metadata,
        },
        `Canonical document operation: ${metric.operation}`
      );
    } catch (error) {
      // Don't let monitoring errors break the application
      logger.warn({ error }, 'Failed to record canonical document operation metric');
    }
  }

  /**
   * Get performance statistics for canonical document operations
   */
  async getPerformanceStats(options: {
    startDate?: Date;
    endDate?: Date;
    operation?: string;
    source?: DocumentSource;
  } = {}): Promise<CanonicalDocumentPerformanceStats[]> {
    const db = getDB();
    const { startDate, endDate, operation, source } = options;

    // Default to last 24 hours if no date range specified
    const queryStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const queryEndDate = endDate || new Date();

    const query: Record<string, unknown> = {
      timestamp: {
        $gte: queryStartDate,
        $lte: queryEndDate,
      },
    };

    if (operation) query.operation = operation;
    if (source) query.source = source;

    const metrics = await db
      .collection<CanonicalDocumentOperationMetric>(COLLECTION_NAME)
      .find(query)
      .toArray();

    if (metrics.length === 0) {
      return [];
    }

    // Group by operation
    const byOperation = new Map<string, CanonicalDocumentOperationMetric[]>();
    for (const metric of metrics) {
      const op = metric.operation;
      if (!byOperation.has(op)) {
        byOperation.set(op, []);
      }
      byOperation.get(op)!.push(metric);
    }

    // Calculate statistics for each operation
    const stats: CanonicalDocumentPerformanceStats[] = [];
    for (const [op, opMetrics] of byOperation.entries()) {
      const responseTimes = opMetrics
        .map((m) => m.responseTimeMs)
        .sort((a, b) => a - b);

      const successCount = opMetrics.filter((m) => m.success).length;
      const errorCount = opMetrics.length - successCount;
      const totalDocuments = opMetrics.reduce((sum, m) => sum + (m.documentCount || 0), 0);

      // Group by source
      const bySource = new Map<string, CanonicalDocumentOperationMetric[]>();
      for (const metric of opMetrics) {
        const src = metric.source || 'unknown';
        if (!bySource.has(src)) {
          bySource.set(src, []);
        }
        bySource.get(src)!.push(metric);
      }

      const sourceStats: Record<string, { count: number; avgResponseTime: number; errorRate: number }> = {};
      for (const [src, srcMetrics] of bySource.entries()) {
        const srcResponseTimes = srcMetrics.map((m) => m.responseTimeMs);
        const srcSuccessCount = srcMetrics.filter((m) => m.success).length;
        sourceStats[src] = {
          count: srcMetrics.length,
          avgResponseTime: srcResponseTimes.reduce((sum, t) => sum + t, 0) / srcResponseTimes.length,
          errorRate: srcMetrics.length > 0 ? (srcMetrics.length - srcSuccessCount) / srcMetrics.length : 0,
        };
      }

      stats.push({
        operation: op,
        totalOperations: opMetrics.length,
        successCount,
        errorCount,
        successRate: opMetrics.length > 0 ? successCount / opMetrics.length : 0,
        p50: this.percentile(responseTimes, 50),
        p95: this.percentile(responseTimes, 95),
        p99: this.percentile(responseTimes, 99),
        averageResponseTime: responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length,
        totalDocumentsProcessed: totalDocuments,
        bySource: Object.keys(sourceStats).length > 0 ? sourceStats : undefined,
      });
    }

    return stats;
  }

  /**
   * Get error statistics for canonical document operations
   */
  async getErrorStats(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<CanonicalDocumentErrorStats> {
    const db = getDB();
    const { startDate, endDate } = options;

    // Default to last 24 hours if no date range specified
    const queryStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const queryEndDate = endDate || new Date();

    const query: Record<string, unknown> = {
      timestamp: {
        $gte: queryStartDate,
        $lte: queryEndDate,
      },
      success: false,
    };

    const errorMetrics = await db
      .collection<CanonicalDocumentOperationMetric>(COLLECTION_NAME)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    const byOperation: Record<string, number> = {};
    const byErrorType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const metric of errorMetrics) {
      // Count by operation
      byOperation[metric.operation] = (byOperation[metric.operation] || 0) + 1;

      // Count by error type
      if (metric.errorType) {
        byErrorType[metric.errorType] = (byErrorType[metric.errorType] || 0) + 1;
      }

      // Count by source
      const src = metric.source || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    }

    const recentErrors = errorMetrics.slice(0, 10).map((m) => ({
      operation: m.operation,
      errorType: m.errorType || 'unknown',
      source: m.source,
      timestamp: m.timestamp,
      message: `Operation ${m.operation} failed`,
    }));

    return {
      totalErrors: errorMetrics.length,
      byOperation,
      byErrorType,
      bySource,
      recentErrors,
    };
  }

  /**
   * Clean up old metrics (retention policy)
   */
  async cleanupOldMetrics(): Promise<number> {
    try {
      const db = getDB();
      const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

      const result = await db.collection<CanonicalDocumentOperationMetric>(COLLECTION_NAME).deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      logger.info(
        { deletedCount: result.deletedCount, cutoffDate },
        'Cleaned up old canonical document metrics'
      );

      return result.deletedCount;
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup old canonical document metrics');
      return 0;
    }
  }

  /**
   * Get queryId linkage statistics
   * Tracks documents with/without queryId and linkage issues
   */
  async getQueryIdLinkageStats(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalDocuments: number;
    withQueryId: number;
    withoutQueryId: number;
    linkageIssues: number; // Documents with workflowRunId but no queryId
    linkageRate: number; // Percentage of documents with queryId
    bySource: Record<string, {
      total: number;
      withQueryId: number;
      withoutQueryId: number;
      linkageIssues: number;
    }>;
  }> {
    try {
      const db = getDB();
      const { startDate, endDate } = options;

      // Default to last 24 hours if no date range specified
      const queryStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const queryEndDate = endDate || new Date();

      // Query metrics for upsert operations in the time range
      const metrics = await db
        .collection<CanonicalDocumentOperationMetric>(COLLECTION_NAME)
        .find({
          operation: 'upsert',
          timestamp: {
            $gte: queryStartDate,
            $lte: queryEndDate,
          },
          success: true,
        })
        .toArray();

      let totalDocuments = 0;
      let withQueryId = 0;
      let withoutQueryId = 0;
      let linkageIssues = 0;
      const bySource: Record<string, { total: number; withQueryId: number; withoutQueryId: number; linkageIssues: number }> = {};

      for (const metric of metrics) {
        const count = metric.documentCount || 1;
        totalDocuments += count;

        const source = metric.source || 'unknown';
        if (!bySource[source]) {
          bySource[source] = { total: 0, withQueryId: 0, withoutQueryId: 0, linkageIssues: 0 };
        }

        bySource[source].total += count;

        const hasQueryId = metric.metadata?.hasQueryId === true;
        const queryIdLinkageIssue = metric.metadata?.queryIdLinkageIssue === true;

        if (hasQueryId) {
          withQueryId += count;
          bySource[source].withQueryId += count;
        } else {
          withoutQueryId += count;
          bySource[source].withoutQueryId += count;
        }

        if (queryIdLinkageIssue) {
          linkageIssues += count;
          bySource[source].linkageIssues += count;
        }
      }

      const linkageRate = totalDocuments > 0 ? (withQueryId / totalDocuments) * 100 : 0;

      return {
        totalDocuments,
        withQueryId,
        withoutQueryId,
        linkageIssues,
        linkageRate,
        bySource,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get queryId linkage statistics');
      return {
        totalDocuments: 0,
        withQueryId: 0,
        withoutQueryId: 0,
        linkageIssues: 0,
        linkageRate: 0,
        bySource: {},
      };
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }
}

// Singleton instance
let canonicalDocumentMonitoringService: CanonicalDocumentMonitoringService | null = null;

/**
 * Get singleton instance of CanonicalDocumentMonitoringService
 */
export function getCanonicalDocumentMonitoringService(): CanonicalDocumentMonitoringService {
  if (!canonicalDocumentMonitoringService) {
    canonicalDocumentMonitoringService = new CanonicalDocumentMonitoringService();
  }
  return canonicalDocumentMonitoringService;
}

