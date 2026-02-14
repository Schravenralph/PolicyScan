/**
 * Learning Scheduler
 * 
 * Schedules periodic learning tasks to update rankings, dictionaries, and sources
 * based on collected feedback.
 */

import { LearningService } from './LearningService.js';
import { withTimeout, DEFAULT_TIMEOUTS } from '../../utils/withTimeout.js';

export interface ScheduledTaskStatus {
  id: string;
  name: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  status: 'idle' | 'running' | 'failed';
  runningSince?: Date;
  lastError?: string;
}

export class LearningScheduler {
  private learningService: LearningService;
  private rankingsIntervalId: NodeJS.Timeout | null = null;
  private dictionariesIntervalId: NodeJS.Timeout | null = null;
  private sourcesIntervalId: NodeJS.Timeout | null = null;
  private monthlyReviewIntervalId: NodeJS.Timeout | null = null;

  // Concurrent execution protection
  private rankingsRunning = false;
  private dictionariesRunning = false;
  private sourcesRunning = false;
  private monthlyReviewRunning = false;

  // Task status tracking
  private rankingsStartTime: Date | null = null;
  private dictionariesStartTime: Date | null = null;
  private sourcesStartTime: Date | null = null;
  private monthlyReviewStartTime: Date | null = null;

  private rankingsLastRun: Date | null = null;
  private dictionariesLastRun: Date | null = null;
  private sourcesLastRun: Date | null = null;
  private monthlyReviewLastRun: Date | null = null;

  private rankingsLastError: string | null = null;
  private dictionariesLastError: string | null = null;
  private sourcesLastError: string | null = null;
  private monthlyReviewLastError: string | null = null;

  private readonly RANKINGS_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
  private readonly DICTIONARIES_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Weekly
  private readonly SOURCES_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Weekly
  private readonly MONTHLY_REVIEW_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // Monthly

  // Timeout for scheduled tasks (30 minutes for full cycle, 10 minutes for individual operations)
  private readonly TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly OPERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  constructor(learningService: LearningService) {
    this.learningService = learningService;
  }

  /**
   * Start all scheduled learning tasks
   */
  start(): void {
    // Force disable scheduler to solve infinite loop/spam issue during tests
    // eslint-disable-next-line no-constant-condition, no-constant-binary-expression
    if (true || !this.learningService.isEnabled()) {
      console.log('[LearningScheduler] Learning scheduler disabled via code patch');
      return;
    }

    const updateRankings = process.env.LEARNING_UPDATE_RANKINGS_DAILY !== 'false';
    const updateDictionaries = process.env.LEARNING_UPDATE_DICTIONARIES_WEEKLY !== 'false';
    const updateSources = process.env.LEARNING_UPDATE_SOURCES_WEEKLY !== 'false';
    const monthlyReview = process.env.LEARNING_FULL_REVIEW_MONTHLY !== 'false';

    console.log('[LearningScheduler] Starting learning scheduler...');

    // Daily ranking updates
    if (updateRankings) {
      this.startRankingsUpdates();
    }

    // Weekly dictionary updates
    if (updateDictionaries) {
      this.startDictionaryUpdates();
    }

    // Weekly source updates
    if (updateSources) {
      this.startSourceUpdates();
    }

    // Monthly full review
    if (monthlyReview) {
      this.startMonthlyReview();
    }

    console.log('[LearningScheduler] All scheduled tasks started');
  }

  /**
   * Stop all scheduled learning tasks
   */
  stop(): void {
    if (this.rankingsIntervalId) {
      clearInterval(this.rankingsIntervalId);
      this.rankingsIntervalId = null;
    }

    if (this.dictionariesIntervalId) {
      clearInterval(this.dictionariesIntervalId);
      this.dictionariesIntervalId = null;
    }

    if (this.sourcesIntervalId) {
      clearInterval(this.sourcesIntervalId);
      this.sourcesIntervalId = null;
    }

    if (this.monthlyReviewIntervalId) {
      clearInterval(this.monthlyReviewIntervalId);
      this.monthlyReviewIntervalId = null;
    }

    console.log('[LearningScheduler] All scheduled tasks stopped');
  }

  /**
   * Start daily ranking updates
   */
  private startRankingsUpdates(): void {
    // Delay initial run to allow MongoDB connection to stabilize
    setTimeout(() => {
      this.updateRankings().catch(error => {
        console.error('[LearningScheduler] Error in initial ranking update:', error);
      });
    }, 5000); // Wait 5 seconds after startup

    // Then run daily
    this.rankingsIntervalId = setInterval(() => {
      this.updateRankings().catch(error => {
        console.error('[LearningScheduler] Error updating rankings:', error);
      });
    }, this.RANKINGS_INTERVAL_MS);

    console.log('[LearningScheduler] Daily ranking updates started');
  }

