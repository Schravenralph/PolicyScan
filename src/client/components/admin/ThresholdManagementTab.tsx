/**
 * Threshold Management Tab Component
 * 
 * Manages system thresholds including current thresholds, templates, schedules, recommendations, and history.
 */

import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { formatFeatureFlagState } from '../../utils/featureFlagFormatters.js';
import { ScheduleDialog } from './ScheduleDialog';

export function ThresholdManagementTab() {
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [schedules, setSchedules] = useState<Array<{
    id: string;
    name: string;
    timeRange: { start: string; end: string };
    daysOfWeek: number[];
    thresholds: Record<string, number>;
    enabled: boolean;
  }>>([]);
  const [templates, setTemplates] = useState<Array<{ name: string; description: string; thresholds: Record<string, number> }>>([]);
  const [history, setHistory] = useState<Array<{
    timestamp: string;
    changedBy?: string;
    previousThresholds: Record<string, number>;
    newThresholds: Record<string, number>;
    reason?: string;
  }>>([]);
  const [recommendations, setRecommendations] = useState<Array<{
    metric: string;
    currentThreshold: number;
    recommendedThreshold: number;
    reason: string;
    confidence: number;
  }>>([]);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  useEffect(() => {
    loadThresholdData();
  }, []);

  const loadThresholdData = async () => {
    try {
      setLoading(true);
      const [thresholdsRes, schedulesRes, templatesRes, historyRes, recommendationsRes, dashboardRes] = await Promise.all([
        api.get<{ thresholds: Record<string, number> }>('/admin/thresholds'),
        api.get<{ schedules: Array<Record<string, unknown>> }>('/admin/thresholds/schedules'),
        api.get<{ templates: Array<Record<string, unknown>> }>('/admin/thresholds/templates'),
        api.get<{ history: Array<Record<string, unknown>> }>('/admin/thresholds/history?limit=20'),
        api.get<{ recommendations: Array<Record<string, unknown>> }>('/admin/thresholds/recommendations'),
        api.get('/admin/thresholds/dashboard'),
      ]);
      setThresholds(thresholdsRes.thresholds || {});
      setSchedules((schedulesRes.schedules || []) as Array<{
        id: string;
        name: string;
        timeRange: { start: string; end: string };
        daysOfWeek: number[];
        thresholds: Record<string, number>;
        enabled: boolean;
      }>);
      setTemplates((templatesRes.templates || []) as Array<{ name: string; description: string; thresholds: Record<string, number> }>);
      setHistory((historyRes.history || []) as Array<{
        timestamp: string;
        changedBy?: string;
        previousThresholds: Record<string, number>;
        newThresholds: Record<string, number>;
        reason?: string;
      }>);
      setRecommendations((recommendationsRes.recommendations || []) as Array<{
        metric: string;
        currentThreshold: number;
        recommendedThreshold: number;
        reason: string;
        confidence: number;
      }>);
      setDashboard(dashboardRes as Record<string, unknown> | null);
    } catch (error) {
      logError(error, 'load-threshold-data');
    } finally {
      setLoading(false);
    }
  };

  const updateThreshold = async (metric: string, value: number, reason?: string) => {
    try {
      const newThresholds = { ...thresholds, [metric]: value };
      await api.put('/admin/thresholds', { thresholds: newThresholds, reason });
      setThresholds(newThresholds);
      await loadThresholdData();
    } catch (error) {
      logError(error, 'update-threshold');
      toast.error(t('admin.failedToUpdateThreshold'));
    }
  };

  const applyTemplate = async (templateName: string) => {
    try {
      await api.post(`/admin/thresholds/templates/${templateName}/apply`);
      await loadThresholdData();
      toast.success(t('admin.templateAppliedSuccessfully'));
    } catch (error) {
      logError(error, 'apply-template');
      toast.error(t('admin.failedToApplyTemplate'));
    }
  };

  const createSchedule = async (schedule: {
    name: string;
    timeRange: { start: string; end: string };
    daysOfWeek: number[];
    thresholds: Record<string, number>;
    enabled: boolean;
  }) => {
    try {
      await api.post('/admin/thresholds/schedules', schedule);
      await loadThresholdData();
      setShowScheduleDialog(false);
      toast.success(t('admin.scheduleCreatedSuccessfully'));
    } catch (error) {
      logError(error, 'create-schedule');
      toast.error(t('admin.failedToCreateSchedule'));
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    if (!confirm(t('admin.confirmDeleteSchedule'))) return;
    try {
      await api.delete(`/admin/thresholds/schedules/${scheduleId}`);
      await loadThresholdData();
    } catch (error) {
      logError(error, 'delete-schedule');
      toast.error(t('admin.failedToDeleteSchedule'));
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading threshold data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Current Thresholds */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Current Thresholds</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(thresholds).map(([metric, value]) => (
            <div key={metric} className="flex items-center justify-between p-4 border rounded">
              <div>
                <label className="text-sm font-medium text-gray-700 capitalize">
                  {metric.replace(/_/g, ' ')}
                </label>
                {dashboard && typeof dashboard === 'object' && 'currentMetrics' in dashboard && dashboard.currentMetrics && typeof dashboard.currentMetrics === 'object' && metric in dashboard.currentMetrics ? (
                  <p className="text-xs text-gray-500 mt-1">
                    Current: {String((dashboard.currentMetrics as Record<string, unknown>)[metric] ?? '')} {metric.includes('mb') ? 'MB' : metric.includes('ms') ? 'ms' : ''}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={value}
                  onChange={(e) => updateThreshold(metric, Number(e.target.value))}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <span className="text-sm text-gray-500">
                  {metric.includes('mb') ? 'MB' : metric.includes('ms') ? 'ms' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Threshold Templates */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Threshold Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.name} className="border rounded p-4">
              <h3 className="font-medium mb-2">{template.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{template.description}</p>
              <button
                onClick={() => applyTemplate(template.name)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Apply Template
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Threshold Schedules */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Threshold Schedules</h2>
          <button
            onClick={() => setShowScheduleDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Create Schedule
          </button>
        </div>
        {schedules.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No schedules configured</p>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="border rounded p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{schedule.name}</h3>
                  <p className="text-sm text-gray-600">
                    {schedule.timeRange.start} - {schedule.timeRange.end} on {schedule.daysOfWeek.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded mt-2 inline-block ${schedule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                    {formatFeatureFlagState(schedule.enabled)}
                  </span>
                </div>
                <button
                  onClick={() => deleteSchedule(schedule.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">AI Recommendations</h2>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="border rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium capitalize">{rec.metric.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-500">Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{rec.reason}</p>
                <div className="flex items-center gap-4">
                  <span className="text-sm">Current: {rec.currentThreshold}</span>
                  <span className="text-sm">→</span>
                  <span className="text-sm font-medium">Recommended: {rec.recommendedThreshold}</span>
                  <button
                    onClick={() => updateThreshold(rec.metric, rec.recommendedThreshold, `Applied recommendation: ${rec.reason}`)}
                    className="ml-auto px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Apply
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Change History</h2>
        <div className="space-y-2">
          {history.map((entry, idx) => (
            <div key={idx} className="border rounded p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{new Date(entry.timestamp).toLocaleString()}</span>
                {entry.changedBy && <span className="text-gray-500">by {entry.changedBy}</span>}
              </div>
              {entry.reason && <p className="text-gray-600 text-xs mb-2">{entry.reason}</p>}
              <div className="text-xs text-gray-500">
                {Object.entries(entry.newThresholds).map(([key, value]) => (
                  <div key={key}>
                    {key.replace(/_/g, ' ')}: {entry.previousThresholds[key] || t('common.notAvailable')} → {value}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Dialog */}
      {showScheduleDialog && (
        <ScheduleDialog
          onClose={() => setShowScheduleDialog(false)}
          onSave={createSchedule}
        />
      )}
    </div>
  );
}

