/**
 * Dashboard Main Content Component
 *
 * Extracted from TestDashboardPage to improve maintainability.
 * Contains summary cards, test execution timeline, flaky tests widget, and quick links.
 */
import { TestApiService, type DashboardData } from '../../services/api/TestApiService';
import type { TestStatistics } from '../../hooks/useTestStatistics';
import type { ActiveFailuresState } from '../../hooks/useActiveFailures';
interface DashboardMainContentProps {
    dashboardData: DashboardData | null;
    testApiService: TestApiService;
    noDataHelp?: string | null;
    onLoadMore: () => Promise<void>;
    testRunsHasMore: boolean;
    testRunsLoadingMore: boolean;
    onFilteredDataChange: (data: {
        filter: {
            status?: string;
            dateRange?: string;
            testFile?: string;
            testType?: string;
        };
        filteredTestRuns: Array<any>;
        displayedTestRuns: Array<any>;
    } | null) => void;
    flakyTestMetrics: {
        totalFlakyTests: number;
        flakyTests?: Array<{
            test_id?: string;
            suite?: string;
            pass_rate: number;
            flake_rate: number;
        }>;
    } | null;
    flakyTestMetricsLoading: boolean;
    statistics: TestStatistics | null;
    activeFailures: ActiveFailuresState | null;
    activeFailuresLoading: boolean;
}
export declare function DashboardMainContent({ dashboardData, testApiService, noDataHelp, onLoadMore, testRunsHasMore, testRunsLoadingMore, onFilteredDataChange, flakyTestMetrics, flakyTestMetricsLoading, statistics, activeFailures, activeFailuresLoading, }: DashboardMainContentProps): import("react/jsx-runtime").JSX.Element;
export {};