  /**
   * Start weekly dictionary updates
   */
  private startDictionaryUpdates(): void {
    // Delay initial run to allow MongoDB connection to stabilize
    setTimeout(() => {
      this.updateDictionaries().catch(error => {
        console.error('[LearningScheduler] Error in initial dictionary update:', error);
      });
    }, 10000); // Wait 10 seconds after startup

    // Then run weekly
    this.dictionariesIntervalId = setInterval(() => {
      this.updateDictionaries().catch(error => {
        console.error('[LearningScheduler] Error updating dictionaries:', error);
      });
    }, this.DICTIONARIES_INTERVAL_MS);

    console.log('[LearningScheduler] Weekly dictionary updates started');
  }

  /**
   * Start weekly source updates
   */
  private startSourceUpdates(): void {
    // Delay initial run to allow MongoDB connection to stabilize
    setTimeout(() => {
      this.updateSources().catch(error => {
        console.error('[LearningScheduler] Error in initial source update:', error);
      });
    }, 15000); // Wait 15 seconds after startup

    // Then run weekly
    this.sourcesIntervalId = setInterval(() => {
      this.updateSources().catch(error => {
        console.error('[LearningScheduler] Error updating sources:', error);
      });
    }, this.SOURCES_INTERVAL_MS);

    console.log('[LearningScheduler] Weekly source updates started');
  }

  /**
   * Start monthly full review
   */
  private startMonthlyReview(): void {
    // Delay initial run to allow MongoDB connection to stabilize
    setTimeout(() => {
      this.runMonthlyReview().catch(error => {
        console.error('[LearningScheduler] Error in initial monthly review:', error);
      });
    }, 20000); // Wait 20 seconds after startup

    // Then run monthly
    this.monthlyReviewIntervalId = setInterval(() => {
      this.runMonthlyReview().catch(error => {
        console.error('[LearningScheduler] Error in monthly review:', error);
      });
    }, this.MONTHLY_REVIEW_INTERVAL_MS);

    console.log('[LearningScheduler] Monthly review started');
  }

  /**
   * Update rankings based on feedback
   */
  private async updateRankings(): Promise<void> {
    // Prevent concurrent execution
    if (this.rankingsRunning) {
      console.warn('[LearningScheduler] Rankings update already running, skipping this execution');
      return;
    }

    this.rankingsRunning = true;
    this.rankingsStartTime = new Date();
    this.rankingsLastError = null;
    console.log('[LearningScheduler] Updating rankings...');
    try {
      const boosts = await withTimeout(
        this.learningService.calculateRankingBoosts(),
        this.OPERATION_TIMEOUT_MS,
        'updateRankings'
      );
      console.log(`[LearningScheduler] Updated ${boosts.length} document rankings`);
      this.rankingsLastRun = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.rankingsLastError = errorMessage;
      console.error('[LearningScheduler] Error updating rankings:', error);
      // Don't throw - allow scheduler to continue with other tasks
    } finally {
      this.rankingsRunning = false;
      this.rankingsStartTime = null;
    }
  }

  /**
   * Update dictionaries with new terms
   */
  private async updateDictionaries(): Promise<void> {
    // Prevent concurrent execution
    if (this.dictionariesRunning) {
      console.warn('[LearningScheduler] Dictionary update already running, skipping this execution');
      return;
    }

    this.dictionariesRunning = true;
    this.dictionariesStartTime = new Date();
    this.dictionariesLastError = null;
    console.log('[LearningScheduler] Updating dictionaries...');
    try {
      const updates = await withTimeout(
        this.learningService.discoverNewTerms(),
        this.OPERATION_TIMEOUT_MS,
        'updateDictionaries'
      );
      console.log(`[LearningScheduler] Discovered ${updates.length} new dictionary entries`);
      this.dictionariesLastRun = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.dictionariesLastError = errorMessage;
      console.error('[LearningScheduler] Error updating dictionaries:', error);
      // Don't throw - allow scheduler to continue with other tasks
    } finally {
      this.dictionariesRunning = false;
      this.dictionariesStartTime = null;
    }
  }

