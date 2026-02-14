import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { RefreshCw, Loader2, AlertCircle, ArrowLeft, ArrowRight, Video, Terminal, Download, GitBranch, Clock, Code, Play, Share2, FileJson } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { getApiBaseUrl } from '../utils/apiUrl';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';

interface TestRunDetail {
  runId: string;
  timestamp: string;
  testFile?: string;
  testType?: string;
  testCommand?: string;
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    failures?: Array<{
      test: string;
      file: string;
      error: string;
      stackTrace?: string;
    }>;
  };
  output?: string;
  videoUrl?: string;
  environment?: {
    platform?: string;
    nodeVersion?: string;
    ci?: boolean;
  };
  git?: {
    branch?: string;
    commit?: string;
    commitShort?: string;
  };
  previousRunId?: string;
  nextRunId?: string;
}

export function TestRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [runDetail, setRunDetail] = useState<TestRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'404' | '500' | 'network' | 'unknown'>('unknown');
  const [output, setOutput] = useState<string>('');
  const [retrying, setRetrying] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleRerun = async () => {
    if (!runDetail) return;

    try {
      setIsRunning(true);
      const response = await fetch(`${getApiBaseUrl()}/tests/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tests: runDetail.testFile ? [runDetail.testFile] : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start test run: ${response.statusText}`);
      }

      await response.json();
      toast.success(t('testRun.startedSuccess'));

      // Navigate to the test dashboard to see progress
      navigate('/tests');

    } catch (err) {
      console.error('Error starting test run:', err);
      toast.error(t('testRun.startFailed'));
    } finally {
      setIsRunning(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('testRun.linkCopied'));
    } catch (err) {
      console.error('Failed to copy link:', err);
      toast.error(t('testRun.copyFailed'));
    }
  };

  const handleExportJSON = () => {
    if (!runDetail) return;
    const blob = new Blob([JSON.stringify(runDetail, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-run-${runDetail.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadRunDetail = useCallback(async (isRetry = false) => {
    if (!runId) return;

    try {
      if (!isRetry) {
        setLoading(true);
      } else {
        setRetrying(true);
      }
      setError(null);
      setErrorType('unknown');
      
      const response = await fetch(`${getApiBaseUrl()}/tests/runs/${encodeURIComponent(runId)}`);
      if (!response.ok) {
        if (response.status === 404) {
          setErrorType('404');
          throw new Error(`Test run not found: ${runId}`);
        } else if (response.status >= 500) {
          setErrorType('500');
          throw new Error(`Server error: HTTP ${response.status}`);
        } else {
          setErrorType('unknown');
          throw new Error(`HTTP ${response.status}`);
        }
      }
      const data = await response.json() as { run?: any; previousRunId?: string; nextRunId?: string } | any;
      // Backend returns { run: TestRun } where TestRun has 'id', but frontend expects TestRunDetail with 'runId'
      const runData = 'run' in data ? data.run : data;
      if (!runData) {
        throw new Error(`Invalid response format: run data not found`);
      }
      // Map backend TestRun format to frontend TestRunDetail format
      const mappedRun: TestRunDetail = {
        runId: runData.id || runData.runId || runId,
        timestamp: runData.timestamp || runData.results?.timestamp || new Date().toISOString(),
        testFile: runData.testFile,
        testType: runData.testType,
        testCommand: runData.testCommand,
        results: {
          total: runData.results?.total || 0,
          passed: runData.results?.passed || 0,
          failed: runData.results?.failed || 0,
          skipped: runData.results?.skipped || 0,
          duration: runData.results?.duration || 0,
          failures: runData.results?.failures || [],
        },
        output: runData.output,
        videoUrl: runData.videoUrl,
        environment: runData.environment,
        git: runData.git,
        previousRunId: data.previousRunId,
        nextRunId: data.nextRunId,
      };
      setRunDetail(mappedRun);
      if (isRetry) {
        toast.success(t('testRun.detailsRefreshed'));
      }
    } catch (err) {
      // Detect network errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setErrorType('network');
        setError('Network error: Unable to connect to server');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load test run details';
        setError(errorMessage);
      }
      console.error('Error loading test run detail:', err);
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, [runId]);

  const loadOutput = useCallback(async () => {
    if (!runId) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/tests/runs/${encodeURIComponent(runId)}/output`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as { output: string };
      setOutput(data.output || '');
    } catch (err) {
      console.error('Error loading output:', err);
    }
  }, [runId]);

  useEffect(() => {
    loadRunDetail();
    loadOutput();
  }, [loadRunDetail, loadOutput]);

  // Skeleton loader
  if (loading && !runDetail) {
    return (
      <div className="p-8 space-y-6">
        <TestDashboardNav />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state with retry
  if (error && !runDetail) {
    const getErrorSuggestion = () => {
      switch (errorType) {
        case '404':
          return 'This test run may have been deleted or the ID is incorrect. Check the test dashboard for available runs.';
        case '500':
          return 'The server encountered an error. Please try again in a moment or contact support if the issue persists.';
        case 'network':
          return 'Check your internet connection and ensure the server is running.';
        default:
          return 'Please try refreshing the page or contact support if the issue persists.';
      }
    };

    return (
      <div className="p-8 space-y-6">
        <TestDashboardNav />
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              Error Loading Test Run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p className="font-semibold mb-1">{error}</p>
              <p className="text-sm text-red-600">{getErrorSuggestion()}</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => loadRunDetail(true)} 
                variant="default"
                disabled={retrying}
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </>
                )}
              </Button>
              <Button onClick={() => navigate('/tests')} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Link to="/tests" className="hover:text-gray-900">Test Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Run {runId?.slice(0, 12)}...</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate('/tests')} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Test Run Details</h1>
            <div className="flex items-center gap-4 mt-1 text-gray-600">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {runDetail && new Date(runDetail.timestamp).toLocaleString()}
              </span>
              {runDetail?.testType && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {runDetail.testType}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {runDetail?.previousRunId && (
            <Button
              onClick={() => navigate(`/tests/runs/${runDetail.previousRunId}`)}
              variant="outline"
              size="sm"
              title="Previous Run"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
          )}
          {runDetail?.nextRunId && (
            <Button
              onClick={() => navigate(`/tests/runs/${runDetail.nextRunId}`)}
              variant="outline"
              size="sm"
              title="Next Run"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button onClick={handleShare} variant="outline" size="sm" title="Share Link">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button onClick={handleExportJSON} variant="outline" size="sm" title="Export JSON">
            <FileJson className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={handleRerun} variant="default" size="sm" disabled={isRunning || retrying}>
            {isRunning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Re-run
          </Button>
          <Button onClick={() => loadRunDetail(true)} variant="outline" size="sm" disabled={retrying}>
            <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {runDetail && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Total Tests</div>
                <div className="text-3xl font-bold">{runDetail.results.total}</div>
              </CardContent>
            </Card>
            <Card className="border-green-500">
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Passed</div>
                <div className="text-3xl font-bold text-green-600">{runDetail.results.passed}</div>
              </CardContent>
            </Card>
            <Card className={runDetail.results.failed > 0 ? 'border-red-500' : ''}>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Failed</div>
                <div className="text-3xl font-bold text-red-600">{runDetail.results.failed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-1">Duration</div>
                <div className="text-3xl font-bold">{(runDetail.results.duration / 1000).toFixed(1)}s</div>
              </CardContent>
            </Card>
          </div>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Run Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Run ID</div>
                  <div className="font-mono text-sm">{runDetail.runId}</div>
                </div>
                {runDetail.testCommand && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Test Command</div>
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">{runDetail.testCommand}</code>
                  </div>
                )}
                {runDetail.testFile && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Test File</div>
                    <div className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">{runDetail.testFile}</span>
                    </div>
                  </div>
                )}
                {runDetail.environment && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Environment</div>
                    <div className="text-sm">
                      {runDetail.environment.platform && <span>{runDetail.environment.platform}</span>}
                      {runDetail.environment.nodeVersion && (
                        <span className="ml-2">Node {runDetail.environment.nodeVersion}</span>
                      )}
                      {runDetail.environment.ci && (
                        <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                          CI
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {runDetail.git && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Git Information</div>
                    <div className="flex items-center gap-2 text-sm">
                      {runDetail.git.branch && (
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-4 h-4" />
                          {runDetail.git.branch}
                        </span>
                      )}
                      {runDetail.git.commitShort && (
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {runDetail.git.commitShort}
                        </code>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Failures */}
          {runDetail.results.failures && runDetail.results.failures.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-700">❌ Test Failures ({runDetail.results.failures.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {runDetail.results.failures.map((failure, index) => (
                    <div key={index} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="font-semibold text-red-800 mb-2">{failure.test}</div>
                      <div className="text-sm text-gray-600 mb-2 flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        <span>{failure.file}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs font-semibold text-red-700 mb-1">Error Message:</div>
                          <pre className="text-sm bg-white p-3 rounded border overflow-x-auto text-red-800">
                            {failure.error}
                          </pre>
                        </div>
                        {failure.stackTrace && failure.stackTrace !== failure.error && (
                          <div>
                            <div className="text-xs font-semibold text-red-700 mb-1">Stack Trace:</div>
                            <pre className="text-xs bg-gray-900 text-gray-300 p-3 rounded border overflow-x-auto font-mono">
                              {failure.stackTrace}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Output */}
          {output && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Terminal className="w-5 h-5" />
                    Test Output
                  </CardTitle>
                  <Button
                    onClick={() => {
                      const blob = new Blob([output], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `test-run-${runId}-output.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-[500px] overflow-auto">
                  {output}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Video */}
          {runDetail.videoUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  Test Video
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video controls className="w-full rounded-lg">
                  <source src={runDetail.videoUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
