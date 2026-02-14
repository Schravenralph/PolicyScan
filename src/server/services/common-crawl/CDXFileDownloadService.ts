/**
 * CDX File Download Service
 * 
 * Downloads Common Crawl CDX index files via HTTPS with parallel downloads,
 * resume capability, and progress tracking.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { AxiosInstance } from 'axios';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { logger } from '../../utils/logger.js';
import { retryWithBackoff } from '../../utils/retry.js';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';

export interface DownloadResult {
  downloaded: number;
  failed: number;
  skipped: number;
  totalSize: number;
  files: DownloadedFile[];
}

export interface DownloadedFile {
  filename: string;
  filePath: string;
  size: number;
  recordCount?: number;
  status: 'downloaded' | 'skipped' | 'failed';
  error?: string;
  downloadDuration?: number; // milliseconds
  downloadSpeed?: number; // MB/s
}

export interface ProgressInfo {
  totalFiles: number;
  downloaded: number;
  failed: number;
  skipped: number;
  inProgress: number;
  totalSize: number;
  downloadedSize: number;
  downloadSpeed?: number; // MB/s
  estimatedTimeRemaining?: number; // seconds
  files: FileProgress[];
}

export interface FileProgress {
  filename: string;
  status: 'pending' | 'downloading' | 'downloaded' | 'failed' | 'skipped';
  size?: number;
  downloadedSize?: number;
  error?: string;
}

export interface DownloadOptions {
  crawlId: string;
  maxFiles?: number;
  concurrency?: number;
  outputDir?: string;
  resume?: boolean;
  validateGzip?: boolean;
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * Service for downloading Common Crawl CDX files
 */
export class CDXFileDownloadService {
  private readonly baseUrl = 'https://data.commoncrawl.org/cc-index/collections';
  private readonly httpClient: AxiosInstance;
  private readonly defaultConcurrency = 5;
  private readonly defaultMaxFiles = 200; // Reasonable default for full crawl

  constructor() {
    this.httpClient = createHttpClient({
      timeout: HTTP_TIMEOUTS.LONG, // 2 minutes for large file downloads
    });
  }

  /**
   * Get latest crawl ID from Common Crawl API
   */
  async getLatestCrawlId(): Promise<string> {
    try {
      const response = await this.httpClient.get('https://index.commoncrawl.org/collinfo.json', {
        timeout: HTTP_TIMEOUTS.STANDARD,
      });
      const collections = response.data as Array<{ id: string }>;
      if (collections && collections.length > 0) {
        return collections[0].id;
      }
      throw new Error('No collections found');
    } catch (error) {
      logger.warn(
        { error },
        'Failed to get latest crawl ID from API, using fallback'
      );
      // Fallback to a known recent crawl
      return 'CC-MAIN-2025-51';
    }
  }

