/**
 * Stuck Job Recovery Service
 * 
 * Provides functionality to detect and recover stuck jobs in queues.
 */

import { getQueueService } from './QueueService.js';
import { logger } from '../../utils/logger.js';
import Bull from 'bull';

export interface StuckJob {
  id: string;
  name: string;
  queue: string;
  age: number;
  data: unknown;
  attemptsMade: number;
  maxAttempts: number;
}

export interface RecoveryResult {
  success: boolean;
  recoveredJobs: number;
  failedJobs: number;
  errors?: string[];
}

export class StuckJobRecoveryService {
  private static readonly STUCK_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  // private static readonly MAX_RECOVERY_ATTEMPTS = 3; // Unused

  /**
   * Detect stuck jobs across all queues
   */
  static async detectStuckJobs(): Promise<StuckJob[]> {
    const stuckJobs: StuckJob[] = [];

    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      if (!queueManager.isInitialized()) {
        return stuckJobs;
      }

      const queues = queueManager.getQueues();

      // Check each queue for stuck jobs
      for (const [queueName, queue] of Object.entries(queues) as [keyof typeof queues, Bull.Queue][]) {
        try {
          const queueTyped = queue as Bull.Queue;
          const activeJobs = await queueTyped.getActive();
          const queueNameStr = String(queueName);
          
          for (const job of activeJobs) {
            const processedOn = job.processedOn || job.timestamp || Date.now();
            const age = Date.now() - processedOn;
            
            if (age > this.STUCK_JOB_THRESHOLD_MS) {
              stuckJobs.push({
                id: job.id?.toString() || 'unknown',
                name: job.name || 'unknown',
                queue: queueNameStr,
                age,
                data: job.data,
                attemptsMade: job.attemptsMade || 0,
                maxAttempts: job.opts?.attempts || 3,
              });
            }
          }
        } catch (error) {
          const queueNameStr = String(queueName);
          logger.error({ error, queueName: queueNameStr }, `Failed to detect stuck jobs in queue ${queueNameStr}`);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to detect stuck jobs');
    }

    return stuckJobs;
  }

  /**
   * Recover stuck jobs by moving them back to waiting state
   */
  static async recoverStuckJobs(jobs?: StuckJob[]): Promise<RecoveryResult> {
    const jobsToRecover = jobs || await this.detectStuckJobs();
    
    if (jobsToRecover.length === 0) {
      return {
        success: true,
        recoveredJobs: 0,
        failedJobs: 0,
      };
    }

    logger.info(
      { stuckJobsCount: jobsToRecover.length },
      `Attempting to recover ${jobsToRecover.length} stuck job(s)`
    );

    const errors: string[] = [];
    let recoveredCount = 0;
    let failedCount = 0;

    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      if (!queueManager.isInitialized()) {
        throw new Error('Queues not initialized');
      }

      const queues = queueManager.getQueues();

      for (const stuckJob of jobsToRecover) {
        try {
          const queue = queues[stuckJob.queue as keyof typeof queues] as Bull.Queue<unknown> | undefined;
          
          if (!queue) {
            errors.push(`Queue ${stuckJob.queue} not found for job ${stuckJob.id}`);
            failedCount++;
            continue;
          }

          // Get the job
          const job = await queue.getJob(stuckJob.id);
          
          if (!job) {
            errors.push(`Job ${stuckJob.id} not found in queue ${stuckJob.queue}`);
            failedCount++;
            continue;
          }

          // Check if job is still active
          const state = await job.getState();
          
          if (state !== 'active') {
            logger.debug(
              { jobId: stuckJob.id, queue: stuckJob.queue, state },
              `Job ${stuckJob.id} is not in active state (${state}), skipping recovery`
            );
            continue;
          }

          // Move job back to waiting state by removing and re-adding it
          // This will allow it to be picked up by a worker again
          const jobData = job.data;
          const jobOptions: Bull.JobOptions = {
            attempts: job.opts.attempts,
            backoff: job.opts.backoff,
            delay: job.opts.delay,
            priority: job.opts.priority,
          };
          await job.remove();
          await queue.add(job.name || 'default', jobData, jobOptions);
          
          logger.info(
            { jobId: stuckJob.id, queue: stuckJob.queue, age: stuckJob.age },
            `Recovered stuck job ${stuckJob.id} from queue ${stuckJob.queue}`
          );
          
          recoveredCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to recover job ${stuckJob.id}: ${errorMessage}`);
          failedCount++;
          
          logger.error(
            { error, jobId: stuckJob.id, queue: stuckJob.queue },
            `Failed to recover stuck job ${stuckJob.id}`
          );
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to recover stuck jobs');
      return {
        success: false,
        recoveredJobs: recoveredCount,
        failedJobs: failedCount + jobsToRecover.length - recoveredCount,
        errors: [...errors, error instanceof Error ? error.message : String(error)],
      };
    }

    const success = failedCount === 0;

    if (!success) {
      logger.warn(
        { recoveredCount, failedCount, errors },
        `Recovered ${recoveredCount} stuck job(s), ${failedCount} failed`
      );
    } else {
      logger.info(
        { recoveredCount },
        `Successfully recovered ${recoveredCount} stuck job(s)`
      );
    }

    return {
      success,
      recoveredJobs: recoveredCount,
      failedJobs: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Retry failed jobs that may have been stuck
   */
  static async retryFailedJobs(
    queueName: string,
    maxAge?: number
  ): Promise<RecoveryResult> {
    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      if (!queueManager.isInitialized()) {
        throw new Error('Queues not initialized');
      }

      const queues = queueManager.getQueues();
      const queue = queues[queueName as keyof typeof queues] as Bull.Queue | undefined;
      
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const failedJobs = await queue.getFailed();
      const jobsToRetry = maxAge
        ? failedJobs.filter(job => {
            const age = Date.now() - (job.finishedOn || job.timestamp || Date.now());
            return age < maxAge;
          })
        : failedJobs;

      let recoveredCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const job of jobsToRetry) {
        try {
          // Check if job has exceeded max attempts
          if (job.attemptsMade >= (job.opts?.attempts || 3)) {
            logger.debug(
              { jobId: job.id, attemptsMade: job.attemptsMade },
              `Job ${job.id} has exceeded max attempts, skipping retry`
            );
            continue;
          }

          await job.retry();
          recoveredCount++;
          
          logger.info(
            { jobId: job.id, queue: queueName },
            `Retried failed job ${job.id} from queue ${queueName}`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to retry job ${job.id}: ${errorMessage}`);
          failedCount++;
          
          logger.error(
            { error, jobId: job.id, queue: queueName },
            `Failed to retry job ${job.id}`
          );
        }
      }

      return {
        success: failedCount === 0,
        recoveredJobs: recoveredCount,
        failedJobs: failedCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error({ error, queueName }, 'Failed to retry failed jobs');
      return {
        success: false,
        recoveredJobs: 0,
        failedJobs: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Clean up old stuck jobs (remove them from queue)
   */
  static async cleanupStuckJobs(
    maxAge: number = 24 * 60 * 60 * 1000 // 24 hours
  ): Promise<RecoveryResult> {
    const stuckJobs = await this.detectStuckJobs();
    const oldStuckJobs = stuckJobs.filter(job => job.age > maxAge);

    if (oldStuckJobs.length === 0) {
      return {
        success: true,
        recoveredJobs: 0,
        failedJobs: 0,
      };
    }

    logger.info(
      { oldStuckJobsCount: oldStuckJobs.length, maxAge },
      `Cleaning up ${oldStuckJobs.length} old stuck job(s)`
    );

    let cleanedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      if (!queueManager.isInitialized()) {
        throw new Error('Queues not initialized');
      }

      const queues = queueManager.getQueues();

      for (const stuckJob of oldStuckJobs) {
        try {
          const queue = queues[stuckJob.queue as keyof typeof queues] as Bull.Queue<unknown> | undefined;
          
          if (!queue) {
            errors.push(`Queue ${stuckJob.queue} not found for job ${stuckJob.id}`);
            failedCount++;
            continue;
          }

          const job = await queue.getJob(stuckJob.id);
          
          if (!job) {
            // Job may have been cleaned up already
            cleanedCount++;
            continue;
          }

          // Remove the job
          await job.remove();
          
          logger.info(
            { jobId: stuckJob.id, queue: stuckJob.queue, age: stuckJob.age },
            `Cleaned up old stuck job ${stuckJob.id} from queue ${stuckJob.queue}`
          );
          
          cleanedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to cleanup job ${stuckJob.id}: ${errorMessage}`);
          failedCount++;
          
          logger.error(
            { error, jobId: stuckJob.id, queue: stuckJob.queue },
            `Failed to cleanup stuck job ${stuckJob.id}`
          );
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup stuck jobs');
      return {
        success: false,
        recoveredJobs: cleanedCount,
        failedJobs: failedCount + oldStuckJobs.length - cleanedCount,
        errors: [...errors, error instanceof Error ? error.message : String(error)],
      };
    }

    return {
      success: failedCount === 0,
      recoveredJobs: cleanedCount,
      failedJobs: failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}


