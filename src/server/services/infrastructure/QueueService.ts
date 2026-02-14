import Bull from 'bull';
import { logger } from '../../utils/logger.js';
import { validateEnv } from '../../config/env.js';
import type {
  ScanJobData,
  EmbeddingJobData,
  ProcessingJobData,
  ExportJobData,
  WorkflowJobData,
  ScrapingJobData,
  ScanJobResult,
} from '../../types/job-data.js';
import { JobPriority as JobPriorityEnum } from '../../types/job-data.js';
import { getProgressService } from '../progress/ProgressService.js';
import type {
  JobStartedEvent,
  JobProgressEvent,
  JobStepEvent,
  JobCompletedEvent,
  JobFailedEvent,
} from '../../types/progress.js';
import { JOB_QUEUE } from '../../config/constants.js';
import { ScanJobProcessorImpl } from './queue-processors/ScanJobProcessor.js';
import { EmbeddingJobProcessorImpl } from './queue-processors/EmbeddingJobProcessor.js';
import { ProcessingJobProcessorImpl } from './queue-processors/ProcessingJobProcessor.js';
import { ExportJobProcessorImpl } from './queue-processors/ExportJobProcessor.js';
import { WorkflowJobProcessorImpl } from './queue-processors/WorkflowJobProcessor.js';
import { ScrapingJobProcessorImpl } from './queue-processors/ScrapingJobProcessor.js';
import type {
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './queue-processors/BaseJobProcessor.js';
import { QueueManager } from './QueueManager.js';
import { QueueEventHandlers } from './QueueEventHandlers.js';
import { getRedisConnectionManager } from './RedisConnectionManager.js';

// Re-export ScanJobData and ScanJobResult for backward compatibility
export type { ScanJobData, ScanJobResult };

/**
 * QueueService manages background job queues for long-running operations
 * Uses Bull (Redis-based) for job queue management
 * 
 * Supports multiple job types:
 * - scan: Website/document scanning operations
 * - embedding: Vector embedding generation for documents
 * - processing: Document processing operations (metadata extraction, content analysis)
 * - export: Export documents/workflows in various formats
 * - workflow: Workflow execution with modules
 */
export class QueueService implements ProgressEventEmitter, PerformanceMetricsUpdater {
  private queueManager: QueueManager;
  private initialized: boolean = false;
  private scanJobProcessor: ScanJobProcessorImpl | null = null;
  private embeddingJobProcessor: EmbeddingJobProcessorImpl | null = null;
  private processingJobProcessor: ProcessingJobProcessorImpl | null = null;
  private exportJobProcessor: ExportJobProcessorImpl | null = null;
  private workflowJobProcessor: WorkflowJobProcessorImpl | null = null;
  private scrapingJobProcessor: ScrapingJobProcessorImpl | null = null;
  private workflowProcessorStarted: boolean = false;
  // Performance metrics
  private performanceMetrics: {
    scanJobs: { count: number; totalTime: number; avgTime: number };
    embeddingJobs: { count: number; totalTime: number; avgTime: number };
    processingJobs: { count: number; totalTime: number; avgTime: number };
    exportJobs: { count: number; totalTime: number; avgTime: number };
    workflowJobs: { count: number; totalTime: number; avgTime: number };
    scrapingJobs: { count: number; totalTime: number; avgTime: number };
  } = {
    scanJobs: { count: 0, totalTime: 0, avgTime: 0 },
    embeddingJobs: { count: 0, totalTime: 0, avgTime: 0 },
    processingJobs: { count: 0, totalTime: 0, avgTime: 0 },
    exportJobs: { count: 0, totalTime: 0, avgTime: 0 },
    workflowJobs: { count: 0, totalTime: 0, avgTime: 0 },
    scrapingJobs: { count: 0, totalTime: 0, avgTime: 0 },
  };

  constructor() {
    // Initialize QueueManager
    this.queueManager = new QueueManager();
  }

  /**
   * Get queue instances (for backward compatibility and internal use)
   */
  private get scanQueue(): Bull.Queue<ScanJobData> | null {
    return this.queueManager.isInitialized() ? this.queueManager.getScanQueue() : null;
  }

  private get embeddingQueue(): Bull.Queue<EmbeddingJobData> | null {
    return this.queueManager.isInitialized() ? this.queueManager.getEmbeddingQueue() : null;
  }

  private get processingQueue(): Bull.Queue<ProcessingJobData> | null {
    return this.queueManager.isInitialized() ? this.queueManager.getProcessingQueue() : null;
  }

  private get exportQueue(): Bull.Queue<ExportJobData> | null {
    return this.queueManager.isInitialized() ? this.queueManager.getExportQueue() : null;
  }

  private get workflowQueue(): Bull.Queue<WorkflowJobData> | null {
    return this.queueManager.isInitialized() ? this.queueManager.getWorkflowQueue() : null;
  }

  private get scrapingQueue(): Bull.Queue<ScrapingJobData> | null {
    return this.queueManager.isInitialized() ? this.queueManager.getScrapingQueue() : null;
  }

  /**
   * Helper to add job to query index
   */
  private async addToQueryIndex(queryId: string, queueName: string, jobId: string | number): Promise<void> {
    try {
      const redisManager = getRedisConnectionManager();
      const client = redisManager.getClient();
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        const key = `query:${queryId}:jobs`;
        const indexedKey = `query:${queryId}:indexed`;

        await client.sadd(key, `${queueName}:${jobId}`);
        // Set expiry to 7 days (same as job retention) to prevent stale keys
        await client.expire(key, 7 * 24 * 60 * 60);

        // Only refresh the indexed flag if it already exists (XX)
        // This prevents marking the index as complete for existing queries that haven't been fully indexed yet
        await client.set(indexedKey, '1', 'EX', 7 * 24 * 60 * 60, 'XX');
      }
    } catch (error) {
      // Don't fail the job if indexing fails
      logger.warn({ error, queryId, queueName, jobId }, 'Failed to add job to query index');
    }
  }

  /**
   * Initialize all queues (lazy initialization)
   * Uses QueueManager for queue initialization
   */
  private async initializeQueues(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Skip initialization if Redis is explicitly disabled
    const env = validateEnv();
    if (env.CACHE_REDIS_ENABLED === false) {
      logger.info('Redis disabled via CACHE_REDIS_ENABLED, skipping queue initialization');
      return;
    }

    try {
      // Initialize queues using QueueManager
      const env = validateEnv();

      // Ensure Redis connection manager is initialized for the secondary index
      await getRedisConnectionManager().initialize();

      await this.queueManager.initializeQueues({
        redis: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
        defaultJobOptions: QueueManager.createDefaultJobOptions(),
      });

      // Set up event handlers for all queues
      const queues = this.queueManager.getQueues();
      QueueEventHandlers.setupEventHandlers(queues);
      
      // Initialize job processors
      this.scanJobProcessor = new ScanJobProcessorImpl(this, this);
      this.embeddingJobProcessor = new EmbeddingJobProcessorImpl(this, this);
      this.processingJobProcessor = new ProcessingJobProcessorImpl(this, this);
      this.exportJobProcessor = new ExportJobProcessorImpl(this, this);
      this.workflowJobProcessor = new WorkflowJobProcessorImpl(this, this);
      this.scrapingJobProcessor = new ScrapingJobProcessorImpl(this, this);
      
      this.initialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRedisError = errorMessage.includes('Redis') ||
                          errorMessage.includes('redis') ||
                          errorMessage.includes('ECONNREFUSED') ||
                          errorMessage.includes('EAI_AGAIN') ||
                          errorMessage.includes('getaddrinfo') ||
                          errorMessage.includes('connection') ||
                          errorMessage.includes('timeout');
      
      logger.warn({ error: errorMessage }, 'Failed to initialize queue service');
      
      if (isRedisError) {
        const { ServiceUnavailableError } = await import('../../types/errors.js');
        throw new ServiceUnavailableError(
          `Queue service initialization failed. Redis connection may be unavailable: ${errorMessage}`,
          {
            reason: 'redis_connection_failed',
            operation: 'initializeQueues',
            originalError: errorMessage
          }
        );
      }
      
      throw error;
    }
  }

  /**
   * Queue a scan job
   * @param jobData - Job data
   * @param delay - Optional delay in milliseconds before job starts
   */
  async queueScan(jobData: ScanJobData, delay?: number): Promise<Bull.Job<ScanJobData>> {
    await this.initializeQueues();
    if (!this.scanQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const priority = jobData.priority ?? JobPriorityEnum.NORMAL;

    const jobOptions: Bull.JobOptions = {
      jobId: `scan-${jobData.queryId}-${Date.now()}`,
      priority,
    };

    if (delay !== undefined && delay > 0) {
      jobOptions.delay = delay;
    }

    const job = await this.scanQueue.add('scan', jobData, jobOptions);

    if (job.id) {
      await this.addToQueryIndex(jobData.queryId, 'scan', job.id);
    }

    logger.info({ jobId: job.id, queryId: jobData.queryId, priority, delay }, 'Queued scan job');
    return job;
  }

  /**
   * Queue an embedding job
   * @param jobData - Job data
   * @param delay - Optional delay in milliseconds before job starts
   */
  async queueEmbedding(jobData: EmbeddingJobData, delay?: number): Promise<Bull.Job<EmbeddingJobData>> {
    await this.initializeQueues();
    if (!this.embeddingQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const priority = jobData.priority ?? JobPriorityEnum.NORMAL;

    const jobOptions: Bull.JobOptions = {
      jobId: `embedding-${jobData.documentIds.join('-')}-${Date.now()}`,
      priority,
    };

    if (delay !== undefined && delay > 0) {
      jobOptions.delay = delay;
    }

    const job = await this.embeddingQueue.add('embedding', jobData, jobOptions);

    if (job.id && jobData.queryId) {
      await this.addToQueryIndex(jobData.queryId, 'embedding', job.id);
    }

    logger.info({ jobId: job.id, documentCount: jobData.documentIds.length, priority, delay }, 'Queued embedding job');
    return job;
  }

  /**
   * Queue a processing job
   * @param jobData - Job data
   * @param delay - Optional delay in milliseconds before job starts
   */
  async queueProcessing(jobData: ProcessingJobData, delay?: number): Promise<Bull.Job<ProcessingJobData>> {
    await this.initializeQueues();
    if (!this.processingQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const priority = jobData.priority ?? JobPriorityEnum.NORMAL;

    const jobOptions: Bull.JobOptions = {
      jobId: `processing-${jobData.processingType}-${Date.now()}`,
      priority,
    };

    if (delay !== undefined && delay > 0) {
      jobOptions.delay = delay;
    }

    const job = await this.processingQueue.add('processing', jobData, jobOptions);

    if (job.id && jobData.queryId) {
      await this.addToQueryIndex(jobData.queryId, 'processing', job.id);
    }

    logger.info({ jobId: job.id, processingType: jobData.processingType, documentCount: jobData.documentIds.length, priority, delay }, 'Queued processing job');
    return job;
  }

  /**
   * Queue a workflow job
   * 
   * Workflow queue behavior:
   * - Workflows are ALWAYS enqueued (even when queue is empty)
   * - If queue is empty, the workflow will execute immediately (Bull processes jobs as soon as they're added)
   * - The workflow remains at the head of the queue while executing (active state)
   * - New workflows are added to the back of the queue (FIFO order)
   * - Workflows execute sequentially (concurrency=1, only one at a time)
   * - Active workflows are only removed from queue when finished or cancelled
   * 
   * @param jobData - Job data
   * @param delay - Optional delay in milliseconds before job starts
   * @throws Error if queue is full (overflow protection)
   */
  async queueWorkflow(jobData: WorkflowJobData, delay?: number): Promise<Bull.Job<WorkflowJobData>> {
    await this.initializeQueues();
    if (!this.workflowQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    // Check queue overflow before adding job
    const { JOB_QUEUE } = await import('../../config/constants.js');
    const [waitingCount, activeCount] = await Promise.all([
      this.workflowQueue.getWaitingCount(),
      this.workflowQueue.getActiveCount(),
    ]);
    const queueSize = waitingCount + activeCount;

    if (queueSize >= JOB_QUEUE.MAX_WORKFLOW_QUEUE_SIZE) {
      logger.warn(
        { 
          queueSize, 
          maxSize: JOB_QUEUE.MAX_WORKFLOW_QUEUE_SIZE, 
          waiting: waitingCount, 
          active: activeCount,
          workflowId: jobData.workflowId 
        },
        'Workflow queue overflow: queue is full, rejecting new job'
      );
      throw new Error(
        `Workflow queue is full (${queueSize}/${JOB_QUEUE.MAX_WORKFLOW_QUEUE_SIZE} jobs). ` +
        `Please try again later or contact support if this persists.`
      );
    }

    const priority = jobData.priority ?? JobPriorityEnum.NORMAL;

    const jobId = `workflow-${jobData.workflowId}-${Date.now()}`;

    const jobOptions: Bull.JobOptions = { 
      jobId,
      priority,
    };

    if (delay !== undefined && delay > 0) {
      jobOptions.delay = delay;
    }

    // Add job to queue - Bull will process it immediately if queue is empty and worker is available
    // The job will be at the head of the queue while active, and new jobs will be added to the back
    try {
      const job = await this.workflowQueue.add('workflow', jobData, jobOptions);

      // Contract compliance: Log workflow queued successfully
      logger.info(
        { 
          jobId: job.id, 
          workflowId: jobData.workflowId,
          runId: jobData.runId,
          priority, 
          delay, 
          queueSize,
          waitingCount,
          activeCount,
          willExecuteImmediately: activeCount === 0 && waitingCount === 0,
          queuePosition: waitingCount + activeCount + 1 // Position in queue (1-based)
        }, 
        'Workflow queued for execution (contract: workflow MUST be queued, no exceptions)'
      );
      return job;
    } catch (error) {
      // Handle Redis READONLY errors with helpful guidance
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('READONLY') || errorMessage.includes('read only replica')) {
        const env = validateEnv();
        logger.error(
          {
            error: errorMessage,
            workflowId: jobData.workflowId,
            redisHost: env.REDIS_HOST,
            redisPort: env.REDIS_PORT,
            redisConnectionMode: env.REDIS_CONNECTION_MODE,
          },
          'Redis READONLY error: Cannot write to read-only replica. ' +
          'Solution: Ensure REDIS_HOST points to the master instance, or use REDIS_CONNECTION_MODE=sentinel for automatic master routing.'
        );
        throw new Error(
          'Cannot write to Redis: The Redis instance is configured as read-only. ' +
          'Please ensure REDIS_HOST points to the master instance, or configure REDIS_CONNECTION_MODE=sentinel for automatic master routing. ' +
          `Current configuration: REDIS_HOST=${env.REDIS_HOST}, REDIS_CONNECTION_MODE=${env.REDIS_CONNECTION_MODE}`
        );
      }
      // Re-throw other errors as-is
      throw error;
    }
  }

  /**
   * Queue an export job
   * @param jobData - Job data
   * @param delay - Optional delay in milliseconds before job starts
   */
  async queueExport(jobData: ExportJobData, delay?: number): Promise<Bull.Job<ExportJobData>> {
    await this.initializeQueues();
    if (!this.exportQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const priority = jobData.priority ?? JobPriorityEnum.NORMAL;

    const jobId = jobData.queryId 
      ? `export-${jobData.format}-${jobData.queryId}-${Date.now()}`
      : `export-${jobData.format}-${Date.now()}`;

    const jobOptions: Bull.JobOptions = { 
      jobId,
      priority,
    };

    if (delay !== undefined && delay > 0) {
      jobOptions.delay = delay;
    }

    const job = await this.exportQueue.add('export', jobData, jobOptions);

    if (job.id && jobData.queryId) {
      await this.addToQueryIndex(jobData.queryId, 'export', job.id);
    }

    logger.info({ jobId: job.id, format: jobData.format, priority, delay }, 'Queued export job');
    return job;
  }

  /**
   * Queue a scraping job
   * @param jobData - Job data
   * @param delay - Optional delay in milliseconds before job starts
   */
  async queueScraping(jobData: ScrapingJobData, delay?: number): Promise<Bull.Job<ScrapingJobData>> {
    await this.initializeQueues();
    if (!this.scrapingQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const priority = jobData.priority ?? JobPriorityEnum.NORMAL;

    const jobId = `scraping-${jobData.websiteUrl.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;

    const jobOptions: Bull.JobOptions = { 
      jobId,
      priority,
    };

    if (delay !== undefined && delay > 0) {
      jobOptions.delay = delay;
    }

    const job = await this.scrapingQueue.add('scraping', jobData, jobOptions);

    logger.info({ jobId: job.id, websiteUrl: jobData.websiteUrl, priority, delay }, 'Queued scraping job');
    return job;
  }

  /**
   * Get job status by ID and type
   */
  async getJobStatus(jobId: string, jobType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping' = 'scan'): Promise<Bull.Job | null> {
    await this.initializeQueues();

    let queue: Bull.Queue | null = null;
    switch (jobType) {
      case 'scan':
        queue = this.scanQueue;
        break;
      case 'scraping':
        queue = this.scrapingQueue;
        break;
      case 'embedding':
        queue = this.embeddingQueue;
        break;
      case 'processing':
        queue = this.processingQueue;
        break;
      case 'export':
        queue = this.exportQueue;
        break;
      case 'workflow':
        queue = this.workflowQueue;
        break;
    }

    if (!queue) {
      return null;
    }

    return await queue.getJob(jobId);
  }

  /**
   * Get all jobs for a query (scans multiple queues if needed)
   */
  async getJobsForQuery(queryId: string): Promise<Bull.Job[]> {
    await this.initializeQueues();
    const allJobs: Bull.Job[] = [];
    let indexFlagPresent = false;
    const redisManager = getRedisConnectionManager();
    const client = redisManager.getClient();

    // Try to use Redis index first
    try {
      if (client && (client.status === 'ready' || client.status === 'connect')) {
        const key = `query:${queryId}:jobs`;
        const indexedKey = `query:${queryId}:indexed`;

        // Check if the query is indexed (lazy indexing)
        // If this flag exists, we assume the index is authoritative and complete
        const isIndexed = await client.get(indexedKey);

        if (isIndexed) {
          const members = await client.smembers(key);

          if (members.length > 0) {
            // Group jobs by queue name for parallel batch processing
            const jobsByQueue: Record<string, string[]> = {};
            members.forEach((member) => {
              if (!member.includes(':')) {
                return;
              }
              const [queueName, jobId] = member.split(':');
              if (!jobsByQueue[queueName]) {
                jobsByQueue[queueName] = [];
              }
              jobsByQueue[queueName].push(jobId);
            });

            // Process each queue in parallel
            const queuePromises = Object.entries(jobsByQueue).map(async ([queueName, jobIds]) => {
              if (jobIds.length === 0) return [];

              let queue: Bull.Queue | null = null;
              switch (queueName) {
                case 'scan': queue = this.scanQueue; break;
                case 'embedding': queue = this.embeddingQueue; break;
                case 'processing': queue = this.processingQueue; break;
                case 'export': queue = this.exportQueue; break;
              }

              if (!queue) return [];

              try {
                // Fetch jobs by ID using Bull's getJob method
                // This is more reliable than reconstructing from raw Redis data
                const jobs: Bull.Job[] = [];
                
                for (const jobId of jobIds) {
                  try {
                    const job = await queue.getJob(jobId);
                    if (job) {
                      // Verify the job actually belongs to the query
                      if ((job.data as any).queryId === queryId) {
                        jobs.push(job);
                      }
                    }
                  } catch (e) {
                    logger.warn({ error: e, queueName, jobId }, 'Failed to get indexed job');
                  }
                }
                return jobs;
              } catch (error) {
                logger.warn({ error, queueName }, 'Failed to fetch indexed jobs batch');
                return [];
              }
            });

            const results = await Promise.all(queuePromises);
            results.forEach(queueJobs => allJobs.push(...queueJobs));
          }
          
          // Only set indexFlagPresent to true after successful retrieval
          // If any operation above fails (e.g. smembers throws), we catch it and fallback to scan
          indexFlagPresent = true;
        }
      }
    } catch (error) {
      logger.warn({ error, queryId }, 'Failed to use Redis index for getJobsForQuery, falling back to scan');
      // Ensure we fallback if an error occurred during index retrieval
      indexFlagPresent = false;
    }

    // Fallback to scan if index was not used AND not marked as indexed
    // This happens when:
    // 1. Redis is down (usedIndex=false, indexFlagPresent=false)
    // 2. Query has never been indexed (indexFlagPresent=false)
    // 3. Index flag expired (indexFlagPresent=false)

    // We do NOT fallback if indexFlagPresent is true, even if allJobs is empty.
    // This solves the performance issue where we scanned empty queues for non-existent queries.
    if (!indexFlagPresent) {
      // Get scan jobs
      if (this.scanQueue) {
        const scanJobs = await this.scanQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
        const matching = scanJobs.filter((job) => (job.data as ScanJobData).queryId === queryId);
        allJobs.push(...matching);
        // Backfill index
        for (const job of matching) {
          if (job.id !== undefined && job.id !== null) await this.addToQueryIndex(queryId, 'scan', job.id);
        }
      }

      // Get embedding jobs
      if (this.embeddingQueue) {
        const embeddingJobs = await this.embeddingQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
        const matching = embeddingJobs.filter((job) => (job.data as EmbeddingJobData).queryId === queryId);
        allJobs.push(...matching);
        for (const job of matching) {
          if (job.id !== undefined && job.id !== null) await this.addToQueryIndex(queryId, 'embedding', job.id);
        }
      }

      // Get processing jobs
      if (this.processingQueue) {
        const processingJobs = await this.processingQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
        const matching = processingJobs.filter((job) => (job.data as ProcessingJobData).queryId === queryId);
        allJobs.push(...matching);
        for (const job of matching) {
          if (job.id !== undefined && job.id !== null) await this.addToQueryIndex(queryId, 'processing', job.id);
        }
      }

      // Get export jobs
      if (this.exportQueue) {
        const exportJobs = await this.exportQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
        const matching = exportJobs.filter((job) => (job.data as ExportJobData).queryId === queryId);
        allJobs.push(...matching);
        for (const job of matching) {
          if (job.id !== undefined && job.id !== null) await this.addToQueryIndex(queryId, 'export', job.id);
        }
      }

      // Mark as indexed so subsequent calls don't need to scan
      // This is crucial for performance - even if no jobs are found, we mark it as "indexed (empty)"
      try {
        if (client && (client.status === 'ready' || client.status === 'connect')) {
          await client.set(`query:${queryId}:indexed`, '1', 'EX', 7 * 24 * 60 * 60);
        }
      } catch (error) {
        logger.warn({ error, queryId }, 'Failed to set indexed flag');
      }
    }

    // Get workflow jobs (workflow jobs don't have queryId, so skip for now)
    // In the future, we might want to filter by userId or other criteria

    return allJobs;
  }

  /**
   * Cancel a job by ID and type
   */
  async cancelJob(jobId: string, jobType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' = 'scan'): Promise<boolean> {
    const job = await this.getJobStatus(jobId, jobType);
    if (!job) {
      return false;
    }

    await job.remove();
    logger.info({ jobId, jobType }, 'Cancelled job');
    return true;
  }

  /**
   * Get queue statistics for all queues
   */
  async getQueueStats(): Promise<{
    scan: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    embedding: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    processing: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    export: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    workflow: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    scraping: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  }> {
    await this.initializeQueues();

    const getStats = async (queue: Bull.Queue | null) => {
      if (!queue) {
        return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      }

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed };
    };

    const [scan, embedding, processing, export_, workflow, scraping] = await Promise.all([
      getStats(this.scanQueue),
      getStats(this.embeddingQueue),
      getStats(this.processingQueue),
      getStats(this.exportQueue),
      getStats(this.workflowQueue),
      getStats(this.scrapingQueue),
    ]);

    return { scan, embedding, processing, export: export_, workflow, scraping };
  }

  /**
   * Get recent job statistics for a queue (jobs within the specified time window)
   * @param queueType - Type of queue
   * @param windowMs - Time window in milliseconds (default: 1 hour)
   * @returns Recent job statistics
   */
  async getRecentJobStats(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping',
    windowMs: number = 3600000 // Default: 1 hour
  ): Promise<{ completed: number; failed: number; total: number }> {
    await this.initializeQueues();

    let queue: Bull.Queue | null = null;
    switch (queueType) {
      case 'scan':
        queue = this.scanQueue;
        break;
      case 'embedding':
        queue = this.embeddingQueue;
        break;
      case 'processing':
        queue = this.processingQueue;
        break;
      case 'export':
        queue = this.exportQueue;
        break;
      case 'workflow':
        queue = this.workflowQueue;
        break;
      case 'scraping':
        queue = this.scrapingQueue;
        break;
    }

    if (!queue) {
      return { completed: 0, failed: 0, total: 0 };
    }

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get recent completed and failed jobs (last 100 of each)
      const [completedJobs, failedJobs] = await Promise.all([
        queue.getCompleted(0, 100),
        queue.getFailed(0, 100),
      ]);

      // Filter jobs within the time window
      const recentCompleted = completedJobs.filter((job) => {
        const finishedOn = job.finishedOn || job.processedOn || job.timestamp;
        return finishedOn && finishedOn >= windowStart;
      });

      const recentFailed = failedJobs.filter((job) => {
        const finishedOn = job.finishedOn || job.processedOn || job.timestamp;
        return finishedOn && finishedOn >= windowStart;
      });

      return {
        completed: recentCompleted.length,
        failed: recentFailed.length,
        total: recentCompleted.length + recentFailed.length,
      };
    } catch (error) {
      logger.warn({ error, queueType }, 'Failed to get recent job stats');
      return { completed: 0, failed: 0, total: 0 };
    }
  }

  /**
   * Get recent failed jobs for analysis
   * @param queueType - Type of queue
   * @param limit - Maximum number of jobs to return (default: 10)
   */
  async getRecentFailedJobs(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping',
    limit: number = 10
  ): Promise<Bull.Job[]> {
    await this.initializeQueues();

    let queue: Bull.Queue | null = null;
    switch (queueType) {
      case 'scan':
        queue = this.scanQueue;
        break;
      case 'embedding':
        queue = this.embeddingQueue;
        break;
      case 'processing':
        queue = this.processingQueue;
        break;
      case 'export':
        queue = this.exportQueue;
        break;
      case 'workflow':
        queue = this.workflowQueue;
        break;
      case 'scraping':
        queue = this.scrapingQueue;
        break;
    }

    if (!queue) {
      return [];
    }

    try {
      // Get recent failed jobs (most recent first)
      const failedJobs = await queue.getFailed(0, limit - 1);
      return failedJobs;
    } catch (error) {
      logger.warn({ error, queueType }, 'Failed to get recent failed jobs');
      return [];
    }
  }

  /**
   * Emit progress event helper
   * Implements ProgressEventEmitter interface
   */
  async emitProgressEvent(
    event: JobStartedEvent | JobProgressEvent | JobStepEvent | JobCompletedEvent | JobFailedEvent
  ): Promise<void> {
    try {
      const progressService = getProgressService();
      await progressService.recordProgress(event);
    } catch (error) {
      logger.error({ error, jobId: event.jobId }, 'Failed to emit progress event');
      // Don't throw - progress tracking should not break job execution
    }
  }

  /**
   * Process scan jobs (worker function)
   * This should be called from a worker process
   */
  async processScanJobs(): Promise<void> {
    try {
      await this.initializeQueues();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue, worker will not start');
      throw error;
    }

    if (!this.scanQueue) {
      throw new Error('Queue service not initialized. Redis may not be available.');
    }

    const concurrency = JOB_QUEUE.DEFAULT_SCAN_CONCURRENCY;
    logger.info({ concurrency }, 'Starting scan job worker...');

    // Use extracted processor for scan jobs
    if (!this.scanJobProcessor) {
      this.scanJobProcessor = new ScanJobProcessorImpl(this, this);
    }

    this.scanQueue.process('scan', concurrency, async (job: Bull.Job<ScanJobData>) => {
      return await this.scanJobProcessor!.process(job);
    });

    logger.info('Scan job worker started and ready to process jobs');
  }

  /**
   * Process embedding jobs (worker function)
   */
  async processEmbeddingJobs(): Promise<void> {
    try {
      await this.initializeQueues();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue, worker will not start');
      throw error;
    }

    if (!this.embeddingQueue) {
      throw new Error('Queue service not initialized. Redis may not be available.');
    }

    const concurrency = JOB_QUEUE.DEFAULT_EMBEDDING_CONCURRENCY;
    logger.info({ concurrency }, 'Starting embedding job worker...');

    // Use extracted processor for embedding jobs
    if (!this.embeddingJobProcessor) {
      this.embeddingJobProcessor = new EmbeddingJobProcessorImpl(this, this);
    }

    this.embeddingQueue.process('embedding', concurrency, async (job: Bull.Job<EmbeddingJobData>) => {
      return await this.embeddingJobProcessor!.process(job);
    });

    logger.info('Embedding job worker started and ready to process jobs');
  }

  /**
   * Process processing jobs (worker function)
   */
  async processProcessingJobs(): Promise<void> {
    try {
      await this.initializeQueues();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue, worker will not start');
      throw error;
    }

    if (!this.processingQueue) {
      throw new Error('Queue service not initialized. Redis may not be available.');
    }

    const concurrency = JOB_QUEUE.DEFAULT_PROCESSING_CONCURRENCY;
    logger.info({ concurrency }, 'Starting processing job worker...');

    // Use extracted processor for processing jobs
    if (!this.processingJobProcessor) {
      this.processingJobProcessor = new ProcessingJobProcessorImpl(this, this);
    }

    this.processingQueue.process('processing', concurrency, async (job: Bull.Job<ProcessingJobData>) => {
      return await this.processingJobProcessor!.process(job);
    });

    logger.info('Processing job worker started and ready to process jobs');
  }

  /**
   * Process export jobs (worker function)
   */
  async processExportJobs(): Promise<void> {
    try {
      await this.initializeQueues();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue, worker will not start');
      throw error;
    }

    if (!this.exportQueue) {
      throw new Error('Queue service not initialized. Redis may not be available.');
    }

    const concurrency = JOB_QUEUE.DEFAULT_EXPORT_CONCURRENCY;
    logger.info({ concurrency }, 'Starting export job worker...');

    // Use extracted processor for export jobs
    if (!this.exportJobProcessor) {
      this.exportJobProcessor = new ExportJobProcessorImpl(this, this);
    }

    this.exportQueue.process('export', concurrency, async (job: Bull.Job<ExportJobData>) => {
      return await this.exportJobProcessor!.process(job);
    });

    logger.info('Export job worker started and ready to process jobs');
  }

  /**
   * Process workflow jobs (worker function)
   * This should be called from a worker process
   * 
   * Queue execution behavior:
   * - Concurrency is set to 1, meaning only ONE workflow executes at a time
   * - Workflows are processed in FIFO order (first in, first out)
   * - If queue is empty when a workflow is added, it executes immediately
   * - Active workflows remain in the queue (at the head) until finished or cancelled
   * - New workflows are added to the back and wait for previous workflows to complete
   */
  async processWorkflowJobs(): Promise<void> {
    // Prevent duplicate processor registration
    // Bull queue.process() can cause issues if called multiple times
    if (this.workflowProcessorStarted) {
      logger.info('Workflow job processor already started, skipping duplicate registration');
      return;
    }

    try {
      await this.initializeQueues();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue, worker will not start');
      throw error;
    }

    if (!this.workflowQueue) {
      throw new Error('Queue service not initialized. Redis may not be available.');
    }

    // Concurrency is set to 1 to ensure sequential execution
    // Only one workflow runs at a time, new workflows wait in queue
    const concurrency = JOB_QUEUE.DEFAULT_WORKFLOW_CONCURRENCY;
    logger.info(
      { 
        concurrency,
        note: 'Workflows execute sequentially - one at a time. New workflows are queued and wait for active workflow to complete.'
      }, 
      'Starting workflow job worker with sequential execution (concurrency=1)...'
    );

    // Use extracted processor for workflow jobs
    if (!this.workflowJobProcessor) {
      this.workflowJobProcessor = new WorkflowJobProcessorImpl(this, this);
    }

    // Register processor with concurrency=1 for sequential execution
    // Jobs are processed in FIFO order: active job at head, waiting jobs at back
    this.workflowQueue.process('workflow', concurrency, async (job: Bull.Job<WorkflowJobData>) => {
      return await this.workflowJobProcessor!.process(job);
    });

    this.workflowProcessorStarted = true;
    logger.info('Workflow job worker started and ready to process jobs sequentially');
  }

  /**
   * Process scraping jobs (worker function)
   * This should be called from a worker process
   */
  async processScrapingJobs(): Promise<void> {
    try {
      await this.initializeQueues();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize queue, worker will not start');
      throw error;
    }

    if (!this.scrapingQueue) {
      throw new Error('Queue service not initialized. Redis may not be available.');
    }

    const concurrency = JOB_QUEUE.DEFAULT_SCAN_CONCURRENCY; // Use same concurrency as scan jobs
    logger.info({ concurrency }, 'Starting scraping job worker...');

    // Use extracted processor for scraping jobs
    if (!this.scrapingJobProcessor) {
      this.scrapingJobProcessor = new ScrapingJobProcessorImpl(this, this);
    }

    this.scrapingQueue.process('scraping', concurrency, async (job: Bull.Job<ScrapingJobData>) => {
      return await this.scrapingJobProcessor!.process(job);
    });

    logger.info('Scraping job worker started and ready to process jobs');
  }

  /**
   * Process all job types (convenience method)
   */
  async processAllJobs(): Promise<void> {
    await Promise.all([
      this.processScanJobs(),
      this.processEmbeddingJobs(),
      this.processProcessingJobs(),
      this.processExportJobs(),
      this.processWorkflowJobs(),
      this.processScrapingJobs(),
    ]);
  }

  /**
   * Get a queue instance by type (for monitoring/investigation purposes)
   */
  getQueueByType(
    queueType: 'scan' | 'embedding' | 'processing' | 'export' | 'workflow' | 'scraping'
  ): Bull.Queue | null {
    if (!this.queueManager.isInitialized()) {
      return null;
    }

    switch (queueType) {
      case 'scan':
        return this.queueManager.getScanQueue();
      case 'embedding':
        return this.queueManager.getEmbeddingQueue();
      case 'processing':
        return this.queueManager.getProcessingQueue();
      case 'export':
        return this.queueManager.getExportQueue();
      case 'workflow':
        return this.queueManager.getWorkflowQueue();
      case 'scraping':
        return this.queueManager.getScrapingQueue();
      default:
        return null;
    }
  }

  /**
   * Gracefully close all queues
   * Uses QueueManager for queue lifecycle management
   */
  async close(): Promise<void> {
    await this.queueManager.close();
    this.initialized = false;
  }

  /**
   * Update performance metrics for a job type
   * Implements PerformanceMetricsUpdater interface
   * @param jobType - Type of job
   * @param processingTime - Processing time in milliseconds
   */
  updatePerformanceMetrics(
    jobType: 'scanJobs' | 'embeddingJobs' | 'processingJobs' | 'exportJobs' | 'workflowJobs' | 'scrapingJobs',
    processingTime: number
  ): void {
    const metrics = this.performanceMetrics[jobType];
    metrics.count += 1;
    metrics.totalTime += processingTime;
    metrics.avgTime = metrics.totalTime / metrics.count;
  }

  /**
   * Get performance metrics for all queue types
   * @returns Performance metrics object
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Get workflow jobs (waiting, active, and paused)
   * Returns jobs with metadata for queue management UI
   * Note: Paused jobs are detected by checking run status, not job state
   */
  async getWorkflowJobs(): Promise<Array<{
    jobId: string;
    workflowId: string;
    runId?: string;
    status: 'waiting' | 'active' | 'paused';
    createdAt: string;
    startedAt?: string;
    params: Record<string, unknown>;
  }>> {
    try {
      await this.initializeQueues();
    } catch (error) {
      // If initialization fails (e.g., Redis unavailable), return empty array
      // This allows the UI to load even if queue service is unavailable
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMessage }, 'Queue service not initialized - returning empty job list');
      return [];
    }
    
    if (!this.workflowQueue) {
      logger.warn('Workflow queue not initialized - cannot retrieve jobs');
      return [];
    }

    try {
      const [waiting, active] = await Promise.all([
        this.workflowQueue.getWaiting(),
        this.workflowQueue.getActive(),
      ]);

      // Debug logging: Log raw queue state from Bull
      logger.debug(
        {
          waitingCount: waiting.length,
          activeCount: active.length,
          waitingJobIds: waiting.map(j => String(j.id)),
          activeJobIds: active.map(j => String(j.id)),
        },
        'Raw queue state from Bull: waiting and active jobs'
      );

      const jobs: Array<{
        jobId: string;
        workflowId: string;
        runId?: string;
        status: 'waiting' | 'active' | 'paused';
        createdAt: string;
        startedAt?: string;
        params: Record<string, unknown>;
      }> = [];

      // Import RunManager to check run status for paused jobs
      const { getDB } = await import('../../config/database.js');
      const { RunManager } = await import('../workflow/RunManager.js');
      const db = getDB();
      const runManager = new RunManager(db);

      // Process active jobs FIRST (they are at the head of the queue)
      // Active jobs remain in the queue while executing and are only removed when finished or cancelled
      for (const job of active) {
        const jobData = job.data as WorkflowJobData;
        let status: 'active' | 'paused' = 'active';
        
        // Check run status to detect paused jobs
        if (jobData.runId) {
          try {
            const run = await runManager.getRun(jobData.runId);
            if (run && run.status === 'paused') {
              status = 'paused';
            }
          } catch (error) {
            // If run not found or error, keep status as 'active'
            logger.debug({ jobId: String(job.id), runId: jobData.runId, error }, 'Could not check run status for job');
          }
        }
        
        jobs.push({
          jobId: String(job.id),
          workflowId: jobData.workflowId,
          runId: jobData.runId,
          status,
          createdAt: new Date(job.timestamp).toISOString(),
          startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
          params: jobData.params || {},
        });
      }

      // Process waiting jobs AFTER active jobs (they are in the back of the queue)
      // Waiting jobs will be processed sequentially, one at a time, after active jobs complete
      for (const job of waiting) {
        const jobData = job.data as WorkflowJobData;
        jobs.push({
          jobId: String(job.id),
          workflowId: jobData.workflowId,
          runId: jobData.runId,
          status: 'waiting',
          createdAt: new Date(job.timestamp).toISOString(),
          params: jobData.params || {},
        });
      }

      // Fetch paused runs from database and add them to the list
      // This ensures paused workflows are visible even if their Bull job has completed
      try {
        const pausedRuns = await runManager.getRunHistory({ status: 'paused', limit: 0 });

        // Filter out paused runs that are already associated with active/waiting jobs
        // This prevents duplicates if a job is somehow still active/waiting but paused
        const existingRunIds = new Set(
          jobs
            .map(j => j.runId)
            .filter((id): id is string => id !== undefined)
        );

        for (const run of pausedRuns) {
          if (run._id && !existingRunIds.has(run._id.toString())) {
            jobs.push({
              jobId: run._id.toString(), // Use runId as jobId for paused runs without an active job
              workflowId: run.params?.workflowId as string || 'unknown',
              runId: run._id.toString(),
              status: 'paused',
              createdAt: run.startTime ? new Date(run.startTime).toISOString() : new Date().toISOString(),
              startedAt: run.startTime ? new Date(run.startTime).toISOString() : undefined,
              params: run.params || {},
            });
          }
        }
      } catch (dbError) {
        logger.warn({ error: dbError }, 'Failed to fetch paused runs from database');
      }

      // Log queue state for debugging (PRD compliance: ensure active jobs are visible)
      logger.debug(
        { 
          activeCount: active.length, 
          waitingCount: waiting.length,
          totalJobs: jobs.length,
          activeJobDetails: jobs.filter(j => j.status === 'active').map(j => ({
            jobId: j.jobId,
            workflowId: j.workflowId,
            runId: j.runId,
            startedAt: j.startedAt,
          })),
          waitingJobDetails: jobs.filter(j => j.status === 'waiting').map(j => ({
            jobId: j.jobId,
            workflowId: j.workflowId,
            runId: j.runId,
          })),
        },
        'Workflow queue state: active jobs at head, waiting jobs at back (PRD FR-4: workflows remain in queue during execution)'
      );

      // Warn if we have active jobs in Bull but none in our result (should not happen)
      if (active.length > 0 && jobs.filter(j => j.status === 'active' || j.status === 'paused').length === 0) {
        logger.warn(
          {
            activeCountFromBull: active.length,
            jobsReturned: jobs.length,
            activeJobIds: active.map(j => String(j.id)),
          },
          'WARNING: Active jobs found in Bull queue but not returned in result - this violates PRD FR-4'
        );
      }

      return jobs;
    } catch (error) {
      // Handle Redis connection errors when retrieving jobs
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRedisError = errorMessage.includes('Redis') ||
                          errorMessage.includes('redis') ||
                          errorMessage.includes('ECONNREFUSED') ||
                          errorMessage.includes('EAI_AGAIN') ||
                          errorMessage.includes('getaddrinfo') ||
                          errorMessage.includes('connection') ||
                          errorMessage.includes('timeout');
      
      if (isRedisError) {
        logger.warn({ error: errorMessage }, 'Redis connection error while retrieving workflow jobs - returning empty list');
        return [];
      }
      
      // For other errors, re-throw
      throw error;
    }
  }

  /**
   * Pause a workflow job
   * Only works for active jobs
   * Note: In Bull v4, individual jobs cannot be paused directly.
   * Instead, we pause the workflow run via RunManager.
   */
  async pauseWorkflowJob(jobId: string): Promise<boolean> {
    await this.initializeQueues();
    
    if (!this.workflowQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const job = await this.workflowQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state !== 'active') {
      throw new Error(`Cannot pause job ${jobId}: job is not active (current state: ${state})`);
    }

    // Get runId from job data
    const jobData = job.data as WorkflowJobData;
    if (!jobData.runId) {
      throw new Error(`Cannot pause job ${jobId}: job has no runId`);
    }

    // Pause the workflow run via RunManager
    // Import RunManager dynamically to avoid circular dependencies
    const { getDB } = await import('../../config/database.js');
    const { RunManager } = await import('../workflow/RunManager.js');
    const db = getDB();
    const runManager = new RunManager(db);
    
    const run = await runManager.getRun(jobData.runId);
    if (!run) {
      throw new Error(`Cannot pause job ${jobId}: run ${jobData.runId} not found`);
    }

    if (run.status !== 'running' && run.status !== 'pending') {
      throw new Error(`Cannot pause job ${jobId}: run status is "${run.status}", expected "running" or "pending"`);
    }

    // Update run status to paused
    await runManager.updateStatus(jobData.runId, 'paused');
    await runManager.log(jobData.runId, 'Workflow pauze aangevraagd', 'info');
    
    logger.info({ jobId, runId: jobData.runId }, 'Paused workflow job');
    return true;
  }

  /**
   * Resume a paused workflow job
   * Supports both Bull job IDs and Run IDs (for paused workflows where the job completed)
   * Enqueues a new job to continue execution from the paused state.
   */
  async resumeWorkflowJob(jobId: string): Promise<boolean> {
    await this.initializeQueues();
    
    if (!this.workflowQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    // Import dependencies dynamically
    const { getDB } = await import('../../config/database.js');
    const { RunManager } = await import('../workflow/RunManager.js');
    const { getWorkflowById } = await import('../../utils/workflowLookup.js');
    const db = getDB();
    const runManager = new RunManager(db);

    let runId: string | undefined;
    let workflowId: string | undefined;
    let params: Record<string, unknown> | undefined;

    // First try to find active/waiting Bull job
    const job = await this.workflowQueue.getJob(jobId);
    
    if (job) {
      // Case 1: Bull job exists (rare for paused workflows as processor usually finishes)
      const jobData = job.data as WorkflowJobData;
      if (!jobData.runId) {
        throw new Error(`Cannot resume job ${jobId}: job has no runId`);
      }
      runId = jobData.runId;
      workflowId = jobData.workflowId;
      params = jobData.params;
    } else {
      // Case 2: Bull job does not exist, check if jobId is actually a runId
      // This happens when we list paused runs from DB in getWorkflowJobs and use runId as jobId
      try {
        const run = await runManager.getRun(jobId);
        if (run) {
          runId = run._id?.toString();
          workflowId = run.params?.workflowId as string;
          params = run.params;
        }
      } catch (error) {
        // Ignore error if jobId is not a valid ObjectId
        logger.debug({ jobId, error }, 'jobId is not a valid Run ID');
      }
    }

    if (!runId || !workflowId) {
      logger.warn({ jobId }, 'Cannot resume job: run not found by job ID or run ID');
      return false;
    }

    // Verify run status
    const run = await runManager.getRun(runId);
    if (!run) {
      throw new Error(`Cannot resume run ${runId}: run not found`);
    }

    if (run.status !== 'paused') {
      throw new Error(`Cannot resume run ${runId}: run status is "${run.status}", expected "paused"`);
    }

    // Ensure we have a valid workflow definition
    const workflow = await getWorkflowById(workflowId);
    if (!workflow) {
      throw new Error(`Cannot resume run ${runId}: workflow ${workflowId} not found`);
    }

    // Save paused state before resuming so we can revert if queueing fails
    const savedPausedState = run.pausedState;

    // Capture paused context BEFORE resumeRun() clears pausedState.
    // pausedState.context contains intermediate step outputs and execution state
    // that the workflow needs to continue correctly from the paused step.
    const pausedState = run.pausedState as { stepId?: string; context?: Record<string, unknown> } | undefined;
    const resumeParams: Record<string, unknown> = { ...(params || {}) };
    if (pausedState?.context) {
      Object.assign(resumeParams, pausedState.context);
    }
    if (pausedState?.stepId) {
      resumeParams.__resumeStepId = pausedState.stepId;
    }

    // Check if there's already a job in the queue for this runId
    // This prevents duplicate jobs when resume is called multiple times or if a job already exists
    const existingJob = await this.findWorkflowJobByRunId(runId);
    if (existingJob) {
      const jobState = await existingJob.getState();
      logger.info(
        { 
          originalJobId: jobId, 
          runId, 
          workflowId, 
          existingJobId: existingJob.id,
          existingJobState: jobState 
        },
        'Resume skipped: job already exists in queue for this runId'
      );
      // Still update the run status to 'running' if it's paused, but don't queue a new job
      if (run.status === 'paused') {
        await runManager.resumeRun(runId);
      }
      return true;
    }

    // Prepare the run for resumption via RunManager.resumeRun()
    // This preserves __resumeStepId from pausedState, clears pausedState, and sets status to 'running'
    // Without this, initializeState may not find the resume step and restart from the beginning
    await runManager.resumeRun(runId);

    // Queue a new job to resume the workflow
    // This ensures the resumed execution is tracked by the queue system (PRD FR-1)
    // The WorkflowJobProcessor will handle the resume logic when it picks up this job
    // If queueing fails, revert the run back to paused to avoid stranded runs
    try {
      await this.queueWorkflow({
        workflowId,
        runId, // Pass existing runId to resume it
        params: resumeParams,
      });
    } catch (error) {
      logger.error({ runId, workflowId, error }, 'Failed to queue resumed workflow, reverting run to paused state');
      if (savedPausedState) {
        await runManager.pauseRun(runId, savedPausedState);
      } else {
        await runManager.updateStatus(runId, 'paused');
      }
      throw error;
    }
    
    logger.info({ originalJobId: jobId, runId, workflowId }, 'Resumed workflow by queuing new job');
    return true;
  }

  /**
   * Find a workflow job by runId
   * Searches through waiting and active jobs to find the job with matching runId
   */
  async findWorkflowJobByRunId(runId: string): Promise<Bull.Job<WorkflowJobData> | null> {
    await this.initializeQueues();
    
    if (!this.workflowQueue) {
      return null;
    }

    // Search in active jobs first (most likely location)
    const activeJobs = await this.workflowQueue.getActive();
    for (const job of activeJobs) {
      const jobData = job.data as WorkflowJobData;
      if (jobData.runId === runId) {
        return job;
      }
    }

    // Search in waiting jobs
    const waitingJobs = await this.workflowQueue.getWaiting();
    for (const job of waitingJobs) {
      const jobData = job.data as WorkflowJobData;
      if (jobData.runId === runId) {
        return job;
      }
    }

    return null;
  }

  /**
   * Remove a workflow job from the queue by jobId
   * Works for waiting, active, and paused jobs
   * When an active job is removed, Bull will automatically pick up the next waiting job
   */
  async removeWorkflowJob(jobId: string): Promise<boolean> {
    await this.initializeQueues();
    
    if (!this.workflowQueue) {
      throw new Error('Queue service not available. Redis may not be connected.');
    }

    const job = await this.workflowQueue.getJob(jobId);
    if (!job) {
      // jobId might be a run ID for a paused run synthesized from the DB in getWorkflowJobs()
      // These entries don't have a corresponding Bull job, so handle removal via RunManager
      try {
        const { getDB } = await import('../../config/database.js');
        const { RunManager } = await import('../workflow/RunManager.js');
        const db = getDB();
        const runManager = new RunManager(db);
        const run = await runManager.getRun(jobId);
        if (run && run.status === 'paused') {
          await runManager.updateStatus(jobId, 'cancelled');
          await runManager.log(jobId, 'Paused workflow removed from queue by user', 'info');
          logger.info({ jobId, runId: jobId }, 'Removed paused workflow run (no Bull job) by updating status to cancelled');
          return true;
        }
      } catch (error) {
        logger.debug({ jobId, error }, 'jobId is not a valid Run ID for removal');
      }
      return false;
    }

    const state = await job.getState();
    const allowedStates = ['waiting', 'active', 'paused'];
    
    // Only allow removal of waiting, active, or paused jobs
    if (!allowedStates.includes(state)) {
      // If job is in a terminal state (completed/failed), treat as idempotent success
      // These jobs are automatically removed from the queue anyway
      if (state === 'completed' || state === 'failed') {
        logger.info({ jobId, state }, 'Job already in terminal state, removal not needed (idempotent success)');
        return true;
      }
      
      const errorMessage = `Cannot remove job ${jobId}: job is in "${state}" state. Only jobs in states [${allowedStates.join(', ')}] can be removed. `;
      const additionalInfo = `Jobs in "${state}" state cannot be removed.`;
      
      logger.warn({ jobId, state, allowedStates }, `Failed to remove job: ${errorMessage}${additionalInfo}`);
      throw new Error(`${errorMessage}${additionalInfo}`);
    }

    // Re-check state immediately before removal to catch race conditions
    const finalState = await job.getState();
    if (!allowedStates.includes(finalState)) {
      // Job transitioned to a terminal state - treat as idempotent success
      if (finalState === 'completed' || finalState === 'failed') {
        logger.info({ jobId, finalState, originalState: state }, 'Job transitioned to terminal state before removal (idempotent success)');
        return true;
      }
      // Job transitioned to another non-removable state
      // Check if job still exists - if it doesn't, treat as success (already removed)
      try {
        const stillExists = await this.workflowQueue.getJob(jobId);
        if (!stillExists) {
          logger.info({ jobId, finalState, originalState: state }, 'Job no longer exists after state transition (idempotent success)');
          return true;
        }
        // Job exists but in non-removable state - this is a real conflict
        logger.warn({ jobId, finalState, originalState: state }, 'Job transitioned to non-removable state before removal');
        throw new Error(`Cannot remove job ${jobId}: job transitioned to "${finalState}" state before removal.`);
      } catch (checkError) {
        // If we can't verify the job exists, assume it was removed (idempotent success)
        logger.info({ jobId, finalState, originalState: state, checkError }, 'Could not verify job existence after state transition, treating as removed (idempotent success)');
        return true;
      }
    }

    try {
      // Get runId from job data before removing the job
      const jobData = job.data as WorkflowJobData;
      const runId = jobData.runId;
      
      await job.remove();
      
      // Cancel the run in the database to prevent it from respawning
      // This ensures that when a user deletes a job, the run is properly cancelled
      if (runId) {
        try {
          const { getDB } = await import('../../config/database.js');
          const { RunManager } = await import('../workflow/RunManager.js');
          const db = getDB();
          const runManager = new RunManager(db);
          const run = await runManager.getRun(runId);
          
          // Only update status if run exists and is in a cancellable state
          if (run && run.status !== 'cancelled' && run.status !== 'completed' && run.status !== 'failed') {
            await runManager.updateStatus(runId, 'cancelled');
            await runManager.log(runId, 'Workflow job removed from queue by user', 'info');
            logger.info({ jobId, runId, previousStatus: run.status }, 'Cancelled run after removing job from queue');
          }
        } catch (runError) {
          // Log but don't fail job removal if run cancellation fails
          logger.warn({ jobId, runId, error: runError }, 'Failed to cancel run after removing job, but job was removed');
        }
      }
      
      logger.info({ jobId, state: finalState, runId }, 'Removed workflow job from queue (next waiting job will start automatically)');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for stale job errors from Bull (job was already processed/removed)
      // Bull throws errors like "Job is not in a state that can be removed" or "stale" when
      // trying to remove an active job that has already transitioned or been removed
      const isStaleError = errorMessage.toLowerCase().includes('stale') ||
                          errorMessage.includes('not in a state that can be removed') ||
                          errorMessage.includes('Job is not in a state') ||
                          errorMessage.includes('Could not remove job');
      
      if (isStaleError) {
        // Check if job still exists and its state (idempotent handling)
        try {
          const stillExists = await this.workflowQueue.getJob(jobId);
          if (!stillExists) {
            // Job already removed - idempotent success
            logger.info({ jobId, originalState: state, error: errorMessage }, 'Job already removed (stale error, idempotent success)');
            return true;
          }
          
          // Check final state
          const errorState = await stillExists.getState();
          if (errorState === 'completed' || errorState === 'failed') {
            // Job in terminal state - idempotent success
            logger.info({ jobId, errorState, originalState: state, error: errorMessage }, 'Job in terminal state, removal not needed (stale error, idempotent success)');
            return true;
          }
          
          // Job exists but is in a different state - still treat as success if it's not removable
          logger.info({ jobId, errorState, originalState: state, error: errorMessage }, 'Job state changed, treating stale error as idempotent success');
          return true;
        } catch (checkError) {
          // If we can't check the job state, assume it was already removed (stale error)
          logger.info({ jobId, originalState: state, error: errorMessage, checkError }, 'Stale error detected, job likely already removed (idempotent success)');
          return true;
        }
      }
      
      // Check if job still exists and its state (idempotent handling for non-stale errors)
      try {
        const stillExists = await this.workflowQueue.getJob(jobId);
        if (!stillExists) {
          // Job already removed - idempotent success
          logger.info({ jobId, originalState: state }, 'Job already removed (idempotent success)');
          return true;
        }
        
        // Check final state
        const errorState = await stillExists.getState();
        if (errorState === 'completed' || errorState === 'failed') {
          // Job in terminal state - idempotent success
          logger.info({ jobId, errorState, originalState: state }, 'Job in terminal state, removal not needed (idempotent success)');
          return true;
        }
      } catch (checkError) {
        // If we can't check the job state, log but continue with original error
        logger.debug({ jobId, checkError }, 'Could not verify job state after removal error');
      }
      
      // Re-throw for actual errors (Redis issues, etc.)
      logger.error({ jobId, state: finalState, error: errorMessage }, 'Failed to remove job from queue');
      throw new Error(`Failed to remove job ${jobId} from queue: ${errorMessage}`);
    }
  }

  /**
   * Remove a workflow job from the queue by runId
   * This is used when cancelling a workflow run - the job must be removed from the queue
   * so that the next waiting job can start executing
   */
  async removeWorkflowJobByRunId(runId: string): Promise<boolean> {
    await this.initializeQueues();
    
    if (!this.workflowQueue) {
      // Queue service not available, but this is not an error - just return false
      logger.debug({ runId }, 'Queue service not available, cannot remove job by runId');
      return false;
    }

    const job = await this.findWorkflowJobByRunId(runId);
    if (!job) {
      logger.debug({ runId }, 'No workflow job found for runId (may have already been removed or completed)');
      return false;
    }

    const jobId = String(job.id);
    const state = await job.getState();
    const allowedStates = ['waiting', 'active', 'paused'];
    
    // Only allow removal of waiting, active, or paused jobs
    if (!allowedStates.includes(state)) {
      // If job is in a terminal state (completed/failed), treat as success (idempotent)
      // These jobs are automatically removed from the queue anyway
      if (state === 'completed' || state === 'failed') {
        logger.debug({ runId, jobId, state }, 'Job already in terminal state, removal not needed (idempotent success)');
        return true;
      }
      logger.debug({ runId, jobId, state }, 'Job is not in a removable state');
      return false;
    }

    // Re-check state immediately before removal to catch race conditions
    const finalState = await job.getState();
    if (!allowedStates.includes(finalState)) {
      // Job transitioned to a terminal state - treat as idempotent success
      if (finalState === 'completed' || finalState === 'failed') {
        logger.debug({ runId, jobId, finalState, originalState: state }, 'Job transitioned to terminal state before removal (idempotent success)');
        return true;
      }
      // Job transitioned to another non-removable state
      logger.debug({ runId, jobId, finalState, originalState: state }, 'Job transitioned to non-removable state before removal');
      return false;
    }

    try {
      await job.remove();
      logger.info(
        { runId, jobId, state: finalState },
        'Removed workflow job from queue by runId (next waiting job will start automatically if queue has waiting jobs)'
      );
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if job still exists and its state (idempotent handling)
      try {
        const stillExists = await this.workflowQueue.getJob(jobId);
        if (!stillExists) {
          // Job already removed - idempotent success
          logger.debug({ runId, jobId, originalState: state }, 'Job already removed (idempotent success)');
          return true;
        }
        
        // Check final state
        const errorState = await stillExists.getState();
        if (errorState === 'completed' || errorState === 'failed') {
          // Job in terminal state - idempotent success
          logger.debug({ runId, jobId, errorState, originalState: state }, 'Job in terminal state, removal not needed (idempotent success)');
          return true;
        }
      } catch (checkError) {
        // If we can't check the job state, log but continue with original error
        logger.debug({ runId, jobId, checkError }, 'Could not verify job state after removal error');
      }
      
      // Log error but return false (non-fatal for this method)
      logger.warn({ runId, jobId, state: finalState, error: errorMessage }, 'Failed to remove workflow job from queue by runId');
      return false;
    }
  }
}

// Singleton instance
let queueServiceInstance: QueueService | null = null;

/**
 * Get or create the QueueService singleton
 */
export function getQueueService(): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }
  return queueServiceInstance;
}
