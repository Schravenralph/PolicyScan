import { useEffect, useState, useCallback, useMemo } from 'react';
import { TestApiService, DashboardData } from '../services/api/TestApiService';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle, SkipForward } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { TestDashboardNav } from '../components/test/TestDashboardNav';

interface TestSummaryPageProps {
  testApiService?: TestApiService; // Optional dependency injection for testing
}

export function TestSummaryPage({ testApiService: injectedTestApiService }: TestSummaryPageProps = {}) {
  // Use dependency injection if provided, otherwise create instance
  // This allows tests to pass mock instances
  const testApi = useMemo(
    () => injectedTestApiService || new TestApiService(),
    [injectedTestApiService]
  );

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await testApi.getDashboardData();
      setDashboardData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load test summary';
      setError(errorMessage);
      console.error('Error loading test summary:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !dashboardData) {
    return (
      <div className="p-8">
        <TestDashboardNav />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading test summary...</p>
          </div>
        </div>
      </div>
    );
  }

  const totalTests: number = (dashboardData?.summary?.totalTests as number) || 0;
  const totalPassed: number = (dashboardData?.summary?.totalPassed as number) || 0;
  const totalFailed: number = (dashboardData?.summary?.totalFailed as number) || 0;
  const totalSkipped: number = (dashboardData?.summary?.totalSkipped as number) || 0;
  const passRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0.0';
  const avgDuration = dashboardData?.summary?.avgDuration 
    ? ((dashboardData.summary.avgDuration as number) / 1000).toFixed(1)
    : '0.0';

  const flakyTests = dashboardData?.summary?.flakyTests;

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📊 Test Summary</h1>
          <p className="text-gray-600 mt-1">Historical view of all test runs and overall statistics</p>
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

      {/* Overall Statistics */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Total Tests</div>
              <div className="text-3xl font-bold">{totalTests}</div>
            </CardContent>
          </Card>
          <Card className="border-green-500">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Passed</div>
              <div className="text-3xl font-bold text-green-600">{totalPassed}</div>
            </CardContent>
          </Card>
          <Card className={totalFailed > 0 ? 'border-red-500' : ''}>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Failed</div>
              <div className="text-3xl font-bold text-red-600">{totalFailed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Pass Rate</div>
              <div className="text-3xl font-bold">{passRate}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Additional Metrics */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Total Runs</div>
              <div className="text-2xl font-bold">{dashboardData.totalRuns}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Average Duration</div>
              <div className="text-2xl font-bold">{avgDuration}s</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Skipped</div>
              <div className="text-2xl font-bold text-yellow-600">{totalSkipped}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Test Runs Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>📅 Recent Test Runs Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {!dashboardData || !Array.isArray(dashboardData.recentRuns) || dashboardData.recentRuns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No test runs available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.recentRuns.slice(0, 20).map((run) => {
                const statusIcon = 
                  (run.results?.failed || 0) > 0 ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (run.results?.skipped || 0) > 0 ? (
                    <SkipForward className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  );
                
                const statusColor = 
                  (run.results?.failed || 0) > 0 ? 'border-red-500' :
                  (run.results?.skipped || 0) > 0 ? 'border-yellow-500' :
                  'border-green-500';

                return (
                  <div
                    key={run.id}
                    className={`border-l-4 ${statusColor} bg-white p-4 rounded-lg shadow-sm`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {statusIcon}
                        <div>
                          <div className="font-semibold">
                            {run.testFile || run.id || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-600">
                            {run.timestamp ? new Date(run.timestamp).toLocaleString() : 'Unknown date'}
                          </div>
                        </div>
                      </div>
                      {run.results && (
                        <div className="text-right text-sm">
                          <div>
                            <span className="text-green-600">{run.results.passed || 0} passed</span>
                            {(run.results.failed ?? 0) > 0 && (
                              <span className="text-red-600 ml-2">{run.results.failed ?? 0} failed</span>
                            )}
                            {(run.results.skipped ?? 0) > 0 && (
                              <span className="text-yellow-600 ml-2">{run.results.skipped ?? 0} skipped</span>
                            )}
                          </div>
                          <div className="text-gray-500 mt-1">
                            {run.results.duration ? (run.results.duration / 1000).toFixed(1) : '0.0'}s
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flaky Tests Detection */}
      {Array.isArray(flakyTests) && flakyTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🎲 Flaky Tests Detection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {flakyTests.map((test, index) => {
                const testName = typeof test === 'string' ? test : String(test);
                return (
                  <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="font-medium text-yellow-800">{testName}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
