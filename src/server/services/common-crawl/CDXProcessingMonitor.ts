/**
 * CDX Processing Monitor
 * 
 * Monitors Common Crawl CDX file download and processing operations,
 * tracks performance metrics, and sends alerts for failures or performance issues.
 */

import { logger } from '../../utils/logger.js';
import { AlertingService } from '../monitoring/AlertingService.js';
import type { DownloadResult } from './CDXFileDownloadService.js';
import type { ProcessResult } from './CDXFileProcessor.js';

export interface ProcessingMetrics {
  crawlId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  downloadMetrics?: {
    totalFiles: number;
    downloaded: number;
    failed: number;
    skipped: number;
    totalSize: number;
    avgDownloadSpeed: number; // MB/s
    maxDownloadSpeed: number; // MB/s
  };
  processingMetrics?: {
    filesProcessed: number;
    recordsProcessed: number;
    recordsInserted: number;
    recordsFiltered: number;
    errors: number;
    avgProcessingSpeed: number; // records/second
    maxProcessingSpeed: number; // records/second
  };
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  failureThreshold: number; // Alert if failure rate exceeds this percentage
  slowDownloadThreshold: number; // Alert if download speed is below this (MB/s)
  slowProcessingThreshold: number; // Alert if processing speed is below this (records/s)
  alertOnCompletion: boolean; // Send alert when processing completes
}

/**
 * Service for monitoring CDX processing operations
 */
export class CDXProcessingMonitor {
  private _alertingService: AlertingService;
  private config: MonitoringConfig;
  private activeOperations: Map<string, ProcessingMetrics> = new Map();

  constructor(alertingService?: AlertingService) {
    this._alertingService = alertingService || new AlertingService();
    this.config = {
      enabled: process.env.CDX_MONITORING_ENABLED !== 'false', // Default: enabled
      failureThreshold: parseFloat(process.env.CDX_FAILURE_THRESHOLD || '10'), // 10%
      slowDownloadThreshold: parseFloat(process.env.CDX_SLOW_DOWNLOAD_THRESHOLD || '1'), // 1 MB/s
      slowProcessingThreshold: parseFloat(process.env.CDX_SLOW_PROCESSING_THRESHOLD || '1000'), // 1000 rec/s
      alertOnCompletion: process.env.CDX_ALERT_ON_COMPLETION === 'true', // Default: false
    };
  }

  /**
   * Start monitoring a CDX processing operation
   */
  startMonitoring(operationId: string, crawlId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const metrics: ProcessingMetrics = {
      crawlId,
      startTime: new Date(),
      status: 'running',
    };

    this.activeOperations.set(operationId, metrics);
    logger.info({ operationId, crawlId }, 'Started monitoring CDX processing operation');
  }

  /**
   * Record download results
   */
  recordDownloadResults(operationId: string, result: DownloadResult): void {
    if (!this.config.enabled) {
      return;
    }

    const metrics = this.activeOperations.get(operationId);
    if (!metrics) {
      logger.warn({ operationId }, 'No active operation found for download results');
      return;
    }

    const downloadSpeeds = result.files
      .filter(f => f.downloadSpeed && f.downloadSpeed > 0)
      .map(f => f.downloadSpeed || 0);

    metrics.downloadMetrics = {
      totalFiles: result.downloaded + result.failed + result.skipped,
      downloaded: result.downloaded,
      failed: result.failed,
      skipped: result.skipped,
      totalSize: result.totalSize,
      avgDownloadSpeed: downloadSpeeds.length > 0
        ? downloadSpeeds.reduce((sum, speed) => sum + speed, 0) / downloadSpeeds.length
        : 0,
      maxDownloadSpeed: downloadSpeeds.length > 0 ? Math.max(...downloadSpeeds) : 0,
    };

    // Check for issues
    this.checkDownloadMetrics(operationId, metrics);
  }

