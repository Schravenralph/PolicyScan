/**
 * Audit Logs Tab Component
 * 
 * Displays audit logs with filtering, pagination, and export capabilities.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';

interface AuditLog {
  _id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, unknown>;
}

export function AuditLogsTab() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsPage, setAuditLogsPage] = useState(1);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [auditLogsLimit] = useState(50);
  const [auditLogUserId] = useState<string>('');
  const [auditLogAction, setAuditLogAction] = useState<string>('');
  const [auditLogTargetType, setAuditLogTargetType] = useState<string>('');
  const [auditLogTargetId, setAuditLogTargetId] = useState<string>('');
  const [auditLogStartDate, setAuditLogStartDate] = useState<string>('');
  const [auditLogEndDate, setAuditLogEndDate] = useState<string>('');
  const [auditLogSearch, setAuditLogSearch] = useState<string>('');

  const loadAuditLogs = useCallback(async () => {
    try {
      setAuditLogsLoading(true);
      const params = new URLSearchParams();
      params.append('page', auditLogsPage.toString());
      params.append('limit', auditLogsLimit.toString());
      if (auditLogUserId) params.append('userId', auditLogUserId);
      if (auditLogAction) params.append('action', auditLogAction);
      if (auditLogTargetType) params.append('targetType', auditLogTargetType);
      if (auditLogTargetId) params.append('targetId', auditLogTargetId);
      if (auditLogStartDate) params.append('startDate', auditLogStartDate);
      if (auditLogEndDate) params.append('endDate', auditLogEndDate);
      if (auditLogSearch) params.append('search', auditLogSearch);

      const response = await api.get<{
        logs: AuditLog[];
        pagination: { page: number; limit: number; total: number; pages: number };
      }>(`/admin/audit-logs?${params.toString()}`);
      setAuditLogs(response.logs || []);
      setAuditLogsTotal(response.pagination.total);
    } catch (error) {
      logError(error, 'load-audit-logs');
    } finally {
      setAuditLogsLoading(false);
    }
  }, [auditLogsPage, auditLogsLimit, auditLogUserId, auditLogAction, auditLogTargetType, auditLogTargetId, auditLogStartDate, auditLogEndDate, auditLogSearch]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const exportAuditLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (auditLogUserId) params.append('userId', auditLogUserId);
      if (auditLogAction) params.append('action', auditLogAction);
      if (auditLogTargetType) params.append('targetType', auditLogTargetType);
      if (auditLogStartDate) params.append('startDate', auditLogStartDate);
      if (auditLogEndDate) params.append('endDate', auditLogEndDate);
      if (auditLogSearch) params.append('search', auditLogSearch);
      params.append('limit', '10000');

      const blob = await api.get<Blob>(`/admin/audit-logs/export?${params.toString()}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logError(error, 'export-audit-logs');
      toast.error(t('admin.failedToExportAuditLogs'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{t('admin.auditLogs')}</h2>
          <button
            onClick={exportAuditLogs}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Export Audit Logs (CSV)
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4 pb-4 border-b border-gray-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User Email
            </label>
            <input
              type="text"
              value={auditLogSearch}
              onChange={(e) => setAuditLogSearch(e.target.value)}
              placeholder={t('admin.search')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.action')}
            </label>
            <select
              value={auditLogAction}
              onChange={(e) => setAuditLogAction(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">{t('workflowManagement.all')}</option>
              <option value="user_role_changed">User Role Changed</option>
              <option value="user_status_changed">User Status Changed</option>
              <option value="user_password_reset">{t('admin.passwordReset')}</option>
              <option value="workflow_paused">{t('admin.workflowPaused')}</option>
              <option value="workflow_resumed">{t('admin.workflowResumed')}</option>
              <option value="threshold_updated">{t('admin.thresholdUpdated')}</option>
              <option value="threshold_schedule_created">{t('admin.thresholdScheduleCreated')}</option>
              <option value="threshold_schedule_updated">{t('admin.thresholdScheduleUpdated')}</option>
              <option value="threshold_schedule_deleted">{t('admin.thresholdScheduleDeleted')}</option>
              <option value="error_resolved">{t('admin.errorResolved')}</option>
              <option value="system_config_changed">System Config Changed</option>
              <option value="audit_log_exported">Audit Log Exported</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.targetType')}
            </label>
            <select
              value={auditLogTargetType}
              onChange={(e) => setAuditLogTargetType(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">{t('workflowManagement.all')}</option>
              <option value="user">User</option>
              <option value="workflow">Workflow</option>
              <option value="system">System</option>
              <option value="threshold">Threshold</option>
              <option value="audit_log">Audit Log</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.targetId')}
            </label>
            <input
              type="text"
              value={auditLogTargetId}
              onChange={(e) => setAuditLogTargetId(e.target.value)}
              placeholder={t('admin.filterByTargetId')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={auditLogStartDate}
              onChange={(e) => setAuditLogStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={auditLogEndDate}
              onChange={(e) => setAuditLogEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Audit Logs Table */}
        {auditLogsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading audit logs...</div>
        ) : auditLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No audit logs found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.ipAddress')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.map((log) => (
                    <tr key={log._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.userEmail}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <span className="font-medium">{log.targetType}</span>
                          {log.targetId && (
                            <span className="ml-2 font-mono text-xs text-gray-400">
                              {log.targetId.substring(0, 8)}...
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.ipAddress || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-md">
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 hover:text-blue-800">
                            View Details
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                {t('common.showing')} {((auditLogsPage - 1) * auditLogsLimit) + 1} {t('common.to')} {Math.min(auditLogsPage * auditLogsLimit, auditLogsTotal)} {t('common.of')} {auditLogsTotal} {t('common.entries')}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setAuditLogsPage(p => Math.max(1, p - 1))}
                  disabled={auditLogsPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setAuditLogsPage(p => p + 1)}
                  disabled={auditLogsPage * auditLogsLimit >= auditLogsTotal}
                  className="px-3 py-2 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

