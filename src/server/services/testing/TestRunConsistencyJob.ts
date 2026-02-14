/**
 * Test Run Consistency Background Job
 * 
 * Periodically checks test run data consistency across MongoDB and JSON file sources.
 * Detects and optionally repairs inconsistencies.
 * 
 * Created as part of WI-TEST-RUNS-003
 */

import { logger } from '../../utils/logger.js';
import { getTestRunDataSyncService, type ConsistencyReport } from './TestRunDataSyncService.js';
import { getTestSummaryService } from './TestSummaryService.js';
import { ensureDBConnection } from '../../config/database.js';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

export interface ConsistencyJobOptions {
  /** Interval in milliseconds between consistency checks (default: 1 hour) */
  checkIntervalMs?: number;
  /** Whether to automatically repair inconsistencies (default: false) */
  autoRepair?: boolean;
  /** Maximum number of runs to check per iteration (default: 100) */
  maxRunsPerCheck?: number;
  /** Whether the job is enabled (default: true) */
  enabled?: boolean;
}

export interface ConsistencyJobStats {
  lastRun: Date | null;
  totalChecks: number;
  inconsistenciesFound: number;
  inconsistenciesRepaired: number;
  errors: number;
}

/**
 * Background job for periodic test run consistency checks
 */
export class TestRunConsistencyJob {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number;
  private readonly autoRepair: boolean;
  private readonly maxRunsPerCheck: number;
  private readonly enabled: boolean;
  private stats: ConsistencyJobStats = {
    lastRun: null,
    totalChecks: 0,
    inconsistenciesFound: 0,
    inconsistenciesRepaired: 0,
    errors: 0,
  };

  constructor(options: ConsistencyJobOptions = {}) {
    this.checkIntervalMs = options.checkIntervalMs ?? 60 * 60 * 1000; // Default: 1 hour
    this.autoRepair = options.autoRepair ?? false;
    this.maxRunsPerCheck = options.maxRunsPerCheck ?? 100;
    this.enabled = options.enabled ?? true;
  }

  /**
   * Start the background job
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('TestRunConsistencyJob already running');
      return;
    }

    if (!this.enabled) {
      logger.info('TestRunConsistencyJob is disabled');
      return;
    }

    logger.info({
      checkIntervalMs: this.checkIntervalMs,
      autoRepair: this.autoRepair,
      maxRunsPerCheck: this.maxRunsPerCheck,
    });

    // Run immediately on start
    this.runConsistencyCheck().catch((error) => {
      logger.error({ error }, 'Error in initial consistency check');
      this.stats.errors++;
    });

    // Then run on schedule
    this.intervalId = setInterval(() => {
      this.runConsistencyCheck().catch((error) => {
        logger.error({ error }, 'Error in scheduled consistency check');
        this.stats.errors++;
      });
    }, this.checkIntervalMs);

    logger.info('TestRunConsistencyJob started');
  }

  /**
   * Stop the background job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('TestRunConsistencyJob stopped');
    }
  }

  /**
   * Get current job statistics
   */
  getStats(): ConsistencyJobStats {
    return { ...this.stats };
  }

  /**
   * Run a consistency check
   */
  private async runConsistencyCheck(): Promise<void> {
    const startTime = Date.now();
    logger.debug('Starting consistency check');

    try {
      await ensureDBConnection();
      const syncService = getTestRunDataSyncService();
      const summaryService = getTestSummaryService();

      // Get recent runs from MongoDB
      const { summaries: recentSummaries } = await summaryService.getRecentSummaries(this.maxRunsPerCheck);
      logger.debug({ count: recentSummaries.length }, 'Checking consistency for recent runs');

      let inconsistenciesFound = 0;
      let inconsistenciesRepaired = 0;

      for (const summary of recentSummaries) {
        try {
          const report = await syncService.verifyConsistency(summary.runId);

          if (!report.consistent) {
            inconsistenciesFound++;
            logger.warn(
              { runId: summary.runId, inconsistencies: report.inconsistencies },
              'Inconsistency detected'
            );

            if (this.autoRepair) {
              try {
                await syncService.repairInconsistencies(summary.runId);
                inconsistenciesRepaired++;
                logger.info({ runId: summary.runId }, 'Inconsistency repaired');
              } catch (error) {
                logger.error({ error, runId: summary.runId }, 'Failed to repair inconsistency');
              }
            }
          }
        } catch (error) {
          logger.warn({ error, runId: summary.runId }, 'Error checking consistency for run');
        }
      }

      // Also check JSON file for runs not in MongoDB
      await this.checkJsonFileRuns(syncService, inconsistenciesFound, inconsistenciesRepaired);

      // Update stats
      this.stats.lastRun = new Date();
      this.stats.totalChecks++;
      this.stats.inconsistenciesFound += inconsistenciesFound;
      this.stats.inconsistenciesRepaired += inconsistenciesRepaired;

      const duration = Date.now() - startTime;
      logger.info(
        {
          duration,
          checked: recentSummaries.length,
          inconsistenciesFound,
          inconsistenciesRepaired,
        },
        'Consistency check completed'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to run consistency check');
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Check runs in JSON file that might not be in MongoDB
   */
  private async checkJsonFileRuns(
    syncService: ReturnType<typeof getTestRunDataSyncService>,
    inconsistenciesFound: number,
    inconsistenciesRepaired: number
  ): Promise<void> {
    try {
      const dashboardDataPath = join(process.cwd(), 'test-results', 'dashboard-data.json');
      const publicDashboardPath = join(process.cwd(), 'public', 'test-results', 'dashboard-data.json');

      let dataPath = dashboardDataPath;
      if (!existsSync(dataPath)) {
        dataPath = publicDashboardPath;
      }

      if (!existsSync(dataPath)) {
        return; // No JSON file to check
      }

      const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
      const recentRuns = data.recentRuns || [];

      // Check first N runs from JSON file
      const runsToCheck = recentRuns.slice(0, this.maxRunsPerCheck);

      for (const run of runsToCheck) {
        if (!run.id) continue;

        try {
          const report = await syncService.verifyConsistency(run.id);

          if (!report.consistent) {
            inconsistenciesFound++;
            logger.warn(
              { runId: run.id, inconsistencies: report.inconsistencies },
              'Inconsistency detected in JSON file run'
            );

            if (this.autoRepair) {
              try {
                await syncService.repairInconsistencies(run.id);
                inconsistenciesRepaired++;
                logger.info({ runId: run.id }, 'Inconsistency repaired for JSON file run');
              } catch (error) {
                logger.error({ error, runId: run.id }, 'Failed to repair inconsistency');
              }
            }
          }
        } catch (error) {
          logger.warn({ error, runId: run.id }, 'Error checking consistency for JSON file run');
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to check JSON file runs');
    }
  }

  /**
   * Manually trigger a consistency check
   */
  async triggerCheck(): Promise<ConsistencyJobStats> {
    await this.runConsistencyCheck();
    return this.getStats();
  }
}

/**
 * Get singleton instance of TestRunConsistencyJob
 */
let consistencyJobInstance: TestRunConsistencyJob | null = null;

export function getTestRunConsistencyJob(options?: ConsistencyJobOptions): TestRunConsistencyJob {
  if (!consistencyJobInstance) {
    consistencyJobInstance = new TestRunConsistencyJob(options);
  }
  return consistencyJobInstance;
}

