import Bull from 'bull';
import { logger } from '../../../utils/logger.js';
import type { ScrapingJobData, ScrapingJobResult } from '../../../types/job-data.js';
import type {
  ScrapingJobProcessor,
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './BaseJobProcessor.js';

/**
 * Processor for scraping jobs
 * Handles website scraping operations
 */
export class ScrapingJobProcessorImpl implements ScrapingJobProcessor {
  constructor(
    private progressEmitter: ProgressEventEmitter,
    private metricsUpdater: PerformanceMetricsUpdater
  ) {}

  async process(job: Bull.Job<ScrapingJobData>): Promise<ScrapingJobResult> {
    const { websiteUrl, onderwerp, thema, queryId, maxPages = 5 } = job.data;
    const jobId = String(job.id);
    const startTime = Date.now();

    logger.info({ jobId, websiteUrl }, 'Processing scraping job');

    try {
      // Emit job started event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_started',
        jobId,
        jobType: 'scraping',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'active',
          message: `Scraping job started for ${websiteUrl}`,
        },
      });

      // Update job progress and emit event
      await job.progress(10);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scraping',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 10,
          message: 'Initializing scraper...',
        },
      });

      // Import WebsiteScraper dynamically
      const { WebsiteScraper } = await import('../../scraping/websiteScraper.js');
      const scraper = new WebsiteScraper();

      await job.progress(30);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scraping',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 30,
          message: 'Scraper initialized, starting scrape...',
        },
      });

      // Perform the scraping
      const documents = await scraper.scrapeWebsite(websiteUrl, onderwerp, thema, maxPages);

      await job.progress(90);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scraping',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 90,
          message: `Scraping completed, found ${documents.length} documents`,
        },
      });

      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('scrapingJobs', processingTime);

      const result: ScrapingJobResult = {
        success: true,
        websiteUrl,
        documents,
        documentsFound: documents.length,
      };

      await job.progress(100);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_completed',
        jobId,
        jobType: 'scraping',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'completed',
          message: `Scraping job completed successfully (${documents.length} documents found)`,
          result,
          metadata: {
            websiteUrl,
            documentsFound: documents.length,
            processingTimeMs: processingTime,
          },
        },
      });

      logger.info({ jobId, websiteUrl, documentsFound: documents.length, processingTimeMs: processingTime }, 'Scraping job completed successfully');

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('scrapingJobs', processingTime);
      logger.error({ jobId, websiteUrl, error, processingTimeMs: processingTime }, 'Error processing scraping job');

      // Emit job failed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_failed',
        jobId,
        jobType: 'scraping',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          errorDetails: error,
        },
      });

      const _result: ScrapingJobResult = {
        success: false,
        websiteUrl,
        documents: [],
        documentsFound: 0,
        error: error instanceof Error ? error.message : String(error),
      };

      throw error; // Bull will handle retries
    }
  }
}