  /**
   * Record processing results
   */
  recordProcessingResults(operationId: string, results: ProcessResult[]): void {
    if (!this.config.enabled) {
      return;
    }

    const metrics = this.activeOperations.get(operationId);
    if (!metrics) {
      logger.warn({ operationId }, 'No active operation found for processing results');
      return;
    }

    const processingSpeeds = results
      .filter(r => r.processingSpeed && r.processingSpeed > 0)
      .map(r => r.processingSpeed || 0);

    const totalProcessed = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
    const totalInserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
    const totalFiltered = results.reduce((sum, r) => sum + r.recordsFiltered, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    metrics.processingMetrics = {
      filesProcessed: results.length,
      recordsProcessed: totalProcessed,
      recordsInserted: totalInserted,
      recordsFiltered: totalFiltered,
      errors: totalErrors,
      avgProcessingSpeed: processingSpeeds.length > 0
        ? processingSpeeds.reduce((sum, speed) => sum + speed, 0) / processingSpeeds.length
        : 0,
      maxProcessingSpeed: processingSpeeds.length > 0 ? Math.max(...processingSpeeds) : 0,
    };

    // Check for issues
    this.checkProcessingMetrics(operationId, metrics);
  }

  /**
   * Complete monitoring for an operation
   */
  completeMonitoring(operationId: string, success: boolean, error?: string): void {
    if (!this.config.enabled) {
      return;
    }

    const metrics = this.activeOperations.get(operationId);
    if (!metrics) {
      logger.warn({ operationId }, 'No active operation found to complete');
      return;
    }

    metrics.endTime = new Date();
    metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
    metrics.status = success ? 'completed' : 'failed';
    if (error) {
      metrics.error = error;
    }

    // Send completion alert if configured
    if (this.config.alertOnCompletion && success) {
      this.sendCompletionAlert(metrics);
    }

    // Send failure alert if failed
    if (!success) {
      this.sendFailureAlert(metrics);
    }

    // Log summary
    logger.info(
      {
        operationId,
        crawlId: metrics.crawlId,
        duration: metrics.duration,
        status: metrics.status,
        downloadMetrics: metrics.downloadMetrics,
        processingMetrics: metrics.processingMetrics,
      },
      'CDX processing operation completed'
    );

    // Remove from active operations after a delay (for potential queries)
    setTimeout(() => {
      this.activeOperations.delete(operationId);
    }, 60000); // Keep for 1 minute
  }

  /**
   * Get metrics for an operation
   */
  getMetrics(operationId: string): ProcessingMetrics | undefined {
    return this.activeOperations.get(operationId);
  }

  /**
   * Check download metrics for issues
   */
  private checkDownloadMetrics(operationId: string, metrics: ProcessingMetrics): void {
    if (!metrics.downloadMetrics) {
      return;
    }

    const dm = metrics.downloadMetrics;
    const issues: string[] = [];

    // Check failure rate
    const totalFiles = dm.totalFiles;
    if (totalFiles > 0) {
      const failureRate = (dm.failed / totalFiles) * 100;
      if (failureRate > this.config.failureThreshold) {
        issues.push(
          `High download failure rate: ${failureRate.toFixed(1)}% (${dm.failed}/${totalFiles} files failed)`
        );
      }
    }

    // Check download speed
    if (dm.avgDownloadSpeed > 0 && dm.avgDownloadSpeed < this.config.slowDownloadThreshold) {
      issues.push(
        `Slow download speed: ${dm.avgDownloadSpeed.toFixed(2)} MB/s (threshold: ${this.config.slowDownloadThreshold} MB/s)`
      );
    }

    // Send alerts if issues found
    if (issues.length > 0) {
      this.sendPerformanceAlert(operationId, metrics, 'download', issues);
    }
  }

  /**
   * Check processing metrics for issues
   */
  private checkProcessingMetrics(operationId: string, metrics: ProcessingMetrics): void {
    if (!metrics.processingMetrics) {
      return;
    }

    const pm = metrics.processingMetrics;
    const issues: string[] = [];

    // Check error rate
    if (pm.recordsProcessed > 0) {
      const errorRate = (pm.errors / pm.recordsProcessed) * 100;
      if (errorRate > this.config.failureThreshold) {
        issues.push(
          `High processing error rate: ${errorRate.toFixed(1)}% (${pm.errors}/${pm.recordsProcessed} records)`
        );
      }
    }

    // Check processing speed
    if (pm.avgProcessingSpeed > 0 && pm.avgProcessingSpeed < this.config.slowProcessingThreshold) {
      issues.push(
        `Slow processing speed: ${Math.round(pm.avgProcessingSpeed)} records/s (threshold: ${this.config.slowProcessingThreshold} records/s)`
      );
    }

    // Send alerts if issues found
    if (issues.length > 0) {
      this.sendPerformanceAlert(operationId, metrics, 'processing', issues);
    }
  }

  /**
   * Send performance alert
   */
  private async sendPerformanceAlert(
    operationId: string,
    metrics: ProcessingMetrics,
    stage: 'download' | 'processing',
    issues: string[]
  ): Promise<void> {
    const message = `CDX Processing Performance Issue (${stage}): ${issues.join('; ')}`;
    
    logger.warn(
      {
        operationId,
        crawlId: metrics.crawlId,
        stage,
        issues,
        metrics: stage === 'download' ? metrics.downloadMetrics : metrics.processingMetrics,
      },
      message
    );

    // Create a mock error log document for alerting service
    // In a real implementation, you might want to create actual error log entries
    try {
      // For now, just log - AlertingService expects ErrorLogDocument which requires database
      // This could be enhanced to create actual error log entries
      logger.warn({ operationId, stage, issues }, 'Performance alert (AlertingService integration requires ErrorLogDocument)');
    } catch (error) {
      logger.error({ error, operationId }, 'Failed to send performance alert');
    }
  }

  /**
   * Send completion alert
   */
  private async sendCompletionAlert(metrics: ProcessingMetrics): Promise<void> {
    const message = `CDX Processing Completed: Crawl ${metrics.crawlId}`;
    
    logger.info(
      {
        crawlId: metrics.crawlId,
        duration: metrics.duration,
        downloadMetrics: metrics.downloadMetrics,
        processingMetrics: metrics.processingMetrics,
      },
      message
    );

    // Similar to performance alert - could be enhanced to use AlertingService properly
  }

  /**
   * Send failure alert
   */
  private async sendFailureAlert(metrics: ProcessingMetrics): Promise<void> {
    const message = `CDX Processing Failed: Crawl ${metrics.crawlId} - ${metrics.error || 'Unknown error'}`;
    
    logger.error(
      {
        crawlId: metrics.crawlId,
        error: metrics.error,
        duration: metrics.duration,
        downloadMetrics: metrics.downloadMetrics,
        processingMetrics: metrics.processingMetrics,
      },
      message
    );

    // Similar to performance alert - could be enhanced to use AlertingService properly
  }
}


