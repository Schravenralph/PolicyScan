/**
 * Log Rotation Service
 * 
 * Handles log file rotation and cleanup based on retention policies.
 * Rotates logs daily and removes old logs based on configured retention period.
 * 
 * @see docs/71-sprint-in-progress/WI-LOG-001.md
 */

import fs from 'fs/promises';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { logger } from '../../utils/logger.js';

/**
 * Log rotation configuration
 */
export interface LogRotationConfig {
  /** Log directory path */
  logDir: string;
  /** Retention period in days (default: 30) */
  retentionDays: number;
  /** Whether to compress rotated logs (default: true) */
  compress: boolean;
  /** Log file pattern (e.g., 'health-check-*.jsonl') */
  filePattern: string;
}

/**
 * Log Rotation Service
 * 
 * Handles rotation and cleanup of log files based on retention policies.
 */
export class LogRotationService {
  private config: LogRotationConfig;
  private rotationInterval: NodeJS.Timeout | null = null;

  constructor(config: LogRotationConfig) {
    this.config = config;
  }

  /**
   * Start automatic log rotation (runs daily)
   */
  startAutomaticRotation(): void {
    // Run rotation check daily at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    // Run first rotation check after delay to midnight
    setTimeout(() => {
      this.rotateLogs().catch((error) => {
        logger.error({ error }, 'Error during automatic log rotation');
      });
      
      // Then run daily
      this.rotationInterval = setInterval(() => {
        this.rotateLogs().catch((error) => {
          logger.error({ error }, 'Error during automatic log rotation');
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);
    
    logger.info(
      { logDir: this.config.logDir, retentionDays: this.config.retentionDays },
      'Automatic log rotation started'
    );
  }

  /**
   * Stop automatic log rotation
   */
  stopAutomaticRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
      logger.info('Automatic log rotation stopped');
    }
  }

  /**
   * Rotate logs and clean up old files
   */
  async rotateLogs(): Promise<void> {
    try {
      await this.ensureLogDir();
      
      // Get all log files matching the pattern
      const files = await this.getLogFiles();
      
      // Rotate files that need rotation (older than today)
      const rotated = await this.rotateOldFiles(files);
      
      // Clean up files older than retention period
      const cleaned = await this.cleanupOldFiles(files);
      
      logger.info(
        { rotated, cleaned, totalFiles: files.length },
        'Log rotation completed'
      );
    } catch (error) {
      logger.error({ error, logDir: this.config.logDir }, 'Error rotating logs');
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
   * Get all log files matching the pattern
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.logDir);
      // Split pattern by * to get prefix and suffix
      const patternParts = this.config.filePattern.split('*');
      const prefix = patternParts[0] || '';
      const suffix = patternParts[1] || '';
      return files
        .filter(file => file.startsWith(prefix) && file.endsWith(suffix))
        .map(file => path.join(this.config.logDir, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Rotate old log files (compress if enabled)
   */
  private async rotateOldFiles(files: string[]): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    let rotated = 0;

    for (const file of files) {
      const fileName = path.basename(file);
      // Extract date from filename (format: prefix-YYYY-MM-DD.jsonl)
      const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
      
      if (!dateMatch) {
        continue; // Skip files without date in name
      }

      const fileDate = dateMatch[1];
      
      // Skip today's file (don't rotate current day)
      if (fileDate === today) {
        continue;
      }

      // Skip already compressed files
      if (fileName.endsWith('.gz')) {
        continue;
      }

      try {
        const rotatedPath = this.config.compress
          ? `${file}.gz`
          : file;

        if (this.config.compress) {
          // Compress the file
          await this.compressFile(file, rotatedPath);
          // Remove original after compression
          await fs.unlink(file);
        }

        rotated++;
        logger.debug({ file, rotatedPath }, 'Rotated log file');
      } catch (error) {
        logger.warn({ error, file }, 'Failed to rotate log file');
      }
    }

    return rotated;
  }

  /**
   * Compress a file using gzip
   */
  private async compressFile(inputPath: string, outputPath: string): Promise<void> {
    const readStream = createReadStream(inputPath);
    const writeStream = createWriteStream(outputPath);
    const gzip = createGzip();

    await pipeline(readStream, gzip, writeStream);
  }

  /**
   * Clean up files older than retention period
   */
  private async cleanupOldFiles(files: string[]): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    let cleaned = 0;

    for (const file of files) {
      const fileName = path.basename(file);
      // Extract date from filename (format: prefix-YYYY-MM-DD.jsonl or prefix-YYYY-MM-DD.jsonl.gz)
      const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
      
      if (!dateMatch) {
        continue; // Skip files without date in name
      }

      const fileDate = dateMatch[1];
      
      // Delete files older than retention period
      if (fileDate < cutoffDateStr) {
        try {
          await fs.unlink(file);
          cleaned++;
          logger.debug({ file, fileDate, cutoffDate: cutoffDateStr }, 'Cleaned up old log file');
        } catch (error) {
          logger.warn({ error, file }, 'Failed to delete old log file');
        }
      }
    }

    return cleaned;
  }

  /**
   * Manually rotate logs (for testing or immediate rotation)
   */
  async manualRotate(): Promise<{ rotated: number; cleaned: number }> {
    const files = await this.getLogFiles();
    const rotated = await this.rotateOldFiles(files);
    const cleaned = await this.cleanupOldFiles(files);
    
    return { rotated, cleaned };
  }
}

