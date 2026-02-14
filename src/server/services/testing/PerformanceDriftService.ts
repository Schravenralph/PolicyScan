/**
 * Performance Drift Service
 * 
 * Tracks test execution duration trends over time to identify tests that are slowing down
 * and potential performance regressions. Analyzes test_runs collection data to detect
 * significant duration increases compared to historical baselines.
 */

import { getDB } from '../../config/database.js';
import { TestRunDocument, TestSuite } from '../../models/TestRun.js';
import { logger } from '../../utils/logger.js';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';

const COLLECTION_NAME = 'test_runs';

// Cache configuration
const CACHE_TTL = parseInt(process.env.PERFORMANCE_DRIFT_CACHE_TTL || '600000', 10); // 10 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.PERFORMANCE_DRIFT_CACHE_MAX_SIZE || '500', 10);

export interface PerformanceDriftResult {
  test_id?: string;
  suite: TestSuite;
  current_duration: number;
  baseline_duration: number;
  increase_percent: number;
  status: 'normal' | 'warning' | 'regression';
  trend: 'stable' | 'increasing' | 'decreasing';
  run_count: number;
  last_run_timestamp: Date;
  baseline_window_start: Date;
  baseline_window_end: Date;
}

export interface PerformanceDriftReport {
  generated_at: Date;
  time_range: {
    start: Date;
    end: Date;
  };
  baseline_window_days: number;
  threshold_percent: number;
  total_tests_analyzed: number;
  regressions: PerformanceDriftResult[];
  warnings: PerformanceDriftResult[];
  stable: PerformanceDriftResult[];
  summary: {
    total_regressions: number;
    total_warnings: number;
    total_stable: number;
    average_increase_percent: number;
  };
}

export interface PerformanceDriftOptions {
  baseline_window_days?: number; // Default: 30 days
  threshold_percent?: number; // Default: 20%
  min_runs_for_baseline?: number; // Default: 10
  suite?: TestSuite; // Filter by suite
  branch?: string; // Filter by branch
  env?: string; // Filter by environment
}

export class PerformanceDriftService {
  private static instance: PerformanceDriftService;
  private cache: Cache<unknown>;

