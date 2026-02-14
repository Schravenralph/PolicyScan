import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService, type DashboardData, type TestRun } from '../services/api/TestApiService';

interface TestReportsPageProps {
  testApiService?: TestApiService; // Optional dependency injection for testing
}

type ReportType = 'all' | 'metrics' | 'last' | 'errors' | 'warnings' | 'errors-warnings' | 'last-x';

interface Metrics {
  totalRuns: number;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  passRate: number;
  avgDuration: number;
  runsWithErrors: number;
  runsWithWarnings: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function TestReportsPage({ testApiService: injectedTestApiService }: TestReportsPageProps = {}) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApiService = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('all');
  const [lastXCount, setLastXCount] = useState(10);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [filteredRuns, setFilteredRuns] = useState<TestRun[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [showMetricsOnly, setShowMetricsOnly] = useState(false);

  const calculateMetrics = useCallback((runs: TestRun[]): Metrics => {
    if (runs.length === 0) {
      return {
        totalRuns: 0,
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        passRate: 0,
        avgDuration: 0,
        runsWithErrors: 0,
        runsWithWarnings: 0,
      };
    }

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalDuration = 0;
    let runsWithErrors = 0;
    let runsWithWarnings = 0;

    runs.forEach((run) => {
      const results = run.results || {};
      totalTests += results.total || 0;
      totalPassed += results.passed || 0;
      totalFailed += results.failed || 0;
      totalSkipped += results.skipped || 0;
      totalDuration += results.duration || 0;

      if ((results.failed || 0) > 0) {
        runsWithErrors++;
      }
      if ((results.skipped || 0) > 0) {
        runsWithWarnings++;
      }
    });

    const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
    const avgDuration = runs.length > 0 ? totalDuration / runs.length : 0;

    return {
      totalRuns: runs.length,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      passRate,
      avgDuration,
      runsWithErrors,
      runsWithWarnings,
    };
  }, []);

  const applyFilters = useCallback(
    (runs: TestRun[], type: ReportType, count: number): TestRun[] => {
      let filtered: TestRun[] = [...runs];

      switch (type) {
        case 'all':
          filtered = runs;
          break;

        case 'metrics':
          setShowMetricsOnly(true);
          return [];

        case 'last': {
          // Get the most recent run for each test file
          const lastRunsMap = new Map<string, TestRun>();
          runs.forEach((run) => {
            const testFile = run.testFile || 'unknown';
            if (!lastRunsMap.has(testFile)) {
              lastRunsMap.set(testFile, run);
            }
          });
          filtered = Array.from(lastRunsMap.values());
          break;
        }

        case 'errors':
          filtered = runs.filter((run) => {
            const results = run.results || {};
            return (results.failed || 0) > 0;
          });
          break;

        case 'warnings':
          filtered = runs.filter((run) => {
            const results = run.results || {};
            return (
              (results.skipped || 0) > 0 ||
              ((results.failed || 0) === 0 && (results.passed || 0) < (results.total || 0))
            );
          });
          break;

        case 'errors-warnings': {
          // Get last runs that have errors or warnings
          const lastRunsWithIssues = new Map<string, TestRun>();
          runs.forEach((run) => {
            const testFile = run.testFile || 'unknown';
            const results = run.results || {};
            const hasIssues = (results.failed || 0) > 0 || (results.skipped || 0) > 0;

            if (hasIssues && !lastRunsWithIssues.has(testFile)) {
              lastRunsWithIssues.set(testFile, run);
            }
          });
          filtered = Array.from(lastRunsWithIssues.values());
          break;
        }

        case 'last-x': {
          const validCount = Math.max(1, Math.min(1000, count));
          filtered = runs.slice(0, Math.min(validCount, runs.length));
          break;
        }

        default:
          filtered = runs;
      }

      setShowMetricsOnly(false);
      return filtered;
    },
    []
  );

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await testApiService.getDashboardData();
      setDashboardData(data);

      const allRuns = Array.isArray(data.recentRuns) ? data.recentRuns : [];

      // Sort by timestamp (newest first)
      allRuns.sort((a, b) => {
        const timeA = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
        if (isNaN(timeA) || isNaN(timeB)) {
          if (isNaN(timeA) && isNaN(timeB)) return 0;
          if (isNaN(timeA)) return 1;
          if (isNaN(timeB)) return -1;
        }
        return timeB - timeA;
      });

      const filtered = applyFilters(allRuns, reportType, lastXCount);
      setFilteredRuns(filtered);
      setMetrics(calculateMetrics(filtered));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load reports';
      setError(errorMessage);
      console.error('Error loading reports:', err);
      setDashboardData(null);
      setFilteredRuns([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [testApiService, reportType, lastXCount, applyFilters, calculateMetrics]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterChange = useCallback(
    (newType: ReportType) => {
      setReportType(newType);
      if (dashboardData) {
        const allRuns = Array.isArray(dashboardData.recentRuns) ? dashboardData.recentRuns : [];
        const filtered = applyFilters(allRuns, newType, lastXCount);
        setFilteredRuns(filtered);
        setMetrics(calculateMetrics(filtered));
      }
    },
    [dashboardData, lastXCount, applyFilters, calculateMetrics]
  );

  const handleLastXChange = useCallback(
    (count: number) => {
      setLastXCount(count);
      if (dashboardData && reportType === 'last-x') {
        const allRuns = Array.isArray(dashboardData.recentRuns) ? dashboardData.recentRuns : [];
        const filtered = applyFilters(allRuns, reportType, count);
        setFilteredRuns(filtered);
        setMetrics(calculateMetrics(filtered));
      }
    },
    [dashboardData, reportType, applyFilters, calculateMetrics]
  );

  const resetFilters = useCallback(() => {
    setReportType('all');
    setLastXCount(10);
    if (dashboardData) {
      const allRuns = Array.isArray(dashboardData.recentRuns) ? dashboardData.recentRuns : [];
      const filtered = applyFilters(allRuns, 'all', 10);
      setFilteredRuns(filtered);
      setMetrics(calculateMetrics(filtered));
    }
  }, [dashboardData, applyFilters, calculateMetrics]);

  const getStatusBadge = (run: TestRun) => {
    const results = run.results || {};
    const failed = results.failed || 0;
    const skipped = results.skipped || 0;

    if (failed > 0) {
      return (
        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold uppercase">
          Failed
        </span>
      );
    }
    if (skipped > 0) {
      return (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold uppercase">
          Warning
        </span>
      );
    }
    return (
      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold uppercase">
        Passed
      </span>
    );
  };

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📋 Test Reports</h1>
          <p className="text-gray-600 mt-1">View and filter test runs with detailed metrics, errors, and warnings</p>
        </div>
        <Button onClick={loadReports} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 Filter Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => handleFilterChange(e.target.value as ReportType)}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="all">All Test Runs</option>
                <option value="metrics">Metrics Only</option>
                <option value="last">All Last Runs</option>
                <option value="errors">Only Errors</option>
                <option value="warnings">Only Warnings</option>
                <option value="errors-warnings">Errors & Warnings (Last Runs)</option>
                <option value="last-x">Last X Runs</option>
              </select>
            </div>
            {reportType === 'last-x' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Number of Runs</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={lastXCount}
                  onChange={(e) => handleLastXChange(parseInt(e.target.value, 10) || 10)}
                  className="border rounded px-3 py-1 text-sm w-32"
                  placeholder="Enter number"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={resetFilters} variant="outline" size="sm">
                🔄 Reset
              </Button>
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

      {/* Metrics Summary */}
      {metrics && metrics.totalRuns > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Summary Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Total Runs</div>
                <div className="text-2xl font-semibold">{metrics.totalRuns}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Total Tests</div>
                <div className="text-2xl font-semibold">{metrics.totalTests}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Passed</div>
                <div className="text-2xl font-semibold text-green-600">{metrics.totalPassed}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Failed</div>
                <div className="text-2xl font-semibold text-red-600">{metrics.totalFailed}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Skipped</div>
                <div className="text-2xl font-semibold text-yellow-600">{metrics.totalSkipped}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Pass Rate</div>
                <div
                  className={`text-2xl font-semibold ${
                    metrics.passRate >= 90
                      ? 'text-green-600'
                      : metrics.passRate >= 70
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {metrics.passRate.toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Avg Duration</div>
                <div className="text-2xl font-semibold">{formatDuration(metrics.avgDuration)}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Runs with Errors</div>
                <div className="text-2xl font-semibold text-red-600">{metrics.runsWithErrors}</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded border">
                <div className="text-xs text-gray-600 uppercase mb-2">Runs with Warnings</div>
                <div className="text-2xl font-semibold text-yellow-600">{metrics.runsWithWarnings}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Runs Table */}
      {!showMetricsOnly && (
        <Card>
          <CardHeader>
            <CardTitle>📋 Test Runs</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4 opacity-50">📋</div>
                <p>No test runs match the selected filters.</p>
              </div>
            ) : (
              <div>
                <div className="text-sm text-gray-600 mb-4">
                  Showing {filteredRuns.length} test run{filteredRuns.length !== 1 ? 's' : ''}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Test File</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Total</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Passed</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Failed</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Skipped</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Duration</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRuns.map((run, idx) => {
                        const results = run.results || {};
                        const total = results.total || 0;
                        const passed = results.passed || 0;
                        const failed = results.failed || 0;
                        const skipped = results.skipped || 0;
                        const duration = results.duration || 0;
                        const passRate = total > 0 ? (passed / total) * 100 : 0;

                        const timestamp = run.timestamp ? new Date(run.timestamp).toLocaleString() : 'Unknown';
                        const testFile = run.testFile || 'Unknown';
                        const testFileName = testFile.split('/').pop() || testFile;

                        return (
                          <tr key={run.id || idx} className="border-b hover:bg-gray-50">
                            <td className="p-3 text-sm">{timestamp}</td>
                            <td className="p-3 text-sm">
                              <a
                                href={`/test-detail.html?test=${encodeURIComponent(run.id || testFile)}`}
                                className="text-blue-600 hover:underline font-medium"
                                title={testFile}
                              >
                                {testFileName}
                              </a>
                            </td>
                            <td className="p-3">{getStatusBadge(run)}</td>
                            <td className="p-3 text-sm">{total}</td>
                            <td className="p-3 text-sm text-green-600 font-semibold">{passed}</td>
                            <td className="p-3 text-sm text-red-600 font-semibold">{failed}</td>
                            <td className="p-3 text-sm text-yellow-600 font-semibold">{skipped}</td>
                            <td className="p-3 text-sm">{formatDuration(duration)}</td>
                            <td
                              className={`p-3 text-sm font-semibold ${
                                passRate >= 90
                                  ? 'text-green-600'
                                  : passRate >= 70
                                    ? 'text-yellow-600'
                                    : 'text-red-600'
                              }`}
                            >
                              {passRate.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics Only View */}
      {showMetricsOnly && metrics && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Metrics View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-4 opacity-50">📊</div>
              <p>Metrics view - no table displayed</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
