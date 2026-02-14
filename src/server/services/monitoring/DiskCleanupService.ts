/**
 * Disk Cleanup Service
 * 
 * Manages cleanup of large directories and files to free disk space:
 * - CommonCrawl data (can be re-downloaded)
 * - Nx build cache (regenerates on build)
 * - Old workflow outputs (beyond retention period)
 * - Temporary files and artifacts
 * 
 * All cleanup operations are safe and reversible (data can be regenerated).
 */

import { logger } from '../../utils/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';
import { OptimizationMetricsService } from './OptimizationMetricsService.js';

interface CleanupResult {
  path: string;
  sizeBytes: number;
  deleted: boolean;
  error?: string;
}

interface CleanupSummary {
  totalFreed: number;
  itemsDeleted: number;
  itemsFailed: number;
  results: CleanupResult[];
  timestamp: Date;
}

export class DiskCleanupService {
  private metricsService: OptimizationMetricsService;
  private projectRoot: string;

  constructor(metricsService?: OptimizationMetricsService) {
    // Lazy initialization of metrics service
    if (metricsService) {
      this.metricsService = metricsService;
    } else {
      // Import and get service synchronously (will be initialized on first use)
      const { getOptimizationMetricsService } = require('./OptimizationMetricsService.js');
      this.metricsService = getOptimizationMetricsService();
    }
    // Get project root (assuming this file is in src/server/services/monitoring)
    this.projectRoot = process.cwd();
  }

  /**
   * Clean up CommonCrawl data directory
   * Safe: Data can be re-downloaded from CommonCrawl if needed
   */
  async cleanupCommonCrawlData(): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];
    const commonCrawlPath = join(this.projectRoot, 'commoncrawl');

    if (!existsSync(commonCrawlPath)) {
      logger.debug('CommonCrawl directory does not exist, skipping cleanup');
      return results;
    }

    try {
      const size = await this.getDirectorySize(commonCrawlPath);
      await fs.rm(commonCrawlPath, { recursive: true, force: true });

      results.push({
        path: commonCrawlPath,
        sizeBytes: size,
        deleted: true,
      });

      logger.info(`Cleaned up CommonCrawl data: ${this.formatBytes(size)}`);

      if (this.metricsService) {
        this.metricsService.recordDiskCleanup('commoncrawl', size);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to cleanup CommonCrawl data: ${errorMessage}`);

      results.push({
        path: commonCrawlPath,
        sizeBytes: 0,
        deleted: false,
        error: errorMessage,
      });
    }

    return results;
  }

  /**
   * Clean up Nx build cache
   * Safe: Cache regenerates automatically on next build
   */
  async cleanupNxCache(): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];
    const nxCachePath = join(this.projectRoot, '.nx');

    if (!existsSync(nxCachePath)) {
      logger.debug('Nx cache directory does not exist, skipping cleanup');
      return results;
    }

    try {
      const size = await this.getDirectorySize(nxCachePath);
      await fs.rm(nxCachePath, { recursive: true, force: true });

      results.push({
        path: nxCachePath,
        sizeBytes: size,
        deleted: true,
      });

      logger.info(`Cleaned up Nx cache: ${this.formatBytes(size)}`);

      if (this.metricsService) {
        this.metricsService.recordDiskCleanup('nx-cache', size);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to cleanup Nx cache: ${errorMessage}`);

      results.push({
        path: nxCachePath,
        sizeBytes: 0,
        deleted: false,
        error: errorMessage,
      });
    }

    return results;
  }

  /**
   * Clean up old workflow outputs beyond retention period
   * Safe: Only deletes outputs older than retention period
   */
  async cleanupOldWorkflowOutputs(retentionDays: number = 30): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];
    const workflowOutputsPath = join(this.projectRoot, 'data', 'workflow-outputs');

    if (!existsSync(workflowOutputsPath)) {
      logger.debug('Workflow outputs directory does not exist, skipping cleanup');
      return results;
    }

    try {
      const entries = await fs.readdir(workflowOutputsPath, { withFileTypes: true });
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let totalFreed = 0;
      let itemsDeleted = 0;

      for (const entry of entries) {
        const entryPath = join(workflowOutputsPath, entry.name);

        try {
          const stats = await fs.stat(entryPath);

          if (stats.mtime < cutoffDate) {
            const size = entry.isDirectory()
              ? await this.getDirectorySize(entryPath)
              : stats.size;

            await fs.rm(entryPath, { recursive: true, force: true });

            results.push({
              path: entryPath,
              sizeBytes: size,
              deleted: true,
            });

            totalFreed += size;
            itemsDeleted++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to cleanup workflow output ${entry.name}: ${errorMessage}`);

          results.push({
            path: entryPath,
            sizeBytes: 0,
            deleted: false,
            error: errorMessage,
          });
        }
      }

      if (itemsDeleted > 0) {
        logger.info(`Cleaned up ${itemsDeleted} old workflow outputs: ${this.formatBytes(totalFreed)}`);

        if (this.metricsService) {
          this.metricsService.recordDiskCleanup('workflow-outputs', totalFreed);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to cleanup workflow outputs: ${errorMessage}`);
    }

    return results;
  }

  /**
   * Perform comprehensive disk cleanup
   */
  async performCleanup(options: {
    commonCrawl?: boolean;
    nxCache?: boolean;
    workflowOutputs?: boolean;
    workflowOutputsRetentionDays?: number;
  } = {}): Promise<CleanupSummary> {
    const {
      commonCrawl = false,
      nxCache = false,
      workflowOutputs = false,
      workflowOutputsRetentionDays = 30,
    } = options;

    logger.info('Starting disk cleanup...');
    const allResults: CleanupResult[] = [];

    if (commonCrawl) {
      const results = await this.cleanupCommonCrawlData();
      allResults.push(...results);
    }

    if (nxCache) {
      const results = await this.cleanupNxCache();
      allResults.push(...results);
    }

    if (workflowOutputs) {
      const results = await this.cleanupOldWorkflowOutputs(workflowOutputsRetentionDays);
      allResults.push(...results);
    }

    const summary: CleanupSummary = {
      totalFreed: allResults
        .filter(r => r.deleted)
        .reduce((sum, r) => sum + r.sizeBytes, 0),
      itemsDeleted: allResults.filter(r => r.deleted).length,
      itemsFailed: allResults.filter(r => !r.deleted).length,
      results: allResults,
      timestamp: new Date(),
    };

    logger.info(
      `Disk cleanup complete: ${this.formatBytes(summary.totalFreed)} freed, ` +
      `${summary.itemsDeleted} items deleted, ${summary.itemsFailed} failed`
    );

    return summary;
  }

  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        try {
          if (entry.isDirectory()) {
            totalSize += await this.getDirectorySize(entryPath);
          } else {
            const stats = await fs.stat(entryPath);
            totalSize += stats.size;
          }
        } catch (error) {
          // Skip files/directories we can't access
          logger.debug(`Skipping ${entryPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to calculate size for ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return totalSize;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}





