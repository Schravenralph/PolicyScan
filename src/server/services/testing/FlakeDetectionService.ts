/**
 * Flake Detection Service
 * 
 * Analyzes test_runs collection to identify tests that pass/fail inconsistently
 * over multiple runs, enabling proactive fixing of flaky tests.
 * 
 * Features:
 * - Analyze test runs for flaky patterns
 * - Calculate pass rates per test_id
 * - Generate flake detection reports
 * - Identify newly detected flakes
 * - Configurable thresholds and time windows
 */

import { TestRun, TestRunDocument, TestSuite } from '../../models/TestRun.js';
import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { ObjectId, Filter } from 'mongodb';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';

// Cache configuration
const CACHE_TTL = parseInt(process.env.FLAKE_DETECTION_CACHE_TTL || '600000', 10); // 10 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.FLAKE_DETECTION_CACHE_MAX_SIZE || '500', 10);

export interface FlakeDetectionConfig {
  /** Minimum pass rate threshold (default: 0.95 = 95%) */
  passRateThreshold?: number;
  /** Minimum number of runs required for analysis (default: 50) */
  minRuns?: number;
  /** Maximum number of runs to analyze (default: 100) */
  maxRuns?: number;
  /** Time window in days (default: 30) */
  timeWindowDays?: number;
  /** Suite filter (optional) */
  suite?: TestSuite;
  /** Environment filter (optional) */
  env?: string;
  /** Branch filter (optional) */
  branch?: string;
}

export interface FlakeReport {
  test_id: string;
  pass_rate: number;
  total_runs: number;
  passed: number;
  failed: number;
  skipped: number;
  status: 'flaky' | 'stable' | 'failing';
  recent_failures: Array<{
    run_id: string;
    git_sha: string;
    timestamp: Date;
    branch: string;
  }>;
  suite?: TestSuite;
  first_seen?: Date;
  last_seen?: Date;
}

export interface FlakeDetectionResult {
  timestamp: Date;
  config: FlakeDetectionConfig;
  total_tests_analyzed: number;
  flaky_tests: FlakeReport[];
  stable_tests: FlakeReport[];
  failing_tests: FlakeReport[];
  summary: {
    total_flaky: number;
    total_stable: number;
    total_failing: number;
    flake_rate: number; // Percentage of tests that are flaky
  };
}

/**
 * Service for detecting flaky tests from test run history
 */
export class FlakeDetectionService {
  private static instance: FlakeDetectionService;
  private cache: Cache<unknown>;

