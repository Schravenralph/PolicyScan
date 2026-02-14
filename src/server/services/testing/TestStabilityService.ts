/**
 * Test Stability Service
 * 
 * Monitors test stability over time, tracking flakiness trends and identifying
 * problematic tests. Provides stability metrics for test dashboard and CI/CD.
 * 
 * Features:
 * - Calculate overall test stability percentage
 * - Track stability trends over time (improving/declining)
 * - Identify tests with declining stability
 * - Report stability metrics with time windows
 * - Configurable thresholds and time windows
 */

import { TestRun, TestRunDocument, TestSuite } from '../../models/TestRun.js';
import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';

// Cache configuration
const CACHE_TTL = parseInt(process.env.TEST_STABILITY_CACHE_TTL || '600000', 10); // 10 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.TEST_STABILITY_CACHE_MAX_SIZE || '500', 10);

export interface TestStabilityConfig {
  /** Time window in days (default: 30) */
  timeWindowDays?: number;
  /** Suite filter (optional) */
  suite?: TestSuite;
  /** Environment filter (optional) */
  env?: string;
  /** Branch filter (optional) */
  branch?: string;
  /** Minimum number of runs required for analysis (default: 10) */
  minRuns?: number;
}

export interface TestStabilityTrend {
  test_id: string;
  current_stability: number; // Pass rate in current period
  previous_stability: number; // Pass rate in previous period
  stability_change: number; // Change in percentage points (positive = improving, negative = declining)
  trend: 'improving' | 'stable' | 'declining';
  total_runs: number;
  suite?: TestSuite;
}

export interface TestStabilityResult {
  timestamp: Date;
  config: TestStabilityConfig;
  overall_stability: number; // Overall pass rate percentage
  total_tests_analyzed: number;
  total_runs: number;
  stability_trends: TestStabilityTrend[];
  summary: {
    improving_tests: number;
    stable_tests: number;
    declining_tests: number;
    tests_above_threshold: number; // Tests with stability > 95%
    tests_below_threshold: number; // Tests with stability < 95%
  };
  period_comparison: {
    current_period: {
      start: Date;
      end: Date;
      stability: number;
      total_runs: number;
    };
    previous_period: {
      start: Date;
      end: Date;
      stability: number;
      total_runs: number;
    };
    stability_change: number; // Overall stability change between periods
  };
}

/**
 * Service for monitoring test stability over time
 */
export class TestStabilityService {
  private static instance: TestStabilityService;
  private cache: Cache<unknown>;

