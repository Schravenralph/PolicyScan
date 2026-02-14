/**
 * Test Execution Section Component
 * 
 * Extracted from TestDashboardPage to improve maintainability.
 * Handles test execution controls, status display, progress, logs, and workflow monitoring.
 */

import { TestApiService, TestStatus } from '../../services/api/TestApiService';
import { Play, Square, Loader2, FileText, AlertCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TestProgressBar } from './TestProgressBar';
import { translateLogMessage } from '../../utils/logTranslations';
import { t } from '../../utils/i18n';

interface TestExecutionSectionProps {
  testStatus: TestStatus | null;
  testApiService: TestApiService;
  onRunTests: () => void;
  onStopTests: () => void;
  // Log files
  logFiles: Array<{
    suite: string;
    date: string;
    timestamp: string;
    type?: string;
    size?: number;
    path: string;
    content?: any;
  }>;
  selectedLogFile: number | null;
  onSelectLogFile: (index: number | null) => void;
  logDirectory?: string | null;
  logFilesLoading: boolean;
  onLoadLogFiles: (runId: string) => void;
  // Live logs
  logs: string[];
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  onClearLogs: () => void;
  logsContainerRef: React.RefObject<HTMLDivElement | null>;
  // Workflow steps
  workflowStepsStatus: {
    running: boolean;
    pipelineRunId?: string;
    currentStep?: {
      stepNumber: number;
      stepName?: string;
      workflowId?: string;
    };
    progress?: {
      completed: number;
      total: number;
      percentage: number;
      estimatedTimeRemaining?: number;
    };
    stepProgress?: Array<{
      stepNumber: number;
      stepName?: string;
      status: 'completed' | 'running' | 'pending';
    }>;
    startTime?: string | Date;
    message?: string;
  } | null;
  workflowStepsStatusLoading: boolean;
  onLoadWorkflowStepsStatus: () => void;
}

/**
 * Get status icon based on test status
 */
function getStatusIcon(testStatus: TestStatus | null) {
  if (!testStatus) return <AlertCircle className="w-4 h-4" />;
  if (testStatus.running) return <Loader2 className="w-4 h-4 animate-spin" />;
  if (testStatus.error) return <XCircle className="w-4 h-4 text-red-500" />;
  if (testStatus.filesReady) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  return <AlertCircle className="w-4 h-4" />;
}

/**
 * Get status text based on test status
 */
function getStatusText(testStatus: TestStatus | null): string {
  if (!testStatus) return t('test.ready');
  if (testStatus.running) return t('test.testsRunning');
  if (testStatus.error) return t('test.failed');
  if (testStatus.filesReady) return t('test.completed');
  return t('test.ready');
}

/**
 * Get log entry color class based on content
 */
function getLogColorClass(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('failed')) return 'text-destructive';
  if (lower.includes('warn') || lower.includes('warning')) return 'text-yellow-600 dark:text-yellow-400';
  if (lower.includes('debug')) return 'text-muted-foreground';
  return 'text-green-600 dark:text-green-400';
}