  /**
   * Download CDX files for a crawl
   */
  async downloadFiles(options: DownloadOptions): Promise<DownloadResult> {
    const {
      crawlId,
      maxFiles = this.defaultMaxFiles,
      concurrency = this.defaultConcurrency,
      outputDir,
      resume = true,
      validateGzip = true,
      onProgress,
    } = options;

    const outputDirectory = outputDir || this.getDefaultOutputDir(crawlId);
    await fs.mkdir(outputDirectory, { recursive: true });

    logger.info(
      { crawlId, maxFiles, concurrency, outputDir: outputDirectory },
      'Starting CDX file download'
    );

    const files: DownloadedFile[] = [];
    // If maxFiles is undefined, we'll download until we hit a 404 (file doesn't exist)
    const isUnlimited = maxFiles === undefined;
    const downloadStartTime = Date.now();
    const progress: ProgressInfo = {
      totalFiles: maxFiles || 0, // Will be updated as we discover files
      downloaded: 0,
      failed: 0,
      skipped: 0,
      inProgress: 0,
      totalSize: 0,
      downloadedSize: 0,
      downloadSpeed: 0,
      estimatedTimeRemaining: undefined,
      files: [],
    };

    // Download files with concurrency control
    const downloadQueue: Array<Promise<void>> = [];
    let fileIndex = 0;
    let consecutiveFailures = 0; // Track consecutive 404s to detect end of files
    const MAX_CONSECUTIVE_FAILURES = 5; // Stop after 5 consecutive 404s

    const downloadNext = async (): Promise<void> => {
      while (isUnlimited ? consecutiveFailures < MAX_CONSECUTIVE_FAILURES : fileIndex < maxFiles) {
        const currentIndex = fileIndex++;
        const fileNum = String(currentIndex).padStart(5, '0');
        const filename = `cdx-${fileNum}.gz`;
        const filePath = path.join(outputDirectory, filename);

        // Check if file already exists (resume capability)
        if (resume) {
          try {
            const stats = await fs.stat(filePath);
            if (stats.size > 0) {
              // Validate gzip if requested
              if (validateGzip) {
                const isValid = await this.validateGzipFile(filePath);
                if (isValid) {
                  logger.debug({ filename }, 'File already exists and is valid, skipping');
                  files.push({
                    filename,
                    filePath,
                    size: stats.size,
                    status: 'skipped',
                  });
                  progress.skipped++;
                  progress.downloadedSize += stats.size;
                  if (onProgress) {
                    // Update download speed
                    const elapsedSeconds = (Date.now() - downloadStartTime) / 1000;
                    if (elapsedSeconds > 0 && progress.downloadedSize > 0) {
                      progress.downloadSpeed = progress.downloadedSize / elapsedSeconds / 1024 / 1024; // MB/s
                    }
                    onProgress({ ...progress });
                  }
                  continue;
                } else {
                  logger.warn({ filename }, 'Existing file is invalid, re-downloading');
                  await fs.unlink(filePath);
                }
              } else {
                files.push({
                  filename,
                  filePath,
                  size: stats.size,
                  status: 'skipped',
                });
                progress.skipped++;
                progress.downloadedSize += stats.size;
                // Update download speed
                const elapsedSeconds = (Date.now() - downloadStartTime) / 1000;
                if (elapsedSeconds > 0 && progress.downloadedSize > 0) {
                  progress.downloadSpeed = progress.downloadedSize / elapsedSeconds / 1024 / 1024; // MB/s
                }
                if (onProgress) onProgress({ ...progress });
                continue;
              }
            }
          } catch {
            // File doesn't exist, proceed with download
          }
        }

        // Download file
        progress.inProgress++;
        if (onProgress) {
          // Update download speed for progress display
          const elapsedSeconds = (Date.now() - downloadStartTime) / 1000;
          if (elapsedSeconds > 0 && progress.downloadedSize > 0) {
            progress.downloadSpeed = progress.downloadedSize / elapsedSeconds / 1024 / 1024; // MB/s
          }
          onProgress({ ...progress });
        }

        try {
          const result = await this.downloadFile(crawlId, filename, filePath);
          files.push(result);
          progress.downloaded++;
          progress.downloadedSize += result.size;
          progress.totalSize += result.size;
          consecutiveFailures = 0; // Reset on success
          // Update totalFiles for unlimited mode
          if (isUnlimited) {
            progress.totalFiles = fileIndex;
          }
          // Calculate download speed and ETA
          const elapsedSeconds = (Date.now() - downloadStartTime) / 1000;
          if (elapsedSeconds > 0 && progress.downloadedSize > 0) {
            progress.downloadSpeed = progress.downloadedSize / elapsedSeconds / 1024 / 1024; // MB/s
            if (progress.totalFiles > 0 && (progress.downloaded + progress.skipped) < progress.totalFiles) {
              const avgSizePerFile = progress.downloadedSize / Math.max(1, progress.downloaded + progress.skipped);
              const remainingFiles = progress.totalFiles - progress.downloaded - progress.skipped;
              if (remainingFiles > 0 && progress.downloadSpeed > 0) {
                const remainingSize = remainingFiles * avgSizePerFile;
                progress.estimatedTimeRemaining = remainingSize / (progress.downloadSpeed * 1024 * 1024); // seconds
              }
            }
          }
          if (onProgress) onProgress({ ...progress });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          // Check if it's a 404 (file doesn't exist) - indicates end of files for unlimited mode
          const is404 = errorMessage.includes('404') || 
                       errorMessage.includes('Not Found') ||
                       (error instanceof Error && 'response' in error && 
                        (error as { response?: { status?: number } }).response?.status === 404);
          
          if (isUnlimited && is404) {
            // In unlimited mode, 404 means we've reached the end
            consecutiveFailures++;
            logger.debug({ filename, consecutiveFailures }, 'File not found (404), may have reached end');
            // Don't add to failed files list for 404s in unlimited mode
            // Just continue to next file
            fileIndex++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              logger.info({ fileIndex }, 'Reached end of files (5 consecutive 404s)');
              break; // Exit the loop
            }
            continue;
          }
          
          logger.error({ filename, error: errorMessage }, 'Failed to download file');
          files.push({
            filename,
            filePath,
            size: 0,
            status: 'failed',
            error: errorMessage,
          });
          progress.failed++;
          consecutiveFailures = is404 ? consecutiveFailures + 1 : 0;
        } finally {
          progress.inProgress--;
          if (onProgress) onProgress({ ...progress });
        }
      }
    };

    // Start concurrent downloads
    for (let i = 0; i < concurrency; i++) {
      downloadQueue.push(downloadNext());
    }

