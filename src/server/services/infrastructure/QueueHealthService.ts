/**
 * Queue Health Service
 * 
 * Provides comprehensive health check functionality for queue system.
 */

import { getQueueService } from './QueueService.js';
import { QueueManager } from './QueueManager.js';
import { logger } from '../../utils/logger.js';

export interface QueueHealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: {
    redis: {
      healthy: boolean;
      message?: string;
      latency?: number;
    };
    queues: {
      healthy: boolean;
      message?: string;
      queues: Array<{
        name: string;
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        paused: boolean;
      }>;
    };
    stuckJobs: {
      healthy: boolean;
      message?: string;
      count?: number;
      jobs?: Array<{
        id: string;
        name: string;
        queue: string;
        age: number;
      }>;
    };
  };
  metrics?: {
    totalWaiting: number;
    totalActive: number;
    totalCompleted: number;
    totalFailed: number;
    totalDelayed: number;
  };
}

export class QueueHealthService {
  /**
   * Perform comprehensive queue health check
   */
  static async checkHealth(): Promise<QueueHealthStatus> {
    const timestamp = new Date().toISOString();
    const checks = {
      redis: await this.checkRedisConnection(),
      queues: await this.checkQueues(),
      stuckJobs: await this.checkStuckJobs(),
    };

    const healthy = Object.values(checks).every(check => check.healthy);

    // Calculate total metrics
    const metrics = checks.queues.queues?.reduce(
      (acc, queue) => ({
        totalWaiting: acc.totalWaiting + queue.waiting,
        totalActive: acc.totalActive + queue.active,
        totalCompleted: acc.totalCompleted + queue.completed,
        totalFailed: acc.totalFailed + queue.failed,
        totalDelayed: acc.totalDelayed + queue.delayed,
      }),
      { totalWaiting: 0, totalActive: 0, totalCompleted: 0, totalFailed: 0, totalDelayed: 0 }
    );

    return {
      healthy,
      timestamp,
      checks,
      metrics,
    };
  }

  /**
   * Check Redis connection health
   */
  private static async checkRedisConnection(): Promise<QueueHealthStatus['checks']['redis']> {
    const startTime = Date.now();
    
    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager as QueueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      
      // Try to get queue counts (this requires Redis connection)
      if (!queueManager.isInitialized()) {
        return {
          healthy: false,
          message: 'Queues not initialized',
        };
      }

      const queues = queueManager.getQueues();
      const workflowQueue = queues.workflowQueue;
      
      // Try a simple operation to test Redis connection
      await workflowQueue.getWaitingCount();
      
      const latency = Date.now() - startTime;
      
      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({ error, latency }, 'Redis connection health check failed');
      
      return {
        healthy: false,
        message: errorMessage,
        latency,
      };
    }
  }

  /**
   * Check all queues health
   */
  private static async checkQueues(): Promise<QueueHealthStatus['checks']['queues']> {
    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager as QueueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      if (!queueManager.isInitialized()) {
        return {
          healthy: false,
          message: 'Queues not initialized',
          queues: [],
        };
      }

      const queues = queueManager.getQueues();
      const queueList: QueueHealthStatus['checks']['queues']['queues'] = [];

      // Check each queue
      for (const [queueName, queue] of Object.entries(queues)) {
        try {
          const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
            queue.isPaused(),
          ]);

          queueList.push({
            name: queueName,
            waiting,
            active,
            completed,
            failed,
            delayed,
            paused,
          });

          // Alert on queue full (more than 90% of max size)
          const { JOB_QUEUE } = await import('../../config/constants.js');
          const maxSize = queueName === 'workflowQueue' 
            ? JOB_QUEUE.MAX_WORKFLOW_QUEUE_SIZE 
            : 1000; // Default max size
          
          const queueSize = waiting + active;
          if (queueSize > maxSize * 0.9) {
            logger.warn(
              { queueName, queueSize, maxSize, waiting, active },
              `ALERT: Queue ${queueName} is near capacity: ${queueSize}/${maxSize}`
            );
          }
        } catch (error) {
          logger.error({ error, queueName }, `Failed to check queue ${queueName}`);
        }
      }

      // Check if any queue is unhealthy
      const unhealthyQueues = queueList.filter(q => q.paused && q.waiting > 0);
      const isHealthy = unhealthyQueues.length === 0;

      return {
        healthy: isHealthy,
        message: unhealthyQueues.length > 0 
          ? `${unhealthyQueues.length} queue(s) are paused with waiting jobs`
          : undefined,
        queues: queueList,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to check queues health');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        queues: [],
      };
    }
  }

  /**
   * Check for stuck jobs (jobs in active state for too long)
   */
  private static async checkStuckJobs(): Promise<QueueHealthStatus['checks']['stuckJobs']> {
    const STUCK_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    
    try {
      const queueService = getQueueService();
      const queueManager = (queueService as any).queueManager as QueueManager;
      if (!queueManager.isInitialized()) {
        await queueManager.initializeQueues();
      }
      if (!queueManager.isInitialized()) {
        return {
          healthy: true, // Not unhealthy if queues aren't initialized
          message: 'Queues not initialized',
        };
      }

      const queues = queueManager.getQueues();
      const stuckJobs: QueueHealthStatus['checks']['stuckJobs']['jobs'] = [];

      // Check each queue for stuck jobs
      for (const [queueName, queue] of Object.entries(queues)) {
        try {
          const activeJobs = await queue.getActive();
          
          for (const job of activeJobs) {
            const age = Date.now() - (job.processedOn || job.timestamp || Date.now());
            
            if (age > STUCK_JOB_THRESHOLD_MS) {
              stuckJobs.push({
                id: job.id?.toString() || 'unknown',
                name: job.name || 'unknown',
                queue: queueName,
                age,
              });
            }
          }
        } catch (error) {
          logger.error({ error, queueName }, `Failed to check stuck jobs in queue ${queueName}`);
        }
      }

      const isHealthy = stuckJobs.length === 0;

      if (!isHealthy) {
        logger.warn(
          { stuckJobsCount: stuckJobs.length, stuckJobs },
          `ALERT: Found ${stuckJobs.length} stuck job(s)`
        );
      }

      return {
        healthy: isHealthy,
        message: stuckJobs.length > 0 
          ? `Found ${stuckJobs.length} stuck job(s)`
          : undefined,
        count: stuckJobs.length,
        jobs: stuckJobs.length > 0 ? stuckJobs : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to check stuck jobs');
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Quick health check (returns boolean)
   */
  static async quickHealthCheck(): Promise<boolean> {
    try {
      const health = await this.checkHealth();
      return health.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Get queue metrics
   */
  static async getQueueMetrics(): Promise<{
    totalWaiting: number;
    totalActive: number;
    totalCompleted: number;
    totalFailed: number;
    totalDelayed: number;
  } | null> {
    try {
      const health = await this.checkHealth();
      return health.metrics || null;
    } catch {
      return null;
    }
  }
}


