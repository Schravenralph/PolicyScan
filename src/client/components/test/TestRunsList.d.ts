/**
 * Test Runs List Component
 *
 * Displays a list of test runs with filtering, pagination, and pipeline expansion capabilities.
 */
import type { DashboardData } from '../../services/api/TestApiService';
import type { TestApiService } from '../../services/api/TestApiService';
import { useTestRunsFiltering } from '../../hooks/useTestRunsFiltering';
interface TestRunsListProps {
    dashboardData: DashboardData | null;
    testApiService: TestApiService;
    noDataHelp: string | null;
    onLoadMore?: () => Promise<void>;
    testRunsHasMore?: boolean;
    testRunsLoadingMore?: boolean;
    LOAD_MORE_INCREMENT?: number;
    onFilteredDataChange?: (data: {
        filter: ReturnType<typeof useTestRunsFiltering>['filter'];
        filteredTestRuns: ReturnType<typeof useTestRunsFiltering>['filteredTestRuns'];
        displayedTestRuns: ReturnType<typeof useTestRunsFiltering>['displayedTestRuns'];
    }) => void;
}
export declare function TestRunsList({ dashboardData, testApiService, noDataHelp, onLoadMore, testRunsHasMore, testRunsLoadingMore, LOAD_MORE_INCREMENT, onFilteredDataChange, }: TestRunsListProps): import("react/jsx-runtime").JSX.Element;
export {};
