import { DashboardData, TestRun } from '../services/api/TestApiService';
export interface TestRunsFilter {
    status?: 'all' | 'passed' | 'failed' | 'skipped';
    dateRange?: '24h' | '7d' | '30d' | 'all';
    testFile?: string;
    testType?: 'all' | 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other';
}
export interface UseTestRunsFilteringResult {
    filter: TestRunsFilter;
    setFilter: React.Dispatch<React.SetStateAction<TestRunsFilter>>;
    filteredTestRuns: TestRun[];
    hasActiveFilters: boolean;
    clearFilters: () => void;
    displayedTestRuns: TestRun[];
    displayLimit: number;
    setDisplayLimit: React.Dispatch<React.SetStateAction<number>>;
    hasMore: boolean;
}
/**
 * Hook to manage test runs filtering and pagination
 *
 * Features:
 * - Filter by status (passed, failed, skipped)
 * - Filter by date range (24h, 7d, 30d, all)
 * - Filter by test file (case-insensitive partial match)
 * - Filter by test type (unit, integration, e2e, etc.)
 * - URL query parameter synchronization
 * - Pagination support
 *
 * @param dashboardData - Dashboard data containing recent runs
 * @returns Filter state, filtered runs, and filter management functions
 */
export declare function useTestRunsFiltering(dashboardData: DashboardData | null): UseTestRunsFilteringResult;
