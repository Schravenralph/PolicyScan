/**
 * Test Run Timeline Component
 * 
 * Visualizes test run history as a timeline with trends and patterns.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Calendar, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

interface TestRunTimelineProps {
  testApiService?: TestApiService;
  testId?: string;
  timeRangeDays?: number;
  limit?: number;
}

interface TimelineRun {
  runId: string;
  timestamp: string;
  passRate: number;
  duration: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  testType?: string;
  branch?: string;
}

export function TestRunTimeline({ testApiService: injectedTestApiService, testId, timeRangeDays: _timeRangeDays = 30, limit = 50 }: TestRunTimelineProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [runs, setRuns] = useState<TimelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (testId) {
        // Get runs for specific test
        const data = await testApi.getTestRuns(testId, { limit });
        setRuns(data.runs.map(run => ({
          runId: run.runId || run.id || '',
          timestamp: run.executionTimestamp || run.timestamp || '',
          passRate: run.summary?.passRate || 0,
          duration: typeof run.duration === 'number' ? run.duration : 0,
          total: run.summary?.total || 0,
          passed: run.summary?.passed || 0,
          failed: run.summary?.failed || 0,
          skipped: run.summary?.skipped || 0,
          testType: run.testType,
          branch: run.git?.branch,
        })));
      } else {
        // Get recent runs
        const dashboardData = await testApi.getDashboardData(limit);
        setRuns(dashboardData.recentRuns.map(run => ({
          runId: run.id || '',
          timestamp: run.timestamp || '',
          passRate: run.results ? ((run.results.passed || 0) / (run.results.total || 1)) * 100 : 0,
          duration: typeof (run.results?.duration || 0) === 'number' ? (run.results?.duration || 0) : 0,
          total: run.results?.total || 0,
          passed: run.results?.passed || 0,
          failed: run.results?.failed || 0,
          skipped: run.results?.skipped || 0,
          testType: run.testType,
        })));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load timeline';
      setError(errorMessage);
      console.error('Error loading timeline:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, testId, limit]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const trendData = useMemo(() => {
    if (runs.length < 2) return null;

    const sortedRuns = [...runs].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const first = sortedRuns[0];
    const last = sortedRuns[sortedRuns.length - 1];

    const passRateTrend = last.passRate - first.passRate;
    const durationTrend = last.duration - first.duration;
    const durationTrendPercent = first.duration > 0 
      ? ((durationTrend / first.duration) * 100) 
      : 0;

    return {
      passRate: {
        change: passRateTrend,
        changePercent: first.passRate > 0 ? (passRateTrend / first.passRate) * 100 : 0,
        direction: passRateTrend > 1 ? 'improving' : passRateTrend < -1 ? 'declining' : 'stable',
      },
      duration: {
        change: durationTrend,
        changePercent: durationTrendPercent,
        direction: durationTrendPercent > 5 ? 'slower' : durationTrendPercent < -5 ? 'faster' : 'stable',
      },
    };
  }, [runs]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

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
          <div className="text-center text-red-600">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">No test runs found</div>
        </CardContent>
      </Card>
    );
  }

  const sortedRuns = [...runs].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Test Run Timeline
          </CardTitle>
          {trendData && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Pass Rate:</span>
                {trendData.passRate.direction === 'improving' && (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                )}
                {trendData.passRate.direction === 'declining' && (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                {trendData.passRate.direction === 'stable' && (
                  <Minus className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={trendData.passRate.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {trendData.passRate.change >= 0 ? '+' : ''}{trendData.passRate.change.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Duration:</span>
                {trendData.duration.direction === 'faster' && (
                  <TrendingDown className="w-4 h-4 text-green-600" />
                )}
                {trendData.duration.direction === 'slower' && (
                  <TrendingUp className="w-4 h-4 text-red-600" />
                )}
                {trendData.duration.direction === 'stable' && (
                  <Minus className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={trendData.duration.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}>
                  {trendData.duration.changePercent >= 0 ? '+' : ''}{trendData.duration.changePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedRuns.map((run, idx) => {
            const prevRun = idx < sortedRuns.length - 1 ? sortedRuns[idx + 1] : null;
            const passRateChange = prevRun ? run.passRate - prevRun.passRate : 0;
            const durationChange = prevRun ? run.duration - prevRun.duration : 0;

            return (
              <div key={run.runId} className="flex items-start gap-4 pb-4 border-b last:border-0">
                <div className="flex-shrink-0 mt-1">
                  {run.passRate >= 95 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : run.passRate >= 80 ? (
                    <Clock className="w-5 h-5 text-yellow-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {new Date(run.timestamp).toLocaleString()}
                      </span>
                      {run.testType && (
                        <Badge variant="outline" className="text-xs">
                          {run.testType}
                        </Badge>
                      )}
                      {run.branch && (
                        <Badge variant="outline" className="text-xs">
                          {run.branch}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDuration(run.duration)}</span>
                      {prevRun && (
                        <span className={durationChange >= 0 ? 'text-red-600' : 'text-green-600'}>
                          {durationChange >= 0 ? '+' : ''}{formatDuration(Math.abs(durationChange))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total:</span>{' '}
                      <span className="font-medium">{run.total}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Passed:</span>{' '}
                      <span className="font-medium text-green-600">{run.passed}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Failed:</span>{' '}
                      <span className="font-medium text-red-600">{run.failed}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Skipped:</span>{' '}
                      <span className="font-medium text-yellow-600">{run.skipped}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-green-600 h-full"
                        style={{ width: `${(run.passed / run.total) * 100}%` }}
                      />
                      <div
                        className="bg-red-600 h-full"
                        style={{ width: `${(run.failed / run.total) * 100}%` }}
                      />
                      <div
                        className="bg-yellow-600 h-full"
                        style={{ width: `${(run.skipped / run.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">
                      {run.passRate.toFixed(1)}%
                    </span>
                    {prevRun && passRateChange !== 0 && (
                      <span className={`text-xs ${
                        passRateChange >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {passRateChange >= 0 ? '+' : ''}{passRateChange.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

