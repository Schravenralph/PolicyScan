import { useMemo } from 'react';
import { DashboardData } from '../services/api/TestApiService';

export interface TestStatistics {
  totalRuns: number;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  passRate: number;
  avgDuration: number;
  failureRate: number;
  passRateTrend: number;
  last5PassRate: number;
  previous5PassRate: number;
  runsWithFailures: number;
  hasPrevious5Runs: boolean;
  recentRuns?: Array<{
    timestamp?: string;
    passed?: number;
    failed?: number;
  }>;
}

/**
 * Hook to calculate test statistics from dashboard data
 * 
 * Computes aggregate statistics including:
 * - Total runs, tests, passed, failed, skipped
 * - Pass rate, average duration, failure rate
 * - Pass rate trend (last 5 runs vs previous 5 runs)
 * 
 * @param dashboardData - Dashboard data containing recent runs
 * @returns Computed statistics or null if no data available
 */
export function useTestStatistics(dashboardData: DashboardData | null): TestStatistics | null {
  return useMemo(() => {
    if (!dashboardData || !dashboardData.recentRuns || dashboardData.recentRuns.length === 0) {
      return null;
    }

    const runs = dashboardData.recentRuns;
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalDuration = 0;
    let runsWithFailures = 0;

    runs.forEach((run) => {
      const results = run.results || {};
      totalTests += results.total || 0;
      totalPassed += results.passed || 0;
      totalFailed += results.failed || 0;
      totalSkipped += results.skipped || 0;
      totalDuration += results.duration || 0;
      if ((results.failed || 0) > 0) {
        runsWithFailures++;
      }
    });

    const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
    const avgDuration = runs.length > 0 ? totalDuration / runs.length : 0;
    const failureRate = runs.length > 0 ? (runsWithFailures / runs.length) * 100 : 0;

    // Calculate pass rate trend (last 5 runs vs previous 5 runs)
    const last5Runs = runs.slice(0, Math.min(5, runs.length));
    const previous5Runs = runs.slice(5, Math.min(10, runs.length));
    
    let last5Passed = 0;
    let last5Total = 0;
    last5Runs.forEach((run) => {
      const results = run.results || {};
      last5Total += results.total || 0;
      last5Passed += results.passed || 0;
    });
    const last5PassRate = last5Total > 0 ? (last5Passed / last5Total) * 100 : 0;

    let previous5Passed = 0;
    let previous5Total = 0;
    previous5Runs.forEach((run) => {
      const results = run.results || {};
      previous5Total += results.total || 0;
      previous5Passed += results.passed || 0;
    });
    const previous5PassRate = previous5Total > 0 ? (previous5Passed / previous5Total) * 100 : 0;
    const passRateTrend = last5PassRate - previous5PassRate;

    return {
      totalRuns: runs.length,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      passRate,
      avgDuration,
      failureRate,
      passRateTrend,
      last5PassRate,
      previous5PassRate,
      runsWithFailures,
      hasPrevious5Runs: previous5Runs.length > 0,
      recentRuns: runs.map(run => ({
        timestamp: run.timestamp,
        passed: run.results?.passed,
        failed: run.results?.failed,
      })),
    };
  }, [dashboardData]);
}

