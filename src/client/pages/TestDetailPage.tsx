import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../utils/apiUrl';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { Play, RefreshCw, ArrowLeft, Video, Terminal } from 'lucide-react';

interface TestRun {
  id: string;
  timestamp: string;
  testFile: string;
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
    }>;
  };
}

interface TestDetails {
  testId: string;
  testFile: string;
  stats: {
    totalRuns: number;
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    avgDuration: number;
    passRate: number;
  };
  runs: TestRun[];
  lastRun: TestRun;
}

export function TestDetailPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [details, setDetails] = useState<TestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadTestDetails = useCallback(async () => {
    try {
      setLoading(true);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/tests/${testId}/details`);
      if (!response.ok) {
        throw new Error('Failed to load test details');
      }
      const data = await response.json();
      setDetails(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test details');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  const loadVideo = useCallback(async () => {
    try {
      setLoadingVideo(true);
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/tests/${testId}/video`);
      if (response.ok) {
        const data = await response.json();
        setVideoUrl(data.url);
      } else {
        setVideoUrl(null);
      }
    } catch (_err) {
      setVideoUrl(null);
    } finally {
      setLoadingVideo(false);
    }
  }, [testId]);

  const loadOutput = useCallback(async () => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/tests/${testId}/output`);
      if (response.ok) {
        const data = await response.json();
        setOutput(data.output || '');
        if (!data.running && running) {
          setRunning(false);
          // Reload details after test completes
          setTimeout(loadTestDetails, 1000);
        }
      }
    } catch (_err) {
      // Ignore errors when loading output
    }
  }, [testId, running, loadTestDetails]);

  useEffect(() => {
    if (testId) {
      loadTestDetails();
      loadVideo();
      // Poll for output if test is running
      const interval = setInterval(() => {
        if (running) {
          loadOutput();
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [testId, running, loadTestDetails, loadVideo, loadOutput]);

  const runTest = async () => {
    try {
      setRunning(true);
      setOutput('');
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/tests/${testId}/run`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to start test');
      }

      // Clear existing interval if any
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      // Start polling for output
      pollIntervalRef.current = setInterval(async () => {
        await loadOutput();
        // Check if still running
        const apiBaseUrl = getApiBaseUrl();
        try {
          const statusResponse = await fetch(`${apiBaseUrl}/tests/status`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (!status.running) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setRunning(false);
              setTimeout(() => {
                loadTestDetails();
                loadVideo();
              }, 2000);
            }
          }
        } catch (error) {
          console.error('Error polling status:', error);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start test');
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading test details...</p>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || 'Test not found'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const testFileName = details.testFile.split('/').pop() || details.testId;
  const isE2E = testFileName.includes('.spec.ts') || testFileName.includes('e2e');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">{testFileName}</h1>
          <p className="text-muted-foreground mt-1">
            {details.stats.totalRuns} run{details.stats.totalRuns !== 1 ? 's' : ''} • 
            {' '}{details.stats.passRate.toFixed(1)}% pass rate
          </p>
        </div>
        <Button 
          onClick={runTest} 
          disabled={running}
          className="gap-2"
        >
          {running ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Test
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Runs</CardDescription>
            <CardTitle className="text-2xl">{details.stats.totalRuns}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Tests</CardDescription>
            <CardTitle className="text-2xl">{details.stats.totalTests}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pass Rate</CardDescription>
            <CardTitle className="text-2xl">{details.stats.passRate.toFixed(1)}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Avg Duration</CardDescription>
            <CardTitle className="text-2xl">{(details.stats.avgDuration / 1000).toFixed(1)}s</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Previous Runs</TabsTrigger>
          {isE2E && <TabsTrigger value="video">Video</TabsTrigger>}
          <TabsTrigger value="output">Terminal Output</TabsTrigger>
        </TabsList>

        {/* Previous Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Run History</CardTitle>
              <CardDescription>
                {details.runs.length} run{details.runs.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {details.runs.map((run) => {
                    const passRate = run.results.total > 0 
                      ? (run.results.passed / run.results.total) * 100 
                      : 0;
                    const status = run.results.failed === 0 && run.results.total > 0 
                      ? 'pass' 
                      : run.results.total === 0 
                        ? 'unknown' 
                        : 'fail';

                    return (
                      <Card key={run.id} className="border-l-4 border-l-blue-500">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-lg">
                                {new Date(run.timestamp).toLocaleString()}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                Run ID: {run.id}
                              </CardDescription>
                            </div>
                            <Badge 
                              variant={status === 'pass' ? 'default' : status === 'fail' ? 'destructive' : 'secondary'}
                            >
                              {status === 'pass' ? '✅ Pass' : status === 'fail' ? '❌ Fail' : '⚠️ Unknown'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-4 gap-4 mb-4">
                            <div>
                              <div className="text-sm text-muted-foreground">Total</div>
                              <div className="text-2xl font-bold">{run.results.total}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Passed</div>
                              <div className="text-2xl font-bold text-green-600">{run.results.passed}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Failed</div>
                              <div className="text-2xl font-bold text-red-600">{run.results.failed}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Duration</div>
                              <div className="text-2xl font-bold">{(run.results.duration / 1000).toFixed(1)}s</div>
                            </div>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Pass Rate:</span> {passRate.toFixed(1)}%
                          </div>
                          {run.results.failures && run.results.failures.length > 0 && (
                            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-md">
                              <div className="font-medium text-red-900 dark:text-red-100 mb-2">
                                {run.results.failures.length} Failure{run.results.failures.length !== 1 ? 's' : ''}:
                              </div>
                              {run.results.failures.slice(0, 3).map((failure, idx) => (
                                <div key={idx} className="text-sm text-red-800 dark:text-red-200 mb-1">
                                  • {failure.test}: {failure.error.substring(0, 100)}...
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Video Tab */}
        {isE2E && (
          <TabsContent value="video" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Test Execution Video
                </CardTitle>
                <CardDescription>
                  {loadingVideo 
                    ? 'Loading video...' 
                    : videoUrl 
                      ? 'Low-resolution, low-framerate recording of test execution'
                      : 'No video available for this test'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingVideo ? (
                  <div className="flex items-center justify-center h-96">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                  </div>
                ) : videoUrl ? (
                  <div className="space-y-4">
                    <video 
                      controls 
                      className="w-full rounded-lg border"
                      style={{ maxHeight: '600px' }}
                    >
                      <source src={videoUrl} type="video/webm" />
                      Your browser does not support the video tag.
                    </video>
                    <p className="text-sm text-muted-foreground">
                      Note: Video is recorded at low resolution (640x480) and low framerate (5fps) to minimize file size.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-96 text-muted-foreground">
                    <div className="text-center">
                      <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No video available</p>
                      <p className="text-sm mt-2">Run the test to generate a video recording</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Terminal Output Tab */}
        <TabsContent value="output" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Terminal Output
              </CardTitle>
              <CardDescription>
                {running ? 'Live output from test execution...' : 'Output from last test run'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <pre className="bg-black text-green-400 p-4 rounded-md font-mono text-sm whitespace-pre-wrap">
                  {output || (running ? 'Waiting for output...' : 'No output available. Run the test to see output.')}
                </pre>
              </ScrollArea>
              {running && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Test is running... Output will update automatically
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