  private constructor() {
    // Private constructor to enforce singleton pattern
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'flake-detection-service');
  }

  public static getInstance(): FlakeDetectionService {
    if (!FlakeDetectionService.instance) {
      FlakeDetectionService.instance = new FlakeDetectionService();
    }
    return FlakeDetectionService.instance;
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `flake-detection:${prefix}:${hash}`;
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
    logger.info('Cache cleared for FlakeDetectionService');
  }

  /**
   * Detect flaky tests based on test run history
   * 
   * @param config Configuration for flake detection
   * @returns Flake detection result with identified flaky tests
   */
  async detectFlakes(config: FlakeDetectionConfig = {}): Promise<FlakeDetectionResult> {
    const {
      passRateThreshold = 0.95,
      minRuns = 50,
      maxRuns = 100,
      timeWindowDays = 30,
      suite,
      env,
      branch,
    } = config;

    // Generate cache key
    const cacheKey = this.getCacheKey('detectFlakes', {
      passRateThreshold,
      minRuns,
      maxRuns,
      timeWindowDays,
      suite,
      env,
      branch,
    });

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for flake detection');
      return cached as FlakeDetectionResult;
    }

    logger.info({
      passRateThreshold,
      minRuns,
      maxRuns,
      timeWindowDays,
      suite,
      env,
      branch,
    }, 'Starting flake detection');

    // Calculate time window
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeWindowDays);

    // Query test runs within time window
    const filters: Record<string, unknown> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
      test_id: { $exists: true, $ne: null },
    };

    if (suite) {
      filters.suite = suite;
    }
    if (env) {
      filters['correlation_ids.env'] = env;
    }
    if (branch) {
      filters.branch = branch;
    }

    const db = await getDB();
    const collection = db.collection<TestRunDocument>('test_runs');

    // Get all test runs with test_id
    const allRuns = await collection
      .find(filters as Filter<TestRunDocument>)
      .sort({ timestamp: -1 })
      .toArray();

    logger.debug(`Found ${allRuns.length} test runs to analyze`);

    // Group runs by test_id
    const runsByTestId = new Map<string, TestRunDocument[]>();
    for (const run of allRuns) {
      if (!run.test_id) continue;
      if (!runsByTestId.has(run.test_id)) {
        runsByTestId.set(run.test_id, []);
      }
      runsByTestId.get(run.test_id)!.push(run);
    }

    logger.debug(`Analyzing ${runsByTestId.size} unique test IDs`);

    // Analyze each test
    const flakyTests: FlakeReport[] = [];
    const stableTests: FlakeReport[] = [];
    const failingTests: FlakeReport[] = [];

    for (const [testId, runs] of runsByTestId.entries()) {
      // Limit to maxRuns (most recent)
      const recentRuns = runs.slice(0, maxRuns);

      // Skip if not enough runs
      if (recentRuns.length < minRuns) {
        continue;
      }

      // Calculate pass rate
      const passed = recentRuns.filter(r => r.status === 'passed').length;
      const failed = recentRuns.filter(r => r.status === 'failed').length;
      const skipped = recentRuns.filter(r => r.status === 'skipped').length;
      const passRate = passed / recentRuns.length;

      // Get recent failures
      const recentFailures = recentRuns
        .filter(r => r.status === 'failed')
        .slice(0, 10) // Last 10 failures
        .map(r => ({
          run_id: r.run_id,
          git_sha: r.git_sha,
          timestamp: r.timestamp,
          branch: r.branch,
        }));

      // Determine status
      let status: 'flaky' | 'stable' | 'failing';
      if (passRate < passRateThreshold && passRate > 0) {
        status = 'flaky';
      } else if (passRate === 0) {
        status = 'failing';
      } else {
        status = 'stable';
      }

      const report: FlakeReport = {
        test_id: testId,
        pass_rate: passRate,
        total_runs: recentRuns.length,
        passed,
        failed,
        skipped,
        status,
        recent_failures: recentFailures,
        suite: recentRuns[0]?.suite,
        first_seen: recentRuns[recentRuns.length - 1]?.timestamp,
        last_seen: recentRuns[0]?.timestamp,
      };

      if (status === 'flaky') {
        flakyTests.push(report);
      } else if (status === 'failing') {
        failingTests.push(report);
      } else {
        stableTests.push(report);
      }
    }

    // Sort flaky tests by pass rate (lowest first)
    flakyTests.sort((a, b) => a.pass_rate - b.pass_rate);

    const totalTests = flakyTests.length + stableTests.length + failingTests.length;
    const flakeRate = totalTests > 0 ? (flakyTests.length / totalTests) * 100 : 0;

    const result: FlakeDetectionResult = {
      timestamp: new Date(),
      config: {
        passRateThreshold,
        minRuns,
        maxRuns,
        timeWindowDays,
        suite,
        env,
        branch,
      },
      total_tests_analyzed: totalTests,
      flaky_tests: flakyTests,
      stable_tests: stableTests,
      failing_tests: failingTests,
      summary: {
        total_flaky: flakyTests.length,
        total_stable: stableTests.length,
        total_failing: failingTests.length,
        flake_rate: flakeRate,
      },
    };

    logger.info({
      total_tests_analyzed: totalTests,
      total_flaky: flakyTests.length,
      total_stable: stableTests.length,
      total_failing: failingTests.length,
      flake_rate: flakeRate.toFixed(2) + '%',
    }, 'Flake detection completed');

    // Cache the result
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cached flake detection result');

    return result;
  }

  /**
   * Get flake detection report for a specific test
   * 
   * @param testId Test identifier
   * @param config Configuration for flake detection
   * @returns Flake report for the test, or null if not found
   */
  async getTestFlakeReport(
    testId: string,
    config: FlakeDetectionConfig = {}
  ): Promise<FlakeReport | null> {
    const result = await this.detectFlakes(config);
    const testReport = result.flaky_tests
      .concat(result.stable_tests)
      .concat(result.failing_tests)
      .find(r => r.test_id === testId);
    return testReport || null;
  }

  /**
   * Compare current flake detection with previous results to identify newly detected flakes
   * 
   * @param currentResult Current flake detection result
   * @param previousResult Previous flake detection result (optional)
   * @returns Array of newly detected flaky tests
   */
  identifyNewFlakes(
    currentResult: FlakeDetectionResult,
    previousResult?: FlakeDetectionResult
  ): FlakeReport[] {
    if (!previousResult) {
      // If no previous result, all flaky tests are "new"
      return currentResult.flaky_tests;
    }

    const previousFlakyTestIds = new Set(
      previousResult.flaky_tests.map(t => t.test_id)
    );

    return currentResult.flaky_tests.filter(
      test => !previousFlakyTestIds.has(test.test_id)
    );
  }

  /**
   * Generate a formatted report string for console output
   * 
   * @param result Flake detection result
   * @returns Formatted report string
   */
  formatReport(result: FlakeDetectionResult): string {
    const lines: string[] = [];
    lines.push('='.repeat(80));
    lines.push('FLAKE DETECTION REPORT');
    lines.push('='.repeat(80));
    lines.push(`Timestamp: ${result.timestamp.toISOString()}`);
    lines.push(`Config: ${JSON.stringify(result.config, null, 2)}`);
    lines.push('');
    lines.push('SUMMARY:');
    lines.push(`  Total tests analyzed: ${result.total_tests_analyzed}`);
    lines.push(`  Flaky tests: ${result.summary.total_flaky}`);
    lines.push(`  Stable tests: ${result.summary.total_stable}`);
    lines.push(`  Failing tests: ${result.summary.total_failing}`);
    lines.push(`  Flake rate: ${result.summary.flake_rate.toFixed(2)}%`);
    lines.push('');

    if (result.flaky_tests.length > 0) {
      lines.push('FLAKY TESTS:');
      lines.push('-'.repeat(80));
      for (const test of result.flaky_tests.slice(0, 20)) {
        // Show top 20 flakiest tests
        lines.push(`  ${test.test_id}`);
        lines.push(`    Pass rate: ${(test.pass_rate * 100).toFixed(2)}%`);
        lines.push(`    Runs: ${test.passed} passed, ${test.failed} failed, ${test.skipped} skipped (total: ${test.total_runs})`);
        if (test.recent_failures.length > 0) {
          lines.push(`    Recent failures: ${test.recent_failures.length}`);
        }
        lines.push('');
      }
      if (result.flaky_tests.length > 20) {
        lines.push(`  ... and ${result.flaky_tests.length - 20} more flaky tests`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

}

