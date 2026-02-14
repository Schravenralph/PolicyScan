/**
 * Real-Time Test Execution Monitor Component
 * 
 * Displays live test execution progress using WebSocket updates.
 */

import { useState, useRef } from 'react';
import { useWebSocket, TestExecutionUpdate, TestResultUpdate } from '../../hooks/useWebSocket';
import { Play, Square, CheckCircle2, XCircle, SkipForward, Loader2, Clock, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { t } from '../../utils/i18n';

interface TestExecutionMonitorProps {
  runId: string;
  onComplete?: (status: 'completed' | 'failed' | 'cancelled') => void;
  onCancel?: () => void;
}

export function TestExecutionMonitor({ runId, onComplete, onCancel }: TestExecutionMonitorProps) {
  const [executionState, setExecutionState] = useState<TestExecutionUpdate['data'] | null>(null);
  const [testResults, setTestResults] = useState<Map<string, TestResultUpdate['result']>>(new Map());
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const outputEndRef = useRef<HTMLDivElement>(null);

  const { connected } = useWebSocket({
    enabled: !!runId,
    testRunId: runId,
    onTestExecutionUpdate: (update: TestExecutionUpdate) => {
      if (update.runId === runId) {
        setExecutionState(update.data);
        
        // Scroll to bottom when new output arrives
        if (update.data.output && update.data.output.length > outputLines.length) {
          setTimeout(() => {
            outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
        
        // Update output lines
        if (update.data.output) {
          setOutputLines(update.data.output);
        }

        // Call onComplete when test execution finishes
        if (update.data.status === 'completed' || update.data.status === 'failed' || update.data.status === 'cancelled') {
          onComplete?.(update.data.status);
        }
      }
    },
    onTestResult: (result: TestResultUpdate) => {
      if (result.runId === runId) {
        setTestResults(prev => new Map(prev).set(result.testId, result.result));
      }
    },
  });

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  const formatTimeRemaining = (seconds?: number): string => {
    if (!seconds) return t('testExecutionMonitor.calculating');
    if (seconds < 60) return t('testExecutionMonitor.secondsRemaining').replace('{{seconds}}', String(seconds));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return t('testExecutionMonitor.timeRemaining').replace('{{minutes}}', String(minutes)).replace('{{seconds}}', String(secs));
  };

  if (!executionState) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              {connected ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">{t('testExecutionMonitor.waitingForStart')}</p>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 mx-auto mb-4 rounded-full bg-muted" />
                  <p className="text-muted-foreground">{t('testExecutionMonitor.notConnected')}</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { status, progress, currentTest, totalTests, completedTests, passedTests, failedTests, skippedTests, output, estimatedSecondsRemaining, error, startedAt, completedAt } = executionState;

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {status === 'running' && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
              {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
              {status === 'failed' && <XCircle className="w-5 h-5 text-destructive" />}
              {status === 'cancelled' && <Square className="w-5 h-5 text-muted-foreground" />}
              {status === 'pending' && <Clock className="w-5 h-5 text-muted-foreground" />}
              <CardTitle>
                {t('testExecutionMonitor.title')}: {runId}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'}>
                {status.toUpperCase()}
              </Badge>
              {onCancel && status === 'running' && (
                <Button variant="outline" size="sm" onClick={onCancel}>
                  <Square className="w-4 h-4 mr-2" />
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('testExecutionMonitor.progress')}</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Test Counts */}
          {totalTests !== undefined && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{totalTests}</div>
                <div className="text-xs text-muted-foreground">{t('testExecutionMonitor.total')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{passedTests || 0}</div>
                <div className="text-xs text-muted-foreground">{t('testExecutionMonitor.passed')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">{failedTests || 0}</div>
                <div className="text-xs text-muted-foreground">{t('testExecutionMonitor.failed')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{skippedTests || 0}</div>
                <div className="text-xs text-gray-600">{t('testExecutionMonitor.skipped')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{completedTests || 0}</div>
                <div className="text-xs text-gray-600">{t('testExecutionMonitor.completed')}</div>
              </div>
            </div>
          )}

          {/* Current Test */}
          {currentTest && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">{t('testExecutionMonitor.currentTest')}:</span>
                <span className="text-sm text-gray-700">{currentTest}</span>
              </div>
            </div>
          )}

          {/* Time Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {startedAt && (
              <div>
                <span className="text-gray-600">{t('testExecutionMonitor.started')}:</span>{' '}
                <span className="font-medium">{new Date(startedAt).toLocaleTimeString()}</span>
              </div>
            )}
            {completedAt && (
              <div>
                <span className="text-gray-600">{t('testExecutionMonitor.completed')}:</span>{' '}
                <span className="font-medium">{new Date(completedAt).toLocaleTimeString()}</span>
              </div>
            )}
            {estimatedSecondsRemaining && status === 'running' && (
              <div>
                <span className="text-gray-600">{t('testExecutionMonitor.estimatedRemaining')}:</span>{' '}
                <span className="font-medium">{formatTimeRemaining(estimatedSecondsRemaining)}</span>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-red-800 mb-1">{t('common.error')}</div>
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('testExecutionMonitor.testResults')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Array.from(testResults.entries()).map(([testId, result]) => (
                <div key={testId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {result.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                    {result.status === 'failed' && <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                    {result.status === 'skipped' && <SkipForward className="w-4 h-4 text-yellow-600 flex-shrink-0" />}
                    <span className="text-sm truncate">{testId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>{formatDuration(result.duration)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output Log */}
      {output && output.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              <CardTitle>{t('testExecutionMonitor.output')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg max-h-96 overflow-y-auto">
              {output.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap">{line}</div>
              ))}
              <div ref={outputEndRef} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

