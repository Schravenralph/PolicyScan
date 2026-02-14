import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const INITIAL_DISPLAY_LIMIT = 25;

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
export function useTestRunsFiltering(
  dashboardData: DashboardData | null
): UseTestRunsFilteringResult {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filter state from URL query parameters
  const [filter, setFilter] = useState<TestRunsFilter>(() => {
    const status = searchParams.get('status') as 'all' | 'passed' | 'failed' | 'skipped' | null;
    const dateRange = searchParams.get('dateRange') as '24h' | '7d' | '30d' | 'all' | null;
    const testFile = searchParams.get('testFile') || '';
    const testType = searchParams.get('testType') as 'all' | 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other' | null;
    
    return {
      status: status || 'all',
      dateRange: dateRange || 'all',
      testFile: testFile || '',
      testType: testType || 'all',
    };
  });
  
  // Filtered test runs based on filter state
  const filteredTestRuns = useMemo(() => {
    if (!dashboardData?.recentRuns) return [];
    
    let filtered = [...dashboardData.recentRuns];
    
    // Filter by status
    if (filter.status && filter.status !== 'all') {
      filtered = filtered.filter((run) => {
        if (filter.status === 'passed') {
          return (run.results?.failed || 0) === 0 && (run.results?.skipped || 0) === 0;
        } else if (filter.status === 'failed') {
          return (run.results?.failed || 0) > 0;
        } else if (filter.status === 'skipped') {
          return (run.results?.skipped || 0) > 0;
        }
        return true;
      });
    }
    
    // Filter by date range
    if (filter.dateRange && filter.dateRange !== 'all') {
      const now = new Date();
      let cutoffDate: Date;
      
      if (filter.dateRange === '24h') {
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (filter.dateRange === '7d') {
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (filter.dateRange === '30d') {
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        cutoffDate = new Date(0); // All time
      }
      
      filtered = filtered.filter((run) => {
        const runDate = new Date(run.timestamp || '');
        return runDate >= cutoffDate;
      });
    }
    
    // Filter by test file (case-insensitive partial match)
    if (filter.testFile && filter.testFile.trim() !== '') {
      const searchTerm = filter.testFile.toLowerCase().trim();
      filtered = filtered.filter((run) => {
        const testFile = (run.testFile || run.id || '').toLowerCase();
        return testFile.includes(searchTerm);
      });
    }
    
    // Filter by test type
    if (filter.testType && filter.testType !== 'all') {
      filtered = filtered.filter((run) => {
        return run.testType === filter.testType;
      });
    }
    
    return filtered;
  }, [dashboardData?.recentRuns, filter]);
  
  // Pagination state
  const [displayLimit, setDisplayLimit] = useState<number>(INITIAL_DISPLAY_LIMIT);
  
  // Apply display limit to filtered runs (for pagination)
  const displayedTestRuns = useMemo(() => {
    return filteredTestRuns.slice(0, displayLimit);
  }, [filteredTestRuns, displayLimit]);
  
  // Check if there are more runs to load
  const hasMore = useMemo(() => {
    return filteredTestRuns.length > displayLimit;
  }, [filteredTestRuns.length, displayLimit]);
  
  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      (filter.status && filter.status !== 'all') ||
      (filter.dateRange && filter.dateRange !== 'all') ||
      (filter.testType && filter.testType !== 'all') ||
      (filter.testFile && filter.testFile.trim() !== '')
    );
  }, [filter]);
  
  // Update URL query parameters when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter.status && filter.status !== 'all') {
      params.set('status', filter.status);
    }
    if (filter.dateRange && filter.dateRange !== 'all') {
      params.set('dateRange', filter.dateRange);
    }
    if (filter.testType && filter.testType !== 'all') {
      params.set('testType', filter.testType);
    }
    if (filter.testFile && filter.testFile.trim() !== '') {
      params.set('testFile', filter.testFile);
    }
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
    
    // Reset display limit when filters change
    setDisplayLimit(INITIAL_DISPLAY_LIMIT);
  }, [filter]);
  
  // Clear filters function
  const clearFilters = useCallback(() => {
    setFilter({
      status: 'all',
      dateRange: 'all',
      testType: 'all',
      testFile: '',
    });
    // Clear URL parameters
    setSearchParams({});
  }, [setSearchParams]);
  
  return {
    filter,
    setFilter,
    filteredTestRuns,
    hasActiveFilters,
    clearFilters,
    displayedTestRuns,
    displayLimit,
    setDisplayLimit,
    hasMore,
  };
}

