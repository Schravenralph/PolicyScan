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

/**
 * Configuration for queue initialization
 */
export interface QueueConfig {
  redis: 
    | {
        host: string;
        port: number;
        password?: string;
      }
    | {
        sentinels?: Array<{ host: string; port: number }>;
        name?: string;
        password?: string;
      }
    | {
        enableReadyCheck?: boolean;
        maxRetriesPerRequest?: number | null;
        lazyConnect?: boolean;
      };
  defaultJobOptions: Bull.JobOptions;
}

/**
 * All queues managed by QueueManager
 */
export interface ManagedQueues {
  scanQueue: Bull.Queue<ScanJobData>;
  embeddingQueue: Bull.Queue<EmbeddingJobData>;
  processingQueue: Bull.Queue<ProcessingJobData>;
  exportQueue: Bull.Queue<ExportJobData>;
  workflowQueue: Bull.Queue<WorkflowJobData>;
  scrapingQueue: Bull.Queue<ScrapingJobData>;
}

/**
 * QueueManager handles queue initialization, configuration, and lifecycle management
 * Extracted from QueueService to improve separation of concerns
 */
export class QueueManager {
  private queues: Partial<ManagedQueues> = {};
  private initialized: boolean = false;

  /**
   * Create default job options for all queues
   */
  static createDefaultJobOptions(): Bull.JobOptions {
    return {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    };
  }

  /**
   * Create job options for workflow queue
   * Per PRD FR-5: Workflows must be removed immediately upon completion
   * This ensures workflows are removed from queue immediately after completion (age: 0, count: 0)
   */
  static createWorkflowQueueJobOptions(): Bull.JobOptions {
    return {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: {
        age: 0, // Remove immediately (PRD FR-5: immediate removal)
        count: 0, // Remove immediately (PRD FR-5: immediate removal)
      },
      removeOnFail: {
        age: 0, // Remove immediately (PRD FR-5: immediate removal)
      },
    };
  }

  /**
   * Create Redis configuration from environment
   * Uses validateEnv() to ensure proper hostname normalization (e.g., "redis" -> "localhost" when not in Docker)
   * Supports single, sentinel, and cluster connection modes
   * 
   * IMPORTANT: If you're getting "READONLY You can't write against a read only replica" errors:
   * 1. Ensure REDIS_HOST points to the master instance (not a replica)
   * 2. Or use REDIS_CONNECTION_MODE=sentinel for automatic master routing
   * 3. Or use REDIS_CONNECTION_MODE=cluster for cluster mode with automatic routing
   */
  static createRedisConfig(): 
    | { host: string; port: number; password?: string }
    | { sentinels: Array<{ host: string; port: number }>; name: string; password?: string }
    | { enableReadyCheck: boolean; maxRetriesPerRequest: number | null; lazyConnect: boolean } {
    // Use validateEnv() to get normalized Redis configuration
    // This ensures "redis" hostname is converted to "localhost" when running outside Docker
    const { validateEnv } = require('../../config/env.js');
    const env = validateEnv();
    
    // Handle Sentinel mode - automatically routes writes to master
    if (env.REDIS_CONNECTION_MODE === 'sentinel') {
      const sentinelHost = env.REDIS_HOST;
      const sentinelPort = env.REDIS_PORT;
      const masterName = process.env.REDIS_SENTINEL_MASTER_NAME || 'mymaster';
      
      logger.info(
        { sentinelHost, sentinelPort, masterName },
        'Configuring Bull queues with Redis Sentinel (writes will automatically route to master)'
      );
      
      return {
        sentinels: [{ host: sentinelHost, port: sentinelPort }],
        name: masterName,
        password: process.env.REDIS_PASSWORD,
      };
    }
    
    // Handle Cluster mode - automatically handles master/replica routing
    if (env.REDIS_CONNECTION_MODE === 'cluster') {
      logger.info(
        { host: env.REDIS_HOST, port: env.REDIS_PORT },
        'Configuring Bull queues with Redis Cluster (writes will automatically route to master)'
      );
      
      // For cluster mode, Bull/ioredis needs cluster nodes configuration
      // Bull will use the host/port from env for cluster discovery
      // Note: For production, you may need to provide all cluster nodes explicitly
      return {
        enableReadyCheck: true,
        maxRetriesPerRequest: null, // Required for cluster mode
        lazyConnect: false,
      } as any; // Type assertion needed because Bull's cluster config is complex
    }
    
    // Default: single connection mode
    // WARNING: If REDIS_HOST points to a replica, you'll get "READONLY" errors
    // Solution: Point REDIS_HOST to the master, or use Sentinel/Cluster mode
    logger.info(
      { host: env.REDIS_HOST, port: env.REDIS_PORT, mode: 'single' },
      'Configuring Bull queues with single Redis connection (ensure REDIS_HOST points to master, not replica)'
    );
    
    return {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    };
  }

