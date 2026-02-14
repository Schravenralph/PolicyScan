import Bull from 'bull';
import { logger } from '../../utils/logger.js';
import type {
  ScanJobData,
  EmbeddingJobData,
  ProcessingJobData,
  ExportJobData,
  WorkflowJobData,
  ScrapingJobData,
} from '../../types/job-data.js';
import type { ManagedQueues } from './QueueManager.js';

/**
 * Emit queue update event via WebSocket and SSE to notify clients about queue changes
 */
async function emitQueueUpdate(
  action: 'job_added' | 'job_updated' | 'job_removed' | 'job_active',
  job?: Bull.Job<WorkflowJobData>,
  nextJob?: Bull.Job<WorkflowJobData> | null
): Promise<void> {
  const timestamp = new Date().toISOString();
  
  // Prepare job status data
  const jobStatus = action === 'job_active' ? 'active' : 
                    action === 'job_removed' ? 'completed' : 
                    'queued';

  // Emit via WebSocket (existing functionality)
  try {
    const { getWebSocketService } = await import('../infrastructure/WebSocketService.js');
    const webSocketService = getWebSocketService();
    const io = webSocketService.getIO();

    if (io) {
      const queueUpdate = {
        type: 'queue_update' as const,
        action,
        timestamp: new Date(),
        job: job ? {
          jobId: String(job.id),
          workflowId: job.data.workflowId,
          runId: job.data.runId,
          status: action === 'job_active' ? 'active' : (action === 'job_removed' ? undefined : 'waiting'),
          createdAt: new Date(job.timestamp).toISOString(),
          startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : (action === 'job_active' ? new Date().toISOString() : undefined),
          params: job.data.params || {},
        } : undefined,
        nextJob: nextJob ? {
          jobId: String(nextJob.id),
          workflowId: nextJob.data.workflowId,
          runId: nextJob.data.runId,
          status: 'active' as const,
          createdAt: new Date(nextJob.timestamp).toISOString(),
          startedAt: new Date().toISOString(),
          params: nextJob.data.params || {},
        } : undefined,
      };

      // Broadcast to all clients listening to queue updates
      io.emit('queue_update', queueUpdate);
    }
  } catch (error) {
    // Don't fail if WebSocket emission fails - logging should be resilient
    logger.debug({ error, action }, 'Failed to emit queue update via WebSocket');
  }

  // Emit via SSE (new functionality per TOOL-006)
  if (job && job.data.runId) {
    try {
      const { getSSEService } = await import('../infrastructure/SSEService.js');
      const sseService = getSSEService();
      
      // Emit job status event
      sseService.emitJobStatus(job.data.runId, {
        status: jobStatus as 'queued' | 'active' | 'completed' | 'failed' | 'cancelled',
        jobId: String(job.id),
        workflowId: job.data.workflowId,
        runId: job.data.runId,
        timestamp,
        message: `Job ${action}`,
      });

      // If job is active, also check queue position
      if (action === 'job_active' || action === 'job_added') {
        try {
          const queue = job.queue;
          const waitingCount = await queue.getWaitingCount();
          const activeCount = await queue.getActiveCount();
          
          // Calculate position (only for waiting jobs)
          if (action === 'job_added' && waitingCount > 0) {
            const waitingJobs = await queue.getWaiting();
            const position = waitingJobs.findIndex(j => String(j.id) === String(job.id)) + 1;
            
            if (position > 0) {
              sseService.emitQueuePosition(job.data.runId, {
                runId: job.data.runId,
                position,
                totalWaiting: waitingCount,
                timestamp,
              });
            }
          }
        } catch (error) {
          logger.debug({ error, runId: job.data.runId }, 'Failed to emit queue position via SSE');
        }
      }
    } catch (error) {
      // Don't fail if SSE emission fails - logging should be resilient
      logger.debug({ 
        error, 
        action, 
        runId: job?.data?.runId || 'unknown',
        hasJob: !!job,
        hasJobData: !!job?.data
      }, 'Failed to emit queue update via SSE');
    }
  }
}

/**
 * QueueEventHandlers sets up event handlers for all queue types
 * Extracted from QueueService to improve separation of concerns
 */
