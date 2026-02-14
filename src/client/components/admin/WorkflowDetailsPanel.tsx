/**
 * Workflow Details Panel Component
 * 
 * Displays detailed information about a workflow including runs, analytics, logs, and errors.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { translateLogMessage } from '../../utils/logTranslations';
import { t, translateStatus } from '../../utils/i18n';

interface WorkflowRun {
  _id: string;
  createdAt: Date | string;
  startTime?: Date | string;
  endTime?: Date | string;
  status: string;
  error?: string;
  duration?: number | null;
}

interface WorkflowAnalytics {
  averageExecutionTime: number | null;
  successRate: number;
  totalRuns: number;
  recentTrends: Array<{
    runId: string;
    status: string;
    executionTime: number | null;
    timestamp: Date | string;
  }>;
  peakExecutionTime: number | null;
  peakUsage: {
    maxConcurrentRuns: number;
    peakDate: string | null;
  };
}

interface WorkflowDetailsPanelProps {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}

export function WorkflowDetailsPanel({ workflowId, workflowName, onClose }: WorkflowDetailsPanelProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [analytics, setAnalytics] = useState<WorkflowAnalytics | null>(null);
  const [logs, setLogs] = useState<Array<{
    level: string;
    message: string;
    timestamp: Date | string;
    metadata: Record<string, unknown>;
    formattedMessage?: string;
  }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [errors, setErrors] = useState<Array<{
    _id: string;
    message: string;
    severity: string;
    component: string;
    last_seen: string;
    occurrence_count: number;
    status: string;
  }>>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const loadWorkflowDetails = useCallback(async () => {
    try {
      setLoading(true);
      const [runsRes, analyticsRes] = await Promise.all([
        api.get<{ runs: WorkflowRun[]; pagination: { total: number; limit: number; skip: number; pages: number } }>(`/admin/workflows/${workflowId}/runs?limit=20`),
        api.get<WorkflowAnalytics>(`/admin/workflows/${workflowId}/analytics`),
      ]);
      setRuns(runsRes.runs || []);
      setAnalytics(analyticsRes);
    } catch (error) {
      logError(error, 'load-workflow-details');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  const loadWorkflowErrors = useCallback(async () => {
    try {
      setErrorsLoading(true);
      const response = await api.get<{
        errors: Array<{
          _id: string;
          message: string;
          severity: string;
          component: string;
          last_seen: string;
          occurrence_count: number;
          status: string;
        }>
      }>(`/admin/workflows/${workflowId}/errors`);
      setErrors(response.errors || []);
    } catch (error) {
      logError(error, 'load-workflow-errors');
    } finally {
      setErrorsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadWorkflowDetails();
  }, [loadWorkflowDetails]);

  const loadRunLogs = async (runId: string) => {
    try {
      setLogsLoading(true);
      const response = await api.get<{
        logs: Array<{
          level: string;
          message: string;
          timestamp: Date | string;
          metadata: Record<string, unknown>;
        }>;
        status: string;
        startTime?: Date | string;
        endTime?: Date | string;
        error?: string;
      }>(`/admin/workflows/${workflowId}/logs/${runId}`);
      setLogs(response.logs || []);
      setSelectedRunId(runId);
    } catch (error) {
      logError(error, 'load-run-logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms) return t('common.notAvailable');
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold">{t('workflowDetails.title')}: {workflowName}</h3>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 mt-1"
          >
            {t('workflowDetails.backToWorkflows')}
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Performance Analytics */}
      {analytics && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-1">{t('workflowDetails.averageExecutionTime')}</h4>
            <p className="text-2xl font-bold">
              {analytics.averageExecutionTime ? formatDuration(analytics.averageExecutionTime) : t('common.notAvailable')}
            </p>
          </div>
          <div className="bg-gray-50 rounded p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-1">{t('workflowDetails.peakExecutionTime')}</h4>
            <p className="text-2xl font-bold">
              {analytics.peakExecutionTime ? formatDuration(analytics.peakExecutionTime) : t('common.notAvailable')}
            </p>
          </div>
          <div className="bg-gray-50 rounded p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-1">{t('workflowDetails.successRate')}</h4>
            <p className="text-2xl font-bold">
              {(analytics.successRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-gray-50 rounded p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-1">{t('workflowDetails.peakUsage')}</h4>
            <p className="text-2xl font-bold">{analytics.peakUsage?.maxConcurrentRuns ?? 0}</p>
            {analytics.peakUsage?.peakDate && (
              <p className="text-xs text-gray-500 mt-1">
                op {new Date(analytics.peakUsage.peakDate).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="bg-gray-50 rounded p-4">
            <h4 className="text-sm font-medium text-gray-500 mb-1">{t('workflowDetails.totalRuns')}</h4>
            <p className="text-2xl font-bold">{analytics.totalRuns}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Execution History */}
        <div>
          <h4 className="text-md font-semibold mb-3">{t('workflowDetails.recentRuns')}</h4>
          {loading ? (
            <div className="text-center py-4 text-gray-500">{t('common.loading')}</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-4 text-gray-500">{t('workflowDetails.noRunsFound')}</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {runs.map((run) => (
                <div
                  key={run._id}
                  className={`border rounded p-3 cursor-pointer hover:bg-gray-50 ${selectedRunId === run._id ? 'bg-blue-50 border-blue-300' : ''
                    }`}
                  onClick={() => loadRunLogs(run._id)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs px-2 py-1 rounded ${run.status === 'completed' ? 'bg-green-100 text-green-800' :
                      run.status === 'failed' ? 'bg-red-100 text-red-800' :
                        run.status === 'running' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                      }`}>
                      {translateStatus(run.status)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {run.duration && (
                    <p className="text-xs text-gray-600">Duration: {formatDuration(run.duration)}</p>
                  )}
                  {run.error && (
                    <p className="text-xs text-red-600 mt-1 truncate">{run.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logs Viewer */}
        <div>
          <h4 className="text-md font-semibold mb-3">
            {t('workflowDetails.runLogs')} {selectedRunId && `(Run: ${selectedRunId.substring(0, 8)}...)`}
          </h4>
          {!selectedRunId ? (
            <div className="text-center py-8 text-gray-500">
              {t('workflowDetails.selectRunToViewLogs')}
            </div>
          ) : logsLoading ? (
            <div className="text-center py-4 text-gray-500">{t('workflowDetails.loadingLogs')}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-4 text-gray-500">{t('workflowDetails.noLogsAvailable')}</div>
          ) : (
            <div className="bg-gray-900 text-gray-100 rounded p-4 max-h-96 overflow-y-auto font-mono text-xs">
              {logs.map((log, idx) => {
                // Translate log message if it contains i18n keys
                const displayMessage = translateLogMessage(
                  typeof log.formattedMessage === 'string' ? log.formattedMessage :
                  typeof log.message === 'string' ? log.message : ''
                );
                return (
                  <div key={idx} className="mb-2">
                    <span className="text-gray-400">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={`ml-2 ${log.level === 'error' ? 'text-red-400' :
                      log.level === 'warn' ? 'text-yellow-400' :
                        log.level === 'debug' ? 'text-gray-400' :
                          'text-gray-100'
                      }`}>
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="ml-2">{displayMessage}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Error Drill-Down Section */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-md font-semibold">{t('workflowDetails.workflowErrors')}</h4>
          <button
            onClick={() => {
              if (!showErrors) {
                loadWorkflowErrors();
              }
              setShowErrors(!showErrors);
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showErrors ? t('workflowDetails.hideErrors') : t('workflowDetails.showErrors')}
          </button>
        </div>
        {showErrors && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {errorsLoading ? (
              <div className="text-center py-4 text-gray-500">{t('workflowDetails.loadingErrors')}</div>
            ) : errors.length === 0 ? (
              <div className="text-center py-4 text-gray-500">{t('workflowDetails.noErrorsFound')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Occurrences</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {errors.map((error) => (
                      <tr
                        key={error._id}
                        className={error.severity === 'critical' ? 'bg-red-50' : ''}
                      >
                        <td className="px-4 py-2 text-sm">{error.message}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${error.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            error.severity === 'error' ? 'bg-orange-100 text-orange-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                            {error.severity}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                          {error.occurrence_count || 1}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                          {new Date(error.last_seen).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${error.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                            {error.status || 'active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

