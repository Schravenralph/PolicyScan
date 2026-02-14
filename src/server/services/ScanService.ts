import { ObjectId } from 'mongodb';
import { getDB } from '../config/database.js';
import { Query } from '../models/Query.js';
import { getQueueService } from './infrastructure/QueueService.js';
import { WorkflowEngine } from './workflow/WorkflowEngine.js';
import { beleidsscanStep4ScanKnownSourcesWorkflow } from '../workflows/predefinedWorkflows.js';
import { logger } from '../utils/logger.js';
import type {
  ScanJobResponseDto,
  JobStatusResponseDto,
  JobsListResponseDto,
  ScanStatusResponseDto,
} from '../types/dto.js';
import type { ScanJobData } from './infrastructure/QueueService.js';
import * as Bull from 'bull';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../types/errors.js';

/**
 * Service for scan orchestration business logic
 * Handles scan job queuing, status tracking, and workflow management
 */
export class ScanService {
  private queueService = getQueueService();

  /**
   * Queue a scan job
   */
  async queueScanJob(queryId: string): Promise<ScanJobResponseDto> {
    try {
      const query = await Query.findById(queryId);
      if (!query) {
        throw new NotFoundError('Query', queryId, {
          reason: 'query_not_found',
          operation: 'queueScanJob',
        });
      }

      logger.info({ queryId, onderwerp: query.onderwerp }, 'Queuing scan job for query');

      const jobData: ScanJobData = {
        queryId,
        onderwerp: query.onderwerp,
        thema: query.onderwerp, // Use onderwerp as thema if not separately defined
        overheidslaag: query.overheidstype || query.overheidsinstantie || 'onbekend',
      };

      const job = await this.queueService.queueScan(jobData);

      return {
        success: true,
        jobId: job.id,
        queryId,
        status: 'queued',
        message: 'Scan job queued. Use GET /api/queries/:id/scan/job/:jobId to check status.',
      };
    } catch (error) {
      logger.error({ error, queryId }, 'Error queueing scan job');
      throw error;
    }
  }

  /**
   * Get the status of a specific scan job
   */
  async getJobStatus(queryId: string, jobId: string): Promise<JobStatusResponseDto> {
    try {
      const job = await this.queueService.getJobStatus(jobId, 'scan');
      if (!job) {
        throw new NotFoundError('Job', jobId, {
          reason: 'job_not_found',
          operation: 'getJobStatus',
        });
      }

      // Type assertion for scan job
      const scanJob = job as Bull.Job<ScanJobData>;
      
      // Verify job belongs to this query
      if (scanJob.data.queryId !== queryId) {
        throw new BadRequestError('Job does not belong to this query', {
          reason: 'job_query_mismatch',
          operation: 'getJobStatus',
          jobId,
          queryId,
          jobQueryId: scanJob.data.queryId
        });
      }

      const state = await scanJob.getState();
      const progress = scanJob.progress();
      const priority = (scanJob.opts?.priority as number | undefined) ?? scanJob.data.priority;

      const response: JobStatusResponseDto = {
        jobId: scanJob.id,
        queryId,
        status: state,
        progress: typeof progress === 'number' ? progress : 0,
        createdAt: new Date(scanJob.timestamp).toISOString(),
        priority,
      };

      // Add result if completed
      if (state === 'completed') {
        const result = await scanJob.finished();
        response.result = result;
      }

      // Add error if failed
      if (state === 'failed') {
        const failedReason = scanJob.failedReason;
        response.error = failedReason;
      }

      return response;
    } catch (error) {
      logger.error({ error, jobId }, 'Error getting job status');
      throw error;
    }
  }

  /**
   * Get all scan jobs for a query
   */
  async getJobsForQuery(queryId: string): Promise<JobsListResponseDto> {
    try {
      const jobs = await this.queueService.getJobsForQuery(queryId);

      const jobsWithStatus = await Promise.all(
        jobs
          .filter((job: Bull.Job) => {
            // Only return scan jobs
            const data = job.data as ScanJobData;
            return data.queryId === queryId;
          })
          .map(async (job: Bull.Job) => {
            const scanJob = job as Bull.Job<ScanJobData>;
            const state = await scanJob.getState();
            const priority = (scanJob.opts?.priority as number | undefined) ?? scanJob.data.priority;
            return {
              jobId: scanJob.id,
              queryId: scanJob.data.queryId,
              status: state,
              progress: typeof scanJob.progress() === 'number' ? scanJob.progress() : 0,
              createdAt: new Date(scanJob.timestamp).toISOString(),
              priority,
              failedReason: state === 'failed' ? scanJob.failedReason : undefined,
            };
          })
      );

      return {
        queryId,
        jobs: jobsWithStatus,
        count: jobsWithStatus.length,
      };
    } catch (error) {
      logger.error({ error, queryId }, 'Error getting jobs for query');
      throw error;
    }
  }

  /**
   * Cancel a scan job
   */
  async cancelJob(queryId: string, jobId: string): Promise<{ success: boolean; jobId: string; message: string }> {
    try {
      const job = await this.queueService.getJobStatus(jobId, 'scan');
      if (!job) {
        throw new NotFoundError('Job', jobId, {
          reason: 'job_not_found',
          operation: 'getJobStatus',
        });
      }

      const scanJob = job as Bull.Job<ScanJobData>;
      
      // Verify job belongs to this query
      if (scanJob.data.queryId !== queryId) {
        throw new BadRequestError('Job does not belong to this query', {
          reason: 'job_query_mismatch',
          operation: 'getJobStatus',
          jobId,
          queryId,
          jobQueryId: scanJob.data.queryId
        });
      }

      const cancelled = await this.queueService.cancelJob(jobId, 'scan');
      if (!cancelled) {
        throw new ServiceUnavailableError('Failed to cancel job', {
          reason: 'job_cancellation_failed',
          operation: 'cancelScanJob',
          jobId
        });
      }

      return {
        success: true,
        jobId,
        message: 'Job cancelled successfully',
      };
    } catch (error) {
      logger.error({ error, jobId }, 'Error cancelling job');
      throw error;
    }
  }

