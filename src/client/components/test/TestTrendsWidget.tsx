/**
 * Test Trends Widget
 * 
 * Displays test trends over time with visual charts.
 */

import { useEffect, useState, useCallback } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TestTrendsWidgetProps {
  testApiService?: TestApiService;
  timeRangeDays?: number;
}

interface TrendData {
  date: string;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
}

export function TestTrendsWidget({ testApiService: injectedTestApiService, timeRangeDays = 30 }: TestTrendsWidgetProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrends = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const dashboardData = await testApi.getDashboardData(100, 0);
      const recentRuns = dashboardData.recentRuns || [];

      // Group by date
      const dailyStats = new Map<string, {
        date: string;
        passed: number;
        failed: number;
        skipped: number;
        total: number;
      }>();

      recentRuns.forEach((run) => {
        if (!run.timestamp) return;
        const dateKey = new Date(run.timestamp).toISOString().split('T')[0];
        const existing = dailyStats.get(dateKey) || {
          date: dateKey,
          passed: 0,
          failed: 0,
          skipped: 0,
          total: 0,
        };

        existing.passed += run.results?.passed || 0;
        existing.failed += run.results?.failed || 0;
        existing.skipped += run.results?.skipped || 0;
        existing.total += run.results?.total || 0;

        dailyStats.set(dateKey, existing);
      });

      // Convert to array and calculate pass rates
      const trendData: TrendData[] = Array.from(dailyStats.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(stats => ({
          date: stats.date,
          passed: stats.passed,
          failed: stats.failed,
          skipped: stats.skipped,
          passRate: stats.total > 0 ? (stats.passed / stats.total) * 100 : 0,
        }));

      setTrends(trendData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load trends';
      setError(errorMessage);
      console.error('Error loading trends:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeRangeDays]);

  useEffect(() => {
    loadTrends();
    // Refresh every 5 minutes
    const interval = setInterval(loadTrends, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadTrends]);

  // Calculate overall trend
  const overallTrend = trends.length >= 2
    ? (() => {
        const first = trends[0].passRate;
        const last = trends[trends.length - 1].passRate;
        const change = last - first;
        if (change > 1) return { direction: 'improving' as const, change };
        if (change < -1) return { direction: 'declining' as const, change };
        return { direction: 'stable' as const, change };
      })()
    : null;

  if (loading && trends.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <BarChart3 className="w-8 h-8 animate-spin text-muted-foreground" />
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

  if (trends.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">No trend data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Test Trends
          </CardTitle>
          {overallTrend && (
            <div className="flex items-center gap-2">
              {overallTrend.direction === 'improving' && (
                <TrendingUp className="w-4 h-4 text-green-600" />
              )}
              {overallTrend.direction === 'declining' && (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              {overallTrend.direction === 'stable' && (
                <Minus className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={`text-sm font-medium ${
                overallTrend.direction === 'improving' ? 'text-green-600 dark:text-green-400' :
                overallTrend.direction === 'declining' ? 'text-destructive' :
                'text-muted-foreground'
              }`}>
                {overallTrend.change >= 0 ? '+' : ''}{overallTrend.change.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              label={{ value: 'Pass Rate (%)', angle: -90, position: 'insideLeft' }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(1)}%`}
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
            <Line
              type="monotone"
              dataKey="passed"
              stroke="#22c55e"
              strokeWidth={1}
              name="Passed"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="failed"
              stroke="#ef4444"
              strokeWidth={1}
              name="Failed"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {trends.reduce((sum, t) => sum + t.passed, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Passed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-destructive">
              {trends.reduce((sum, t) => sum + t.failed, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {trends.length > 0
                ? (trends.reduce((sum, t) => sum + t.passRate, 0) / trends.length).toFixed(1)
                : 0}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Pass Rate</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

