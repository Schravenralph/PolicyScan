/**
 * Workflow Monitoring Dashboard
 * 
 * Dashboard for monitoring stuck workflows and currently running workflows.
 * Provides visibility into workflows that are running longer than expected,
 * approaching timeouts, or have been stuck for extended periods.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';

/**
 * Enriched run data with timeout information
 */
interface EnrichedRun {
  _id: string;
  runId: string;
  workflowId?: string;
  workflowName?: string;
  status: string;
  startTime: string;
  elapsedTime: number; // milliseconds
  workflowTimeout: number; // milliseconds
  percentageUsed: number; // percentage
  isApproachingTimeout: boolean; // >= 80%
  isStuck: boolean; // exceeded timeout by threshold
  percentageOverTimeout?: number; // if stuck, percentage over timeout
  currentStepId?: string;
  params?: Record<string, unknown>;
}

/**
 * Workflow monitoring statistics
 */
interface WorkflowStats {
  running: number;
  pending: number;
  completed: number;
  failed: number;
  approachingTimeout: number;
  stuck: number;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format percentage
 */
function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

export function WorkflowMonitoringDashboard() {
  const [runningWorkflows, setRunningWorkflows] = useState<EnrichedRun[]>([]);
  const [stuckWorkflows, setStuckWorkflows] = useState<EnrichedRun[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [activeTab, setActiveTab] = useState<'running' | 'stuck'>('running');
  const [searchTerm, setSearchTerm] = useState('');
  const [workflowIdFilter, setWorkflowIdFilter] = useState('');

  /**
   * Fetch running workflows
   */
  const fetchRunningWorkflows = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (workflowIdFilter) {
        params.append('workflowId', workflowIdFilter);
      }
      params.append('limit', '100');
      params.append('skip', '0');

      const response = await api.get<{
        data: EnrichedRun[];
        total: number;
        limit: number;
        skip: number;
        page: number;
      }>(`/workflows/admin/workflows/running?${params.toString()}`);

      interface ApiResponse {
        data?: EnrichedRun[];
      }
      setRunningWorkflows(Array.isArray(response) ? response : (response as ApiResponse)?.data || []);
    } catch (err) {
      console.error('Error fetching running workflows:', err);
      if (!error) {
        setError(err instanceof Error ? err.message : 'Failed to fetch running workflows');
      }
    }
  }, [workflowIdFilter, error]);

  /**
   * Fetch stuck workflows
   */
  const fetchStuckWorkflows = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('limit', '100');
      params.append('skip', '0');

      const response = await api.get<{
        data: EnrichedRun[];
        total: number;
        limit: number;
        skip: number;
        page: number;
      }>(`/workflows/admin/workflows/stuck?${params.toString()}`);

      interface ApiResponse {
        data?: EnrichedRun[];
      }
      setStuckWorkflows(Array.isArray(response) ? response : (response as ApiResponse)?.data || []);
    } catch (err) {
      console.error('Error fetching stuck workflows:', err);
      if (!error) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stuck workflows');
      }
    }
  }, [error]);

  /**
   * Fetch statistics
   */
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get<WorkflowStats>('/workflows/admin/workflows/stats');
      setStats(response);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  }, []);

  /**
   * Fetch all data
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchRunningWorkflows(),
        fetchStuckWorkflows(),
        fetchStats(),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow data');
    } finally {
      setLoading(false);
    }
  }, [fetchRunningWorkflows, fetchStuckWorkflows, fetchStats]);

  /**
   * Set up auto-refresh
   */
  useEffect(() => {
    fetchData();

    if (!autoRefresh) {
      return;
    }

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, autoRefresh, refreshInterval]);

  /**
   * Filter workflows by search term
   */
  const filteredRunningWorkflows = runningWorkflows.filter((workflow) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        workflow.workflowName?.toLowerCase().includes(term) ||
        workflow.workflowId?.toLowerCase().includes(term) ||
        workflow.runId.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const filteredStuckWorkflows = stuckWorkflows.filter((workflow) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        workflow.workflowName?.toLowerCase().includes(term) ||
        workflow.workflowId?.toLowerCase().includes(term) ||
        workflow.runId.toLowerCase().includes(term)
      );
    }
    return true;
  });

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading workflow monitoring data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Workflow Monitoring Dashboard</h1>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span>Auto-refresh</span>
          </label>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
            disabled={!autoRefresh}
          >
            <option value={10000}>10 seconds</option>
            <option value={30000}>30 seconds</option>
            <option value={60000}>1 minute</option>
            <option value={300000}>5 minutes</option>
          </select>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Running</div>
            <div className="text-2xl font-bold text-blue-900">{stats.running}</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-sm text-yellow-600 font-medium">Approaching Timeout</div>
            <div className="text-2xl font-bold text-yellow-900">{stats.approachingTimeout}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Stuck</div>
            <div className="text-2xl font-bold text-red-900">{stats.stuck}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600 font-medium">Pending</div>
            <div className="text-2xl font-bold text-gray-900">{stats.pending}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Completed</div>
            <div className="text-2xl font-bold text-green-900">{stats.completed}</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Failed</div>
            <div className="text-2xl font-bold text-orange-900">{stats.failed}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('running')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'running'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Running Workflows ({filteredRunningWorkflows.length})
          </button>
          <button
            onClick={() => setActiveTab('stuck')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'stuck'
                ? 'border-b-2 border-red-600 text-red-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Stuck Workflows ({filteredStuckWorkflows.length})
          </button>
        </nav>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search workflows..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 border rounded px-4 py-2"
        />
        <input
          type="text"
          placeholder="Filter by Workflow ID..."
          value={workflowIdFilter}
          onChange={(e) => setWorkflowIdFilter(e.target.value)}
          className="border rounded px-4 py-2"
        />
      </div>

      {/* Running Workflows Table */}
      {activeTab === 'running' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Workflow</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Run ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Elapsed Time</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Timeout Used</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Current Step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRunningWorkflows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No running workflows found
                  </td>
                </tr>
              ) : (
                filteredRunningWorkflows.map((workflow) => (
                  <tr
                    key={workflow.runId}
                    className={`hover:bg-gray-50 ${
                      workflow.isApproachingTimeout ? 'bg-yellow-50' : ''
                    } ${workflow.isStuck ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{workflow.workflowName || workflow.workflowId || 'Unknown'}</div>
                      {workflow.workflowId && (
                        <div className="text-sm text-gray-500">{workflow.workflowId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{workflow.runId.substring(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm">{formatDuration(workflow.elapsedTime)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              workflow.percentageUsed >= 95
                                ? 'bg-red-600'
                                : workflow.percentageUsed >= 80
                                ? 'bg-yellow-600'
                                : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(workflow.percentageUsed, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{formatPercentage(workflow.percentageUsed)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          workflow.isStuck
                            ? 'bg-red-100 text-red-800'
                            : workflow.isApproachingTimeout
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {workflow.isStuck
                          ? 'Stuck'
                          : workflow.isApproachingTimeout
                          ? 'Approaching Timeout'
                          : 'Running'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {workflow.currentStepId || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stuck Workflows Table */}
      {activeTab === 'stuck' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Workflow</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Run ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Elapsed Time</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Over Timeout</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredStuckWorkflows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No stuck workflows found
                  </td>
                </tr>
              ) : (
                filteredStuckWorkflows.map((workflow) => (
                  <tr key={workflow.runId} className="hover:bg-gray-50 bg-red-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{workflow.workflowName || workflow.workflowId || 'Unknown'}</div>
                      {workflow.workflowId && (
                        <div className="text-sm text-gray-500">{workflow.workflowId}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{workflow.runId.substring(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm">{formatDuration(workflow.elapsedTime)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-red-600">
                        {workflow.percentageOverTimeout
                          ? `+${formatPercentage(workflow.percentageOverTimeout)}`
                          : 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <a
                          href={`/workflows/runs/${workflow.runId}`}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                          View
                        </a>
                        <button
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          onClick={async () => {
                            if (confirm('Are you sure you want to cancel this workflow?')) {
                              try {
                                await api.post(`/runs/${workflow.runId}/cancel`);
                                await fetchData();
                              } catch {
                                alert('Failed to cancel workflow');
                              }
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


