/**
 * Test Health Score Widget
 * 
 * Displays overall test health score with breakdown by category.
 */

import { useEffect, useState, useCallback } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Activity, TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';

interface TestHealthScoreWidgetProps {
  testApiService?: TestApiService;
  timeRangeDays?: number;
}

interface HealthScore {
  overall: number; // 0-100
  categories: {
    passRate: number;
    stability: number;
    performance: number;
    coverage: number;
  };
  trends: {
    passRate: 'improving' | 'declining' | 'stable';
    stability: 'improving' | 'declining' | 'stable';
    performance: 'improving' | 'declining' | 'stable';
  };
}

export function TestHealthScoreWidget({ testApiService: injectedTestApiService, timeRangeDays = 30 }: TestHealthScoreWidgetProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealthScore = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get dashboard data and statistics
      const [dashboardData] = await Promise.all([
        testApi.getDashboardData(100, 0),
        testApi.getTestStatistics({ timeRangeDays }),
      ]);

      // Calculate health score
      const recentRuns = dashboardData.recentRuns || [];
      const totalRuns = recentRuns.length;
      
      if (totalRuns === 0) {
        setHealthScore({
          overall: 0,
          categories: {
            passRate: 0,
            stability: 0,
            performance: 0,
            coverage: 0,
          },
          trends: {
            passRate: 'stable',
            stability: 'stable',
            performance: 'stable',
          },
        });
        return;
      }

      // Calculate pass rate score
      const totalTests = recentRuns.reduce((sum, r) => sum + (r.results?.total || 0), 0);
      const totalPassed = recentRuns.reduce((sum, r) => sum + (r.results?.passed || 0), 0);
      const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
      const passRateScore = Math.min(passRate, 100);

      // Calculate stability score (based on flakiness)
      const flakyRuns = recentRuns.filter(r => {
        const failed = r.results?.failed || 0;
        const total = r.results?.total || 0;
        return failed > 0 && (failed / total) < 0.1; // Some failures but not many
      }).length;
      const stabilityScore = Math.max(0, 100 - (flakyRuns / totalRuns) * 100);

      // Calculate performance score (based on duration consistency)
      const durations = recentRuns.map(r => r.results?.duration || 0).filter(d => d > 0);
      const avgDuration = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;
      const durationVariance = durations.length > 0
        ? durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length
        : 0;
      const durationStdDev = Math.sqrt(durationVariance);
      const performanceScore = avgDuration > 0
        ? Math.max(0, 100 - (durationStdDev / avgDuration) * 100)
        : 100;

      // Coverage score (placeholder - would need coverage data)
      const coverageScore = 75; // Default if no coverage data

      // Calculate trends
      const recentHalf = recentRuns.slice(0, Math.floor(totalRuns / 2));
      const olderHalf = recentRuns.slice(Math.floor(totalRuns / 2));

      const recentPassRate = recentHalf.reduce((sum, r) => {
        const total = r.results?.total || 0;
        const passed = r.results?.passed || 0;
        return sum + (total > 0 ? (passed / total) * 100 : 0);
      }, 0) / recentHalf.length;

      const olderPassRate = olderHalf.reduce((sum, r) => {
        const total = r.results?.total || 0;
        const passed = r.results?.passed || 0;
        return sum + (total > 0 ? (passed / total) * 100 : 0);
      }, 0) / olderHalf.length;

      const passRateTrend = recentPassRate > olderPassRate + 1 ? 'improving' :
        recentPassRate < olderPassRate - 1 ? 'declining' : 'stable';

      // Overall score (weighted average)
      const overall = (
        passRateScore * 0.4 +
        stabilityScore * 0.3 +
        performanceScore * 0.2 +
        coverageScore * 0.1
      );

      setHealthScore({
        overall: Math.round(overall),
        categories: {
          passRate: Math.round(passRateScore),
          stability: Math.round(stabilityScore),
          performance: Math.round(performanceScore),
          coverage: coverageScore,
        },
        trends: {
          passRate: passRateTrend,
          stability: 'stable', // Would need more data for accurate trend
          performance: 'stable', // Would need more data for accurate trend
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to calculate health score';
      setError(errorMessage);
      console.error('Error loading health score:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeRangeDays]);

  useEffect(() => {
    loadHealthScore();
    // Refresh every 5 minutes
    const interval = setInterval(loadHealthScore, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadHealthScore]);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };


  if (loading && !healthScore) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Activity className="w-8 h-8 animate-spin text-muted-foreground" />
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

  if (!healthScore) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Test Health Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="text-center">
          <div className={`text-6xl font-bold ${getScoreColor(healthScore.overall)}`}>
            {healthScore.overall}
          </div>
          <div className="text-sm text-muted-foreground mt-1">Overall Health</div>
          <Progress value={healthScore.overall} className="mt-2 h-3" />
        </div>

        {/* Category Breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pass Rate</span>
              <div className="flex items-center gap-1">
                {healthScore.trends.passRate === 'improving' && (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                )}
                {healthScore.trends.passRate === 'declining' && (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm font-bold ${getScoreColor(healthScore.categories.passRate)}`}>
                  {healthScore.categories.passRate}
                </span>
              </div>
            </div>
            <Progress value={healthScore.categories.passRate} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Stability</span>
              <span className={`text-sm font-bold ${getScoreColor(healthScore.categories.stability)}`}>
                {healthScore.categories.stability}
              </span>
            </div>
            <Progress value={healthScore.categories.stability} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Performance</span>
              <span className={`text-sm font-bold ${getScoreColor(healthScore.categories.performance)}`}>
                {healthScore.categories.performance}
              </span>
            </div>
            <Progress value={healthScore.categories.performance} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Coverage</span>
              <span className={`text-sm font-bold ${getScoreColor(healthScore.categories.coverage)}`}>
                {healthScore.categories.coverage}
              </span>
            </div>
            <Progress value={healthScore.categories.coverage} className="h-2" />
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-center pt-2">
          {healthScore.overall >= 80 ? (
            <Badge className="bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Healthy
            </Badge>
          ) : healthScore.overall >= 60 ? (
            <Badge className="bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200">
              <AlertCircle className="w-3 h-3 mr-1" />
              Needs Attention
            </Badge>
          ) : (
            <Badge className="bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200">
              <AlertCircle className="w-3 h-3 mr-1" />
              Critical
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