  /**
   * Get scan status (legacy endpoint - counts documents)
   */
  async getScanStatus(queryId: string): Promise<ScanStatusResponseDto> {
    try {
      const db = getDB();

      // Count documents for this query using canonical document service
      const { getCanonicalDocumentService } = await import('./canonical/CanonicalDocumentService.js');
      const documentService = getCanonicalDocumentService();
      const documentsCount = await documentService.countByQueryId(queryId);

      const sourcesCount = await db
        .collection('bronwebsites')
        .countDocuments({ queryId: new ObjectId(queryId) });

      return {
        status: 'completed',
        documentsFound: documentsCount,
        sourcesFound: sourcesCount,
      };
    } catch (error) {
      logger.error({ error, queryId }, 'Error getting scan status');
      throw error;
    }
  }

  /**
   * Start a scrape workflow for selected websites
   * 
   * @param queryId - Query ID
   * @param websiteIds - Selected website IDs
   * @param workflowEngine - Workflow engine instance
   * @param userId - Optional user ID to use their active workflow configuration
   */
  async startScrapeWorkflow(
    queryId: string,
    websiteIds: string[],
    workflowEngine: WorkflowEngine,
    userId?: string
  ): Promise<ScanJobResponseDto> {
    try {
      const query = await Query.findById(queryId);
      if (!query) {
        throw new NotFoundError('Query', queryId, {
          reason: 'query_not_found',
          operation: 'queueScanJob',
        });
      }

      const db = getDB();

      // Get the selected websites
      interface WebsiteDocument {
        url: string;
      }

      const websites = await db
        .collection<WebsiteDocument>('bronwebsites')
        .find({
          _id: { $in: websiteIds.map((id: string) => new ObjectId(id)) }
        })
        .toArray();

      if (websites.length === 0) {
        throw new NotFoundError('Websites', undefined, {
          reason: 'websites_not_found',
          operation: 'getScanStatus',
          websiteIds: websiteIds.length
        });
      }

      // Update query with selected website URLs
      const websiteUrls = websites.map((w) => w.url);
      await Query.update(queryId, { websiteUrls });

      // Determine workflow and parameters
      // Priority: User's active configuration > Query-based logic > Default
      let workflow;
      let workflowParams: Record<string, unknown>;
      let workflowId: string | undefined;

      // Try to get workflow from user's active configuration
      if (userId) {
        try {
          const { WorkflowConfiguration } = await import('../models/WorkflowConfiguration.js');
          const config = await WorkflowConfiguration.findActiveByUser(userId);
          if (config) {
            workflowId = config.workflowId;
            logger.info(
              { userId, queryId, workflowId: config.workflowId, configName: config.name },
              'Using workflow from user active configuration'
            );
          }
        } catch (error) {
          logger.warn(
            { error, userId, queryId },
            'Failed to get user configuration (non-fatal) - falling back to query-based logic'
          );
        }
      }

      // If no configuration workflow, use query-based logic
      if (!workflowId) {
        // Check if Horst aan de Maas is selected
        const isHorstAanDeMaas = query.overheidsinstantie?.toLowerCase().includes('horst') ||
                                 query.overheidsinstantie?.toLowerCase().includes('horst aan de maas') ||
                                 websites.some((w) => w.url?.toLowerCase().includes('horstaandemaas'));

        if (isHorstAanDeMaas) {
          workflowId = 'horst-aan-de-maas';
        } else {
          workflowId = 'beleidsscan-step-4-scan-sources';
        }
      }

      // Get workflow by ID
      const { getWorkflowById } = await import('../utils/workflowLookup.js');
      workflow = await getWorkflowById(workflowId);
      if (!workflow) {
        logger.warn(
          { workflowId, queryId, userId },
          `Workflow ${workflowId} not found, falling back to beleidsscan-step-4-scan-sources`
        );
        workflow = beleidsscanStep4ScanKnownSourcesWorkflow;
        workflowId = 'beleidsscan-step-4-scan-sources';
      }

      // Prepare workflow parameters
      if (workflowId === 'horst-aan-de-maas') {
        const onderwerpLower = (query.onderwerp || '').toLowerCase();
        const topic = (onderwerpLower && !onderwerpLower.includes('arbeid') && !onderwerpLower.includes('energie'))
            ? query.onderwerp  // Use user's topic if not arbeid/energie
            : (onderwerpLower.includes('arbeid') ? query.onderwerp : 'arbeidsmigranten'); // Default for backward compat
        
        workflowParams = {
          queryId,
          onderwerp: topic,
          thema: topic,
          websiteUrls
        };
        logger.info({ queryId, topic }, 'Horst aan de Maas workflow - using topic');
      } else {
        workflowParams = {
          queryId,
          onderwerp: query.onderwerp || 'klimaatadaptatie', // Use query or default
          websiteUrls,
          selectedWebsites: websiteIds
        };
      }
      
      const runId = await workflowEngine.startWorkflow(workflow, workflowParams);

      logger.info({ queryId, runId }, 'Started workflow for query');

      return {
        success: true,
        runId,
        message: 'Workflow started. Graph visualization will update in real-time.',
        documents: [], // Will be populated by workflow
        documentsFound: 0
      };
    } catch (error) {
      logger.error({ error, queryId }, 'Error starting scrape workflow');
      throw error;
    }
  }
}
