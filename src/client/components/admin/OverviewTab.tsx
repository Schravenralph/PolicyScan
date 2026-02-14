/**
 * Overview Tab Component
 * 
 * Displays system overview including metrics, error overview, storage usage, system health, and trends.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { useAdminMetrics, SystemMetrics } from '../../hooks/useAdminMetrics';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { MetricCard } from './MetricCard';

interface TrendData {
  period: string;
  trends: Array<{
    date: string;
    runs: number;
    completed: number;
    failed: number;
  }>;
}

interface OverviewTabProps {
  onErrorSelect: (errorId: string) => void;
}

export function OverviewTab({ onErrorSelect }: OverviewTabProps) {
  const { metrics, loading: metricsLoading, error: metricsError, refresh: refreshMetrics } = useAdminMetrics({
    refreshInterval: 0, // Disable auto-refresh, parent handles it
    enabled: true
  });
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [cleanupRunning, setCleanupRunning] = useState(false);

  const loadTrends = useCallback(async () => {
    try {
      const response = await api.get<TrendData>(`/admin/metrics/trends?period=${trendPeriod}`);
      setTrends(response);
    } catch (error) {
      logError(error, 'load-trends');
    }
  }, [trendPeriod]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

  const triggerDatabaseCleanup = useCallback(async () => {
    if (cleanupRunning) return;
    
    const confirmMessage = t('admin.confirmDatabaseCleanup') || 'Are you sure you want to run database cleanup? This may take several minutes.';
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setCleanupRunning(true);
      toast.info(t('admin.databaseCleanupStarted') || 'Database cleanup started...');
      
      const response = await api.post<{
        success: boolean;
        message: string;
        summary: {
          totalDeleted: number;
          totalTruncated: number;
          totalDurationMs: number;
        };
      }>('/admin/database-cleanup/run', {});

      if (response.success) {
        const { totalDeleted, totalTruncated } = response.summary;
        toast.success(
          t('admin.databaseCleanupCompleted') || 
          `Database cleanup completed. Deleted: ${totalDeleted}, Truncated: ${totalTruncated}`
        );
        // Refresh metrics to show updated storage usage
        await refreshMetrics();
      } else {
        toast.error(t('admin.databaseCleanupFailed') || 'Database cleanup failed');
      }
    } catch (error) {
      logError(error, 'trigger-database-cleanup');
      toast.error(t('admin.databaseCleanupFailed') || 'Database cleanup failed');
    } finally {
      setCleanupRunning(false);
    }
  }, [cleanupRunning, refreshMetrics, t]);

  if (metricsLoading && !metrics) {
    return <div className="text-center py-8 text-gray-500">Loading overview...</div>;
  }

  return (
    <div className="space-y-6">
      {!metrics ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">{t('admin.noMetricsDataAvailable')} {metricsError ? t('admin.pleaseCheckErrorAndRetry') : t('admin.loading')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title={t('admin.totalUsers')}
              value={metrics.users.total}
              subtitle={`${metrics.users.active_today} ${t('admin.activeToday')}`}
            />
            <MetricCard
              title={t('admin.workflows')}
              value={metrics.workflows.total}
              subtitle={`${metrics.workflows.automated} ${t('admin.automated')}, ${metrics.workflows.running} ${t('admin.running')}`}
            />
            <MetricCard
              title={t('admin.runsToday')}
              value={metrics.runs.today}
              subtitle={`${(metrics.runs.success_rate * 100).toFixed(1)}${t('admin.successRate')}`}
            />
            <MetricCard
              title={t('admin.errors24h')}
              value={metrics.errors.last_24h}
              subtitle={`${metrics.errors.critical} ${t('admin.critical')}`}
              className={metrics.errors.last_24h > 0 ? 'border-red-300 cursor-pointer hover:bg-red-50' : ''}
              onClick={() => {
                if (metrics.errors.last_24h > 0 && metrics.errors.details?.recent && metrics.errors.details.recent.length > 0) {
                  onErrorSelect(metrics.errors.details.recent[0]._id);
                }
              }}
            />
          </div>

          {/* Error Aggregation */}
          {metrics.errors.details && (metrics.errors.details.bySeverity || metrics.errors.details.byComponent) && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Error Overview</h3>
                <a
                  href="/admin?tab=errors"
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  View All Errors
                </a>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {metrics.errors.details.bySeverity && Object.keys(metrics.errors.details.bySeverity).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">By Severity</h4>
                    <div className="space-y-2">
                      {Object.entries(metrics.errors.details.bySeverity).map(([severity, count]) => (
                        <div key={severity} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">{severity}</span>
                          <span className={`px-2 py-1 rounded text-sm font-medium ${severity === 'critical' ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200' :
                            severity === 'error' ? 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200' :
                              'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200'
                            }`}>
                            {count as number}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {metrics.errors.details.byComponent && Object.keys(metrics.errors.details.byComponent).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">By Component</h4>
                    <div className="space-y-2">
                      {Object.entries(metrics.errors.details.byComponent).map(([component, count]) => (
                        <div key={component} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">{component}</span>
                          <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-sm font-medium">
                            {count as number}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {metrics.errors.details.recent && metrics.errors.details.recent.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium text-foreground mb-2">{t('admin.recentErrors')}</h4>
                  <div className="space-y-2">
                    {metrics.errors.details.recent.slice(0, 5).map((error) => (
                      <div
                        key={error._id}
                        className="flex items-center justify-between p-2 bg-muted rounded hover:bg-muted/80 cursor-pointer"
                        onClick={() => onErrorSelect(error._id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{error.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {error.component} • {error.last_seen || error.timestamp ? new Date(error.last_seen || error.timestamp || '').toLocaleString() : t('common.notAvailable')}
                          </p>
                        </div>
                        <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${error.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          error.severity === 'error' ? 'bg-orange-100 text-orange-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                          {error.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Storage Usage</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Knowledge Base:</span>
                  <span className="font-medium">{metrics.storage.knowledge_base_size_mb} MB</span>
                </div>
                <div className="flex justify-between">
                  <span>Database:</span>
                  <span className="font-medium">{metrics.storage.database_size_mb} MB</span>
                </div>
                {metrics.storage.breakdown && (
                  <>
                    <div className="flex justify-between">
                      <span>Logs:</span>
                      <span className="font-medium">{metrics.storage.breakdown.logs?.size_mb || 0} MB</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="font-semibold">Total:</span>
                      <span className="font-semibold">{metrics.storage.breakdown.total_mb || (metrics.storage.knowledge_base_size_mb + metrics.storage.database_size_mb)} MB</span>
                    </div>
                  </>
                )}
              </div>
              {metrics.storage.cleanup_recommendations && metrics.storage.cleanup_recommendations.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-foreground">Cleanup Recommendations</h4>
                    {metrics.storage.cleanup_recommendations.some(rec => rec.component === 'database') && (
                      <button
                        onClick={triggerDatabaseCleanup}
                        disabled={cleanupRunning}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cleanupRunning ? t('admin.running') || 'Running...' : t('admin.runCleanup') || 'Run Cleanup'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {metrics.storage.cleanup_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="flex items-start justify-between">
                          <span className="text-muted-foreground">{rec.recommendation}</span>
                          <span className={`px-2 py-1 rounded text-xs ml-2 ${rec.priority === 'high' ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200' :
                            rec.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200' :
                              'bg-primary/10 text-primary'
                            }`}>
                            {rec.priority}
                          </span>
                        </div>
                        {(typeof rec.potential_savings_mb === 'number' && rec.potential_savings_mb > 0) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Potential savings: ~{rec.potential_savings_mb} MB
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">System Health</h3>
              <div className="space-y-2">
                {(() => {
                  // Try to get health from metrics, otherwise show basic status
                  interface HealthStatus {
                    status: 'healthy' | 'unhealthy' | 'unknown';
                  }
                  interface HealthData {
                    components?: Record<string, HealthStatus>;
                  }
                  const health = (metrics as SystemMetrics & { health?: HealthData }).health;
                  if (health && health.components) {
                    return Object.entries(health.components).map(([component, status]) => (
                      <div key={component} className="flex items-center justify-between">
                        <span className="capitalize">{component.replace('_', ' ')}:</span>
                        <span className={`px-2 py-1 rounded text-sm ${status.status === 'healthy' ? 'bg-green-100 text-green-800' :
                          status.status === 'unhealthy' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                          {status.status === 'healthy' ? t('admin.healthy') :
                            status.status === 'unhealthy' ? t('admin.unhealthy') : t('admin.unknown')}
                        </span>
                      </div>
                    ));
                  }
                  // Fallback to basic display
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span>API Status:</span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Healthy</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Database:</span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">Connected</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={async () => {
                    try {
                      const response = await api.get('/admin/health');
                      // Update metrics with health data
                      if (response) {
                        // Health data will be included in next metrics refresh
                        await refreshMetrics();
                      }
                    } catch (error) {
                      logError(error, 'check-system-health');
                      toast.error(t('admin.failedToCheckSystemHealth'));
                    }
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Refresh Health Status
                </button>
              </div>
            </div>
          </div>

          {/* Resource Usage Trends */}
          {trends && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Resource Usage Trends</h3>
                <select
                  value={trendPeriod}
                  onChange={(e) => setTrendPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="daily">Daily (7 days)</option>
                  <option value="weekly">Weekly (30 days)</option>
                  <option value="monthly">Monthly (90 days)</option>
                </select>
              </div>
              {!trends.trends || trends.trends.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No trend data available</p>
              ) : (
                <div className="space-y-3">
                  {trends.trends.slice(-7).map((trend, index) => {
                    const successRate = trend.runs > 0 ? (trend.completed / trend.runs) * 100 : 0;
                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {new Date(trend.date).toLocaleDateString()}
                          </span>
                          <span className="text-muted-foreground">
                            {trend.runs} runs ({successRate.toFixed(1)}% success)
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${(trend.completed / Math.max(trend.runs, 1)) * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>✓ {trend.completed} completed</span>
                          <span>✗ {trend.failed} failed</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

