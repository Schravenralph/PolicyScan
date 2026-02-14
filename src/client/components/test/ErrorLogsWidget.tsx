/**
 * Error Logs Widget Component
 * 
 * Displays application error logs with filtering capabilities (time range, severity, component, test run ID).
 */

import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useDebounce } from '../../hooks/useDebounce';
import { t } from '../../utils/i18n';
import type { TestApiService } from '../../services/api/TestApiService';

interface ErrorLog {
  _id?: string;
  error_id?: string;
  timestamp?: string | Date;
  severity?: 'critical' | 'error' | 'warning';
  component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
  message?: string;
  stack_trace?: string;
  status?: 'open' | 'resolved' | 'ignored';
  occurrence_count?: number;
  testRunId?: string;
}

interface ErrorLogsFilter {
  severity?: 'critical' | 'error' | 'warning';
  component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
  testRunId?: string;
  timeRange?: '24h' | '7d' | '30d';
}

interface ErrorLogsWidgetProps {
  testApiService: TestApiService;
  onErrorLogsLoaded?: (errorLogs: ErrorLog[]) => void;
}

/**
 * Safely format a date string or Date object to a localized string.
 * Returns "N/A" if the date is invalid, null, or undefined.
 */
function formatSafeDate(date: string | Date | null | undefined): string {
  if (!date) return t('common.notAvailable');

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return t('common.notAvailable');
    return dateObj.toLocaleString();
  } catch {
    return t('common.notAvailable');
  }
}

export function ErrorLogsWidget({ testApiService, onErrorLogsLoaded }: ErrorLogsWidgetProps) {
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogsError, setErrorLogsError] = useState<string | null>(null);
  const [errorLogsFilter, setErrorLogsFilter] = useState<ErrorLogsFilter>({ timeRange: '24h' });

  // Debounce error log filters for auto-apply (500ms delay)
  const debouncedErrorLogsFilter = useDebounce(errorLogsFilter, 500);

  // Load error logs with specific filter (for manual refresh) or debounced filter (for auto-apply)
  const loadErrorLogs = useCallback(async (filterOverride?: ErrorLogsFilter) => {
    const filterToUse = filterOverride || debouncedErrorLogsFilter;

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

      const result = await testApiService.getErrorLogs({
        severity: filterToUse.severity,
        component: filterToUse.component,
        testRunId: filterToUse.testRunId,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        limit: 50,
        sort: 'last_seen',
        sortOrder: 'desc',
      });

      const errors = (result.errors as unknown[]) || [];
      setErrorLogs(errors as typeof errorLogs);
      // Call onErrorLogsLoaded only if it's provided (using ref to avoid dependency issues)
      if (onErrorLogsLoaded) {
        onErrorLogsLoaded(errors as typeof errorLogs);
      }
    } catch (err) {
      console.error('Error loading error logs:', err);
      setErrorLogsError(err instanceof Error ? err.message : 'Failed to load error logs');
      // Don't block the page - error logs are optional
    } finally {
      setErrorLogsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testApiService, debouncedErrorLogsFilter]); // Removed onErrorLogsLoaded from dependencies to prevent infinite loops

  // Auto-apply filters when debounced filter changes
  useEffect(() => {
    loadErrorLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedErrorLogsFilter]); // Only depend on debouncedErrorLogsFilter to avoid infinite loops

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('test.applicationErrorLogs')}</CardTitle>
          <div className="flex gap-2">
            <select
              value={errorLogsFilter.timeRange || '24h'}
              onChange={(e) => {
                setErrorLogsFilter(prev => ({ ...prev, timeRange: e.target.value as '24h' | '7d' | '30d' }));
                // Auto-applied via debounced filter
              }}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <select
              value={errorLogsFilter.severity || ''}
              onChange={(e) => {
                setErrorLogsFilter(prev => ({ ...prev, severity: e.target.value as 'critical' | 'error' | 'warning' | undefined || undefined }));
                // Auto-applied via debounced filter
              }}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
            <select
              value={errorLogsFilter.component || ''}
              onChange={(e) => {
                setErrorLogsFilter(prev => ({ ...prev, component: e.target.value as 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other' | undefined || undefined }));
                // Auto-applied via debounced filter
              }}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="">All Components</option>
              <option value="scraper">Scraper</option>
              <option value="workflow">Workflow</option>
              <option value="api">API</option>
              <option value="frontend">Frontend</option>
              <option value="database">Database</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text"
              placeholder="Test Run ID (optional)"
              value={errorLogsFilter.testRunId || ''}
              onChange={(e) => {
                setErrorLogsFilter(prev => ({ ...prev, testRunId: e.target.value || undefined }));
                // Auto-applied via debounced filter
              }}
              className="text-sm border border-gray-300 rounded px-2 py-1 w-40"
            />
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                loadErrorLogs(errorLogsFilter).catch(err => {
                  console.error('Error refreshing logs:', err);
                });
              }}
              variant="outline"
              size="sm"
              disabled={errorLogsLoading}
              title="Manual refresh (filters auto-apply with 500ms delay)"
            >
              <RefreshCw className={`h-4 w-4 ${errorLogsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {errorLogsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">{t('test.loadingErrorLogs')}</span>
          </div>
        ) : errorLogsError ? (
          <div className="text-sm text-red-600 py-4">
            <AlertCircle className="h-5 w-5 inline mr-2" />
            {errorLogsError}
          </div>
        ) : errorLogs.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">
            No errors found for the selected filters
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {errorLogs.map((error, index) => (
              <div
                key={error._id || error.error_id || `error-${index}`}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {error.severity && (
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          error.severity === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : error.severity === 'error'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {error.severity.toUpperCase()}
                      </span>
                    )}
                    {error.component && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                        {error.component}
                      </span>
                    )}
                    {error.status === 'open' && (
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-700">
                        OPEN
                      </span>
                    )}
                    {error.testRunId && error.testRunId.length > 0 && (
                      <Link
                        to={`/tests/runs/${encodeURIComponent(error.testRunId)}`}
                        className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors cursor-pointer"
                        title={`View test run: ${error.testRunId}`}
                      >
                        Test: {error.testRunId.substring(0, 8)}
                      </Link>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatSafeDate(error.timestamp)}
                    {error.occurrence_count && error.occurrence_count > 1 && (
                      <span className="ml-2">({error.occurrence_count} occurrences)</span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-900 mb-1">
                  {error.message || 'No message available'}
                </div>
                {error.stack_trace && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">
                      Show stack trace
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {error.stack_trace}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