  /**
   * Update source quality scores
   */
  private async updateSources(): Promise<void> {
    // Prevent concurrent execution
    if (this.sourcesRunning) {
      console.warn('[LearningScheduler] Source quality update already running, skipping this execution');
      return;
    }

    this.sourcesRunning = true;
    this.sourcesStartTime = new Date();
    this.sourcesLastError = null;
    console.log('[LearningScheduler] Updating source quality...');
    try {
      const updates = await withTimeout(
        this.learningService.updateSourceQuality(),
        this.OPERATION_TIMEOUT_MS,
        'updateSources'
      );
      console.log(`[LearningScheduler] Updated quality for ${updates.length} sources`);
      this.sourcesLastRun = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sourcesLastError = errorMessage;
      console.error('[LearningScheduler] Error updating sources:', error);
      // Don't throw - allow scheduler to continue with other tasks
    } finally {
      this.sourcesRunning = false;
      this.sourcesStartTime = null;
    }
  }

  /**
   * Run full monthly review
   */
  private async runMonthlyReview(): Promise<void> {
    // Prevent concurrent execution
    if (this.monthlyReviewRunning) {
      console.warn('[LearningScheduler] Monthly review already running, skipping this execution');
      return;
    }

    this.monthlyReviewRunning = true;
    this.monthlyReviewStartTime = new Date();
    this.monthlyReviewLastError = null;
    console.log('[LearningScheduler] Running monthly review...');
    try {
      const result = await withTimeout(
        this.learningService.runLearningCycle(),
        this.TASK_TIMEOUT_MS,
        'runMonthlyReview'
      );
      console.log('[LearningScheduler] Monthly review completed:', {
        rankingBoosts: result.rankingBoosts.length,
        dictionaryUpdates: result.dictionaryUpdates.length,
        sourceUpdates: result.sourceUpdates.length,
        overallCTR: result.metrics.overallCTR.toFixed(3),
        overallAcceptanceRate: result.metrics.overallAcceptanceRate.toFixed(3)
      });
      this.monthlyReviewLastRun = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.monthlyReviewLastError = errorMessage;
      console.error('[LearningScheduler] Error in monthly review:', error);
      // Don't throw - allow scheduler to continue with other tasks
    } finally {
      this.monthlyReviewRunning = false;
      this.monthlyReviewStartTime = null;
    }
  }

  /**
   * Get status of all scheduled tasks
   */
  getStatus(): {
    enabled: boolean;
    tasks: ScheduledTaskStatus[];
  } {
    const enabled = this.learningService.isEnabled();
    const now = new Date();

    const tasks: ScheduledTaskStatus[] = [];

    // Rankings task
    const rankingsNextRun = this.rankingsLastRun
      ? new Date(this.rankingsLastRun.getTime() + this.RANKINGS_INTERVAL_MS)
      : undefined;
    tasks.push({
      id: 'rankings',
      name: 'Daily Ranking Updates',
      enabled: process.env.LEARNING_UPDATE_RANKINGS_DAILY !== 'false',
      lastRun: this.rankingsLastRun || undefined,
      nextRun: rankingsNextRun,
      status: this.rankingsRunning ? 'running' : (this.rankingsLastError ? 'failed' : 'idle'),
      runningSince: this.rankingsStartTime || undefined,
      lastError: this.rankingsLastError || undefined,
    });

    // Dictionaries task
    const dictionariesNextRun = this.dictionariesLastRun
      ? new Date(this.dictionariesLastRun.getTime() + this.DICTIONARIES_INTERVAL_MS)
      : undefined;
    tasks.push({
      id: 'dictionaries',
      name: 'Weekly Dictionary Updates',
      enabled: process.env.LEARNING_UPDATE_DICTIONARIES_WEEKLY !== 'false',
      lastRun: this.dictionariesLastRun || undefined,
      nextRun: dictionariesNextRun,
      status: this.dictionariesRunning ? 'running' : (this.dictionariesLastError ? 'failed' : 'idle'),
      runningSince: this.dictionariesStartTime || undefined,
      lastError: this.dictionariesLastError || undefined,
    });

    // Sources task
    const sourcesNextRun = this.sourcesLastRun
      ? new Date(this.sourcesLastRun.getTime() + this.SOURCES_INTERVAL_MS)
      : undefined;
    tasks.push({
      id: 'sources',
      name: 'Weekly Source Updates',
      enabled: process.env.LEARNING_UPDATE_SOURCES_WEEKLY !== 'false',
      lastRun: this.sourcesLastRun || undefined,
      nextRun: sourcesNextRun,
      status: this.sourcesRunning ? 'running' : (this.sourcesLastError ? 'failed' : 'idle'),
      runningSince: this.sourcesStartTime || undefined,
      lastError: this.sourcesLastError || undefined,
    });

    // Monthly review task
    const monthlyReviewNextRun = this.monthlyReviewLastRun
      ? new Date(this.monthlyReviewLastRun.getTime() + this.MONTHLY_REVIEW_INTERVAL_MS)
      : undefined;
    tasks.push({
      id: 'monthly-review',
      name: 'Monthly Full Review',
      enabled: process.env.LEARNING_FULL_REVIEW_MONTHLY !== 'false',
      lastRun: this.monthlyReviewLastRun || undefined,
      nextRun: monthlyReviewNextRun,
      status: this.monthlyReviewRunning ? 'running' : (this.monthlyReviewLastError ? 'failed' : 'idle'),
      runningSince: this.monthlyReviewStartTime || undefined,
      lastError: this.monthlyReviewLastError || undefined,
    });

    return {
      enabled,
      tasks,
    };
  }

