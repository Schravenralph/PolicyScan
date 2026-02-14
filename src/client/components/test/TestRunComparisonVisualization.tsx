/**
 * Test Run Comparison Visualization
 * 
 * Visual comparison of two or more test runs with side-by-side metrics.
 */

import { useState, useMemo } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { t } from '../../utils/i18n';

interface TestRun {
  id: string;
  timestamp: string;
  testFile?: string;
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
}

interface TestRunComparisonVisualizationProps {
  runs: TestRun[];
  maxRuns?: number;
}

export function TestRunComparisonVisualization({ runs, maxRuns = 5 }: TestRunComparisonVisualizationProps) {
  const [selectedMetric, setSelectedMetric] = useState<'passRate' | 'duration' | 'total'>('passRate');

  // Limit runs to compare
  const runsToCompare = useMemo(() => {
    return runs.slice(0, maxRuns).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [runs, maxRuns]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return runsToCompare.map((run, index) => {
      const passRate = run.results.total > 0
        ? (run.results.passed / run.results.total) * 100
        : 0;

      return {
        name: run.testFile || `Run ${index + 1}`,
        runId: run.id,
        timestamp: new Date(run.timestamp).toLocaleDateString(),
        passRate: passRate.toFixed(1),
        duration: (run.results.duration / 1000).toFixed(1),
        total: run.results.total,
        passed: run.results.passed,
        failed: run.results.failed,
        skipped: run.results.skipped,
      };
    });
  }, [runsToCompare]);

  // Calculate differences between runs
  const comparisons = useMemo(() => {
    if (runsToCompare.length < 2) return [];

    const comparisons = [];
    for (let i = 0; i < runsToCompare.length - 1; i++) {
      const current = runsToCompare[i];
      const previous = runsToCompare[i + 1];

      const currentPassRate = current.results.total > 0
        ? (current.results.passed / current.results.total) * 100
        : 0;
      const previousPassRate = previous.results.total > 0
        ? (previous.results.passed / previous.results.total) * 100
        : 0;

      const passRateChange = currentPassRate - previousPassRate;
      const durationChange = current.results.duration - previous.results.duration;
      const totalChange = current.results.total - previous.results.total;

      comparisons.push({
        from: previous.testFile || previous.id,
        to: current.testFile || current.id,
        passRateChange,
        durationChange,
        totalChange,
        direction: passRateChange > 1 ? 'improving' : passRateChange < -1 ? 'declining' : 'stable',
      });
    }

    return comparisons;
  }, [runsToCompare]);

  if (runsToCompare.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">No test runs to compare</div>
        </CardContent>
      </Card>
    );
  }

  const getMetricValue = (data: typeof chartData[0]): number => {
    switch (selectedMetric) {
      case 'passRate':
        return parseFloat(data.passRate);
      case 'duration':
        return parseFloat(data.duration);
      case 'total':
        return data.total;
      default:
        return 0;
    }
  };

  const getMetricLabel = (): string => {
    switch (selectedMetric) {
      case 'passRate':
        return 'Pass Rate (%)';
      case 'duration':
        return 'Duration (s)';
      case 'total':
        return 'Total Tests';
      default:
        return '';
    }
  };

  const getBarColor = (value: number): string => {
    if (selectedMetric === 'passRate') {
      if (value >= 95) return '#10b981';
      if (value >= 80) return '#eab308';
      return '#ef4444';
    }
    if (selectedMetric === 'duration') {
      // Lower is better for duration
      const max = Math.max(...chartData.map(d => parseFloat(d.duration)));
      const ratio = value / max;
      if (ratio <= 0.5) return '#10b981';
      if (ratio <= 0.75) return '#eab308';
      return '#ef4444';
    }
    return '#3b82f6';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Test Run Comparison
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant={selectedMetric === 'passRate' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMetric('passRate')}
              >
                Pass Rate
              </Button>
              <Button
                variant={selectedMetric === 'duration' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMetric('duration')}
              >
                Duration
              </Button>
              <Button
                variant={selectedMetric === 'total' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedMetric('total')}
              >
                Total Tests
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{ value: getMetricLabel(), angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={(value: number) => {
                  if (selectedMetric === 'passRate') return `${value.toFixed(1)}%`;
                  if (selectedMetric === 'duration') return `${value.toFixed(1)}s`;
                  return value.toString();
                }}
                labelFormatter={(label, payload) => {
                  const data = payload?.[0]?.payload;
                  return data ? `${data.name} - ${data.timestamp}` : label;
                }}
              />
              <Legend />
              <Bar dataKey={selectedMetric === 'passRate' ? 'passRate' : selectedMetric === 'duration' ? 'duration' : 'total'}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(getMetricValue(entry))} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Side-by-side comparison */}
      {runsToCompare.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {runsToCompare.map((run, index) => {
            const passRate = run.results.total > 0
              ? (run.results.passed / run.results.total) * 100
              : 0;

            const previousRun = index < runsToCompare.length - 1 ? runsToCompare[index + 1] : null;
            const comparison = previousRun ? comparisons[index] : null;

            return (
              <Card key={run.id}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {run.testFile || `Run ${index + 1}`}
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">
                    {new Date(run.timestamp).toLocaleString()}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Tests</div>
                      <div className="text-2xl font-bold">{run.results.total}</div>
                      {comparison && (
                        <div className={`text-xs ${
                          comparison.totalChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {comparison.totalChange >= 0 ? '+' : ''}{comparison.totalChange}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Pass Rate</div>
                      <div className={`text-2xl font-bold ${
                        passRate >= 95 ? 'text-green-600' :
                        passRate >= 80 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {passRate.toFixed(1)}%
                      </div>
                      {comparison && (
                        <div className={`text-xs flex items-center gap-1 ${
                          comparison.passRateChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {comparison.passRateChange >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {comparison.passRateChange >= 0 ? '+' : ''}{comparison.passRateChange.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-green-50 rounded">
                      <div className="text-sm text-muted-foreground">Passed</div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">{run.results.passed}</div>
                    </div>
                    <div className="text-center p-2 bg-red-50 dark:bg-red-950/30 rounded">
                      <div className="text-sm text-muted-foreground">Failed</div>
                      <div className="text-lg font-bold text-destructive">{run.results.failed}</div>
                    </div>
                    <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded">
                      <div className="text-sm text-muted-foreground">Skipped</div>
                      <div className="text-lg font-bold text-yellow-600">{run.results.skipped}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                    <div className="text-lg font-bold">{(run.results.duration / 1000).toFixed(1)}s</div>
                    {comparison && (
                      <div className={`text-xs ${
                        comparison.durationChange <= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {comparison.durationChange <= 0 ? '-' : '+'}
                        {(Math.abs(comparison.durationChange) / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>

                  {comparison && index === 0 && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        <ArrowRight className="w-4 h-4" />
                        <span className="text-muted-foreground">{t('test.comparedToPreviousRun')}</span>
                        <Badge className={
                          comparison.direction === 'improving' ? 'bg-green-100 text-green-800' :
                          comparison.direction === 'declining' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }>
                          {comparison.direction}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