  private constructor() {
    // Private constructor to enforce singleton pattern
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'test-stability-service');
  }

  public static getInstance(): TestStabilityService {
    if (!TestStabilityService.instance) {
      TestStabilityService.instance = new TestStabilityService();
    }
    return TestStabilityService.instance;
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `test-stability:${prefix}:${hash}`;
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
    logger.info('Cache cleared for TestStabilityService');
  }

  /**
   * Calculate test stability metrics
   * 
   * @param config Configuration for stability analysis
   * @returns Test stability result with trends and metrics
   */
  async calculateStability(config: TestStabilityConfig = {}): Promise<TestStabilityResult> {
    const {
      timeWindowDays = 30,
      suite,
      env,
      branch,
      minRuns = 10,
    } = config;

    // Generate cache key
    const cacheKey = this.getCacheKey('calculateStability', {
      timeWindowDays,
      suite,
      env,
      branch,
      minRuns,
    });

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for test stability');
      return cached as TestStabilityResult;
    }

    logger.info({
      timeWindowDays,
      suite,
      env,
      branch,
      minRuns,
    }, 'Calculating test stability');

    const db = await getDB();
    const collection = db.collection<TestRunDocument>('test_runs');

    // Calculate time windows
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeWindowDays);

    // Split into two periods for trend analysis
    const midDate = new Date();
    midDate.setDate(midDate.getDate() - (timeWindowDays / 2));

    // Build query filter
    const filter: Record<string, unknown> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (suite) {
      filter.suite = suite;
    }

    if (env) {
      filter['correlation_ids.env'] = env;
    }

    if (branch) {
      filter.branch = branch;
    }

    // Get all test runs in the time window
    const allRuns = await collection.find(filter).sort({ timestamp: 1 }).toArray();

    if (allRuns.length === 0) {
      logger.warn({ filter }, 'No test runs found for stability analysis');
      const result: TestStabilityResult = {
        timestamp: new Date(),
        config: {
          timeWindowDays,
          suite,
          env,
          branch,
          minRuns,
        },
        overall_stability: 0,
        total_tests_analyzed: 0,
        total_runs: 0,
        stability_trends: [],
        summary: {
          improving_tests: 0,
          stable_tests: 0,
          declining_tests: 0,
          tests_above_threshold: 0,
          tests_below_threshold: 0,
        },
        period_comparison: {
          current_period: {
            start: midDate,
            end: endDate,
            stability: 0,
            total_runs: 0,
          },
          previous_period: {
            start: startDate,
            end: midDate,
            stability: 0,
            total_runs: 0,
          },
          stability_change: 0,
        },
      };
      return result;
    }

    // Calculate overall stability (pass rate)
    const totalRuns = allRuns.length;
    const passedRuns = allRuns.filter(run => run.status === 'passed').length;
    const overallStability = totalRuns > 0 ? (passedRuns / totalRuns) * 100 : 0;

    // Split runs into current and previous periods
    const currentPeriodRuns = allRuns.filter(run => run.timestamp >= midDate);
    const previousPeriodRuns = allRuns.filter(run => run.timestamp < midDate);

    // Calculate period stability
    const currentPeriodStability = currentPeriodRuns.length > 0
      ? (currentPeriodRuns.filter(run => run.status === 'passed').length / currentPeriodRuns.length) * 100
      : 0;
    const previousPeriodStability = previousPeriodRuns.length > 0
      ? (previousPeriodRuns.filter(run => run.status === 'passed').length / previousPeriodRuns.length) * 100
      : 0;
    const stabilityChange = currentPeriodStability - previousPeriodStability;

    // Group runs by test_id for trend analysis
    const testRunsMap = new Map<string, TestRunDocument[]>();
    for (const run of allRuns) {
      if (run.test_id) {
        const existing = testRunsMap.get(run.test_id) || [];
        existing.push(run);
        testRunsMap.set(run.test_id, existing);
      }
    }

    // Calculate stability trends per test
    const stabilityTrends: TestStabilityTrend[] = [];
    let improvingTests = 0;
    let stableTests = 0;
    let decliningTests = 0;
    let testsAboveThreshold = 0;
    let testsBelowThreshold = 0;

    for (const [testId, runs] of testRunsMap.entries()) {
      if (runs.length < minRuns) {
        continue; // Skip tests with insufficient runs
      }

      // Split runs into periods
      const currentRuns = runs.filter(run => run.timestamp >= midDate);
      const previousRuns = runs.filter(run => run.timestamp < midDate);

      if (currentRuns.length === 0 || previousRuns.length === 0) {
        continue; // Need data in both periods for trend analysis
      }

      // Calculate pass rates
      const currentStability = (currentRuns.filter(run => run.status === 'passed').length / currentRuns.length) * 100;
      const previousStability = (previousRuns.filter(run => run.status === 'passed').length / previousRuns.length) * 100;
      const stabilityChange = currentStability - previousStability;

      // Determine trend
      let trend: 'improving' | 'stable' | 'declining';
      if (Math.abs(stabilityChange) < 1) {
        trend = 'stable';
        stableTests++;
      } else if (stabilityChange > 0) {
        trend = 'improving';
        improvingTests++;
      } else {
        trend = 'declining';
        decliningTests++;
      }

      // Check threshold (95% stability)
      if (currentStability >= 95) {
        testsAboveThreshold++;
      } else {
        testsBelowThreshold++;
      }

      stabilityTrends.push({
        test_id: testId,
        current_stability: currentStability,
        previous_stability: previousStability,
        stability_change: stabilityChange,
        trend,
        total_runs: runs.length,
        suite: runs[0]?.suite,
      });
    }

    // Sort trends by stability change (declining first)
    stabilityTrends.sort((a, b) => a.stability_change - b.stability_change);

    const result: TestStabilityResult = {
      timestamp: new Date(),
      config: {
        timeWindowDays,
        suite,
        env,
        branch,
        minRuns,
      },
      overall_stability: overallStability,
      total_tests_analyzed: stabilityTrends.length,
      total_runs: totalRuns,
      stability_trends: stabilityTrends,
      summary: {
        improving_tests: improvingTests,
        stable_tests: stableTests,
        declining_tests: decliningTests,
        tests_above_threshold: testsAboveThreshold,
        tests_below_threshold: testsBelowThreshold,
      },
      period_comparison: {
        current_period: {
          start: midDate,
          end: endDate,
          stability: currentPeriodStability,
          total_runs: currentPeriodRuns.length,
        },
        previous_period: {
          start: startDate,
          end: midDate,
          stability: previousPeriodStability,
          total_runs: previousPeriodRuns.length,
        },
        stability_change: stabilityChange,
      },
    };

    logger.info({
      overall_stability: overallStability.toFixed(2) + '%',
      total_tests_analyzed: stabilityTrends.length,
      total_runs: totalRuns,
      improving_tests: improvingTests,
      stable_tests: stableTests,
      declining_tests: decliningTests,
      stability_change: stabilityChange.toFixed(2) + '%',
    }, 'Test stability calculation completed');

    // Cache the result
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cached test stability result');

    return result;
  }
}

