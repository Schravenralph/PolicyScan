/**
 * Test Coverage Visualization
 * 
 * Visual representation of test coverage with file-level breakdown.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { FileText, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { t } from '../../utils/i18n';

interface TestCoverageVisualizationProps {
  testApiService?: TestApiService;
  timeRangeDays?: number;
}

interface CoverageMetrics {
  summary: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  trends: Array<{
    date: string;
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  }>;
  change: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  } | null;
  byType: Record<string, {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  }>;
  modules: Array<{
    name: string;
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  }>;
  totalRuns: number;
  filesCovered: number;
  metrics: {
    hasCoverageData: boolean;
    lastUpdated: string | null;
  };
}

export function TestCoverageVisualization({ testApiService: injectedTestApiService, timeRangeDays = 30 }: TestCoverageVisualizationProps) {
  const testApi = injectedTestApiService || new TestApiService();
  const [coverageData, setCoverageData] = useState<CoverageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCoverage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await testApi.getCoverageMetrics(timeRangeDays) as unknown as CoverageMetrics;
      setCoverageData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load coverage data';
      setError(errorMessage);
      console.error('Error loading coverage:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, timeRangeDays]);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  // Calculate overall coverage score
  const overallCoverage = useMemo(() => {
    if (!coverageData) return 0;
    const { summary } = coverageData;
    return (summary.statements + summary.branches + summary.functions + summary.lines) / 4;
  }, [coverageData]);

  // Prepare chart data
  const coverageChartData = useMemo(() => {
    if (!coverageData) return [];
    return [
      { name: 'Statements', value: coverageData.summary.statements },
      { name: 'Branches', value: coverageData.summary.branches },
      { name: 'Functions', value: coverageData.summary.functions },
      { name: 'Lines', value: coverageData.summary.lines },
    ];
  }, [coverageData]);

  const trendChartData = useMemo(() => {
    if (!coverageData) return [];
    return coverageData.trends.map(t => ({
      date: new Date(t.date).toLocaleDateString(),
      statements: t.statements,
      branches: t.branches,
      functions: t.functions,
      lines: t.lines,
    }));
  }, [coverageData]);

  if (loading && !coverageData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Target className="w-8 h-8 animate-spin text-muted-foreground" />
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

  if (!coverageData || !coverageData.metrics.hasCoverageData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground py-8">
            <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p>{t('common.noCoverageData')}</p>
            <p className="text-sm mt-2">{t('common.runTestsWithCoverage')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getCoverageColor = (value: number): string => {
    if (value >= 80) return '#10b981';
    if (value >= 60) return '#eab308';
    return '#ef4444';
  };

  return (
    <div className="space-y-4">
      {/* Overall Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Overall Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-4">
            <div className={`text-6xl font-bold ${
              overallCoverage >= 80 ? 'text-green-600' :
              overallCoverage >= 60 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {overallCoverage.toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground mt-1">Average Coverage</div>
            <Progress value={overallCoverage} className="mt-4 h-3" />
          </div>

          {/* Coverage Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Statements</div>
              <div className="text-2xl font-bold" style={{ color: getCoverageColor(coverageData.summary.statements) }}>
                {coverageData.summary.statements.toFixed(1)}%
              </div>
              {coverageData.change && (
                <div className={`text-xs flex items-center gap-1 mt-1 ${
                  coverageData.change.statements >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {coverageData.change.statements >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {coverageData.change.statements >= 0 ? '+' : ''}{coverageData.change.statements.toFixed(1)}%
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Branches</div>
              <div className="text-2xl font-bold" style={{ color: getCoverageColor(coverageData.summary.branches) }}>
                {coverageData.summary.branches.toFixed(1)}%
              </div>
              {coverageData.change && (
                <div className={`text-xs flex items-center gap-1 mt-1 ${
                  coverageData.change.branches >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {coverageData.change.branches >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {coverageData.change.branches >= 0 ? '+' : ''}{coverageData.change.branches.toFixed(1)}%
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Functions</div>
              <div className="text-2xl font-bold" style={{ color: getCoverageColor(coverageData.summary.functions) }}>
                {coverageData.summary.functions.toFixed(1)}%
              </div>
              {coverageData.change && (
                <div className={`text-xs flex items-center gap-1 mt-1 ${
                  coverageData.change.functions >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {coverageData.change.functions >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {coverageData.change.functions >= 0 ? '+' : ''}{coverageData.change.functions.toFixed(1)}%
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Lines</div>
              <div className="text-2xl font-bold" style={{ color: getCoverageColor(coverageData.summary.lines) }}>
                {coverageData.summary.lines.toFixed(1)}%
              </div>
              {coverageData.change && (
                <div className={`text-xs flex items-center gap-1 mt-1 ${
                  coverageData.change.lines >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {coverageData.change.lines >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {coverageData.change.lines >= 0 ? '+' : ''}{coverageData.change.lines.toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
        </TabsList>
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Coverage Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    label={{ value: 'Coverage (%)', angle: -90, position: 'insideLeft' }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(1)}%`}
                  />
                  <Legend />
                  <Bar dataKey="statements" fill="#3b82f6" name="Statements" />
                  <Bar dataKey="branches" fill="#10b981" name="Branches" />
                  <Bar dataKey="functions" fill="#eab308" name="Functions" />
                  <Bar dataKey="lines" fill="#f59e0b" name="Lines" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle>Coverage Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={coverageChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis
                    label={{ value: 'Coverage (%)', angle: -90, position: 'insideLeft' }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(1)}%`}
                  />
                  <Bar dataKey="value">
                    {coverageChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getCoverageColor(entry.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Module Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {coverageData.modules.slice(0, 20).map((module, idx) => {
                  const moduleAvg = (module.statements + module.branches + module.functions + module.lines) / 4;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          {module.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          S: {module.statements.toFixed(1)}% | B: {module.branches.toFixed(1)}% | F: {module.functions.toFixed(1)}% | L: {module.lines.toFixed(1)}%
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className={`text-2xl font-bold ${
                          moduleAvg >= 80 ? 'text-green-600' :
                          moduleAvg >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {moduleAvg.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