export class QueueEventHandlers {
  /**
   * Set up event handlers for all queues
   * @param queues - The managed queues to set up handlers for
   */
  static setupEventHandlers(queues: Partial<ManagedQueues>): void {
    // Scan queue handlers
    if (queues.scanQueue) {
      queues.scanQueue.on('completed', (job: Bull.Job<ScanJobData>) => {
        logger.info({ jobId: job.id, queryId: job.data.queryId }, 'Scan job completed');
      });

      queues.scanQueue.on('failed', (job: Bull.Job<ScanJobData> | undefined, err: Error) => {
        logger.error({ jobId: job?.id, queryId: job?.data.queryId, error: err }, 'Scan job failed');
      });

      queues.scanQueue.on('stalled', (jobId: string) => {
        logger.warn({ jobId }, 'Scan job stalled');
      });
    }

    // Embedding queue handlers
    if (queues.embeddingQueue) {
      queues.embeddingQueue.on('completed', (job: Bull.Job<EmbeddingJobData>) => {
        logger.info({ jobId: job.id, documentCount: job.data.documentIds.length }, 'Embedding job completed');
      });

      queues.embeddingQueue.on('failed', (job: Bull.Job<EmbeddingJobData> | undefined, err: Error) => {
        logger.error({ jobId: job?.id, error: err }, 'Embedding job failed');
      });

      queues.embeddingQueue.on('stalled', (jobId: string) => {
        logger.warn({ jobId }, 'Embedding job stalled');
      });
    }

    // Processing queue handlers
    if (queues.processingQueue) {
      queues.processingQueue.on('completed', (job: Bull.Job<ProcessingJobData>) => {
        logger.info({ jobId: job.id, processingType: job.data.processingType }, 'Processing job completed');
      });

      queues.processingQueue.on('failed', (job: Bull.Job<ProcessingJobData> | undefined, err: Error) => {
        logger.error({ jobId: job?.id, error: err }, 'Processing job failed');
      });

      queues.processingQueue.on('stalled', (jobId: string) => {
        logger.warn({ jobId }, 'Processing job stalled');
      });
    }

    // Export queue handlers
    if (queues.exportQueue) {
      queues.exportQueue.on('completed', (job: Bull.Job<ExportJobData>) => {
        logger.info({ jobId: job.id, format: job.data.format }, 'Export job completed');
      });

      queues.exportQueue.on('failed', (job: Bull.Job<ExportJobData> | undefined, err: Error) => {
        logger.error({ jobId: job?.id, error: err }, 'Export job failed');
      });

      queues.exportQueue.on('stalled', (jobId: string) => {
        logger.warn({ jobId }, 'Export job stalled');
      });
    }

    // Workflow queue handlers
    if (queues.workflowQueue) {
      queues.workflowQueue.on('waiting', async (job: Bull.Job<WorkflowJobData>) => {
        // Emit WebSocket event when job is added to waiting queue
        await emitQueueUpdate('job_added', job);
      });

      queues.workflowQueue.on('active', async (job: Bull.Job<WorkflowJobData>) => {
        // Contract compliance: Log job transition from waiting → active
        logger.info(
          { 
            jobId: job.id, 
            workflowId: job.data.workflowId, 
            runId: job.data.runId,
            queuePosition: 'head' // Job is at head of queue when active
          }, 
          'Workflow job transitioned to active (contract: job at head of queue, execution started)'
        );

        // Emit WebSocket event for queue update
        await emitQueueUpdate('job_active', job);
      });

      queues.workflowQueue.on('completed', async (job: Bull.Job<WorkflowJobData>) => {
        // Contract compliance: Log job completion before removal
        logger.info(
          { 
            jobId: job.id, 
            workflowId: job.data.workflowId,
            runId: job.data.runId
          }, 
          'Workflow job completed (contract: job will be removed immediately)'
        );

        // Emit WebSocket event for queue update
        await emitQueueUpdate('job_removed', job);
      });

      queues.workflowQueue.on('removed', async (job: Bull.Job<WorkflowJobData>) => {
        // Contract compliance: Log job removal (immediate removal after completion)
        logger.info(
          { 
            jobId: job.id, 
            workflowId: job.data.workflowId,
            runId: job.data.runId
          }, 
          'Workflow job removed from queue (contract: immediate removal on completion, next waiting job will start)'
        );

        // Check if there's a next job that should become active
        // Bull automatically picks up the next waiting job, but we want to verify and notify
        try {
          if (!queues.workflowQueue) {
            return;
          }
          const waitingJobs = await queues.workflowQueue.getWaiting();
          const activeJobs = await queues.workflowQueue.getActive();
          
          // If there are waiting jobs and no active jobs, the next job should become active soon
          // (Bull will automatically process it due to concurrency=1)
          if (waitingJobs.length > 0 && activeJobs.length === 0) {
            const nextJob = waitingJobs[0]; // First waiting job will be next
            logger.info(
              { 
                nextJobId: nextJob.id,
                nextWorkflowId: nextJob.data.workflowId,
                nextRunId: nextJob.data.runId,
                waitingCount: waitingJobs.length
              },
              'Next workflow job in queue will become active automatically (Bull queue will process it)'
            );
            
            // Emit WebSocket event indicating next job will become active
            await emitQueueUpdate('job_removed', job, nextJob);
          } else if (waitingJobs.length === 0) {
            logger.info('No more jobs in queue after removal');
            // Emit WebSocket event for queue update (no next job)
            await emitQueueUpdate('job_removed', job, null);
          } else {
            // There's already an active job (shouldn't happen with concurrency=1, but log it)
            logger.debug(
              { 
                activeJobId: activeJobs[0]?.id,
                waitingCount: waitingJobs.length
              },
              'Job removed, but there is already an active job (unexpected with concurrency=1)'
            );
            await emitQueueUpdate('job_removed', job);
          }
        } catch (error) {
          logger.warn({ error, jobId: job.id }, 'Failed to check for next job after removal');
          // Still emit the removal event even if we can't check for next job
          await emitQueueUpdate('job_removed', job);
        }
      });

      queues.workflowQueue.on('failed', async (job: Bull.Job<WorkflowJobData> | undefined, err: Error) => {
        // Contract compliance: Log job failure before removal
        logger.error(
          { 
            jobId: job?.id, 
            workflowId: job?.data.workflowId,
            runId: job?.data.runId,
            error: err 
          }, 
          'Workflow job failed (contract: job will be removed immediately)'
        );

        // Explicitly remove the failed job from the queue
        // Even though removeOnFail is configured, we ensure it's removed immediately
        if (job) {
          try {
            const state = await job.getState();
            // Only try to remove if job is still in a removable state
            // If it's already removed or in a terminal state, that's fine
            if (state === 'failed' || state === 'active' || state === 'waiting' || state === 'paused') {
              try {
                await job.remove();
                logger.debug({ jobId: job.id, runId: job.data.runId }, 'Explicitly removed failed job from queue');
              } catch (removeError) {
                // Job may have already been removed by Bull's removeOnFail setting
                // This is expected and not an error
                const removeErrorMessage = removeError instanceof Error ? removeError.message : String(removeError);
                if (removeErrorMessage.includes('stale') || 
                    removeErrorMessage.includes('not in a state') ||
                    removeErrorMessage.includes('Could not remove')) {
                  logger.debug({ jobId: job.id, runId: job.data.runId }, 'Failed job already removed (expected)');
                } else {
                  logger.warn({ jobId: job.id, runId: job.data.runId, error: removeError }, 'Failed to explicitly remove failed job (non-fatal)');
                }
              }
            }
          } catch (stateError) {
            // If we can't check state, job may already be removed - that's fine
            logger.debug({ jobId: job.id, runId: job.data.runId, error: stateError }, 'Could not check job state for removal (job may already be removed)');
          }
          
          // Emit WebSocket event for queue update
          await emitQueueUpdate('job_removed', job);
        }
      });

      queues.workflowQueue.on('stalled', (jobId: string) => {
        logger.warn({ jobId }, 'Workflow job stalled');
      });
    }

    // Scraping queue handlers
    if (queues.scrapingQueue) {
      queues.scrapingQueue.on('completed', (job: Bull.Job<ScrapingJobData>) => {
        logger.info({ jobId: job.id }, 'Scraping job completed');
      });

      queues.scrapingQueue.on('failed', (job: Bull.Job<ScrapingJobData> | undefined, err: Error) => {
        logger.error({ jobId: job?.id, error: err }, 'Scraping job failed');
      });

      queues.scrapingQueue.on('stalled', (jobId: string) => {
        logger.warn({ jobId }, 'Scraping job stalled');
      });
    }

    // Global error handler for all queues
    const allQueues = [
      queues.scanQueue,
      queues.embeddingQueue,
      queues.processingQueue,
      queues.exportQueue,
      queues.workflowQueue,
      queues.scrapingQueue,
    ].filter((q): q is Bull.Queue => q !== null && q !== undefined);

    allQueues.forEach((queue) => {
      queue.on('error', (error: Error) => {
        // Check if this is a Redis connection error (expected when Redis is unavailable)
        const errorMessage = error.message || String(error);
        const isRedisConnectionError =
          errorMessage.includes('EAI_AGAIN') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('getaddrinfo') ||
          errorMessage.includes('ENOTFOUND') ||
          (error as any).code === 'EAI_AGAIN' ||
          (error as any).code === 'ECONNREFUSED' ||
          (error as any).syscall === 'getaddrinfo';

        if (isRedisConnectionError) {
          // Redis is unavailable - log as debug/warn since Redis is optional
          // This prevents noise in logs when running outside Docker or when Redis is intentionally not running
          logger.debug(
            { error: errorMessage, code: (error as any).code, syscall: (error as any).syscall },
            'Redis connection error (expected if Redis is not available, using in-memory fallback)'
          );
        } else {
          // Other errors should be logged as errors
          logger.error({ error }, 'Queue error');
        }
      });
    });
  }
}

