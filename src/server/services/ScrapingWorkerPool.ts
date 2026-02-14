import { BaseScraper } from './scrapers/baseScraper.js';
import { ScrapedDocument } from './infrastructure/types.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration for the scraping worker pool
 */
export interface ScrapingWorkerPoolConfig {
  /** Maximum number of concurrent scrapers (default: 5) */
  maxConcurrency?: number;
  /** Maximum memory usage in MB before throttling (default: 1024) */
  maxMemoryMB?: number;
  /** Rate limit: max requests per second per scraper (default: 2) */
  rateLimitPerSecond?: number;
  /** Timeout for individual scraper execution in milliseconds (default: 60000) */
  scraperTimeout?: number;
}

/**
 * Progress information for a single scraping task
 */
export interface ScrapingTaskProgress {
  websiteUrl: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  documentsFound: number;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Result of a single scraping task
 */
export interface ScrapingTaskResult {
  websiteUrl: string;
  documents: ScrapedDocument[];
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Progress callback for tracking scraping progress
 */
export type ProgressCallback = (progress: ScrapingTaskProgress[]) => void;

/**
 * Scraping task definition
 */
interface ScrapingTask {
  websiteUrl: string;
  websiteTitle?: string;
  scraper: BaseScraper | null;
  onderwerp: string;
  thema: string;
  queryText: string;
}

/**
 * ScrapingWorkerPool - Manages parallel execution of multiple scrapers
 * 
 * Features:
 * - Parallel execution with configurable concurrency
 * - Resource management (rate limiting, memory monitoring)
 * - Result aggregation
 * - Progress tracking
 * - Error handling and recovery
 */
export class ScrapingWorkerPool {
  private config: Required<ScrapingWorkerPoolConfig>;
  private activeTasks: Map<string, ScrapingTaskProgress> = new Map();
  private rateLimiters: Map<string, number[]> = new Map();
  private progressCallback?: ProgressCallback;

  constructor(config: ScrapingWorkerPoolConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 5,
      maxMemoryMB: config.maxMemoryMB ?? 1024,
      rateLimitPerSecond: config.rateLimitPerSecond ?? 2,
      scraperTimeout: config.scraperTimeout ?? 60000,
    };
  }

