/**
 * Test Alerts Page
 * 
 * Displays active alerts for test failures, regressions, and issues.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TestApiService } from '../services/api/TestApiService';
import { RefreshCw, AlertCircle, AlertTriangle, Info, XCircle, Download, Bell, BellOff, X, ExternalLink, Eye } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { Badge } from '../components/ui/badge';
import { t } from '../utils/i18n';
import { translateLogMessage } from '../utils/logTranslations';

interface TestAlertsPageProps {
  testApiService?: TestApiService;
}

interface Alert {
  id: string;
  type: 'failure' | 'regression' | 'flakiness' | 'coverage' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  affectedTests?: string[];
  metrics?: Record<string, unknown>;
}

interface AlertsData {
  alerts: Alert[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  };
  filters: {
    timeRangeDays: number;
    testType?: string;
    branch?: string;
    severity?: string;
  };
  timestamp: string;
}

const SEVERITY_COLORS = {
  critical: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800',
  high: 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-800',
  medium: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800',
  low: 'bg-primary/10 text-primary border-primary/30',
};

const SEVERITY_ICONS = {
  critical: XCircle,
  high: AlertCircle,
  medium: AlertTriangle,
  low: Info,
};

// TYPE_LABELS moved inside component to use t() function

const DISMISSED_ALERTS_STORAGE_KEY = 'test-alerts-dismissed';

export function TestAlertsPage({ testApiService: injectedTestApiService }: TestAlertsPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );
  const navigate = useNavigate();

  const TYPE_LABELS = {
    failure: t('testAlerts.type.failure'),
    regression: t('testAlerts.type.regression'),
    flakiness: t('testAlerts.type.flakiness'),
    coverage: t('testAlerts.type.coverage'),
    performance: t('testAlerts.type.performance'),
  };

  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRangeDays, setTimeRangeDays] = useState(7);
  const [testType, setTestType] = useState<string>('');
  const [branch] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Load dismissed alerts from localStorage on mount
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_ALERTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return new Set(parsed);
      }
    } catch (error) {
      console.warn('Failed to load dismissed alerts from localStorage:', error);
    }
    return new Set();
  });

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await testApi.getTestAlerts({
        timeRangeDays,
        testType: testType || undefined,
        branch: branch || undefined,
        severity: severityFilter || undefined,
      });
      setData(result as unknown as AlertsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load alerts';
      setError(errorMessage);
      console.error('Error loading alerts:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeRangeDays, testType, branch, severityFilter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadAlerts();
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, loadAlerts]);

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    let filtered = data.alerts.filter(alert => !dismissedAlerts.has(alert.id));

    if (typeFilter) {
      filtered = filtered.filter(alert => alert.type === typeFilter);
    }

    // Sort by severity (critical > high > medium > low)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return filtered;
  }, [data, dismissedAlerts, typeFilter]);

  const dismissAlert = useCallback((alertId: string) => {
    setDismissedAlerts(prev => {
      const updated = new Set([...prev, alertId]);
      // Persist to localStorage
      try {
        localStorage.setItem(DISMISSED_ALERTS_STORAGE_KEY, JSON.stringify(Array.from(updated)));
      } catch (error) {
        console.warn('Failed to save dismissed alerts to localStorage:', error);
      }
      return updated;
    });
  }, []);

  const viewAffectedTests = useCallback((alert: Alert) => {
    // Navigate to relevant test page based on alert type
    if (alert.type === 'failure' || alert.type === 'regression') {
      navigate('/tests/failures'); // Test failure analysis page
    } else if (alert.type === 'flakiness') {
      navigate('/tests/summary'); // Test summary shows flaky tests
    } else if (alert.type === 'performance') {
      navigate('/tests/trends'); // Performance trends page
    } else if (alert.type === 'coverage') {
      navigate('/tests/coverage'); // Coverage page
    } else {
      navigate('/tests/summary'); // Default to summary
    }
  }, [navigate]);

  const exportAlerts = useCallback(() => {
    if (!data) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      filters: data.filters,
      summary: data.summary,
      alerts: filteredAlerts,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-alerts-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, filteredAlerts]);

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">🚨 Test Alerts</h1>
          <p className="text-gray-600 mt-1">Active alerts for test failures, regressions, and issues</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
          >
            {autoRefresh ? <Bell className="w-4 h-4 mr-2" /> : <BellOff className="w-4 h-4 mr-2" />}
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
          <Button onClick={loadAlerts} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportAlerts} variant="outline" size="sm" disabled={!data}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Time Range</label>
              <select
                value={timeRangeDays}
                onChange={(e) => setTimeRangeDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Test Type</label>
              <select
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="">All Types</option>
                <option value="unit">Unit</option>
                <option value="integration">Integration</option>
                <option value="e2e">End-to-end</option>
                <option value="visual">Visual</option>
                <option value="performance">Performance</option>
                <option value="workflow-steps">Workflow Steps</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alert Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="">All Types</option>
                <option value="failure">Failure</option>
                <option value="regression">Regression</option>
                <option value="flakiness">Flakiness</option>
                <option value="coverage">Coverage</option>
                <option value="performance">Performance</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.summary.total}</div>
              <div className="text-sm text-gray-600">Total Alerts</div>
            </CardContent>
          </Card>
          {Object.entries(data.summary.bySeverity).map(([severity, count]) => (
            <Card key={severity}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-gray-600 capitalize">{severity}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* Alerts List */}
      {data && filteredAlerts.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            {dismissedAlerts.size > 0 && data.alerts.length > 0
              ? 'All alerts have been dismissed.'
              : 'No alerts found matching your filters.'}
          </CardContent>
        </Card>
      )}

      {data && filteredAlerts.length > 0 && (
        <div className="space-y-4">
          {filteredAlerts.map((alert) => {
            const Icon = SEVERITY_ICONS[alert.severity] || AlertCircle;
            return (
              <Card key={alert.id} className={`border-l-4 ${
                alert.severity === 'critical' ? 'border-l-red-500 dark:border-l-red-600' :
                alert.severity === 'high' ? 'border-l-orange-500 dark:border-l-orange-600' :
                alert.severity === 'medium' ? 'border-l-yellow-500 dark:border-l-yellow-600' :
                'border-l-primary'
              }`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${
                        alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/30' :
                        alert.severity === 'high' ? 'bg-orange-50 dark:bg-orange-950/30' :
                        alert.severity === 'medium' ? 'bg-yellow-50 dark:bg-yellow-950/30' :
                        'bg-primary/10'
                      }`}>
                        <Icon className={`w-5 h-5 ${
                          alert.severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                          alert.severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                          alert.severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-primary'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{translateLogMessage(alert.title)}</CardTitle>
                          <Badge className={SEVERITY_COLORS[alert.severity]}>
                            {alert.severity}
                          </Badge>
                          <Badge variant="outline">
                            {TYPE_LABELS[alert.type]}
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm mb-2">{translateLogMessage(alert.message)}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewAffectedTests(alert)}
                        className="text-xs"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View Details
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissAlert(alert.id)}
                        className="text-gray-400 hover:text-gray-600"
                        title={t('testAlerts.dismissAlert')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {(alert.affectedTests && alert.affectedTests.length > 0) || alert.metrics ? (
                    <div className="space-y-3">
                      {alert.affectedTests && alert.affectedTests.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm">Affected Tests:</h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewAffectedTests(alert)}
                              className="text-xs h-6"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View All
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {alert.affectedTests.slice(0, 10).map((test, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {test}
                              </Badge>
                            ))}
                            {alert.affectedTests.length > 10 && (
                              <Badge variant="outline" className="text-xs">
                                +{alert.affectedTests.length - 10} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      {alert.metrics && Object.keys(alert.metrics).length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 text-sm">Metrics:</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            {Object.entries(alert.metrics).map(([key, value]) => (
                              <div key={key} className="bg-gray-50 px-2 py-1 rounded">
                                <span className="font-medium">{key}:</span> {String(value)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

