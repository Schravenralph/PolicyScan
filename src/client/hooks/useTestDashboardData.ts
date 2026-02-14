import { useState, useCallback } from 'react';
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

export function useTestDashboardData(testApi: TestApiService): UseTestDashboardDataResult {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noDataHelp, setNoDataHelp] = useState<string | null>(null);

  // Pagination state
  const [testRunsOffset, setTestRunsOffset] = useState<number>(0);
  const [testRunsHasMore, setTestRunsHasMore] = useState<boolean>(false);
  const [testRunsLoadingMore, setTestRunsLoadingMore] = useState<boolean>(false);

  const LOAD_MORE_INCREMENT = 25;
  const INITIAL_DISPLAY_LIMIT = 25;

  // Load dashboard data with pagination
  const loadDashboardData = useCallback(async (_resetPagination: boolean = false) => {
    try {
      setError(null);
      setNoDataHelp(null);

      const limit = INITIAL_DISPLAY_LIMIT;
      // If resetting, start from 0, otherwise rely on current logic (though usually we reload fresh)
      // Original code used 0 offset always for main load
      const offset = 0;

      const data = await testApi.getDashboardData(limit, offset);

      // Always replace data on initial load or reset
      setDashboardData(data);

      // Update pagination state
      if (data.pagination) {
        setTestRunsHasMore(data.pagination.hasMore);
        setTestRunsOffset(data.pagination.offset + data.recentRuns.length);
      }
    } catch (err) {
      // Check if this is a 404 for missing dashboard data (expected state, not an error)
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { status?: number; data?: { help?: string; message?: string; error?: string } } }).response;
        if (response?.status === 404 && response?.data?.help) {
          // This is expected when no tests have been run - show as info, not error
          setNoDataHelp(response.data.help);
          setDashboardData(null);
          return;
        }
      }

      // Real error - show error message
      let errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';

      // Check if error response has help message
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { data?: { help?: string; message?: string } } }).response;
        if (response?.data?.help) {
          errorMessage = `${response.data.message || errorMessage}\n\n${response.data.help}`;
        }
      }

      setError(errorMessage);
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi]);

  // Re-implementing loadMoreTestRuns properly
  const loadMoreTestRunsImpl = useCallback(async () => {
     if (testRunsLoadingMore || !testRunsHasMore || !dashboardData) return;

    try {
      setTestRunsLoadingMore(true);
      const limit = LOAD_MORE_INCREMENT;
      const offset = testRunsOffset;

      const data = await testApi.getDashboardData(limit, offset);

      // Accumulate the new runs with existing ones
      if (data.recentRuns && data.recentRuns.length > 0) {
        setDashboardData(prev => {
          if (!prev) return data;
          return {
            ...prev,
            recentRuns: [...prev.recentRuns, ...data.recentRuns],
            pagination: data.pagination,
          };
        });

        // Update pagination state
        if (data.pagination) {
          setTestRunsHasMore(data.pagination.hasMore);
          setTestRunsOffset(prev => prev + data.recentRuns.length);
        }
      } else {
        // No more runs available
        setTestRunsHasMore(false);
      }
    } catch (err) {
      console.error('Error loading more test runs:', err);
      // Don't show error to user - just stop loading more
      setTestRunsHasMore(false);
    } finally {
      setTestRunsLoadingMore(false);
    }
  }, [testApi, testRunsLoadingMore, testRunsHasMore, dashboardData, testRunsOffset]);

  // Load test status
  const loadTestStatus = useCallback(async () => {
    try {
      const status = await testApi.getTestStatus();
      setTestStatus(status);
      return status;
    } catch (err) {
      console.error('Error loading test status:', err);
      return null;
    }
  }, [testApi]);

  return {
    dashboardData,
    setDashboardData,
    testStatus,
    setTestStatus,
    loading,
    error,
    noDataHelp,
    testRunsHasMore,
    testRunsLoadingMore,
    loadDashboardData,
    loadTestStatus,
    loadMoreTestRuns: loadMoreTestRunsImpl
  };
}