  /**
   * Set progress callback for real-time progress updates
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Execute multiple scraping tasks in parallel
   * 
   * @param tasks - Array of scraping tasks to execute
   * @returns Aggregated results from all tasks
   */
  async executeParallel(
    tasks: Array<{
      websiteUrl: string;
      websiteTitle?: string;
      scraper: BaseScraper | null;
      onderwerp: string;
      thema: string;
    }>
  ): Promise<{
    results: ScrapingTaskResult[];
    totalDocuments: number;
    successfulTasks: number;
    failedTasks: number;
  }> {
    // Initialize progress tracking
    const scrapingTasks: ScrapingTask[] = tasks.map(task => ({
      websiteUrl: task.websiteUrl,
      websiteTitle: task.websiteTitle,
      scraper: task.scraper,
      onderwerp: task.onderwerp,
      thema: task.thema,
      queryText: `${task.onderwerp} ${task.thema}`.trim(),
    }));

    // Initialize progress for all tasks
    scrapingTasks.forEach(task => {
      this.activeTasks.set(task.websiteUrl, {
        websiteUrl: task.websiteUrl,
        status: 'pending',
        documentsFound: 0,
      });
    });

    // Execute tasks in parallel with concurrency limit
    const results: ScrapingTaskResult[] = [];
    const semaphore = new Semaphore(this.config.maxConcurrency);

    const taskPromises = scrapingTasks.map(async (task) => {
      await semaphore.acquire();
      try {
        return await this.executeTask(task);
      } finally {
        semaphore.release();
      }
    });

    const taskResults = await Promise.allSettled(taskPromises);
    
    // Process results
    taskResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const task = scrapingTasks[index];
        results.push({
          websiteUrl: task.websiteUrl,
          documents: [],
          success: false,
          error: result.reason?.message || 'Unknown error',
          duration: 0,
        });
        const progress = this.activeTasks.get(task.websiteUrl);
        if (progress) {
          progress.status = 'failed';
          progress.error = result.reason?.message || 'Unknown error';
        }
      }
    });

    // Calculate summary statistics
    const successfulTasks = results.filter(r => r.success).length;
    const failedTasks = results.filter(r => !r.success).length;
    const totalDocuments = results.reduce((sum, r) => sum + r.documents.length, 0);

    // Final progress update
    this.notifyProgress();

    return {
      results,
      totalDocuments,
      successfulTasks,
      failedTasks,
    };
  }

  /**
   * Execute a single scraping task
   */
  private async executeTask(task: ScrapingTask): Promise<ScrapingTaskResult> {
    const startTime = Date.now();
    const progress = this.activeTasks.get(task.websiteUrl);
    
    if (!progress) {
      throw new Error(`Progress not found for task: ${task.websiteUrl}`);
    }

    progress.status = 'running';
    progress.startTime = startTime;
    this.notifyProgress();

    try {
      // Check memory usage before starting
      await this.checkMemoryUsage();

      // Apply rate limiting
      await this.applyRateLimit(task.websiteUrl);

      let documents: ScrapedDocument[] = [];

      if (task.scraper) {
        // Use specific scraper
        documents = await Promise.race([
          task.scraper.scrape(
            task.queryText,
            task.onderwerp,
            task.thema
          ),
          this.createTimeout(this.config.scraperTimeout),
        ]) as ScrapedDocument[];
      } else {
        // Fallback: This would typically use WebsiteScraper, but we don't have access here
        // The orchestrator should handle fallback logic
        throw new Error('No scraper available and fallback not implemented in worker pool');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      progress.status = 'completed';
      progress.documentsFound = documents.length;
      progress.endTime = endTime;
      this.notifyProgress();

      return {
        websiteUrl: task.websiteUrl,
        documents,
        success: true,
        duration,
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      progress.status = 'failed';
      progress.error = errorMessage;
      progress.endTime = endTime;
      this.notifyProgress();

      logger.error(
        { error, websiteUrl: task.websiteUrl, duration },
        'Scraping task failed'
      );

      return {
        websiteUrl: task.websiteUrl,
        documents: [],
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Apply rate limiting based on domain
   */
  private async applyRateLimit(websiteUrl: string): Promise<void> {
    const domain = new URL(websiteUrl).hostname;
    const windowMs = 1000; // 1 second window

    if (!this.rateLimiters.has(domain)) {
      this.rateLimiters.set(domain, []);
    }

    const requests = this.rateLimiters.get(domain)!;
    
    // Remove old requests outside the window
    const now = Date.now();
    let recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    // Check if we've exceeded the rate limit
    if (recentRequests.length >= this.config.rateLimitPerSecond) {
      const oldestRequest = recentRequests[0];
      const waitTime = windowMs - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Re-filter after waiting (time has passed, some requests may have expired)
        const updatedNow = Date.now();
        recentRequests = requests.filter(timestamp => updatedNow - timestamp < windowMs);
      }
    }

    // Add current request with current timestamp
    const currentTime = Date.now();
    recentRequests.push(currentTime);
    this.rateLimiters.set(domain, recentRequests.slice(-this.config.rateLimitPerSecond));
  }

  /**
   * Check memory usage and throttle if necessary
   */
  private async checkMemoryUsage(): Promise<void> {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      const memoryMB = usage.heapUsed / 1024 / 1024;

      if (memoryMB > this.config.maxMemoryMB) {
        logger.warn(
          { memoryMB, maxMemoryMB: this.config.maxMemoryMB },
          'Memory usage high, throttling scraping'
        );
        // Wait a bit to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Scraper timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Notify progress callback if set
   */
  private notifyProgress(): void {
    if (this.progressCallback) {
      const progressArray = Array.from(this.activeTasks.values());
      this.progressCallback(progressArray);
    }
  }

  /**
   * Get current progress for all tasks
   */
  getProgress(): ScrapingTaskProgress[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Reset the worker pool state
   */
  reset(): void {
    this.activeTasks.clear();
    this.rateLimiters.clear();
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private available: number;
  private waiters: Array<() => void> = [];

  constructor(count: number) {
    this.available = count;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const resolve = this.waiters.shift()!;
      resolve();
    } else {
      this.available++;
    }
  }
}

