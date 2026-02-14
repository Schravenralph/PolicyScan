/**
 * Test Performance Analytics Service
 * 
 * Provides analytics for test performance trends including:
 * - Average duration over time
 * - Duration percentiles (p50, p90, p95, p99)
 * - Slowest tests identification
 * - Performance regression detection
 * - Trend analysis and alerts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { TestLogEntry } from '../../types/testLogging.js';

export interface TestRun {
  id: string;
  timestamp: string;
  testFile?: string;
  testType?: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other';
  results: {
    timestamp: string;
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    duration: number;
    failures?: unknown[];
  };
  summary?: {
    passRate?: number;
    avgDuration?: number;
    flakyTests?: unknown[];
  };
  logs?: TestLogEntry[];
}

export interface DashboardData {
  lastUpdated: string;
  totalRuns: number;
  recentRuns: TestRun[];
}

export interface PerformanceMetrics {
  averageDuration: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  minDuration: number;
  maxDuration: number;
  totalRuns: number;
}

export interface SlowestTest {
  testFile: string;
  averageDuration: number;
  maxDuration: number;
  runCount: number;
  lastRun: string;
}

export interface TrendDataPoint {
  date: string;
  averageDuration: number;
  p50: number;
  p95: number;
  p99: number;
  runCount: number;
}

export interface RegressionAlert {
  testFile: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentDuration: number;
  previousAverage: number;
  increasePercentage: number;
  detectedAt: string;
}

export interface PerformanceTrends {
  metrics: PerformanceMetrics;
  slowestTests: SlowestTest[];
  trends: TrendDataPoint[];
  regressions: RegressionAlert[];
  timeRange: {
    startDate: string;
    endDate: string;
  };
  dataAvailable?: {
    totalRuns: number;
    oldestRunDate: string;
    newestRunDate: string;
    hasDataOutsideRange: boolean;
  };
}

export class TestPerformanceAnalyticsService {
  private readonly dashboardDataPath: string;
  private readonly publicDashboardPath: string;

  constructor() {
    this.dashboardDataPath = join(process.cwd(), 'test-results', 'dashboard-data.json');
    this.publicDashboardPath = join(process.cwd(), 'public', 'test-results', 'dashboard-data.json');
  }

  /**
   * Load dashboard data from file system
   */
  private loadDashboardData(): DashboardData | null {
    const dataPath = this.dashboardDataPath;
    const fallbackPath = this.publicDashboardPath;
    
    // Try primary path first
    if (existsSync(dataPath)) {
      try {
        const fileContent = readFileSync(dataPath, 'utf-8');
        // Check if file is not empty
        if (fileContent && fileContent.trim().length > 0) {
          const data = JSON.parse(fileContent);
          // Validate that data has the expected structure
          if (data && typeof data === 'object' && Array.isArray(data.recentRuns)) {
            return data as DashboardData;
          }
        }
        // File exists but is empty or invalid, try fallback
        logger.warn({ path: dataPath }, 'Dashboard data file is empty or invalid, trying fallback');
      } catch (error) {
        // Parse error, try fallback
        logger.warn({ error, path: dataPath }, 'Failed to parse dashboard data, trying fallback');
      }
    }

    // Try fallback path
    if (existsSync(fallbackPath)) {
      try {
        const fileContent = readFileSync(fallbackPath, 'utf-8');
        if (fileContent && fileContent.trim().length > 0) {
          const data = JSON.parse(fileContent);
          if (data && typeof data === 'object' && Array.isArray(data.recentRuns)) {
            return data as DashboardData;
          }
        }
      } catch (error) {
        logger.error({ error, path: fallbackPath }, 'Failed to load fallback dashboard data');
      }
    }

    logger.warn({ primaryPath: dataPath, fallbackPath }, 'Dashboard data file not found or invalid');
    return null;
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Calculate performance metrics from test runs
   */
  calculateMetrics(testRuns: TestRun[]): PerformanceMetrics {
    const durations = testRuns
      .map((run) => run.results.duration)
      .filter((duration) => duration > 0)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        averageDuration: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        minDuration: 0,
        maxDuration: 0,
        totalRuns: testRuns.length,
      };
    }

    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    return {
      averageDuration,
      p50: this.percentile(durations, 50),
      p90: this.percentile(durations, 90),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      totalRuns: testRuns.length,
    };
  }

  /**
   * Identify slowest tests by average duration
   */
  identifySlowestTests(testRuns: TestRun[], limit: number = 10): SlowestTest[] {
    const testFileMap = new Map<string, { durations: number[]; lastRun: string }>();

    // Group runs by test file
    for (const run of testRuns) {
      if (!run.testFile || run.results.duration <= 0) continue;

      const existing = testFileMap.get(run.testFile) || { durations: [], lastRun: run.timestamp };
      existing.durations.push(run.results.duration);
      if (new Date(run.timestamp) > new Date(existing.lastRun)) {
        existing.lastRun = run.timestamp;
      }
      testFileMap.set(run.testFile, existing);
    }

    // Calculate averages and sort
    const slowestTests: SlowestTest[] = Array.from(testFileMap.entries())
      .map(([testFile, data]) => {
        const durations = data.durations.sort((a, b) => a - b);
        const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        const maxDuration = durations[durations.length - 1];

        return {
          testFile,
          averageDuration,
          maxDuration,
          runCount: durations.length,
          lastRun: data.lastRun,
        };
      })
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, limit);

    return slowestTests;
  }

  /**
   * Detect performance regressions
   */
  detectRegressions(testRuns: TestRun[], baselineDays: number = 7): RegressionAlert[] {
    const now = new Date();
    const baselineCutoff = new Date(now.getTime() - baselineDays * 24 * 60 * 60 * 1000);
    const recentCutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // Last 24 hours

    // Split runs into baseline and recent
    const baselineRuns = testRuns.filter(
      (run) => new Date(run.timestamp) >= baselineCutoff && new Date(run.timestamp) < recentCutoff
    );
    const recentRuns = testRuns.filter((run) => new Date(run.timestamp) >= recentCutoff);

    const testFileMap = new Map<string, { baseline: number[]; recent: number[] }>();

    // Group baseline runs
    for (const run of baselineRuns) {
      if (!run.testFile || run.results.duration <= 0) continue;
      const existing = testFileMap.get(run.testFile) || { baseline: [], recent: [] };
      existing.baseline.push(run.results.duration);
      testFileMap.set(run.testFile, existing);
    }

    // Group recent runs
    for (const run of recentRuns) {
      if (!run.testFile || run.results.duration <= 0) continue;
      const existing = testFileMap.get(run.testFile) || { baseline: [], recent: [] };
      existing.recent.push(run.results.duration);
      testFileMap.set(run.testFile, existing);
    }

    // Detect regressions
    const regressions: RegressionAlert[] = [];

    for (const [testFile, data] of testFileMap.entries()) {
      if (data.baseline.length === 0 || data.recent.length === 0) continue;

      const baselineAverage =
        data.baseline.reduce((sum, d) => sum + d, 0) / data.baseline.length;
      const recentAverage = data.recent.reduce((sum, d) => sum + d, 0) / data.recent.length;

      if (recentAverage > baselineAverage) {
        const increasePercentage = ((recentAverage - baselineAverage) / baselineAverage) * 100;
        const maxRecent = Math.max(...data.recent);

        // Determine severity
        let severity: RegressionAlert['severity'] = 'low';
        if (increasePercentage >= 100) severity = 'critical';
        else if (increasePercentage >= 50) severity = 'high';
        else if (increasePercentage >= 25) severity = 'medium';

        regressions.push({
          testFile,
          severity,
          currentDuration: maxRecent,
          previousAverage: baselineAverage,
          increasePercentage,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Sort by severity and increase percentage
    return regressions.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.increasePercentage - a.increasePercentage;
    });
  }

  /**
   * Calculate trend data points grouped by day
   */
  calculateTrends(testRuns: TestRun[]): TrendDataPoint[] {
    // Group runs by date
    const runsByDate = new Map<string, TestRun[]>();

    for (const run of testRuns) {
      if (run.results.duration <= 0) continue;
      const date = new Date(run.timestamp).toISOString().split('T')[0];
      const existing = runsByDate.get(date) || [];
      existing.push(run);
      runsByDate.set(date, existing);
    }

    // Calculate metrics for each date
    const trendData: TrendDataPoint[] = Array.from(runsByDate.entries())
      .map(([date, runs]) => {
        const durations = runs.map((r) => r.results.duration).sort((a, b) => a - b);
        const metrics = this.calculateMetrics(runs);

        return {
          date,
          averageDuration: metrics.averageDuration,
          p50: metrics.p50,
          p95: metrics.p95,
          p99: metrics.p99,
          runCount: runs.length,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return trendData;
  }

  /**
   * Get comprehensive performance trends analysis
   */
  async getPerformanceTrends(
    timeRangeDays: number = 30,
    includeRegressions: boolean = true
  ): Promise<PerformanceTrends | null> {
    const dashboardData = this.loadDashboardData();
    if (!dashboardData) {
      return null;
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - timeRangeDays * 24 * 60 * 60 * 1000);

    // Filter runs within time range
    const filteredRuns = dashboardData.recentRuns.filter(
      (run) => new Date(run.timestamp) >= startDate
    );

    // If no runs in time range, but we have dashboard data, return empty structure
    // This allows frontend to distinguish between "no data file" vs "no data in time range"
    if (filteredRuns.length === 0) {
      // Check if there are any runs at all (outside time range)
      const hasAnyRuns = dashboardData.recentRuns.length > 0;
      let dataAvailable: PerformanceTrends['dataAvailable'] | undefined;
      
      if (hasAnyRuns) {
        const oldestRun = dashboardData.recentRuns.reduce((oldest, run) => {
          const runDate = new Date(run.timestamp);
          const oldestDate = new Date(oldest.timestamp);
          return runDate < oldestDate ? run : oldest;
        });
        const newestRun = dashboardData.recentRuns.reduce((newest, run) => {
          const runDate = new Date(run.timestamp);
          const newestDate = new Date(newest.timestamp);
          return runDate > newestDate ? run : newest;
        });

        dataAvailable = {
          totalRuns: dashboardData.recentRuns.length,
          oldestRunDate: oldestRun.timestamp,
          newestRunDate: newestRun.timestamp,
          hasDataOutsideRange: true,
        };
      }

      const result: PerformanceTrends = {
        metrics: {
          averageDuration: 0,
          p50: 0,
          p90: 0,
          p95: 0,
          p99: 0,
          minDuration: 0,
          maxDuration: 0,
          totalRuns: 0,
        },
        slowestTests: [],
        trends: [],
        regressions: [],
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
        },
      };

      if (dataAvailable) {
        result.dataAvailable = dataAvailable;
      }

      return result;
    }

    const metrics = this.calculateMetrics(filteredRuns);
    const slowestTests = this.identifySlowestTests(filteredRuns, 10);
    const trends = this.calculateTrends(filteredRuns);
    const regressions = includeRegressions ? this.detectRegressions(filteredRuns, 7) : [];

    return {
      metrics,
      slowestTests,
      trends,
      regressions,
      timeRange: {
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
      },
    };
  }

  /**
   * Get performance metrics for a specific test file
   */
  async getTestFileMetrics(testFile: string, timeRangeDays: number = 30): Promise<PerformanceMetrics | null> {
    const dashboardData = this.loadDashboardData();
    if (!dashboardData) {
      return null;
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - timeRangeDays * 24 * 60 * 60 * 1000);

    const testRuns = dashboardData.recentRuns.filter(
      (run) => run.testFile === testFile && new Date(run.timestamp) >= startDate
    );

    if (testRuns.length === 0) {
      return null;
    }

    return this.calculateMetrics(testRuns);
  }

  /**
   * Get test runs by test ID (test file name or run ID)
   * Matches by run ID, test file name, or test file path
   */
  getTestRunsByTestId(testId: string): TestRun[] {
    const dashboardData = this.loadDashboardData();
    if (!dashboardData) {
      return [];
    }

    const matchingRuns = dashboardData.recentRuns.filter((run) => {
      const runTestFile = run.testFile || '';
      const runFileName = runTestFile.split('/').pop() || '';

      return (
        run.id === testId ||
        runTestFile === testId ||
        runTestFile.includes(testId) ||
        runFileName === testId ||
        runFileName === `${testId}.spec.ts` ||
        runFileName.replace('.spec.ts', '') === testId.replace('.spec.ts', '')
      );
    });

    // Sort by timestamp (newest first)
    return matchingRuns.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      // Handle NaN values (invalid dates)
      if (isNaN(timeA) || isNaN(timeB)) {
        if (isNaN(timeA) && isNaN(timeB)) return 0;
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
      }
      return timeB - timeA;
    });
  }

  /**
   * Get a single test run by run ID
   */
  getTestRunByRunId(runId: string): TestRun | null {
    const dashboardData = this.loadDashboardData();
    if (!dashboardData) {
      return null;
    }

    return dashboardData.recentRuns.find((run) => run.id === runId) || null;
  }

  /**
   * Get test details with statistics for a specific test ID
   */
  getTestDetails(testId: string): {
    testId: string;
    testFile: string;
    stats: {
      totalRuns: number;
      totalTests: number;
      totalPassed: number;
      totalFailed: number;
      totalSkipped: number;
      avgDuration: number;
      passRate: number;
    };
    runs: TestRun[];
    lastRun: TestRun | null;
  } | null {
    const matchingRuns = this.getTestRunsByTestId(testId);

    if (matchingRuns.length === 0) {
      return null;
    }

    // Calculate stats across all runs
    const totalRuns = matchingRuns.length;
    const totalTests = matchingRuns.reduce((sum, run) => sum + (run.results?.total || 0), 0);
    const totalPassed = matchingRuns.reduce((sum, run) => sum + (run.results?.passed || 0), 0);
    const totalFailed = matchingRuns.reduce((sum, run) => sum + (run.results?.failed || 0), 0);
    const totalSkipped = matchingRuns.reduce((sum, run) => sum + (run.results?.skipped || 0), 0);
    const avgDuration =
      totalRuns > 0
        ? matchingRuns.reduce((sum, run) => sum + (run.results?.duration || 0), 0) / totalRuns
        : 0;
    const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

    // Get test file name from first run
    const testFileName = matchingRuns[0].testFile || testId;

    return {
      testId,
      testFile: testFileName,
      stats: {
        totalRuns,
        totalTests,
        totalPassed,
        totalFailed,
        totalSkipped,
        avgDuration,
        passRate,
      },
      runs: matchingRuns,
      lastRun: matchingRuns[0] || null,
    };
  }
}

// Singleton instance
let analyticsService: TestPerformanceAnalyticsService | null = null;

export function getTestPerformanceAnalyticsService(): TestPerformanceAnalyticsService {
  if (!analyticsService) {
    analyticsService = new TestPerformanceAnalyticsService();
  }
  return analyticsService;
}

