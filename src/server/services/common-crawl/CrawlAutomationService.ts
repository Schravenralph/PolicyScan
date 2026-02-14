/**
 * Common Crawl Automation Service
 * 
 * Automatically detects new Common Crawl crawls and processes them
 * using the CDX file migration approach.
 */

import { logger } from '../../utils/logger.js';
import { CDXFileDownloadService } from './CDXFileDownloadService.js';
import { CDXFileProcessor } from './CDXFileProcessor.js';
import { CommonCrawlIndexService } from './CommonCrawlIndexService.js';
import * as path from 'path';
import * as os from 'os';

export interface AutomationConfig {
  enabled: boolean;
  checkIntervalHours: number; // How often to check for new crawls
  autoProcess: boolean; // Automatically process new crawls when detected
  maxFiles?: number; // Limit files per crawl (undefined = all files)
  concurrency?: number; // Download concurrency
  outputDir?: string; // Output directory for CDX files
  batchSize?: number; // Batch size for processing
  notificationEmail?: string; // Email for notifications (optional)
}

export interface CrawlStatus {
  crawlId: string;
  isLoaded: boolean;
  recordCount?: number;
  lastChecked?: Date;
  lastProcessed?: Date;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface AutomationStatus {
  enabled: boolean;
  lastCheck?: Date;
  nextCheck?: Date;
  latestCrawlId?: string;
  processedCrawls: CrawlStatus[];
  inProgress?: {
    crawlId: string;
    startedAt: Date;
    progress?: {
      filesDownloaded: number;
      filesTotal: number;
      recordsProcessed: number;
    };
  };
}

/**
 * Service for automating Common Crawl crawl detection and processing
 */
export class CrawlAutomationService {
  private readonly indexService: CommonCrawlIndexService;
  private readonly downloadService: CDXFileDownloadService;
  private readonly processor: CDXFileProcessor;
  private config: AutomationConfig;
  private status: AutomationStatus;
  private checkInterval?: NodeJS.Timeout;

  constructor(config: AutomationConfig) {
    this.config = config;
    this.indexService = new CommonCrawlIndexService();
    this.downloadService = new CDXFileDownloadService();
    this.processor = new CDXFileProcessor(this.indexService);
    this.status = {
      enabled: config.enabled,
      processedCrawls: [],
    };
  }

  /**
   * Start automation service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Crawl automation is disabled');
      return;
    }

    logger.info(
      {
        checkIntervalHours: this.config.checkIntervalHours,
        autoProcess: this.config.autoProcess,
      },
      'Starting Common Crawl automation service'
    );

    // Initial check
    await this.checkForNewCrawls();

    // Schedule periodic checks
    const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.checkForNewCrawls().catch((error) => {
        logger.error({ error }, 'Error during automated crawl check');
      });
    }, intervalMs);

    this.status.nextCheck = new Date(Date.now() + intervalMs);
    logger.info(
      { nextCheck: this.status.nextCheck },
      'Automation service started, scheduled periodic checks'
    );
  }

  /**
   * Stop automation service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.status.enabled = false;
    logger.info('Common Crawl automation service stopped');
  }

  /**
   * Check for new crawls and process if configured
   */
  async checkForNewCrawls(): Promise<CrawlStatus[]> {
    this.status.lastCheck = new Date();

    try {
      // Get latest crawl ID
      const latestCrawlId = await this.downloadService.getLatestCrawlId();
      this.status.latestCrawlId = latestCrawlId;

      logger.info({ latestCrawlId }, 'Checking for new Common Crawl crawls');

      // Check if this crawl is already loaded
      const isLoaded = await this.indexService.isCrawlLoaded(latestCrawlId);

      const crawlStatus: CrawlStatus = {
        crawlId: latestCrawlId,
        isLoaded,
        lastChecked: this.status.lastCheck,
      };

      if (!isLoaded && this.config.autoProcess) {
        logger.info(
          { crawlId: latestCrawlId },
          'New crawl detected, starting automatic processing'
        );
        crawlStatus.status = 'processing';
        crawlStatus.lastProcessed = new Date();

        // Process in background (don't await to avoid blocking)
        this.processCrawl(latestCrawlId).catch((error) => {
          logger.error(
            { error, crawlId: latestCrawlId },
            'Error processing crawl automatically'
          );
          crawlStatus.status = 'failed';
          crawlStatus.error =
            error instanceof Error ? error.message : String(error);
        });
      } else if (!isLoaded) {
        logger.info(
          { crawlId: latestCrawlId },
          'New crawl detected but auto-processing is disabled'
        );
        crawlStatus.status = 'pending';
      } else {
        logger.info(
          { crawlId: latestCrawlId },
          'Latest crawl is already loaded'
        );
        crawlStatus.status = 'completed';
      }

      // Update status
      const existingIndex = this.status.processedCrawls.findIndex(
        (c) => c.crawlId === latestCrawlId
      );
      if (existingIndex >= 0) {
        this.status.processedCrawls[existingIndex] = crawlStatus;
      } else {
        this.status.processedCrawls.push(crawlStatus);
      }

      // Keep only last 10 crawls in status
      if (this.status.processedCrawls.length > 10) {
        this.status.processedCrawls = this.status.processedCrawls.slice(-10);
      }

      return [crawlStatus];
    } catch (error) {
      logger.error({ error }, 'Error checking for new crawls');
      throw error;
    }
  }

