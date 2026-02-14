/**
 * Test Stability Monitoring Service
 * 
 * Tracks test stability and flakiness trends over time to identify problematic tests,
 * monitor stability improvements, and alert on new flaky tests. Analyzes test_runs
 * collection data to calculate pass rate trends and flakiness metrics.
 */

import { getDB } from '../../config/database.js';
import { TestRunDocument, TestSuite } from '../../models/TestRun.js';
import { logger } from '../../utils/logger.js';
import { Cache } from '../infrastructure/cache.js';
import { FlakeDetectionService, FlakeDetectionConfig } from './FlakeDetectionService.js';
import crypto from 'crypto';

const COLLECTION_NAME = 'test_runs';

// Cache configuration
const CACHE_TTL = parseInt(process.env.STABILITY_MONITORING_CACHE_TTL || '600000', 10); // 10 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.STABILITY_MONITORING_CACHE_MAX_SIZE || '500', 10);

export interface StabilityTrend {
  test_id: string;
  suite?: TestSuite;
  current_pass_rate: number;
  previous_pass_rate: number;
  trend: 'improving' | 'stable' | 'degrading';
  change_percent: number;
  period_start: Date;
  period_end: Date;
  run_count: number;
}

export interface StabilityMetrics {
  overall_stability: number; // Overall pass rate (0-1)
  flaky_test_count: number;
  stable_test_count: number;
  failing_test_count: number;
  new_flaky_tests: Array<{
    test_id: string;
    pass_rate: number;
    first_detected: Date;
  }>;
  improved_tests: Array<{
    test_id: string;
    previous_pass_rate: number;
    current_pass_rate: number;
    improvement_percent: number;
  }>;
  degraded_tests: Array<{
    test_id: string;
    previous_pass_rate: number;
    current_pass_rate: number;
    degradation_percent: number;
  }>;
}

export interface StabilityReport {
  generated_at: Date;
  time_range: {
    start: Date;
    end: Date;
  };
  comparison_period_days: number;
  total_tests_analyzed: number;
  metrics: StabilityMetrics;
  trends: StabilityTrend[];
  summary: {
    overall_stability: number;
    flaky_rate: number; // Percentage of tests that are flaky
    improvement_rate: number; // Percentage of tests that improved
    degradation_rate: number; // Percentage of tests that degraded
  };
}

export interface StabilityMonitoringOptions {
  comparison_period_days?: number; // Default: 7 days (compare last 7 days vs previous 7 days)
  min_runs_per_period?: number; // Default: 10 runs per period
  pass_rate_threshold?: number; // Default: 0.95 (95%)
  suite?: TestSuite; // Filter by suite
  branch?: string; // Filter by branch
  env?: string; // Filter by environment
}

export class TestStabilityMonitoringService {
  private static instance: TestStabilityMonitoringService;
  private cache: Cache<unknown>;
  private flakeDetectionService: FlakeDetectionService;