  /**
   * Initialize all queues
   * @param config - Queue configuration (optional, uses defaults if not provided)
   * @returns Initialized queues
   */
  async initializeQueues(config?: Partial<QueueConfig>): Promise<ManagedQueues> {
    if (this.initialized) {
      return this.queues as ManagedQueues;
    }

    // Check if Redis is enabled
    if (process.env.CACHE_REDIS_ENABLED === 'false') {
      const error = new Error('Redis is disabled via CACHE_REDIS_ENABLED');
      logger.warn({ error }, 'Redis is disabled, skipping queue initialization');
      throw error;
    }

    const redisConfig = config?.redis || QueueManager.createRedisConfig();
    const defaultJobOptions = config?.defaultJobOptions || QueueManager.createDefaultJobOptions();

    try {
      // Create scan queue
      this.queues.scanQueue = new Bull<ScanJobData>('scan-jobs', {
        redis: redisConfig,
        defaultJobOptions,
      });

      // Create embedding queue
      this.queues.embeddingQueue = new Bull<EmbeddingJobData>('embedding-jobs', {
        redis: redisConfig,
        defaultJobOptions,
      });

      // Create processing queue
      this.queues.processingQueue = new Bull<ProcessingJobData>('processing-jobs', {
        redis: redisConfig,
        defaultJobOptions,
      });

      // Create export queue
      this.queues.exportQueue = new Bull<ExportJobData>('export-jobs', {
        redis: redisConfig,
        defaultJobOptions,
      });

      // Create workflow queue with PRD-compliant job options (immediate removal on completion)
      this.queues.workflowQueue = new Bull<WorkflowJobData>('workflow-jobs', {
        redis: redisConfig,
        defaultJobOptions: QueueManager.createWorkflowQueueJobOptions(),
      });

      // Create scraping queue
      this.queues.scrapingQueue = new Bull<ScrapingJobData>('scraping-jobs', {
        redis: redisConfig,
        defaultJobOptions,
      });

      this.initialized = true;
      logger.info('All queues initialized successfully');

      return this.queues as ManagedQueues;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize queues');
      throw error;
    }
  }

  /**
   * Get all initialized queues
   * @returns All queues (throws if not initialized)
   */
  getQueues(): ManagedQueues {
    if (!this.initialized) {
      throw new Error('Queues not initialized. Call initializeQueues() first.');
    }
    return this.queues as ManagedQueues;
  }

  /**
   * Get a specific queue by type
   */
  getScanQueue(): Bull.Queue<ScanJobData> {
    return this.getQueues().scanQueue;
  }

  getEmbeddingQueue(): Bull.Queue<EmbeddingJobData> {
    return this.getQueues().embeddingQueue;
  }

  getProcessingQueue(): Bull.Queue<ProcessingJobData> {
    return this.getQueues().processingQueue;
  }

  getExportQueue(): Bull.Queue<ExportJobData> {
    return this.getQueues().exportQueue;
  }

  getWorkflowQueue(): Bull.Queue<WorkflowJobData> {
    return this.getQueues().workflowQueue;
  }

  getScrapingQueue(): Bull.Queue<ScrapingJobData> {
    return this.getQueues().scrapingQueue;
  }

  /**
   * Check if queues are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Close all queues gracefully
   */
  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    const queues = [
      this.queues.scanQueue,
      this.queues.embeddingQueue,
      this.queues.processingQueue,
      this.queues.exportQueue,
      this.queues.workflowQueue,
      this.queues.scrapingQueue,
    ].filter((q): q is Bull.Queue => q !== null && q !== undefined);

    await Promise.all(queues.map((queue) => queue.close()));
    this.initialized = false;
    this.queues = {};
    logger.info('All queues closed');
  }

  /**
   * Clean up all queues (force close)
   */
  async cleanup(): Promise<void> {
    await this.close();
  }
}

