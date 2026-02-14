/**
 * Test Recommendations Page
 * 
 * Displays actionable recommendations for improving test quality, stability, and coverage.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { TestApiService } from '../services/api/TestApiService';
import { RefreshCw, AlertCircle, TrendingUp, Target, Lightbulb, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { Badge } from '../components/ui/badge';

interface TestRecommendationsPageProps {
  testApiService?: TestApiService;
}

interface Recommendation {
  id: string;
  type: 'coverage' | 'stability' | 'performance' | 'maintenance' | 'flakiness' | 'best-practice';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  actionItems: string[];
  relatedTests?: string[];
  metrics?: Record<string, unknown>;
}

interface RecommendationsData {
  recommendations: Recommendation[];
  summary: {
    total: number;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
  };
  timestamp: string;
}

const PRIORITY_COLORS = {
  critical: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800',
  high: 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-800',
  medium: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-800',
  low: 'bg-primary/10 text-primary border-primary/30',
};

const TYPE_ICONS = {
  coverage: Target,
  stability: TrendingUp,
  performance: TrendingUp,
  maintenance: RefreshCw,
  flakiness: AlertCircle,
  'best-practice': Lightbulb,
};

const TYPE_LABELS = {
  coverage: 'Coverage',
  stability: 'Stability',
  performance: 'Performance',
  maintenance: 'Maintenance',
  flakiness: 'Flakiness',
  'best-practice': 'Best Practice',
};

export function TestRecommendationsPage({ testApiService: injectedTestApiService }: TestRecommendationsPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [data, setData] = useState<RecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRangeDays, setTimeRangeDays] = useState(30);
  const [testType, setTestType] = useState<string>('');
  const [branch] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [includeCoverage, setIncludeCoverage] = useState(true);
  const [includeFlakiness, setIncludeFlakiness] = useState(true);
  const [includePerformance, setIncludePerformance] = useState(true);

  const loadRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await testApi.getTestRecommendations({
        timeRangeDays,
        testType: testType || undefined,
        branch: branch || undefined,
        includeCoverage,
        includeFlakiness,
        includePerformance,
      });
      setData(result as unknown as RecommendationsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load recommendations';
      setError(errorMessage);
      console.error('Error loading recommendations:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeRangeDays, testType, branch, includeCoverage, includeFlakiness, includePerformance]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const filteredRecommendations = useMemo(() => {
    if (!data) return [];
    let filtered = [...data.recommendations];

    if (priorityFilter) {
      filtered = filtered.filter(r => r.priority === priorityFilter);
    }

    if (typeFilter) {
      filtered = filtered.filter(r => r.type === typeFilter);
    }

    // Sort by priority (critical > high > medium > low)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return filtered;
  }, [data, priorityFilter, typeFilter]);

  const exportRecommendations = useCallback(() => {
    if (!data) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      filters: {
        timeRangeDays,
        testType: testType || 'all',
        branch: branch || 'all',
      },
      summary: data.summary,
      recommendations: filteredRecommendations,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-recommendations-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, filteredRecommendations, timeRangeDays, testType, branch]);

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">💡 Test Recommendations</h1>
          <p className="text-gray-600 mt-1">Actionable insights to improve your test suite</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={loadRecommendations} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportRecommendations} variant="outline" size="sm" disabled={!data}>
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
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
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
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
              >
                <option value="">All Types</option>
                <option value="coverage">Coverage</option>
                <option value="stability">Stability</option>
                <option value="performance">Performance</option>
                <option value="maintenance">Maintenance</option>
                <option value="flakiness">Flakiness</option>
                <option value="best-practice">Best Practice</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeCoverage}
                onChange={(e) => setIncludeCoverage(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include Coverage</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeFlakiness}
                onChange={(e) => setIncludeFlakiness(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include Flakiness</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includePerformance}
                onChange={(e) => setIncludePerformance(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include Performance</span>
            </label>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.summary.total}</div>
              <div className="text-sm text-gray-600">Total Recommendations</div>
            </CardContent>
          </Card>
          {Object.entries(data.summary.byPriority).map(([priority, count]) => (
            <Card key={priority}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-gray-600 capitalize">{priority} Priority</div>
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

      {/* Recommendations List */}
      {data && filteredRecommendations.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-gray-500">
            No recommendations found matching your filters.
          </CardContent>
        </Card>
      )}

      {data && filteredRecommendations.length > 0 && (
        <div className="space-y-4">
          {filteredRecommendations.map((rec) => {
            const Icon = TYPE_ICONS[rec.type] || Lightbulb;
            return (
              <Card key={rec.id} className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg bg-primary/10`}>
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{rec.title}</CardTitle>
                          <Badge className={PRIORITY_COLORS[rec.priority]}>
                            {rec.priority}
                          </Badge>
                          <Badge variant="outline">
                            {TYPE_LABELS[rec.type]}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm mb-2">{rec.description}</p>
                        <p className="text-sm">
                          <span className="font-medium">Impact:</span> {rec.impact}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium mb-2">Action Items:</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                        {rec.actionItems.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    {rec.relatedTests && rec.relatedTests.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Related Tests:</h4>
                        <div className="flex flex-wrap gap-2">
                          {rec.relatedTests.slice(0, 5).map((test, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {test}
                            </Badge>
                          ))}
                          {rec.relatedTests.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{rec.relatedTests.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    {rec.metrics && Object.keys(rec.metrics).length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Metrics:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          {Object.entries(rec.metrics).map(([key, value]) => (
                            <div key={key} className="bg-gray-50 px-2 py-1 rounded">
                              <span className="font-medium">{key}:</span> {String(value)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