    await Promise.all(downloadQueue);

    logger.info(
      {
        crawlId,
        downloaded: progress.downloaded,
        failed: progress.failed,
        skipped: progress.skipped,
        totalSize: progress.downloadedSize,
      },
      'CDX file download completed'
    );

    return {
      downloaded: progress.downloaded,
      failed: progress.failed,
      skipped: progress.skipped,
      totalSize: progress.downloadedSize,
      files,
    };
  }

  /**
   * Download a single CDX file
   */
  private async downloadFile(
    crawlId: string,
    filename: string,
    filePath: string
  ): Promise<DownloadedFile> {
    const url = `${this.baseUrl}/${crawlId}/indexes/${filename}`;
    const downloadStartTime = Date.now();

    return await retryWithBackoff(
      async () => {
        logger.debug({ filename, url }, 'Downloading CDX file');

        const response = await this.httpClient.get(url, {
          responseType: 'stream',
          timeout: HTTP_TIMEOUTS.VERY_LONG, // 5 minutes for large files
        });

        const writeStream = createWriteStream(filePath);
        await pipeline(response.data, writeStream);

        const stats = await fs.stat(filePath);
        const recordCount = await this.countRecords(filePath);
        const downloadDuration = Date.now() - downloadStartTime;
        const downloadSpeed = downloadDuration > 0 ? stats.size / downloadDuration / 1024 / 1024 * 1000 : 0; // MB/s

        logger.debug(
          { filename, size: stats.size, recordCount, downloadDuration, downloadSpeed },
          'CDX file downloaded successfully'
        );

        return {
          filename,
          filePath,
          size: stats.size,
          recordCount,
          status: 'downloaded' as const,
          downloadDuration,
          downloadSpeed,
        };
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        multiplier: 2,
      },
      `Download ${filename}`
    );
  }

  /**
   * Validate gzip file integrity
   */
  private async validateGzipFile(filePath: string): Promise<boolean> {
    try {
      const readStream = createReadStream(filePath);
      const gunzip = createGunzip();
      await pipeline(readStream, gunzip);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Count records in a CDX file (quick estimate)
   */
  private async countRecords(filePath: string): Promise<number | undefined> {
    try {
      const _readStream = createReadStream(filePath);
      const gunzip = createGunzip();
      let _count = 0;
      
      for await (const chunk of gunzip) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
        _count += lines.length;
        // Only count first chunk for performance
        break;
      }
      
      // Estimate total based on file size (rough estimate)
      const stats = await fs.stat(filePath);
      const avgLineSize = 150; // Approximate bytes per line (compressed)
      return Math.floor((stats.size / avgLineSize) * 0.7); // 0.7 compression ratio estimate
    } catch {
      return undefined;
    }
  }

  /**
   * Get default output directory for a crawl
   */
  private getDefaultOutputDir(crawlId: string): string {
    return path.join(process.cwd(), 'commoncrawl', crawlId, 'cdx-indexes');
  }

  /**
   * Resume interrupted download
   */
  async resumeDownload(crawlId: string, outputDir: string): Promise<DownloadResult> {
    return this.downloadFiles({
      crawlId,
      outputDir,
      resume: true,
      validateGzip: true,
    });
  }

  /**
   * Get download progress
   */
  async getProgress(crawlId: string, outputDir: string): Promise<ProgressInfo> {
    const directory = outputDir || this.getDefaultOutputDir(crawlId);
    
    try {
      const files = await fs.readdir(directory);
      const gzFiles = files.filter(f => f.endsWith('.gz'));
      
      const fileProgress: FileProgress[] = [];
      let downloadedSize = 0;
      let downloaded = 0;
      let failed = 0;
      const skipped = 0;

      for (const filename of gzFiles) {
        const filePath = path.join(directory, filename);
        try {
          const stats = await fs.stat(filePath);
          const isValid = await this.validateGzipFile(filePath);
          
          fileProgress.push({
            filename,
            status: isValid ? 'downloaded' : 'failed',
            size: stats.size,
            downloadedSize: stats.size,
          });
          
          if (isValid) {
            downloaded++;
            downloadedSize += stats.size;
          } else {
            failed++;
          }
        } catch {
          fileProgress.push({
            filename,
            status: 'failed',
          });
          failed++;
        }
      }

      return {
        totalFiles: gzFiles.length,
        downloaded,
        failed,
        skipped,
        inProgress: 0,
        totalSize: downloadedSize,
        downloadedSize,
        files: fileProgress,
      };
    } catch {
      return {
        totalFiles: 0,
        downloaded: 0,
        failed: 0,
        skipped: 0,
        inProgress: 0,
        totalSize: 0,
        downloadedSize: 0,
        files: [],
      };
    }
  }
}
