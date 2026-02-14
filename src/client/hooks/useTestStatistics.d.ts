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
export declare function useTestStatistics(dashboardData: DashboardData | null): TestStatistics | null;
