import { useEffect, useState, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { TestApiService } from '../services/api/TestApiService';
import { t } from '../utils/i18n';

interface TestTrendsPageProps {
  testApiService?: TestApiService; // Optional dependency injection for testing
}

interface TrendsData {
  dailyTrends: Array<{
    date: string;
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    passRate: number;
  }>;
  summary: {
    totalRuns: number;
    passRate: number;
    avgDuration: number;
  };
}

interface FlakeDetectionData {
  flakyTests: Array<{
    test_id?: string;
    suite?: string;
    total_runs: number;
    pass_rate: number;
    flake_rate: number;
    recent_failures: number;
  }>;
  totalFlakyTests: number;
}

interface PerformanceDriftData {
  regressions: Array<{
    test_id?: string;
    suite?: string;
    current_duration: number;
    baseline_duration: number;
    increase_percent: number;
    status: 'regression' | 'warning';
    trend: string;
  }>;
  warnings: Array<{
    test_id?: string;
    suite?: string;
    current_duration: number;
    baseline_duration: number;
    increase_percent: number;
    status: 'regression' | 'warning';
    trend: string;
  }>;
  summary: {
    total_tests_analyzed: number;
    total_regressions: number;
    total_warnings: number;
  };
}

interface WhatBrokeWhenData {
  breakTimeline: Array<{
    git_sha: string;
    branch: string;
    timestamp: string;
    failureCount: number;
    failures: Array<{
      test_id?: string;
      suite?: string;
    }>;
  }>;
  summary: {
    totalFailures: number;
    uniqueCommits: number;
    uniqueTests: number;
  };
}

export function TestTrendsPage({ testApiService: injectedTestApiService }: TestTrendsPageProps = {}) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApiService = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('30');
  const [suite, setSuite] = useState('');
  const [branch, setBranch] = useState('');
  const [env, setEnv] = useState('');

  // Data states
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [flakeData, setFlakeData] = useState<FlakeDetectionData | null>(null);
  const [performanceData, setPerformanceData] = useState<PerformanceDriftData | null>(null);
  const [whatBrokeData, setWhatBrokeData] = useState<WhatBrokeWhenData | null>(null);

  // Loading states for each section
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [flakeLoading, setFlakeLoading] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [whatBrokeLoading, setWhatBrokeLoading] = useState(false);

  const loadTrends = useCallback(async () => {
    try {
      setTrendsLoading(true);
      const data = await testApiService.getTrends({
        timeRangeDays: parseInt(timeRange, 10),
        suite: suite || undefined,
        branch: branch || undefined,
        env: env || undefined,
      });
      setTrendsData(data as unknown as TrendsData);
    } catch (err) {
      console.error('Error loading trends:', err);
      setTrendsData(null);
    } finally {
      setTrendsLoading(false);
    }
  }, [testApiService, timeRange, suite, branch, env]);

  const loadFlakeDetection = useCallback(async () => {
    try {
      setFlakeLoading(true);
      const data = await testApiService.getFlakeDetection({
        timeRangeDays: parseInt(timeRange, 10),
        suite: suite || undefined,
      });
      setFlakeData(data as unknown as FlakeDetectionData);
    } catch (err) {
      console.error('Error loading flake detection:', err);
      setFlakeData(null);
    } finally {
      setFlakeLoading(false);
    }
  }, [testApiService, timeRange, suite]);

  const loadPerformanceDrift = useCallback(async () => {
    try {
      setPerformanceLoading(true);
      const data = await testApiService.getPerformanceDrift({
        baselineWindowDays: parseInt(timeRange, 10),
        thresholdPercent: 20,
        suite: suite || undefined,
        branch: branch || undefined,
        env: env || undefined,
      });
      setPerformanceData(data);
    } catch (err) {
      console.error('Error loading performance drift:', err);
      setPerformanceData(null);
    } finally {
      setPerformanceLoading(false);
    }
  }, [testApiService, timeRange, suite, branch, env]);

  const loadWhatBrokeWhen = useCallback(async () => {
    try {
      setWhatBrokeLoading(true);
      const data = await testApiService.getWhatBrokeWhen({
        timeRangeDays: parseInt(timeRange, 10),
        suite: suite || undefined,
        branch: branch || undefined,
      });
      setWhatBrokeData(data as unknown as WhatBrokeWhenData);
    } catch (err) {
      console.error('Error loading what broke when:', err);
      setWhatBrokeData(null);
    } finally {
      setWhatBrokeLoading(false);
    }
  }, [testApiService, timeRange, suite, branch]);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadTrends(),
        loadFlakeDetection(),
        loadPerformanceDrift(),
        loadWhatBrokeWhen(),
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('toastMessages.failedToLoadData');
      setError(errorMessage);
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [loadTrends, loadFlakeDetection, loadPerformanceDrift, loadWhatBrokeWhen]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('testTrends.title')}</h1>
          <p className="text-gray-600 mt-1">{t('testTrends.description')}</p>
        </div>
        <Button onClick={loadAllData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {t('testTrends.refresh')}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('testTrends.filters')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t('testTrends.timeRange')}</label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="7">{t('testTrends.lastDays').replace('{{days}}', '7')}</option>
                <option value="14">{t('testTrends.lastDays').replace('{{days}}', '14')}</option>
                <option value="30">{t('testTrends.lastDays').replace('{{days}}', '30')}</option>
                <option value="60">{t('testTrends.lastDays').replace('{{days}}', '60')}</option>
                <option value="90">{t('testTrends.lastDays').replace('{{days}}', '90')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t('testTrends.testSuite')}</label>
              <select
                value={suite}
                onChange={(e) => setSuite(e.target.value)}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="">{t('testTrends.allSuites')}</option>
                <option value="unit">Unit</option>
                <option value="component">Component</option>
                <option value="integration">Integration</option>
                <option value="contract">Contract</option>
                <option value="e2e">End-to-end</option>
                <option value="smoke">Smoke</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t('testTrends.branch')}</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="e.g., main"
                className="border rounded px-3 py-1 text-sm w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{t('testTrends.environment')}</label>
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="">{t('testTrends.allEnvironments')}</option>
                <option value="ci">CI</option>
                <option value="local">Local</option>
                <option value="staging">Staging</option>
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

      {/* Test Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('testTrends.passFailTrends')}
            {trendsData && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                {t('testTrends.passRate')} {trendsData.summary.passRate.toFixed(1)}%
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : trendsData && trendsData.dailyTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={trendsData.dailyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="passed"
                  stroke="#10b981"
                  strokeWidth={2}
                  name={t('testTrends.passed')}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name={t('testTrends.failed')}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="skipped"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name={t('testTrends.skipped')}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>{t('testTrends.noTrendsData')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flake Detection Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('testTrends.flakeDetection')}</CardTitle>
        </CardHeader>
        <CardContent>
          {flakeLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : flakeData ? (
            flakeData.flakyTests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{t('testTrends.noFlakyTests')}</p>
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.testIdSuite')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.totalRuns')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.passRate')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.flakeRate')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.recentFailures')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flakeData.flakyTests.map((test, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3">{test.test_id || test.suite || t('common.unknown')}</td>
                          <td className="p-3">{test.total_runs}</td>
                          <td className="p-3">{(test.pass_rate * 100).toFixed(1)}%</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${
                                test.flake_rate > 0.5
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {(test.flake_rate * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3">{test.recent_failures}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  {t('testTrends.totalFlakyTests')} {flakeData.totalFlakyTests}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>{t('testTrends.failedToLoadFlake')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Drift Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('testTrends.performanceDrift')}</CardTitle>
        </CardHeader>
        <CardContent>
          {performanceLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : performanceData ? (
            performanceData.summary.total_tests_analyzed === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{t('testTrends.noTestData')}</p>
              </div>
            ) : performanceData.regressions.length === 0 && performanceData.warnings.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{t('testTrends.noRegressions')}</p>
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.testIdSuite')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.currentDuration')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.baselineDuration')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.increase')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.status')}</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">{t('testTrends.trend')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...performanceData.regressions, ...performanceData.warnings].map((test, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3">{test.test_id || test.suite || t('common.unknown')}</td>
                          <td className="p-3">{test.current_duration.toFixed(0)}ms</td>
                          <td className="p-3">{test.baseline_duration.toFixed(0)}ms</td>
                          <td className="p-3">{test.increase_percent.toFixed(1)}%</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${
                                test.status === 'regression'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {test.status}
                            </span>
                          </td>
                          <td className="p-3">{test.trend}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  {t('testTrends.regressions')} {performanceData.summary.total_regressions} | {t('testTrends.warnings')} {performanceData.summary.total_warnings}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>{t('testTrends.failedToLoadPerformance')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What Broke When Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('testTrends.whatBrokeWhen')}</CardTitle>
        </CardHeader>
        <CardContent>
          {whatBrokeLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : whatBrokeData ? (
            !whatBrokeData.breakTimeline || whatBrokeData.breakTimeline.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{t('testTrends.noFailuresInRange')}</p>
              </div>
            ) : (
              <div>
                <div className="mb-4 text-sm text-gray-600">
                  {t('testTrends.totalFailures')} {whatBrokeData.summary.totalFailures} | {t('testTrends.uniqueCommits')} {whatBrokeData.summary.uniqueCommits} | {t('testTrends.uniqueTests')} {whatBrokeData.summary.uniqueTests}
                </div>
                <div className="space-y-3">
                  {whatBrokeData.breakTimeline.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-gray-50 border border-gray-200 rounded-lg border-l-4 border-l-red-500"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-base">
                            {t('testTrends.commit')} {entry.git_sha.substring(0, 7)}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {t('testTrends.branch')} {entry.branch} | {new Date(entry.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                          {entry.failureCount} {t('testTrends.failures')}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="text-xs text-gray-600 mb-2">{t('testTrends.failedTests')}</div>
                        <div className="flex flex-wrap gap-2">
                          {entry.failures.map((f, fIdx) => (
                            <span
                              key={fIdx}
                              className="px-2 py-1 bg-white border border-gray-200 rounded text-xs"
                            >
                              {f.test_id || f.suite || t('common.unknown')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>{t('testTrends.failedToLoadTimeline')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
