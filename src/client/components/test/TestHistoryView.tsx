/**
 * Test History View
 * 
 * Enhanced test history visualization with advanced filtering and analysis.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Clock, CheckCircle2, XCircle, SkipForward } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TestHistoryStatistics } from './TestHistoryStatistics';
import { TestHistoryFilters } from './TestHistoryFilters';
import { t } from '../../utils/i18n';

interface TestHistoryViewProps {
  testApiService?: TestApiService;
  testId?: string;
  timeRangeDays?: number;
  limit?: number;
}

interface TestRun {
  id: string;
  runId?: string;
  timestamp: string;
  executionTimestamp?: string;
  testType?: string;
  branch?: string;
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
  git?: {
    branch?: string;
    commit?: string;
  };
}

export function TestHistoryView({ testApiService: injectedTestApiService, testId, timeRangeDays: _timeRangeDays = 30, limit = 100 }: TestHistoryViewProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'duration' | 'passRate'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'chart' | 'timeline'>('list');

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (testId) {
        const data = await testApi.getTestRuns(testId, { limit });
        if (!data || !data.runs || !Array.isArray(data.runs)) {
          setRuns([]);
          return;
        }
        setRuns(data.runs.map(run => ({
          id: run.runId || run.id || '',
          runId: run.runId || run.id || '',
          timestamp: run.executionTimestamp || run.timestamp || '',
          executionTimestamp: run.executionTimestamp || run.timestamp || '',
          testType: run.testType,
          branch: run.git?.branch,
          results: {
            total: run.summary?.total || 0,
            passed: run.summary?.passed || 0,
            failed: run.summary?.failed || 0,
            skipped: run.summary?.skipped || 0,
            duration: typeof run.duration === 'number' ? run.duration : 0,
          },
          summary: run.summary,
          git: run.git,
        } as TestRun)));
      } else {
        const dashboardData = await testApi.getDashboardData(limit, 0);
        if (!dashboardData) {
          setRuns([]);
          setError(t('test.noDashboardDataAvailable'));
          return;
        }
        if (!dashboardData.recentRuns || !Array.isArray(dashboardData.recentRuns)) {
          setRuns([]);
          if (dashboardData.totalRuns === 0) {
            setError(t('test.noTestRunsFound'));
          } else {
            setError(t('test.invalidDataFormat'));
          }
          return;
        }
        setRuns(dashboardData.recentRuns.map(run => ({
          id: run.id || run.runId || '',
          runId: run.id || run.runId || '',
          timestamp: run.timestamp || run.executionTimestamp || '',
          executionTimestamp: run.timestamp || run.executionTimestamp || '',
          testType: run.testType,
          branch: run.git?.branch,
          results: {
            total: run.results?.total || run.summary?.total || 0,
            passed: run.results?.passed || run.summary?.passed || 0,
            failed: run.results?.failed || run.summary?.failed || 0,
            skipped: run.results?.skipped || run.summary?.skipped || 0,
            duration: typeof (run.results?.duration || run.duration) === 'number' ? (run.results?.duration || run.duration || 0) : 0,
          },
          summary: {
            total: run.results?.total || run.summary?.total || 0,
            passed: run.results?.passed || run.summary?.passed || 0,
            failed: run.results?.failed || run.summary?.failed || 0,
            skipped: run.results?.skipped || run.summary?.skipped || 0,
            passRate: (run.results?.total || run.summary?.total || 0) > 0 
              ? ((run.results?.passed || run.summary?.passed || 0) / (run.results?.total || run.summary?.total || 0)) * 100 
              : 0,
          },
          git: run.git,
        } as TestRun)));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('test.failedToLoadHistory');
      setError(errorMessage);
      console.error('Error loading test history:', err);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [testApi, testId, limit]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Filter and sort runs
  const filteredAndSortedRuns = useMemo(() => {
    let filtered = [...runs];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(run =>
        run.id.toLowerCase().includes(query) ||
        run.testType?.toLowerCase().includes(query) ||
        run.branch?.toLowerCase().includes(query) ||
        run.git?.commit?.toLowerCase().includes(query)
      );
    }

    // Test type filter
    if (testTypeFilter !== 'all') {
      filtered = filtered.filter(run => run.testType === testTypeFilter);
    }

    // Branch filter
    if (branchFilter !== 'all') {
      filtered = filtered.filter(run => run.branch === branchFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'passed') {
        filtered = filtered.filter(run => run.results.failed === 0 && run.results.total > 0);
      } else if (statusFilter === 'failed') {
        filtered = filtered.filter(run => run.results.failed > 0);
      } else if (statusFilter === 'partial') {
        filtered = filtered.filter(run => run.results.failed > 0 && run.results.passed > 0);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      if (sortBy === 'timestamp') {
        aValue = new Date(a.timestamp).getTime();
        bValue = new Date(b.timestamp).getTime();
      } else if (sortBy === 'duration') {
        aValue = a.results.duration;
        bValue = b.results.duration;
      } else {
        const aPassRate = a.results.total > 0 ? (a.results.passed / a.results.total) * 100 : 0;
        const bPassRate = b.results.total > 0 ? (b.results.passed / b.results.total) * 100 : 0;
        aValue = aPassRate;
        bValue = bPassRate;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return filtered;
  }, [runs, searchQuery, testTypeFilter, branchFilter, statusFilter, sortBy, sortOrder]);

  // Get unique branches and test types
  const uniqueBranches = useMemo(() => {
    const branches = new Set(runs.map(r => r.branch).filter((b): b is string => Boolean(b)));
    return Array.from(branches).sort();
  }, [runs]);

  const uniqueTestTypes = useMemo(() => {
    const types = new Set(runs.map(r => r.testType).filter((t): t is string => Boolean(t)));
    return Array.from(types).sort();
  }, [runs]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (filteredAndSortedRuns.length === 0) {
      return {
        totalRuns: 0,
        totalTests: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        avgPassRate: 0,
        avgDuration: 0,
        trend: 'stable' as const,
      };
    }

    const totalRuns = filteredAndSortedRuns.length;
    const totalTests = filteredAndSortedRuns.reduce((sum, r) => sum + r.results.total, 0);
    const totalPassed = filteredAndSortedRuns.reduce((sum, r) => sum + r.results.passed, 0);
    const totalFailed = filteredAndSortedRuns.reduce((sum, r) => sum + r.results.failed, 0);
    const totalSkipped = filteredAndSortedRuns.reduce((sum, r) => sum + r.results.skipped, 0);
    const avgPassRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
    const avgDuration = filteredAndSortedRuns.reduce((sum, r) => sum + r.results.duration, 0) / totalRuns;

    // Calculate trend
    const recentHalf = filteredAndSortedRuns.slice(0, Math.floor(totalRuns / 2));
    const olderHalf = filteredAndSortedRuns.slice(Math.floor(totalRuns / 2));

    const recentPassRate = recentHalf.reduce((sum, r) => {
      const passRate = r.results.total > 0 ? (r.results.passed / r.results.total) * 100 : 0;
      return sum + passRate;
    }, 0) / recentHalf.length;

    const olderPassRate = olderHalf.reduce((sum, r) => {
      const passRate = r.results.total > 0 ? (r.results.passed / r.results.total) * 100 : 0;
      return sum + passRate;
    }, 0) / olderHalf.length;

    const trend: 'improving' | 'declining' | 'stable' = recentPassRate > olderPassRate + 1 ? 'improving' : recentPassRate < olderPassRate - 1 ? 'declining' : 'stable';

    return {
      totalRuns,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      avgPassRate,
      avgDuration,
      trend,
    };
  }, [filteredAndSortedRuns]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredAndSortedRuns.slice(0, 50).map(run => {
      const passRate = run.results.total > 0 ? (run.results.passed / run.results.total) * 100 : 0;
      return {
        date: new Date(run.timestamp).toLocaleDateString(),
        timestamp: run.timestamp,
        passRate: passRate.toFixed(1),
        duration: (run.results.duration / 1000).toFixed(1),
        total: run.results.total,
        passed: run.results.passed,
        failed: run.results.failed,
        skipped: run.results.skipped,
      };
    });
  }, [filteredAndSortedRuns]);

  if (loading && runs.length === 0) {
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

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <TestHistoryStatistics statistics={{
        totalRuns: statistics.totalRuns,
        totalTests: statistics.totalTests,
        avgPassRate: statistics.avgPassRate,
        avgDuration: statistics.avgDuration,
        trend: statistics.trend,
      }} />

      {/* Filters */}
      <TestHistoryFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        testTypeFilter={testTypeFilter}
        onTestTypeChange={setTestTypeFilter}
        branchFilter={branchFilter}
        onBranchChange={setBranchFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        uniqueTestTypes={uniqueTestTypes}
        uniqueBranches={uniqueBranches}
      />

      {/* Results */}
      {viewMode === 'chart' && (
        <Card>
          <CardHeader>
            <CardTitle>Pass Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  label={{ value: t('test.passRate'), angle: -90, position: 'insideLeft' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  formatter={(value: number) => `${value}%`}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Pass Rate (%)"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {viewMode === 'list' && (
        <div className="space-y-2">
          {filteredAndSortedRuns.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-8">
                  No test runs found matching the filters
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredAndSortedRuns.map((run) => {
              const passRate = run.results.total > 0 ? (run.results.passed / run.results.total) * 100 : 0;
              return (
                <Card key={run.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-sm">{run.id.substring(0, 8)}</span>
                          {run.testType && <Badge variant="outline">{run.testType}</Badge>}
                          {run.branch && <Badge variant="outline">{run.branch}</Badge>}
                          <span className="text-sm text-muted-foreground">
                            {new Date(run.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <div className="text-sm text-muted-foreground">Total</div>
                            <div className="text-lg font-bold">{run.results.total}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              Passed
                            </div>
                            <div className="text-lg font-bold text-green-600">{run.results.passed}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-red-600" />
                              Failed
                            </div>
                            <div className="text-lg font-bold text-red-600">{run.results.failed}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <SkipForward className="w-3 h-3 text-yellow-600" />
                              Skipped
                            </div>
                            <div className="text-lg font-bold text-yellow-600">{run.results.skipped}</div>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <div className="text-sm text-muted-foreground">Pass Rate</div>
                        <div className={`text-2xl font-bold ${
                          passRate >= 95 ? 'text-green-600' :
                          passRate >= 80 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {passRate.toFixed(1)}%
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {(run.results.duration / 1000).toFixed(1)}s
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


