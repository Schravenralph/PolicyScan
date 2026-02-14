import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService, DashboardData } from '../services/api/TestApiService';
import { RefreshCw, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { useSearchParams } from 'react-router-dom';
import { t } from '../utils/i18n';

interface TestComparisonPageProps {
  testApiService?: TestApiService; // Optional dependency injection for testing
}

export function TestComparisonPage({ testApiService: injectedTestApiService }: TestComparisonPageProps = {}) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );
  const [searchParams] = useSearchParams();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [, _setComparisonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun1, setSelectedRun1] = useState<string>(searchParams.get('run1') || '');
  const [selectedRun2, setSelectedRun2] = useState<string>(searchParams.get('run2') || '');
  const [_comparisonMode] = useState<'simple' | 'advanced'>('simple');
  const [_testId] = useState<string>('');
  const [_timeRangeDays] = useState(30);
  const [_compareBy] = useState<'testFile' | 'testType' | 'branch'>('testFile');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await testApi.getDashboardData();
      setDashboardData(data);
      // Auto-select first two runs if available and no URL params
      if (data.recentRuns.length >= 2 && !selectedRun1 && !selectedRun2) {
        setSelectedRun1(data.recentRuns[0].id || '');
        setSelectedRun2(data.recentRuns[1].id || '');
      } else if (selectedRun1 && selectedRun2) {
        // Validate URL params - ensure runs exist
        const run1Exists = data.recentRuns.some(r => r.id === selectedRun1);
        const run2Exists = data.recentRuns.some(r => r.id === selectedRun2);
        if (!run1Exists || !run2Exists) {
          // If URL params are invalid, fall back to first two runs
          if (data.recentRuns.length >= 2) {
            setSelectedRun1(data.recentRuns[0].id || '');
            setSelectedRun2(data.recentRuns[1].id || '');
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load test data';
      setError(errorMessage);
      console.error('Error loading test data:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi, selectedRun1, selectedRun2]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const run1 = dashboardData?.recentRuns.find(r => r.id === selectedRun1);
  const run2 = dashboardData?.recentRuns.find(r => r.id === selectedRun2);

  if (loading && !dashboardData) {
    return (
      <div className="p-8">
        <TestDashboardNav />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading test data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">🔍 Test Comparison</h1>
          <p className="text-muted-foreground mt-1">Side-by-side comparison of test runs</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Selection Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Select Test Runs to Compare</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">First Test Run</label>
              <select
                value={selectedRun1}
                onChange={(e) => setSelectedRun1(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select a test run...</option>
                {dashboardData?.recentRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.testFile || run.id} - {run.timestamp ? new Date(run.timestamp).toLocaleString() : 'No timestamp'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Second Test Run</label>
              <select
                value={selectedRun2}
                onChange={(e) => setSelectedRun2(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select a test run...</option>
                {dashboardData?.recentRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.testFile || run.id} - {run.timestamp ? new Date(run.timestamp).toLocaleString() : 'No timestamp'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {run1 && run2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Run 1 */}
          <Card>
            <CardHeader>
              <CardTitle>{t('testComparison.run1')} {run1.testFile || run1.id}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {run1.timestamp ? new Date(run1.timestamp).toLocaleString() : t('testComparison.noTimestamp')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {run1.results && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Total</div>
                      <div className="text-2xl font-bold">{run1.results.total || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Duration</div>
                      <div className="text-2xl font-bold">
                        {((run1.results.duration || 0) / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded">
                      <div className="text-sm text-gray-600">Passed</div>
                      <div className="text-xl font-bold text-green-600">
                        {run1.results.passed || 0}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded">
                      <div className="text-sm text-gray-600">Failed</div>
                      <div className="text-xl font-bold text-red-600">
                        {run1.results.failed || 0}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded">
                      <div className="text-sm text-gray-600">Skipped</div>
                      <div className="text-xl font-bold text-yellow-600">
                        {run1.results.skipped || 0}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Run 2 */}
          <Card>
            <CardHeader>
              <CardTitle>{t('testComparison.run2')} {run2.testFile || run2.id}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {run2.timestamp ? new Date(run2.timestamp).toLocaleString() : t('testComparison.noTimestamp')}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {run2.results && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Total</div>
                      <div className="text-2xl font-bold">{run2.results.total || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Duration</div>
                      <div className="text-2xl font-bold">
                        {((run2.results.duration || 0) / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded">
                      <div className="text-sm text-gray-600">Passed</div>
                      <div className="text-xl font-bold text-green-600">
                        {run2.results.passed || 0}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded">
                      <div className="text-sm text-gray-600">Failed</div>
                      <div className="text-xl font-bold text-red-600">
                        {run2.results.failed || 0}
                      </div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded">
                      <div className="text-sm text-gray-600">Skipped</div>
                      <div className="text-xl font-bold text-yellow-600">
                        {run2.results.skipped || 0}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Diff Summary */}
      {run1 && run2 && run1.results && run2.results && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Comparison Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Total Tests</span>
                <span className="flex items-center gap-2">
                  {run1.results.total || 0}
                  <ArrowRight className="w-4 h-4" />
                  {run2.results.total || 0}
                  <span className="text-sm text-gray-600">
                    ({((run2.results.total || 0) - (run1.results.total || 0)) >= 0 ? '+' : ''}
                    {(run2.results.total || 0) - (run1.results.total || 0)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Passed</span>
                <span className="flex items-center gap-2">
                  {run1.results.passed || 0}
                  <ArrowRight className="w-4 h-4" />
                  {run2.results.passed || 0}
                  <span className="text-sm text-gray-600">
                    ({((run2.results.passed || 0) - (run1.results.passed || 0)) >= 0 ? '+' : ''}
                    {(run2.results.passed || 0) - (run1.results.passed || 0)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Failed</span>
                <span className="flex items-center gap-2">
                  {run1.results.failed || 0}
                  <ArrowRight className="w-4 h-4" />
                  {run2.results.failed || 0}
                  <span className="text-sm text-gray-600">
                    ({((run2.results.failed || 0) - (run1.results.failed || 0)) >= 0 ? '+' : ''}
                    {(run2.results.failed || 0) - (run1.results.failed || 0)})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Duration</span>
                <span className="flex items-center gap-2">
                  {((run1.results.duration || 0) / 1000).toFixed(1)}s
                  <ArrowRight className="w-4 h-4" />
                  {((run2.results.duration || 0) / 1000).toFixed(1)}s
                  <span className="text-sm text-gray-600">
                    ({(((run2.results.duration || 0) - (run1.results.duration || 0)) / 1000) >= 0 ? '+' : ''}
                    {(((run2.results.duration || 0) - (run1.results.duration || 0)) / 1000).toFixed(1)}s)
                  </span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!run1 || !run2 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">
              <p>Select two test runs to compare</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

