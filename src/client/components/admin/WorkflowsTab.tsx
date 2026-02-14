/**
 * Workflows Tab Component
 * 
 * Displays workflow monitoring information including status, runs, and success rates.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { WorkflowDetailsPanel } from './WorkflowDetailsPanel';
import { t, translateStatus } from '../../utils/i18n';

interface Workflow {
  id: string;
  name: string;
  status: string;
  paused?: boolean;
  stats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    lastRunTime: string | null;
    hasErrors: boolean;
  };
}

export function WorkflowsTab() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const workflowsRes = await api.get<Workflow[] | { data: Workflow[] }>('/admin/workflows').catch(() => []);
      // Handle both array and object response formats
      const workflowsList = Array.isArray(workflowsRes)
        ? workflowsRes
        : (workflowsRes && typeof workflowsRes === 'object' && 'data' in workflowsRes && Array.isArray(workflowsRes.data))
          ? workflowsRes.data
          : [];
      setWorkflows(workflowsList);
    } catch (error) {
      logError(error, 'load-workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading workflows...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Workflow Monitoring</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Runs</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {!workflows || workflows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    {t('workflows.noWorkflowsFound')}
                  </td>
                </tr>
              ) : (
                workflows.map((workflow) => (
                  <tr
                    key={workflow.id}
                    className={workflow.stats.hasErrors ? 'bg-red-50' : ''}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setSelectedWorkflowId(workflow.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {workflow.name || workflow.id}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${workflow.status === 'Published'
                        ? 'bg-green-100 text-green-800'
                        : workflow.status === 'Draft'
                          ? 'bg-gray-100 text-gray-800'
                          : workflow.status === 'Testing'
                            ? 'bg-blue-100 text-blue-800'
                            : workflow.status === 'Tested'
                              ? 'bg-purple-100 text-purple-800'
                              : workflow.status === 'Unpublished'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                        }`}>
                        {translateStatus(workflow.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {workflow.stats.totalRuns}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`font-medium ${workflow.stats.successRate >= 0.9
                        ? 'text-green-600'
                        : workflow.stats.successRate >= 0.7
                          ? 'text-yellow-600'
                          : 'text-red-600'
                        }`}>
                        {(workflow.stats.successRate * 100).toFixed(1)}%
                      </span>
                      <span className="text-gray-500 text-xs ml-2">
                        ({workflow.stats.successfulRuns}/{workflow.stats.totalRuns})
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {workflow.stats.lastRunTime
                        ? new Date(workflow.stats.lastRunTime).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Workflows are categorical (Published/Draft/etc.), not something you pause/resume */}
                      {/* Pause/resume actions apply to individual workflow runs, not workflows themselves */}
                      —
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workflow Details Panel */}
      {selectedWorkflowId && (
        <WorkflowDetailsPanel
          workflowId={selectedWorkflowId}
          workflowName={workflows.find(w => w.id === selectedWorkflowId)?.name || selectedWorkflowId}
          onClose={() => setSelectedWorkflowId(null)}
        />
      )}
    </div>
  );
}

