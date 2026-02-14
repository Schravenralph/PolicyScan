/**
 * Workflow Log Cleanup Service
 * 
 * Aggressively cleans up workflow logs older than 1 day.
 * Compresses logs older than 12 hours to save space.
 * 
 * This is critical because workflow logs can grow to hundreds of GB
 * if not cleaned up regularly.
 */

import fs from 'fs/promises';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { logger } from '../../utils/logger.js';
import { getOptimizationMetricsService } from './OptimizationMetricsService.js';

export interface WorkflowLogCleanupConfig {
  /** Log directory path */
  logDir: string;
  /** Delete logs older than this (hours) - default: 24 hours (1 day) */
  deleteAfterHours: number;
  /** Compress logs older than this (hours) - default: 12 hours */
  compressAfterHours: number;
  /** Run cleanup every N hours - default: 6 hours */
  cleanupIntervalHours: number;
}

/**
 * Workflow Log Cleanup Service
 * 
 * Aggressively manages workflow log files to prevent disk space issues.
 */
export class WorkflowLogCleanupService {
  private config: WorkflowLogCleanupConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<WorkflowLogCleanupConfig>) {
    this.config = {
      logDir: config?.logDir || 'data/workflow-logs',
      deleteAfterHours: config?.deleteAfterHours || parseInt(process.env.WORKFLOW_LOG_RETENTION_HOURS || '24', 10),
      compressAfterHours: config?.compressAfterHours || parseInt(process.env.WORKFLOW_LOG_COMPRESS_HOURS || '12', 10),
      cleanupIntervalHours: config?.cleanupIntervalHours || parseInt(process.env.WORKFLOW_LOG_CLEANUP_INTERVAL_HOURS || '6', 10),
    };
  }

  /**
   * Start automatic cleanup
   */
  start(): void {
    if (this.cleanupInterval) {
      logger.warn('Workflow log cleanup is already running');
      return;
    }

    // Run cleanup immediately
    this.cleanup().catch((error) => {
      logger.error({ error }, 'Error during initial workflow log cleanup');
    });

    // Then run periodically
    const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch((error) => {
        logger.error({ error }, 'Error during periodic workflow log cleanup');
      });
    }, intervalMs);

    logger.info(
      {
        logDir: this.config.logDir,
        deleteAfterHours: this.config.deleteAfterHours,
        compressAfterHours: this.config.compressAfterHours,
        cleanupIntervalHours: this.config.cleanupIntervalHours,
      },
      'Workflow log cleanup service started'
    );
  }

  /**
   * Stop automatic cleanup
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Workflow log cleanup service stopped');
    }
  }

  /**
   * Run cleanup: compress old logs and delete very old logs
   */
  async cleanup(): Promise<{ compressed: number; deleted: number; totalSize: number; freedSize: number }> {
    try {
      await this.ensureLogDir();

      const files = await this.getLogFiles();
      const now = Date.now();
      const deleteCutoff = now - (this.config.deleteAfterHours * 60 * 60 * 1000);
      const compressCutoff = now - (this.config.compressAfterHours * 60 * 60 * 1000);

      let compressed = 0;
      let deleted = 0;
      let totalSize = 0;
      let freedSize = 0;

      for (const file of files) {
        try {
          const stats = await fs.stat(file);
          totalSize += stats.size;
          const fileAge = now - stats.mtimeMs;

          // Delete very old files
          if (fileAge > deleteCutoff) {
            await fs.unlink(file);
            deleted++;
            freedSize += stats.size;
            logger.debug({ file, age: Math.round(fileAge / (60 * 60 * 1000)) + 'h' }, 'Deleted old workflow log');
            continue;
          }

          // Compress old files (if not already compressed)
          if (fileAge > compressCutoff && !file.endsWith('.gz')) {
            try {
              const compressedPath = `${file}.gz`;
              await this.compressFile(file, compressedPath);
              await fs.unlink(file);
              
              const compressedStats = await fs.stat(compressedPath);
              compressed++;
              freedSize += stats.size - compressedStats.size;
              logger.debug({ file, age: Math.round(fileAge / (60 * 60 * 1000)) + 'h' }, 'Compressed workflow log');
            } catch (error) {
              logger.warn({ error, file }, 'Failed to compress workflow log file');
            }
          }
        } catch (error) {
          logger.warn({ error, file }, 'Error processing workflow log file');
        }
      }

      const freedSizeMB = freedSize / (1024 * 1024);
      
      // Record metrics
      const metricsService = getOptimizationMetricsService();
      metricsService.recordLogCleanup(deleted, compressed, freedSizeMB);

      logger.info(
        {
          compressed,
          deleted,
          totalFiles: files.length,
          totalSizeMB: Math.round(totalSize / (1024 * 1024)),
          freedSizeMB: Math.round(freedSizeMB),
        },
        'Workflow log cleanup completed'
      );

      return { compressed, deleted, totalSize, freedSize };
    } catch (error) {
      logger.error({ error, logDir: this.config.logDir }, 'Error during workflow log cleanup');
      throw error;
    }
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.logDir, { recursive: true });
    } catch (error) {
      logger.error({ error, logDir: this.config.logDir }, 'Failed to create log directory');
      throw error;
    }
  }

  /**
   * Get all log files in the directory
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.logDir);
      return files
        .filter(file => file.endsWith('.log') || file.endsWith('.log.gz'))
        .map(file => path.join(this.config.logDir, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Compress a file using gzip
   */
  private async compressFile(inputPath: string, outputPath: string): Promise<void> {
    const readStream = createReadStream(inputPath);
    const writeStream = createWriteStream(outputPath);
    const gzip = createGzip({ level: 9 }); // Maximum compression

    await pipeline(readStream, gzip, writeStream);
  }
}

// Singleton instance
let workflowLogCleanupInstance: WorkflowLogCleanupService | null = null;

/**
 * Get or create the workflow log cleanup service instance
 */
export function getWorkflowLogCleanupService(): WorkflowLogCleanupService {
  if (!workflowLogCleanupInstance) {
    workflowLogCleanupInstance = new WorkflowLogCleanupService();
  }
  return workflowLogCleanupInstance;
}

