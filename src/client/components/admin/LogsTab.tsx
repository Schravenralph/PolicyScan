/**
 * Logs Tab Component
 * 
 * Displays system logs with filtering and export capabilities.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

interface LogEntry {
  timestamp: string;
  severity: 'error' | 'warning' | 'info';
  component: string;
  message: string;
  runId?: string;
  workflowId?: string;
}

export function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSeverity, setLogSeverity] = useState<string>('');
  const [logComponent, setLogComponent] = useState<string>('');
  const [logStartDate, setLogStartDate] = useState<string>('');
  const [logEndDate, setLogEndDate] = useState<string>('');

  const loadLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const params = new URLSearchParams();
      if (logSeverity) params.append('severity', logSeverity);
      if (logComponent) params.append('component', logComponent);
      if (logStartDate) params.append('startDate', logStartDate);
      if (logEndDate) params.append('endDate', logEndDate);
      params.append('limit', '100');

      const response = await api.get<{ logs: LogEntry[] }>(`/admin/logs?${params.toString()}`);
      setLogs(response.logs || []);
    } catch (error) {
      logError(error, 'load-logs');
    } finally {
      setLogsLoading(false);
    }
  }, [logSeverity, logComponent, logStartDate, logEndDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (logSeverity) params.append('severity', logSeverity);
      if (logComponent) params.append('component', logComponent);
      if (logStartDate) params.append('startDate', logStartDate);
      if (logEndDate) params.append('endDate', logEndDate);

      const blob = await api.get<Blob>(`/admin/logs/export?${params.toString()}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logError(error, 'export-logs');
      toast.error(t('admin.failedToExportLogs'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">System Logs</h2>
          <button
            onClick={exportLogs}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Export Logs (CSV)
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-gray-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Severity
            </label>
            <select
              value={logSeverity}
              onChange={(e) => setLogSeverity(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="error">{t('admin.severityError')}</option>
              <option value="warning">{t('admin.severityWarning')}</option>
              <option value="info">{t('admin.severityInfo')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Component
            </label>
            <input
              type="text"
              value={logComponent}
              onChange={(e) => setLogComponent(e.target.value)}
              placeholder={t('admin.filterByComponent')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={logStartDate}
              onChange={(e) => setLogStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={logEndDate}
              onChange={(e) => setLogEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Logs Table */}
        {logsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-timestamp">Timestamp</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-severity">Severity</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-component">Component</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-message">Message</th>
                  <th scope="col" role="columnheader" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-testid="columnheader-run-id">Run ID</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log, index) => (
                  <tr key={index} className={log.severity === 'error' ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${log.severity === 'error'
                        ? 'bg-red-100 text-red-800'
                        : log.severity === 'warning'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                        }`}>
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.component}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                      {log.message}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.runId ? (
                        <span className="font-mono text-xs">{log.runId.substring(0, 8)}...</span>
                      ) : (
                        '-'
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