export function TestExecutionSection({
  testStatus,
  onRunTests,
  onStopTests,
  logFiles,
  selectedLogFile,
  onSelectLogFile,
  logDirectory,
  logFilesLoading,
  onLoadLogFiles,
  logs,
  autoScroll,
  onToggleAutoScroll,
  onClearLogs,
  logsContainerRef,
  workflowStepsStatus,
  workflowStepsStatusLoading,
  onLoadWorkflowStepsStatus,
}: TestExecutionSectionProps) {
  return (
    <>
      {/* Test Execution Controls */}
      <Card>
        <CardHeader>
          <CardTitle>{t('test.execution.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            {!testStatus?.running ? (
              <Button 
                onClick={onRunTests} 
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="run-all-tests-button"
              >
                <Play className="w-4 h-4 mr-2" />
                {t('test.execution.runAllTests')}
              </Button>
            ) : (
              <Button 
                onClick={onStopTests} 
                variant="destructive"
                data-testid="stop-tests-button"
              >
                <Square className="w-4 h-4 mr-2" />
                {t('test.execution.stopTests')}
              </Button>
            )}
            
            <div 
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg"
              data-testid="test-status-indicator"
            >
              {getStatusIcon(testStatus)}
              <span className="text-sm font-medium">{getStatusText(testStatus)}</span>
            </div>
            
            {testStatus?.startTime && (
              <span className="text-sm text-gray-600">
                {t('test.execution.started')} {new Date(testStatus.startTime).toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Progress indicator */}
          {testStatus?.running && testStatus.progress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <TestProgressBar progress={testStatus.progress} />
            </div>
          )}

          {testStatus && (testStatus.running || testStatus.error || testStatus.filesReady) && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded space-y-2">
              {testStatus.processId && <div>{t('test.execution.processId')} {testStatus.processId}</div>}
              {testStatus.testFile && <div>{t('test.execution.testFile')} {testStatus.testFile}</div>}
              {testStatus.error && (
                <div className="text-red-600 mt-2">{t('test.execution.error')} {testStatus.error}</div>
              )}
              {testStatus.filesReady && (
                <div className="text-green-600 mt-2">{t('test.execution.resultsReady')}</div>
              )}
              {testStatus.lastRunId && (
                <div className="mt-2">
                  <Button
                    onClick={() => onLoadLogFiles(testStatus.lastRunId!)}
                    variant="outline"
                    size="sm"
                    disabled={logFilesLoading}
                  >
                    {logFilesLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        {t('test.execution.loading')}
                      </>
                    ) : (
                      <>
                        <FileText className="w-3 h-3 mr-2" />
                        {t('test.execution.viewLogFiles')}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Log Files Section */}
          {logFiles.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t('test.execution.logFiles')}
                {logDirectory && (
                  <span className="text-xs text-gray-500 font-normal">
                    {t('test.execution.savedIn')} {logDirectory})
                  </span>
                )}
              </h3>
              <div className="space-y-2">
                {logFiles.map((file, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded">
                    <button
                      onClick={() => onSelectLogFile(selectedLogFile === idx ? null : idx)}
                      className="w-full text-left p-2 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{file.suite}</div>
                        <div className="text-xs text-gray-500">
                          {file.date} {file.timestamp} • {file.type?.toUpperCase() || 'UNKNOWN'}
                          {file.size && ` • ${(file.size / 1024).toFixed(1)} KB`}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-1 truncate">
                          {file.path}
                        </div>
                      </div>
                      <div className="ml-2">
                        {selectedLogFile === idx ? (
                          <span className="text-xs text-gray-500">▼</span>
                        ) : (
                          <span className="text-xs text-gray-500">▶</span>
                        )}
                      </div>
                    </button>
                    {selectedLogFile === idx && file.content && (
                      <div className="border-t border-gray-200 p-3 bg-gray-50">
                        <div className="text-xs font-semibold mb-2 text-gray-700">{t('test.execution.logContent')}</div>
                        {file.type === 'json' ? (
                          <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded font-mono overflow-x-auto max-h-96 overflow-y-auto">
                            {String(JSON.stringify(file.content as any, null, 2))}
                          </pre>
                        ) : (
                          <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                            {typeof file.content === 'string' ? (file.content as string) : String(file.content)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {t('test.execution.logsAutoSaved')}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Logs Viewer */}
      {testStatus?.running && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>{t('test.execution.liveLogs')}</CardTitle>
              <div className="flex gap-2">
                <Button onClick={onClearLogs} variant="outline" size="sm">
                  {t('test.execution.clear')}
                </Button>
                <Button
                  onClick={onToggleAutoScroll}
                  variant="outline"
                  size="sm"
                >
                  {autoScroll ? t('test.autoScrollOn') : t('test.autoScrollOff')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={logsContainerRef}
              className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-[500px] overflow-y-auto"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500">{t('test.execution.waitingForOutput')}</div>
              ) : (
                logs.map((line, index) => (
                  <div key={index} className={getLogColorClass(line)}>
                    {line}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow Steps Test Monitoring */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{t('test.execution.workflowStepsMonitoring')}</CardTitle>
            <Button
              onClick={onLoadWorkflowStepsStatus}
              variant="outline"
              size="sm"
              disabled={workflowStepsStatusLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${workflowStepsStatusLoading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {workflowStepsStatusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">{t('test.execution.loadingStatus')}</span>
            </div>
          ) : workflowStepsStatus?.running ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-700">{t('test.execution.pipelineStatus')}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {t('test.execution.executionId')} {workflowStepsStatus.pipelineRunId?.substring(0, 20)}...
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-semibold text-green-600">{t('test.execution.active')}</span>
                </div>
              </div>

              {workflowStepsStatus.currentStep && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-sm font-semibold text-blue-900 mb-1">{t('test.execution.currentStep')}</div>
                  <div className="text-sm text-blue-700">
                    {t('test.execution.step')} {workflowStepsStatus.currentStep.stepNumber}: {workflowStepsStatus.currentStep.stepName || t('common.unknown')}
                  </div>
                  {workflowStepsStatus.currentStep.workflowId && (
                    <div className="text-xs text-blue-600 mt-1">
                      {t('test.execution.workflow')} {workflowStepsStatus.currentStep.workflowId}
                    </div>
                  )}
                </div>
              )}

              {workflowStepsStatus.progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{t('test.execution.progress')}</span>
                    <span className="font-semibold">
                      {workflowStepsStatus.progress.completed} / {workflowStepsStatus.progress.total} {t('test.execution.steps')}
                      ({workflowStepsStatus.progress.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${workflowStepsStatus.progress.percentage}%` }}
                    />
                  </div>
                  {workflowStepsStatus.progress.estimatedTimeRemaining && (
                    <div className="text-xs text-gray-500">
                      {t('test.execution.estimatedTimeRemaining')} {Math.floor(workflowStepsStatus.progress.estimatedTimeRemaining / 60)}m {workflowStepsStatus.progress.estimatedTimeRemaining % 60}s
                    </div>
                  )}
                </div>
              )}

              {workflowStepsStatus.stepProgress && workflowStepsStatus.stepProgress.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-gray-700">{t('test.execution.stepProgress')}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {workflowStepsStatus.stepProgress.map((step) => (
                      <div
                        key={step.stepNumber}
                        className={`p-2 rounded border ${
                          step.status === 'completed'
                            ? 'bg-green-50 border-green-200'
                            : step.status === 'running'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="text-xs font-semibold">
                          {t('test.execution.step')} {step.stepNumber}
                        </div>
                        <div className="text-xs text-gray-600 truncate" title={step.stepName}>
                          {step.stepName}
                        </div>
                        <div className="text-xs mt-1">
                          {step.status === 'completed' && (
                            <span className="text-green-600">{t('test.execution.completed')}</span>
                          )}
                          {step.status === 'running' && (
                            <span className="text-blue-600">{t('test.execution.running')}</span>
                          )}
                          {step.status === 'pending' && (
                            <span className="text-gray-500">{t('test.execution.pending')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {workflowStepsStatus.startTime && (
                <div className="text-xs text-gray-500">
                  {t('test.execution.started')} {new Date(workflowStepsStatus.startTime).toLocaleString()}
                </div>
              )}
            </div>
          ) : workflowStepsStatus?.message ? (
            <div className="text-sm text-gray-500 text-center py-4">
              {translateLogMessage(workflowStepsStatus.message)}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-4">
              {t('test.execution.noWorkflowStepsActive')}
            </div>
          )}
        </CardContent>
      </Card>

    </>
  );
}
