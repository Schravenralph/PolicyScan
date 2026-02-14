/**
 * Test Performance Profiler
 * 
 * Detailed performance analysis and profiling for test runs.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Clock, TrendingUp, Zap, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { t } from '../../utils/i18n';

interface TestPerformanceProfilerProps {
  testApiService?: TestApiService;
  testId?: string;
  timeRangeDays?: number;
}

interface PerformanceData {
  averageDuration: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  totalRuns: number;
  trends: Array<{
    date: string;
    duration: number;
    p50: number;
    p90: number;
    p95: number;
  }>;
  slowestTests: Array<{
    testId: string;
    testName: string;
    avgDuration: number;
    maxDuration: number;
    runCount: number;
  }>;
}

export function TestPerformanceProfiler({ testApiService: injectedTestApiService, testId, timeRangeDays = 30 }: TestPerformanceProfilerProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPerformanceData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await testApi.getPerformanceTrends({
        timeRangeDays,
        includeRegressions: true,
      }) as unknown as PerformanceData;

      setPerformanceData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load performance data';
      setError(errorMessage);
      console.error('Error loading performance data:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeRangeDays, testId]);

  useEffect(() => {
    loadPerformanceData();
  }, [loadPerformanceData]);

  // Calculate performance insights
  const insights = useMemo(() => {
    if (!performanceData) return null;

    const { averageDuration, trends } = performanceData;

    // Check for regressions
    const recentTrends = trends.slice(0, Math.min(10, trends.length));
    const olderTrends = trends.slice(Math.min(10, trends.length));

    const recentAvg = recentTrends.length > 0
      ? recentTrends.reduce((sum, t) => sum + t.duration, 0) / recentTrends.length
      : averageDuration;

    const olderAvg = olderTrends.length > 0
      ? olderTrends.reduce((sum, t) => sum + t.duration, 0) / olderTrends.length
      : averageDuration;

    const regression = recentAvg > olderAvg * 1.2; // 20% increase
    const improvement = recentAvg < olderAvg * 0.8; // 20% decrease

    // Identify slow tests
    const slowTests = performanceData.slowestTests.filter(t => t.avgDuration > averageDuration * 2);

    return {
      regression,
      improvement,
      slowTests,
      recentAvg,
      olderAvg,
      changePercent: ((recentAvg - olderAvg) / olderAvg) * 100,
    };
  }, [performanceData]);

  if (loading && !performanceData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Clock className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!performanceData) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(performanceData.averageDuration / 1000).toFixed(1)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">P50 (Median)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(performanceData.p50 / 1000).toFixed(1)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">P90</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(performanceData.p90 / 1000).toFixed(1)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">P95</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(performanceData.p95 / 1000).toFixed(1)}s</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">P99</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(performanceData.p99 / 1000).toFixed(1)}s</div>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.regression && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <div className="font-medium text-yellow-900 dark:text-yellow-100">{t('common.performanceRegressionDetected')}</div>
                    <div className="text-sm text-yellow-700 dark:text-yellow-300">
                      {t('common.averageDurationIncreased')} {Math.abs(insights.changePercent).toFixed(1)}% {t('common.comparedToPreviousPeriod')}
                    </div>
                  </div>
                </div>
              )}
              {insights.improvement && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-100">Performance Improvement</div>
                    <div className="text-sm text-green-700 dark:text-green-300">
                      Average duration decreased by {Math.abs(insights.changePercent).toFixed(1)}% compared to previous period
                    </div>
                  </div>
                </div>
              )}
              {insights.slowTests.length > 0 && (
                <div>
                  <div className="font-medium mb-2">Slow Tests ({insights.slowTests.length})</div>
                  <div className="space-y-2">
                    {insights.slowTests.slice(0, 5).map((test) => (
                      <div key={test.testId} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">{test.testName || test.testId}</span>
                        <Badge variant="outline">{(test.avgDuration / 1000).toFixed(1)}s avg</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="percentiles">Percentiles</TabsTrigger>
          <TabsTrigger value="slowest">Slowest Tests</TabsTrigger>
        </TabsList>
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={performanceData.trends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    label={{ value: 'Duration (ms)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    formatter={(value: number) => `${(value / 1000).toFixed(1)}s`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="duration"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Average Duration"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="#10b981"
                    strokeWidth={1}
                    name="P50"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p90"
                    stroke="#eab308"
                    strokeWidth={1}
                    name="P90"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p95"
                    stroke="#f59e0b"
                    strokeWidth={1}
                    name="P95"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="percentiles">
          <Card>
            <CardHeader>
              <CardTitle>Percentile Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={[
                  { name: 'P50', value: performanceData.p50 },
                  { name: 'P90', value: performanceData.p90 },
                  { name: 'P95', value: performanceData.p95 },
                  { name: 'P99', value: performanceData.p99 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis
                    label={{ value: 'Duration (ms)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    formatter={(value: number) => `${(value / 1000).toFixed(1)}s`}
                  />
                  <Bar dataKey="value">
                    {[
                      { name: 'P50', value: performanceData.p50 },
                      { name: 'P90', value: performanceData.p90 },
                      { name: 'P95', value: performanceData.p95 },
                      { name: 'P99', value: performanceData.p99 },
                    ].map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={
                        index === 0 ? '#10b981' :
                        index === 1 ? '#eab308' :
                        index === 2 ? '#f59e0b' :
                        '#ef4444'
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="slowest">
          <Card>
            <CardHeader>
              <CardTitle>Slowest Tests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {performanceData.slowestTests.slice(0, 20).map((test) => (
                  <div key={test.testId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{test.testName || test.testId}</div>
                      <div className="text-sm text-muted-foreground">
                        {test.runCount} runs
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{(test.avgDuration / 1000).toFixed(1)}s</div>
                      <div className="text-sm text-muted-foreground">
                        max: {(test.maxDuration / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

