import { TestApiService, DashboardData, TestStatus } from '../services/api/TestApiService';
interface UseTestDashboardDataResult {
    dashboardData: DashboardData | null;
    setDashboardData: React.Dispatch<React.SetStateAction<DashboardData | null>>;
    testStatus: TestStatus | null;
    setTestStatus: React.Dispatch<React.SetStateAction<TestStatus | null>>;
    loading: boolean;
    error: string | null;
    noDataHelp: string | null;
    testRunsHasMore: boolean;
    testRunsLoadingMore: boolean;
    loadDashboardData: (resetPagination?: boolean) => Promise<void>;
    loadTestStatus: () => Promise<TestStatus | null>;
    loadMoreTestRuns: () => Promise<void>;
}
export declare function useTestDashboardData(testApi: TestApiService): UseTestDashboardDataResult;
export {};