  /**
   * Process a crawl (download and process CDX files)
   */
  async processCrawl(crawlId: string): Promise<void> {
    const startTime = Date.now();
    const outputDir =
      this.config.outputDir ||
      path.join(os.tmpdir(), 'commoncrawl-cdx', crawlId);

    this.status.inProgress = {
      crawlId,
      startedAt: new Date(),
    };

    try {
      logger.info({ crawlId, outputDir }, 'Starting crawl processing');

      // Filter for .nl domains
      const isNLDomain = (record: {
        url?: string;
        urlkey?: string;
      }): boolean => {
        const url = record.url || record.urlkey || '';
        return url.includes('.nl/') || url.endsWith('.nl');
      };

      // Download files
      const downloadResult = await this.downloadService.downloadFiles({
        crawlId,
        maxFiles: this.config.maxFiles,
        concurrency: this.config.concurrency,
        outputDir,
        onProgress: (progress) => {
          if (this.status.inProgress) {
            this.status.inProgress.progress = {
              filesDownloaded: progress.downloaded,
              filesTotal: progress.totalFiles,
              recordsProcessed: 0, // Will be updated during processing
            };
          }
        },
      });

      logger.info(
        {
          crawlId,
          downloaded: downloadResult.downloaded,
          failed: downloadResult.failed,
        },
        'CDX files downloaded'
      );

      // Process files
      const filesToProcess = downloadResult.files
        .filter((f) => f.status === 'downloaded')
        .map((f) => f.filePath);

      let totalRecordsProcessed = 0;
      for (const filePath of filesToProcess) {
        const result = await this.processor.processFile({
          filePath,
          crawlId,
          batchSize: this.config.batchSize,
          filter: isNLDomain,
          onProgress: (processed, _inserted) => {
            totalRecordsProcessed = processed;
            if (this.status.inProgress) {
              this.status.inProgress.progress = {
                ...this.status.inProgress.progress!,
                recordsProcessed: processed,
              };
            }
          },
        });

        logger.info(
          {
            filePath,
            recordsProcessed: result.recordsProcessed,
            recordsInserted: result.recordsInserted,
          },
          'File processed'
        );
      }

      // Update status
      const crawlStatus = this.status.processedCrawls.find(
        (c) => c.crawlId === crawlId
      );
      if (crawlStatus) {
        crawlStatus.status = 'completed';
        crawlStatus.recordCount = totalRecordsProcessed;
        crawlStatus.lastProcessed = new Date();
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          crawlId,
          duration: `${(duration / 1000).toFixed(2)}s`,
          recordsProcessed: totalRecordsProcessed,
        },
        'Crawl processing completed'
      );

      // Clear in-progress status
      this.status.inProgress = undefined;
    } catch (error) {
      logger.error({ error, crawlId }, 'Error processing crawl');

      // Update status
      const crawlStatus = this.status.processedCrawls.find(
        (c) => c.crawlId === crawlId
      );
      if (crawlStatus) {
        crawlStatus.status = 'failed';
        crawlStatus.error =
          error instanceof Error ? error.message : String(error);
      }

      this.status.inProgress = undefined;
      throw error;
    }
  }

  /**
   * Get automation status
   */
  getStatus(): AutomationStatus {
    return { ...this.status };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutomationConfig>): void {
    this.config = { ...this.config, ...config };
    this.status.enabled = this.config.enabled;

    // Restart if enabled state changed
    if (this.config.enabled && !this.checkInterval) {
      this.start().catch((error) => {
        logger.error({ error }, 'Error restarting automation service');
      });
    } else if (!this.config.enabled && this.checkInterval) {
      this.stop();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AutomationConfig {
    return { ...this.config };
  }
}

