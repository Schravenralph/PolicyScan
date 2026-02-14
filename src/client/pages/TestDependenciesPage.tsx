/**
 * Test Dependencies Page
 * 
 * Analyzes test dependencies, relationships, and impact of changes.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { TestApiService } from '../services/api/TestApiService';
import { RefreshCw, AlertCircle, Network, TrendingUp, FileText, Search, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

interface TestDependenciesPageProps {
  testApiService?: TestApiService;
}

interface TestDependency {
  testFile: string;
  dependencies: string[];
  dependents: string[];
  impactScore: number;
  lastRun?: string;
  passRate?: number;
}

interface DependencyAnalysis {
  testDependencies?: TestDependency[];
  affectedTests?: string[];
  impactScore?: number;
  byFile?: Record<string, string[]>;
  impactMap?: Record<string, {
    affectedTests: string[];
    impactScore: number;
  }>;
  summary?: {
    totalTests: number;
    testsWithDependencies: number;
    highImpactTests: number;
  };
  timestamp: string;
}

export function TestDependenciesPage({ testApiService: injectedTestApiService }: TestDependenciesPageProps = {}) {
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [data, setData] = useState<DependencyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testType, setTestType] = useState<string>('');
  const [includeImpact, setIncludeImpact] = useState(true);
  const [filePaths, setFilePaths] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [analysisMode, setAnalysisMode] = useState<'full' | 'affected'>('full');

  const loadDependencies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (analysisMode === 'affected' && filePaths.trim()) {
        const paths = filePaths.split(',').map(p => p.trim()).filter(Boolean);
        const result = await testApi.analyzeTestDependencies({
          filePaths: paths,
          includeImpact,
        });
        setData(result as unknown as DependencyAnalysis);
      } else {
        const result = await testApi.analyzeTestDependencies({
          testType: testType || undefined,
          includeImpact,
        });
        setData(result as unknown as DependencyAnalysis);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dependencies';
      setError(errorMessage);
      console.error('Error loading dependencies:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [testApi, testType, includeImpact, filePaths, analysisMode]);

  useEffect(() => {
    loadDependencies();
  }, [loadDependencies]);

  const filteredDependencies = useMemo(() => {
    if (!data || !data.testDependencies) return [];
    let filtered = [...data.testDependencies];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(dep =>
        dep.testFile.toLowerCase().includes(query) ||
        dep.dependencies.some(d => d.toLowerCase().includes(query)) ||
        dep.dependents.some(d => d.toLowerCase().includes(query))
      );
    }

    // Sort by impact score (highest first)
    filtered.sort((a, b) => b.impactScore - a.impactScore);

    return filtered;
  }, [data, searchQuery]);

  const exportDependencies = useCallback(() => {
    if (!data) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      mode: analysisMode,
      filters: {
        testType: testType || 'all',
        includeImpact,
        filePaths: analysisMode === 'affected' ? filePaths.split(',').map(p => p.trim()) : undefined,
      },
      data,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-dependencies-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, analysisMode, testType, includeImpact, filePaths]);

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">🔗 Test Dependencies</h1>
          <p className="text-muted-foreground mt-1">Analyze test dependencies and impact of code changes</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={loadDependencies} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={exportDependencies} variant="outline" size="sm" disabled={!data}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Analysis Mode Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analysis Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="full"
                checked={analysisMode === 'full'}
                onChange={(e) => setAnalysisMode(e.target.value as 'full')}
                className="rounded"
              />
              <span>Full Dependency Analysis</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="affected"
                checked={analysisMode === 'affected'}
                onChange={(e) => setAnalysisMode(e.target.value as 'affected')}
                className="rounded"
              />
              <span>Affected Tests (by file paths)</span>
            </label>
          </div>

          {analysisMode === 'affected' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">File Paths (comma-separated)</label>
              <Input
                value={filePaths}
                onChange={(e) => setFilePaths(e.target.value)}
                placeholder="src/services/UserService.ts, src/models/User.ts"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Enter file paths to see which tests are affected by changes to these files
              </p>
            </div>
          )}

          {analysisMode === 'full' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  checked={includeImpact}
                  onChange={(e) => setIncludeImpact(e.target.checked)}
                  className="rounded"
                />
                <label className="text-sm">Include Impact Scores</label>
              </div>
            </div>
          )}
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

      {/* Affected Tests View */}
      {analysisMode === 'affected' && data && data.affectedTests && (
        <Card>
          <CardHeader>
            <CardTitle>Affected Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="text-2xl font-bold mb-2">{data.affectedTests.length}</div>
                <div className="text-sm text-muted-foreground">Tests affected by changes</div>
                {data.impactScore !== undefined && (
                  <div className="mt-2">
                    <Badge className="bg-blue-100 text-blue-800">
                      Impact Score: {data.impactScore}/100
                    </Badge>
                  </div>
                )}
              </div>
              {data.byFile && Object.keys(data.byFile).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Affected Tests by File:</h4>
                  <div className="space-y-2">
                    {Object.entries(data.byFile).map(([file, tests]) => (
                      <div key={file} className="bg-muted p-3 rounded">
                        <div className="font-medium text-sm mb-1">{file}</div>
                        <div className="flex flex-wrap gap-2">
                          {tests.map((test, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {test}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.affectedTests.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">All Affected Tests:</h4>
                  <div className="flex flex-wrap gap-2">
                    {data.affectedTests.map((test, idx) => (
                      <Badge key={idx} variant="outline">
                        {test}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {analysisMode === 'full' && data && data.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.summary.totalTests}</div>
              <div className="text-sm text-muted-foreground">Total Tests</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.summary.testsWithDependencies}</div>
              <div className="text-sm text-muted-foreground">Tests with Dependencies</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{data.summary.highImpactTests}</div>
              <div className="text-sm text-muted-foreground">High Impact Tests</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      {analysisMode === 'full' && (
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tests, dependencies, or dependents..."
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Dependencies List */}
      {analysisMode === 'full' && data && filteredDependencies.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {searchQuery ? 'No dependencies found matching your search.' : 'No dependencies found.'}
          </CardContent>
        </Card>
      )}

      {analysisMode === 'full' && data && filteredDependencies.length > 0 && (
        <div className="space-y-4">
          {filteredDependencies.map((dep, index) => (
            <Card key={`${dep.testFile}-${index}`} className="border-l-4 border-l-blue-500">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <Network className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg">{dep.testFile}</CardTitle>
                        {includeImpact && (
                          <Badge className="bg-blue-100 text-blue-800">
                            Impact: {dep.impactScore}/100
                          </Badge>
                        )}
                        {dep.passRate !== undefined && (
                          <Badge variant={dep.passRate >= 95 ? 'default' : 'destructive'}>
                            Pass Rate: {dep.passRate.toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                      {dep.lastRun && (
                        <p className="text-xs text-muted-foreground">
                          Last run: {new Date(dep.lastRun).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dep.dependencies.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Dependencies ({dep.dependencies.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {dep.dependencies.slice(0, 10).map((depName, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {depName}
                          </Badge>
                        ))}
                        {dep.dependencies.length > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{dep.dependencies.length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  {dep.dependents.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 text-sm flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Dependents ({dep.dependents.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {dep.dependents.slice(0, 10).map((dependent, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {dependent}
                          </Badge>
                        ))}
                        {dep.dependents.length > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{dep.dependents.length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

