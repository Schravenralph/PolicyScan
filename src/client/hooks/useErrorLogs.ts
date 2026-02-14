import { useState, useCallback, useEffect, useRef } from 'react';
import { TestApiService } from '../services/api/TestApiService';
import { useDebounce } from './useDebounce';

export interface ErrorLog {
  _id?: string;
  error_id: string;
  timestamp: string;
  severity: 'critical' | 'error' | 'warning';
  component: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
  message: string;
  stack_trace?: string;
  status: 'open' | 'resolved' | 'ignored';
  occurrence_count: number;
  testRunId?: string;
}

export interface ErrorLogsFilter {
  severity?: 'critical' | 'error' | 'warning';
  component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
  testRunId?: string;
  timeRange?: '24h' | '7d' | '30d';
}

interface UseErrorLogsResult {
  errorLogs: ErrorLog[];
  errorLogsLoading: boolean;
  errorLogsError: string | null;
  errorLogsFilter: ErrorLogsFilter;
  setErrorLogsFilter: React.Dispatch<React.SetStateAction<ErrorLogsFilter>>;
  loadErrorLogs: (filterOverride?: ErrorLogsFilter) => Promise<void>;
}

export function useErrorLogs(testApi: TestApiService): UseErrorLogsResult {
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogsError, setErrorLogsError] = useState<string | null>(null);

  const [errorLogsFilter, setErrorLogsFilter] = useState<ErrorLogsFilter>({ timeRange: '24h' });

  // Debounce error log filters for auto-apply (500ms delay)
  const debouncedErrorLogsFilter = useDebounce(errorLogsFilter, 500);
  
  // Use ref to track previous debounced filter to prevent infinite loops
  const previousDebouncedFilterRef = useRef<ErrorLogsFilter | null>(null);
  // Use ref to always have access to current debounced filter in callbacks
  const debouncedFilterRef = useRef<ErrorLogsFilter>(debouncedErrorLogsFilter);
  
  // Update ref when debounced filter changes
  useEffect(() => {
    debouncedFilterRef.current = debouncedErrorLogsFilter;
  }, [debouncedErrorLogsFilter]);

  // Load error logs with specific filter (for manual refresh) or debounced filter (for auto-apply)
  const loadErrorLogs = useCallback(async (filterOverride?: ErrorLogsFilter) => {
    const filterToUse = filterOverride || debouncedFilterRef.current;

    try {
      setErrorLogsLoading(true);
      setErrorLogsError(null);

      // Calculate date range
      const now = new Date();
      let startDate: Date;
      if (filterToUse.timeRange === '24h') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (filterToUse.timeRange === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const result = await testApi.getErrorLogs({
        severity: filterToUse.severity,
        component: filterToUse.component,
        testRunId: filterToUse.testRunId,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        limit: 50,
        sort: 'last_seen',
        sortOrder: 'desc',
      });

      setErrorLogs((result.errors as ErrorLog[]) || []);
    } catch (err) {
      // Handle network errors gracefully - don't show error if backend is unreachable
      const isNetworkError = err instanceof Error && (
        err.message.includes('Backend server is niet bereikbaar') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('NetworkError')
      );
      
      if (isNetworkError) {
        // Silently fail for network errors - backend may be starting up
        console.debug('Error loading error logs (network error, backend may be unreachable):', err);
        setErrorLogsError(null); // Don't show error for network issues
      } else {
        console.error('Error loading error logs:', err);
        setErrorLogsError(err instanceof Error ? err.message : 'Failed to load error logs');
      }
      // Don't block the page - error logs are optional
    } finally {
      setErrorLogsLoading(false);
    }
  }, [testApi]);

  // Auto-apply filters when debounced filter changes (only when it actually changes)
  useEffect(() => {
    // Compare current debounced filter with previous to avoid infinite loops
    const prevFilter = previousDebouncedFilterRef.current;
    const currentFilter = debouncedErrorLogsFilter;
    
    // On first render or when filter actually changed
    const isFirstRender = prevFilter === null;
    const filterChanged = isFirstRender || (
      prevFilter.severity !== currentFilter.severity ||
      prevFilter.component !== currentFilter.component ||
      prevFilter.testRunId !== currentFilter.testRunId ||
      prevFilter.timeRange !== currentFilter.timeRange
    );
    
    if (filterChanged) {
      previousDebouncedFilterRef.current = currentFilter;
      // Call loadErrorLogs with the current debounced filter
      loadErrorLogs(currentFilter);
    }
  }, [debouncedErrorLogsFilter, loadErrorLogs]);

  return {
    errorLogs,
    errorLogsLoading,
    errorLogsError,
    errorLogsFilter,
    setErrorLogsFilter,
    loadErrorLogs
  };
}