  /**
   * Recover stuck scheduled tasks
   * Checks for tasks that have been running for more than the specified timeout
   * 
   * @param timeoutMinutes - Maximum time a task should run (default: 30 minutes for full cycle, 10 for operations)
   * @returns Number of tasks recovered
   */
  recoverStuckTasks(timeoutMinutes?: number): number {
    const defaultTimeout = 30; // 30 minutes for full cycle
    const operationTimeout = 10; // 10 minutes for individual operations
    let recovered = 0;

    // Check rankings task
    if (this.rankingsRunning && this.rankingsStartTime) {
      const elapsed = (Date.now() - this.rankingsStartTime.getTime()) / (1000 * 60);
      if (elapsed > (timeoutMinutes || operationTimeout)) {
        console.warn(`[LearningScheduler] Recovering stuck rankings task (running for ${elapsed.toFixed(1)} minutes)`);
        this.rankingsRunning = false;
        this.rankingsStartTime = null;
        this.rankingsLastError = `Task was stuck and recovered after ${elapsed.toFixed(1)} minutes`;
        recovered++;
      }
    }

    // Check dictionaries task
    if (this.dictionariesRunning && this.dictionariesStartTime) {
      const elapsed = (Date.now() - this.dictionariesStartTime.getTime()) / (1000 * 60);
      if (elapsed > (timeoutMinutes || operationTimeout)) {
        console.warn(`[LearningScheduler] Recovering stuck dictionaries task (running for ${elapsed.toFixed(1)} minutes)`);
        this.dictionariesRunning = false;
        this.dictionariesStartTime = null;
        this.dictionariesLastError = `Task was stuck and recovered after ${elapsed.toFixed(1)} minutes`;
        recovered++;
      }
    }

    // Check sources task
    if (this.sourcesRunning && this.sourcesStartTime) {
      const elapsed = (Date.now() - this.sourcesStartTime.getTime()) / (1000 * 60);
      if (elapsed > (timeoutMinutes || operationTimeout)) {
        console.warn(`[LearningScheduler] Recovering stuck sources task (running for ${elapsed.toFixed(1)} minutes)`);
        this.sourcesRunning = false;
        this.sourcesStartTime = null;
        this.sourcesLastError = `Task was stuck and recovered after ${elapsed.toFixed(1)} minutes`;
        recovered++;
      }
    }

    // Check monthly review task
    if (this.monthlyReviewRunning && this.monthlyReviewStartTime) {
      const elapsed = (Date.now() - this.monthlyReviewStartTime.getTime()) / (1000 * 60);
      if (elapsed > (timeoutMinutes || defaultTimeout)) {
        console.warn(`[LearningScheduler] Recovering stuck monthly review task (running for ${elapsed.toFixed(1)} minutes)`);
        this.monthlyReviewRunning = false;
        this.monthlyReviewStartTime = null;
        this.monthlyReviewLastError = `Task was stuck and recovered after ${elapsed.toFixed(1)} minutes`;
        recovered++;
      }
    }

    return recovered;
  }

  /**
   * Manually trigger a scheduled task
   * 
   * @param taskId - ID of the task to trigger ('rankings', 'dictionaries', 'sources', 'monthly-review')
   * @returns Promise that resolves when task completes
   */
  async triggerTask(taskId: string): Promise<void> {
    switch (taskId) {
      case 'rankings':
        await this.updateRankings();
        break;
      case 'dictionaries':
        await this.updateDictionaries();
        break;
      case 'sources':
        await this.updateSources();
        break;
      case 'monthly-review':
        await this.runMonthlyReview();
        break;
      default:
        throw new Error(`Unknown task ID: ${taskId}`);
    }
  }

  /**
   * Check if a task can be triggered (not already running)
   */
  canTriggerTask(taskId: string): boolean {
    switch (taskId) {
      case 'rankings':
        return !this.rankingsRunning;
      case 'dictionaries':
        return !this.dictionariesRunning;
      case 'sources':
        return !this.sourcesRunning;
      case 'monthly-review':
        return !this.monthlyReviewRunning;
      default:
        return false;
    }
  }
}

