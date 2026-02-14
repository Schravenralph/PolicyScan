/**
 * Error Monitoring Tab Component
 * 
 * Displays and manages application errors with filtering, statistics, and resolution capabilities.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

interface ErrorMonitoringTabProps {
  onErrorSelect: (errorId: string) => void;
}

export function ErrorMonitoringTab({ onErrorSelect }: ErrorMonitoringTabProps) {
  const [errors, setErrors] = useState<Array<{
    _id: string;
    message: string;
    severity: string;
    component: string;
    last_seen: string;
    occurrence_count: number;
    status: string;
    metadata?: {
      process_name?: string;
      file_path?: string;
      file_line?: number;
      file_column?: number;
      request_path?: string;
      request_method?: string;
    };
  }>>([]);
  const [statistics, setStatistics] = useState<{
    total_errors?: number;
    by_severity?: Record<string, number>;
    by_component?: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingTestErrors, setResolvingTestErrors] = useState(false);
  const [filters, setFilters] = useState({
    severity: '',
    component: '',
    status: '',
    processName: '',
    startDate: '',
    endDate: '',
  });

  const loadErrors = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.component) params.append('component', filters.component);
      if (filters.status) params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('limit', '50');

      const response = await api.get<{
        errors: Array<{
          _id: string;
          message: string;
          severity: string;
          component: string;
          last_seen: string;
          occurrence_count: number;
          status: string;
          metadata?: {
            process_name?: string;
            file_path?: string;
            file_line?: number;
            file_column?: number;
            request_path?: string;
            request_method?: string;
          };
        }>
      }>(`/admin/errors?${params.toString()}`);

      // Apply client-side filtering for process name (not supported by backend yet)
      let filteredErrors = response.errors || [];
      if (filters.processName) {
        filteredErrors = filteredErrors.filter(error =>
          error.metadata?.process_name?.toLowerCase().includes(filters.processName.toLowerCase())
        );
      }
      setErrors(filteredErrors);
    } catch (error) {
      logError(error, 'load-errors');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadStatistics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.component) params.append('component', filters.component);

      const response = await api.get<{
        total_errors?: number;
        by_severity?: Record<string, number>;
        by_component?: Record<string, number>;
      }>(`/admin/errors/statistics?${params.toString()}`);
      setStatistics(response);
    } catch (error) {
      logError(error, 'load-statistics');
    }
  }, [filters]);

  useEffect(() => {
    loadErrors();
    loadStatistics();
  }, [loadErrors, loadStatistics]);

  const resolveError = async (errorId: string) => {
    try {
      await api.post(`/admin/errors/${errorId}/resolve`);
      await loadErrors();
      await loadStatistics();
    } catch (error) {
      logError(error, 'resolve-error');
      toast.error(t('admin.failedToResolveError'));
    }
  };

  const resolveTestErrors = async () => {
    try {
      setResolvingTestErrors(true);
      const result = await api.errorMonitoring.resolveTestErrors();
      toast.success(
        'Test Errors Resolved',
        `Resolved ${result.resolvedCount} test-related error(s)`
      );
      await loadErrors();
      await loadStatistics();
    } catch (error) {
      logError(error, 'resolve-test-errors');
      toast.error(t('admin.failedToResolveTestErrors'));
    } finally {
      setResolvingTestErrors(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Total Errors</h3>
            <p className="text-2xl font-bold">{statistics.total_errors || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Critical</h3>
            <p className="text-2xl font-bold text-red-600">{statistics.by_severity?.critical || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Errors</h3>
            <p className="text-2xl font-bold text-orange-600">{statistics.by_severity?.error || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Warnings</h3>
            <p className="text-2xl font-bold text-yellow-600">{statistics.by_severity?.warning || 0}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Error Monitoring</h2>
          <button
            onClick={resolveTestErrors}
            disabled={resolvingTestErrors}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            title={t('admin.resolveTestErrorsTooltip')}
          >
            {resolvingTestErrors ? t('admin.resolving') : t('admin.resolveTestErrors')}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">{t('workflowManagement.all')}</option>
              <option value="critical">{t('admin.severityCritical')}</option>
              <option value="error">{t('admin.severityError')}</option>
              <option value="warning">{t('admin.severityWarning')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('admin.component')}</label>
            <input
              type="text"
              value={filters.component}
              onChange={(e) => setFilters({ ...filters, component: e.target.value })}
              placeholder={t('admin.filterByComponent')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('admin.process')}</label>
            <input
              type="text"
              value={filters.processName}
              onChange={(e) => setFilters({ ...filters, processName: e.target.value })}
              placeholder={t('admin.filterByProcess')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              title={t('admin.filterByProcessTitle')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('admin.status')}</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">{t('workflowManagement.all')}</option>
              <option value="open">{t('errorDetail.status.open')}</option>
              <option value="resolved">{t('admin.statusResolved')}</option>
              <option value="ignored">{t('admin.statusIgnored')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Errors Table */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading errors...</div>
        ) : errors.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No errors found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="logs-columnheader-message">{t('admin.tableMessage')}</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="logs-columnheader-severity">{t('admin.tableSeverity')}</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="logs-columnheader-component">{t('admin.tableComponent')}</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase" data-testid="logs-columnheader-location">{t('admin.tableLocation')}</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase" data-testid="logs-columnheader-occurrences">{t('admin.tableOccurrences')}</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase" data-testid="logs-columnheader-last-seen">{t('common.lastSeen')}</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase" data-testid="logs-columnheader-status">{t('admin.tableStatus')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{t('admin.tableActions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {errors.map((error) => (
                  <tr
                    key={error._id}
                    className={error.severity === 'critical' ? 'bg-red-50' : ''}
                  >
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => onErrorSelect(error._id)}
                        className="text-primary hover:text-primary/80 text-left"
                      >
                        {error.message}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${error.severity === 'critical' ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200' :
                        error.severity === 'error' ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200' :
                          'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200'
                        }`}>
                        {error.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {error.component}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(() => {
                        const meta = error.metadata;
                        const parts: string[] = [];
                        if (meta?.process_name) {
                          parts.push(meta.process_name);
                        }
                        if (meta?.file_path) {
                          const fileName = meta.file_path.split('/').pop() || meta.file_path;
                          const location = meta.file_line !== undefined
                            ? `${fileName}:${meta.file_line}`
                            : fileName;
                          parts.push(location);
                        } else if (meta?.request_path) {
                          parts.push(`${meta.request_method || 'GET'} ${meta.request_path}`);
                        }
                        return parts.length > 0 ? parts.join(' • ') : t('common.notAvailable');
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {error.occurrence_count || 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(error.last_seen).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${error.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {error.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {error.status !== 'resolved' && (
                        <button
                          onClick={() => resolveError(error._id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