  private constructor() {
    // Private constructor to enforce singleton pattern
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'performance-drift-service');
  }

  public static getInstance(): PerformanceDriftService {
    if (!PerformanceDriftService.instance) {
      PerformanceDriftService.instance = new PerformanceDriftService();
    }
    return PerformanceDriftService.instance;
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `performance-drift:${prefix}:${hash}`;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ReturnType<typeof this.cache.getStats> {
    return this.cache.getStats();
  }

  /**
   * Clear cache manually
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    logger.info('Cache cleared for PerformanceDriftService');
  }

  /**
   * Analyze performance drift for test runs
   * 
   * @param options Analysis options
   * @returns Performance drift report
   */
  async analyzeDrift(options: PerformanceDriftOptions = {}): Promise<PerformanceDriftReport> {
    const {
      baseline_window_days = 30,
      threshold_percent = 20,
      min_runs_for_baseline = 10,
      suite,
      branch,
      env,
    } = options;

    // Generate cache key
    const cacheKey = this.getCacheKey('analyze-drift', {
      baseline_window_days,
      threshold_percent,
      min_runs_for_baseline,
      suite,
      branch,
      env,
    });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for analyzeDrift');
      return cached as PerformanceDriftReport;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - baseline_window_days);

    logger.info({
      baseline_window_days,
      threshold_percent,
      startDate,
      endDate,
      suite,
      branch,
      env,
    }, 'Analyzing performance drift');

    // Get all test runs in the baseline window
    const baselineRuns = await this.getTestRunsInWindow(startDate, endDate, {
      suite,
      branch,
      env,
    });

    if (baselineRuns.length === 0) {
      logger.warn('No test runs found in baseline window');
      return this.createEmptyReport(endDate, startDate, baseline_window_days, threshold_percent);
    }

    // Group runs by test_id (or suite if test_id not available)
    const runsByTest = this.groupRunsByTest(baselineRuns);

    // Analyze each test
    const results: PerformanceDriftResult[] = [];
    for (const [testKey, runs] of Object.entries(runsByTest)) {
      if (runs.length < min_runs_for_baseline) {
        logger.debug(`Skipping test ${testKey}: insufficient runs (${runs.length} < ${min_runs_for_baseline})`);
        continue;
      }

      const result = this.analyzeTestDrift(
        testKey,
        runs,
        threshold_percent,
        startDate,
        endDate,
      );
      if (result) {
        results.push(result);
      }
    }

    // Categorize results
    const regressions = results.filter(r => r.status === 'regression');
    const warnings = results.filter(r => r.status === 'warning');
    const stable = results.filter(r => r.status === 'normal');

    const averageIncrease = results.length > 0
      ? results.reduce((sum, r) => sum + r.increase_percent, 0) / results.length
      : 0;

    const report: PerformanceDriftReport = {
      generated_at: new Date(),
      time_range: {
        start: startDate,
        end: endDate,
      },
      baseline_window_days,
      threshold_percent,
      total_tests_analyzed: results.length,
      regressions,
      warnings,
      stable,
      summary: {
        total_regressions: regressions.length,
        total_warnings: warnings.length,
        total_stable: stable.length,
        average_increase_percent: averageIncrease,
      },
    };

    logger.info({
      total_tests: results.length,
      regressions: regressions.length,
      warnings: warnings.length,
      stable: stable.length,
    }, 'Performance drift analysis complete');

    // Store in cache
    await this.cache.set(cacheKey, report);
    logger.debug({ cacheKey }, 'Cache miss for analyzeDrift, stored in cache');

    return report;
  }

  /**
   * Get test runs within a time window
   */
  private async getTestRunsInWindow(
    startDate: Date,
    endDate: Date,
    filters: { suite?: TestSuite; branch?: string; env?: string } = {},
  ): Promise<TestRunDocument[]> {
    const queryFilters: Record<string, unknown> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (filters.suite) {
      queryFilters.suite = filters.suite;
    }
    if (filters.branch) {
      queryFilters.branch = filters.branch;
    }
    if (filters.env) {
      queryFilters['correlation_ids.env'] = filters.env;
    }

    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);
    const runs = await collection
      .find(queryFilters)
      .sort({ timestamp: -1 })
      .toArray();

    return runs;
  }

  /**
   * Group test runs by test identifier
   */
  private groupRunsByTest(runs: TestRunDocument[]): Record<string, TestRunDocument[]> {
    const grouped: Record<string, TestRunDocument[]> = {};

    for (const run of runs) {
      // Use test_id if available, otherwise use suite as identifier
      const testKey = run.test_id || `suite:${run.suite}`;
      if (!grouped[testKey]) {
        grouped[testKey] = [];
      }
      grouped[testKey].push(run);
    }

    return grouped;
  }

  /**
   * Analyze drift for a single test
   */
  private analyzeTestDrift(
    testKey: string,
    runs: TestRunDocument[],
    thresholdPercent: number,
    baselineStart: Date,
    baselineEnd: Date,
  ): PerformanceDriftResult | null {
    // Sort runs by timestamp (oldest first)
    const sortedRuns = [...runs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate baseline (median of all runs, excluding the most recent 10%)
    const baselineRuns = sortedRuns.slice(0, Math.floor(sortedRuns.length * 0.9));
    const baselineDurations = baselineRuns.map(r => r.duration).sort((a, b) => a - b);
    const baselineDuration = this.median(baselineDurations);

    // Get current duration (median of most recent 10% of runs, or last run if only one)
    const recentRuns = sortedRuns.slice(Math.floor(sortedRuns.length * 0.9));
    const currentDurations = recentRuns.length > 0
      ? recentRuns.map(r => r.duration).sort((a, b) => a - b)
      : [sortedRuns[sortedRuns.length - 1].duration];
    const currentDuration = this.median(currentDurations);

    // Calculate increase percentage
    const increasePercent = baselineDuration > 0
      ? ((currentDuration - baselineDuration) / baselineDuration) * 100
      : 0;

    // Determine status
    let status: 'normal' | 'warning' | 'regression';
    if (increasePercent >= thresholdPercent) {
      status = 'regression';
    } else if (increasePercent >= thresholdPercent * 0.5) {
      status = 'warning';
    } else {
      status = 'normal';
    }

    // Determine trend (compare last 25% vs previous 25%)
    const recentQuarter = sortedRuns.slice(Math.floor(sortedRuns.length * 0.75));
    const previousQuarter = sortedRuns.slice(
      Math.floor(sortedRuns.length * 0.5),
      Math.floor(sortedRuns.length * 0.75),
    );

    const recentAvg = recentQuarter.length > 0
      ? recentQuarter.reduce((sum, r) => sum + r.duration, 0) / recentQuarter.length
      : currentDuration;
    const previousAvg = previousQuarter.length > 0
      ? previousQuarter.reduce((sum, r) => sum + r.duration, 0) / previousQuarter.length
      : baselineDuration;

    let trend: 'stable' | 'increasing' | 'decreasing';
    const trendThreshold = 0.05; // 5% change to consider trend
    if (recentAvg > previousAvg * (1 + trendThreshold)) {
      trend = 'increasing';
    } else if (recentAvg < previousAvg * (1 - trendThreshold)) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    const [testId, suite] = testKey.startsWith('suite:')
      ? [undefined, testKey.replace('suite:', '') as TestSuite]
      : [testKey, runs[0].suite];

    return {
      test_id: testId,
      suite,
      current_duration: currentDuration,
      baseline_duration: baselineDuration,
      increase_percent: increasePercent,
      status,
      trend,
      run_count: runs.length,
      last_run_timestamp: sortedRuns[sortedRuns.length - 1].timestamp,
      baseline_window_start: baselineStart,
      baseline_window_end: baselineEnd,
    };
  }

  /**
   * Calculate median of an array
   */
  private median(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Create an empty report when no data is available
   */
  private createEmptyReport(
    endDate: Date,
    startDate: Date,
    baselineWindowDays: number,
    thresholdPercent: number,
  ): PerformanceDriftReport {
    return {
      generated_at: new Date(),
      time_range: {
        start: startDate,
        end: endDate,
      },
      baseline_window_days: baselineWindowDays,
      threshold_percent: thresholdPercent,
      total_tests_analyzed: 0,
      regressions: [],
      warnings: [],
      stable: [],
      summary: {
        total_regressions: 0,
        total_warnings: 0,
        total_stable: 0,
        average_increase_percent: 0,
      },
    };
  }

  /**
   * Generate a formatted report as JSON
   */
  async generateReport(options: PerformanceDriftOptions = {}): Promise<string> {
    const report = await this.analyzeDrift(options);
    return JSON.stringify(report, null, 2);
  }

  /**
   * Get alerts for significant performance regressions
   */
  async getAlerts(options: PerformanceDriftOptions = {}): Promise<PerformanceDriftResult[]> {
    // Generate cache key
    const cacheKey = this.getCacheKey('get-alerts', options as Record<string, unknown>);

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getAlerts');
      return cached as PerformanceDriftResult[];
    }

    const report = await this.analyzeDrift(options);
    const alerts = [...report.regressions, ...report.warnings];

    // Store in cache
    await this.cache.set(cacheKey, alerts);
    logger.debug({ cacheKey }, 'Cache miss for getAlerts, stored in cache');

    return alerts;
  }
}