  private constructor() {
    // Private constructor to enforce singleton pattern
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'stability-monitoring-service');
    this.flakeDetectionService = FlakeDetectionService.getInstance();
  }

  public static getInstance(): TestStabilityMonitoringService {
    if (!TestStabilityMonitoringService.instance) {
      TestStabilityMonitoringService.instance = new TestStabilityMonitoringService();
    }
    return TestStabilityMonitoringService.instance;
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `stability-monitoring:${prefix}:${hash}`;
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
    logger.info('Cache cleared for TestStabilityMonitoringService');
  }

  /**
   * Monitor test stability and generate stability report
   * 
   * @param options Configuration options
   * @returns Stability report with trends and metrics
   */
  async monitorStability(options: StabilityMonitoringOptions = {}): Promise<StabilityReport> {
    const {
      comparison_period_days = 7,
      min_runs_per_period = 10,
      pass_rate_threshold = 0.95,
      suite,
      branch,
      env,
    } = options;

    // Generate cache key
    const cacheKey = this.getCacheKey('monitorStability', {
      comparison_period_days,
      min_runs_per_period,
      pass_rate_threshold,
      suite,
      branch,
      env,
    });

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for stability monitoring');
      return cached as StabilityReport;
    }

    logger.info({
      comparison_period_days,
      min_runs_per_period,
      pass_rate_threshold,
      suite,
      branch,
      env,
    }, 'Starting stability monitoring');

    // Calculate time periods
    const endDate = new Date();
    const currentPeriodStart = new Date();
    currentPeriodStart.setDate(currentPeriodStart.getDate() - comparison_period_days);
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - comparison_period_days);
    const previousPeriodEnd = new Date(currentPeriodStart);

    // Get current period flake detection
    const currentFlakeConfig: FlakeDetectionConfig = {
      passRateThreshold: pass_rate_threshold,
      minRuns: min_runs_per_period,
      maxRuns: 200,
      timeWindowDays: comparison_period_days,
      suite,
      env,
      branch,
    };

    const currentFlakeResult = await this.flakeDetectionService.detectFlakes(currentFlakeConfig);

    // Get previous period flake detection
    const previousFlakeConfig: FlakeDetectionConfig = {
      ...currentFlakeConfig,
      timeWindowDays: comparison_period_days * 2, // Get data for both periods
    };

    // We'll filter to previous period in the analysis
    const previousFlakeResult = await this.flakeDetectionService.detectFlakes(previousFlakeConfig);

    // Calculate trends by comparing current vs previous period
    const trends = this.calculateTrends(
      currentFlakeResult,
      previousFlakeResult,
      currentPeriodStart,
      previousPeriodStart,
      previousPeriodEnd
    );

    // Calculate metrics
    const metrics = this.calculateMetrics(
      currentFlakeResult,
      previousFlakeResult,
      currentPeriodStart,
      previousPeriodStart
    );

    // Calculate summary
    const totalTests = currentFlakeResult.total_tests_analyzed;
    const flakyRate = totalTests > 0 ? (currentFlakeResult.summary.total_flaky / totalTests) * 100 : 0;
    const improvingCount = trends.filter(t => t.trend === 'improving').length;
    const degradingCount = trends.filter(t => t.trend === 'degrading').length;
    const improvementRate = totalTests > 0 ? (improvingCount / totalTests) * 100 : 0;
    const degradationRate = totalTests > 0 ? (degradingCount / totalTests) * 100 : 0;

    const report: StabilityReport = {
      generated_at: new Date(),
      time_range: {
        start: previousPeriodStart,
        end: endDate,
      },
      comparison_period_days,
      total_tests_analyzed: totalTests,
      metrics,
      trends,
      summary: {
        overall_stability: metrics.overall_stability * 100,
        flaky_rate: flakyRate,
        improvement_rate: improvementRate,
        degradation_rate: degradationRate,
      },
    };

    // Cache the result
    await this.cache.set(cacheKey, report);
    logger.debug({ cacheKey }, 'Cached stability monitoring result');

    return report;
  }

  /**
   * Calculate trends by comparing current and previous periods
   */
  private calculateTrends(
    currentResult: Awaited<ReturnType<typeof this.flakeDetectionService.detectFlakes>>,
    previousResult: Awaited<ReturnType<typeof this.flakeDetectionService.detectFlakes>>,
    currentPeriodStart: Date,
    previousPeriodStart: Date,
    previousPeriodEnd: Date
  ): StabilityTrend[] {
    const trends: StabilityTrend[] = [];

    // Create maps for quick lookup
    const currentTests = new Map(
      [...currentResult.flaky_tests, ...currentResult.stable_tests, ...currentResult.failing_tests].map(
        test => [test.test_id, test]
      )
    );

    const previousTests = new Map(
      [...previousResult.flaky_tests, ...previousResult.stable_tests, ...previousResult.failing_tests].map(
        test => [test.test_id, test]
      )
    );

    // Calculate trends for tests that exist in both periods
    for (const [testId, currentTest] of currentTests) {
      const previousTest = previousTests.get(testId);

      if (previousTest) {
        const changePercent = currentTest.pass_rate - previousTest.pass_rate;
        let trend: 'improving' | 'stable' | 'degrading';

        if (changePercent > 0.05) {
          // Improved by more than 5%
          trend = 'improving';
        } else if (changePercent < -0.05) {
          // Degraded by more than 5%
          trend = 'degrading';
        } else {
          // Stable (within 5%)
          trend = 'stable';
        }

        trends.push({
          test_id: testId,
          suite: currentTest.suite,
          current_pass_rate: currentTest.pass_rate,
          previous_pass_rate: previousTest.pass_rate,
          trend,
          change_percent: changePercent * 100,
          period_start: previousPeriodStart,
          period_end: currentPeriodStart,
          run_count: currentTest.total_runs,
        });
      } else {
        // New test (not in previous period)
        // Consider it stable for now (no comparison)
        trends.push({
          test_id: testId,
          suite: currentTest.suite,
          current_pass_rate: currentTest.pass_rate,
          previous_pass_rate: currentTest.pass_rate, // Same as current (new test)
          trend: 'stable',
          change_percent: 0,
          period_start: previousPeriodStart,
          period_end: currentPeriodStart,
          run_count: currentTest.total_runs,
        });
      }
    }

    return trends;
  }

  /**
   * Calculate stability metrics
   */
  private calculateMetrics(
    currentResult: Awaited<ReturnType<typeof this.flakeDetectionService.detectFlakes>>,
    previousResult: Awaited<ReturnType<typeof this.flakeDetectionService.detectFlakes>>,
    currentPeriodStart: Date,
    previousPeriodStart: Date
  ): StabilityMetrics {
    // Calculate overall stability (weighted average pass rate)
    const allCurrentTests = [
      ...currentResult.flaky_tests,
      ...currentResult.stable_tests,
      ...currentResult.failing_tests,
    ];

    let totalPassed = 0;
    let totalRuns = 0;

    for (const test of allCurrentTests) {
      totalPassed += test.passed;
      totalRuns += test.total_runs;
    }

    const overallStability = totalRuns > 0 ? totalPassed / totalRuns : 0;

    // Find new flaky tests (in current but not in previous)
    const previousFlakyTestIds = new Set(previousResult.flaky_tests.map(t => t.test_id));
    const newFlakyTests = currentResult.flaky_tests
      .filter(test => !previousFlakyTestIds.has(test.test_id))
      .map(test => ({
        test_id: test.test_id,
        pass_rate: test.pass_rate,
        first_detected: test.first_seen || currentPeriodStart,
      }));

    // Find improved tests (was flaky/failing, now stable)
    const currentStableTestIds = new Set(currentResult.stable_tests.map(t => t.test_id));
    const previousFlakyOrFailingTestIds = new Set([
      ...previousResult.flaky_tests.map(t => t.test_id),
      ...previousResult.failing_tests.map(t => t.test_id),
    ]);

    const improvedTests = currentResult.stable_tests
      .filter(test => previousFlakyOrFailingTestIds.has(test.test_id))
      .map(test => {
        const previousTest =
          previousResult.flaky_tests.find(t => t.test_id === test.test_id) ||
          previousResult.failing_tests.find(t => t.test_id === test.test_id);

        return {
          test_id: test.test_id,
          previous_pass_rate: previousTest?.pass_rate || 0,
          current_pass_rate: test.pass_rate,
          improvement_percent: previousTest
            ? ((test.pass_rate - previousTest.pass_rate) / previousTest.pass_rate) * 100
            : 100,
        };
      });

    // Find degraded tests (was stable, now flaky/failing)
    const previousStableTestIds = new Set(previousResult.stable_tests.map(t => t.test_id));
    const currentFlakyOrFailingTestIds = new Set([
      ...currentResult.flaky_tests.map(t => t.test_id),
      ...currentResult.failing_tests.map(t => t.test_id),
    ]);

    const degradedTests = [
      ...currentResult.flaky_tests,
      ...currentResult.failing_tests,
    ]
      .filter(test => previousStableTestIds.has(test.test_id))
      .map(test => {
        const previousTest = previousResult.stable_tests.find(t => t.test_id === test.test_id);

        return {
          test_id: test.test_id,
          previous_pass_rate: previousTest?.pass_rate || 1,
          current_pass_rate: test.pass_rate,
          degradation_percent: previousTest
            ? ((previousTest.pass_rate - test.pass_rate) / previousTest.pass_rate) * 100
            : 100,
        };
      });

    return {
      overall_stability: overallStability,
      flaky_test_count: currentResult.summary.total_flaky,
      stable_test_count: currentResult.summary.total_stable,
      failing_test_count: currentResult.summary.total_failing,
      new_flaky_tests: newFlakyTests,
      improved_tests: improvedTests,
      degraded_tests: degradedTests,
    };
  }

  /**
   * Format stability report for console output
   */
  formatReport(report: StabilityReport): string {
    const lines: string[] = [];
    lines.push('='.repeat(80));
    lines.push('TEST STABILITY MONITORING REPORT');
    lines.push('='.repeat(80));
    lines.push(`Generated: ${report.generated_at.toISOString()}`);
    lines.push(`Time Range: ${report.time_range.start.toISOString()} to ${report.time_range.end.toISOString()}`);
    lines.push(`Comparison Period: ${report.comparison_period_days} days`);
    lines.push('');
    lines.push('SUMMARY:');
    lines.push(`  Overall Stability: ${report.summary.overall_stability.toFixed(2)}%`);
    lines.push(`  Flaky Rate: ${report.summary.flaky_rate.toFixed(2)}%`);
    lines.push(`  Improvement Rate: ${report.summary.improvement_rate.toFixed(2)}%`);
    lines.push(`  Degradation Rate: ${report.summary.degradation_rate.toFixed(2)}%`);
    lines.push(`  Total Tests Analyzed: ${report.total_tests_analyzed}`);
    lines.push('');

    if (report.metrics.new_flaky_tests.length > 0) {
      lines.push('⚠️  NEW FLAKY TESTS:');
      lines.push('-'.repeat(80));
      for (const test of report.metrics.new_flaky_tests.slice(0, 10)) {
        lines.push(`  ${test.test_id}`);
        lines.push(`    Pass Rate: ${(test.pass_rate * 100).toFixed(2)}%`);
        lines.push(`    First Detected: ${test.first_detected.toISOString()}`);
        lines.push('');
      }
      if (report.metrics.new_flaky_tests.length > 10) {
        lines.push(`  ... and ${report.metrics.new_flaky_tests.length - 10} more new flaky tests`);
        lines.push('');
      }
    }

    if (report.metrics.improved_tests.length > 0) {
      lines.push('✅ IMPROVED TESTS:');
      lines.push('-'.repeat(80));
      for (const test of report.metrics.improved_tests.slice(0, 10)) {
        lines.push(`  ${test.test_id}`);
        lines.push(`    Previous: ${(test.previous_pass_rate * 100).toFixed(2)}% → Current: ${(test.current_pass_rate * 100).toFixed(2)}%`);
        lines.push(`    Improvement: +${test.improvement_percent.toFixed(2)}%`);
        lines.push('');
      }
      if (report.metrics.improved_tests.length > 10) {
        lines.push(`  ... and ${report.metrics.improved_tests.length - 10} more improved tests`);
        lines.push('');
      }
    }

    if (report.metrics.degraded_tests.length > 0) {
      lines.push('⚠️  DEGRADED TESTS:');
      lines.push('-'.repeat(80));
      for (const test of report.metrics.degraded_tests.slice(0, 10)) {
        lines.push(`  ${test.test_id}`);
        lines.push(`    Previous: ${(test.previous_pass_rate * 100).toFixed(2)}% → Current: ${(test.current_pass_rate * 100).toFixed(2)}%`);
        lines.push(`    Degradation: -${test.degradation_percent.toFixed(2)}%`);
        lines.push('');
      }
      if (report.metrics.degraded_tests.length > 10) {
        lines.push(`  ... and ${report.metrics.degraded_tests.length - 10} more degraded tests`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

