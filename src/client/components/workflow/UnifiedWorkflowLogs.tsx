/**
 * UnifiedWorkflowLogs Component
 * 
 * Unified component that consolidates WorkflowLogsDisplay and WorkflowLogs functionality.
 * Displays workflow execution logs with instant text rendering.
 */

import { useEffect, useRef } from 'react';
import { Clock, Info, Sparkles, Download, Pause, Play, Square } from 'lucide-react';
import { LogBubble, BaseLogEntry } from '../shared/LogBubble';
import { JobFailureDisplay } from '../jobs/JobFailureDisplay';
import { t, translateStatus } from '../../utils/i18n';
import { translateLogMessage } from '../../utils/logTranslations';
import { useRunLogs } from '../../hooks/useRunLogs';
import type { ScraperProgressUpdate, JobProgressEvent } from '../../hooks/useWebSocket';

interface UnifiedWorkflowLogsProps {
  // Logs data - can be provided directly or fetched via runId
  logs?: BaseLogEntry[];
  runId?: string | null;
  
  // Status and workflow info
  runStatus?: string | null;
  runningWorkflowId?: string | null;
  pollingError?: string | null;
  isPolling?: boolean;
  
  // Additional features (from WorkflowLogsDisplay)
  jobFailures?: JobProgressEvent[];
  workflowProgress?: ScraperProgressUpdate['data'] | null;
  
  // Refs for scrolling
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  logEndRef?: React.RefObject<HTMLDivElement | null>;
  
  // Callbacks
  onDownloadLogs?: () => void;
  onDismissJobFailure?: (jobId: string) => void;
  onPauseWorkflow?: () => void;
  onResumeWorkflow?: () => void;
  onStopWorkflow?: () => void;
  
  // Layout options
  variant?: 'inline' | 'compact';
  className?: string;
  title?: string;
  showHeader?: boolean;
}

export function UnifiedWorkflowLogs({
  logs: providedLogs,
  runId: providedRunId,
  runStatus: providedRunStatus,
  runningWorkflowId,
  pollingError,
  isPolling,
  jobFailures = [],
  workflowProgress,
  scrollContainerRef: providedScrollContainerRef,
  logEndRef: providedLogEndRef,
  onDownloadLogs: providedOnDownloadLogs,
  onDismissJobFailure,
  onPauseWorkflow,
  onResumeWorkflow,
  onStopWorkflow,
  variant = 'inline',
  className = '',
  title,
  showHeader = true,
}: UnifiedWorkflowLogsProps) {
  // Use runId if provided, otherwise fall back to runningWorkflowId
  const runId = providedRunId || runningWorkflowId || null;
  
  // If runId is provided but logs are not, fetch them using useRunLogs
  const { logs: fetchedLogs, status: fetchedStatus, isLoading } = useRunLogs({
    runId: runId || null,
    pollDelay: 3000,
    autoClearOnComplete: false,
    clearDelay: 10000
  });
  
  const logs = providedLogs || fetchedLogs || [];
  const runStatus = providedRunStatus || fetchedStatus || null;
  
  // Always create refs - cannot conditionally call hooks
  const internalScrollContainerRef = useRef<HTMLDivElement>(null);
  const internalLogEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = providedScrollContainerRef || internalScrollContainerRef;
  const logEndRef = providedLogEndRef || internalLogEndRef;
  
  // Auto-scroll to bottom when new logs arrive
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      const container = scrollContainerRef?.current;
      if (!container || logs.length === 0) return;
      
      requestAnimationFrame(() => {
        if (!container) return;
        
        const scrollHeight = container.scrollHeight;
        const scrollTop = container.scrollTop;
        const clientHeight = container.clientHeight;
        
        const scrollThreshold = 100;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < scrollThreshold;
        const isInitialContent = scrollHeight <= clientHeight;

        if (isNearBottom || isInitialContent) {
          container.scrollTop = scrollHeight;
        }
      });
    }, 300);
    
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [logs.length, scrollContainerRef]);

  const handleDownloadLogs = () => {
    if (providedOnDownloadLogs) {
      providedOnDownloadLogs();
      return;
    }
    
    if (logs.length === 0) return;
    
    const logText = logs.map(log => {
      const timestamp = typeof log.timestamp === 'string' 
        ? log.timestamp 
        : log.timestamp instanceof Date
        ? log.timestamp.toLocaleString('nl-NL')
        : '--:--:--';
      let text = `[${timestamp}] ${(log.level || 'info').toUpperCase()}\n`;
      text += `${log.localizedMessage || log.formattedMessage || log.message}\n`;
      if (log.thoughtBubble && !/Ik werk de navigatiegrafiek bij|Navigation graph.*updated|graph.*updated|Updating graph|Merging.*graph|Consolidating.*graph/i.test(log.thoughtBubble)) {
        text += `💭 ${log.thoughtBubble}\n`;
      }
      text += '\n';
      return text;
    }).join('---\n');
    
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow-logs-${runId || 'unknown'}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = () => {
    if (!runStatus) return null;
    
    switch (runStatus) {
      case 'completed':
        return (
          <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-green-900 text-green-300">
            {t('workflowLogs.status.completed')}
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-red-900 text-red-300">
            {t('workflowLogs.status.failed')}
          </span>
        );
      case 'running':
        return (
          <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-blue-900 text-blue-300 flex items-center gap-1">
            <Clock className="w-3 h-3 animate-spin" />
            {t('workflowLogs.status.running')}
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-gray-900 text-gray-300">
            {t('workflowLogs.status.pending')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-gray-900 text-gray-300">
            {t('workflowLogs.status.cancelled')}
          </span>
        );
      case 'completed_with_errors':
        return (
          <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-yellow-900 text-yellow-300">
            {t('workflowLogs.status.completed_with_errors')}
          </span>
        );
      default:
        return (
          <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
            runStatus === 'completed' ? 'bg-green-900 text-green-300' :
            runStatus === 'failed' ? 'bg-red-900 text-red-300' :
            runStatus === 'completed_with_errors' ? 'bg-yellow-900 text-yellow-300' :
            'bg-blue-900 text-blue-300'
          }`}>
            {translateStatus(runStatus)}
          </span>
        );
    }
  };

  // Determine display title
  const displayTitle = title || (variant === 'inline' ? t('workflowPage.workflowThoughts') : t('workflowLogs.title'));

  // Container classes based on variant
  const containerClasses = variant === 'inline' 
    ? `lg:col-span-2 bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col h-[600px] ${className}`
    : `bg-gray-900 rounded-xl border border-gray-700 flex flex-col h-full ${className}`;

  return (
    <div className={containerClasses} data-testid="execution-logs-panel">
      {showHeader && (
        <div className={`flex flex-col gap-2 mb-4 border-b border-gray-700 ${variant === 'inline' ? 'pb-2' : 'p-4'}`}>
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-semibold text-gray-200 ${variant === 'compact' ? 'flex items-center gap-2' : ''}`}>
              {variant === 'compact' && <Sparkles className="w-5 h-5 text-blue-400" />}
              {displayTitle}
            </h3>
            <div className="flex items-center gap-2">
              {/* Pause/Resume button - only show when workflow is running or paused */}
              {runId && (runStatus === 'running' || runStatus === 'paused') && (
                <>
                  {runStatus === 'running' && onPauseWorkflow && (
                    <button
                      onClick={onPauseWorkflow}
                      className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                      title={t('workflowPage.pause')}
                      aria-label={t('workflowPage.pause')}
                    >
                      <Pause className="w-4 h-4 text-yellow-400 fill-current" />
                    </button>
                  )}
                  {runStatus === 'paused' && onResumeWorkflow && (
                    <button
                      onClick={onResumeWorkflow}
                      className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                      title={t('workflowPage.resume')}
                      aria-label={t('workflowPage.resume')}
                    >
                      <Play className="w-4 h-4 text-green-400 fill-current" />
                    </button>
                  )}
                  {/* Stop button - show when running or paused */}
                  {onStopWorkflow && (
                    <button
                      onClick={onStopWorkflow}
                      className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                      title={t('workflowPage.stop')}
                      aria-label={t('workflowPage.stop')}
                    >
                      <Square className="w-4 h-4 text-red-400 fill-current" />
                    </button>
                  )}
                </>
              )}
              {logs.length > 0 && (
                <button
                  onClick={handleDownloadLogs}
                  className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                  title={variant === 'inline' ? t('workflowPage.downloadLogsTooltip') : t('workflowLogs.downloadTooltip')}
                >
                  <Download className="w-4 h-4 text-gray-400" />
                </button>
              )}
              {runStatus && getStatusBadge()}
            </div>
          </div>
          
          {/* Job failures display */}
          {jobFailures.length > 0 && (
            <div className="space-y-2 mb-4">
              {jobFailures.map((failure) => (
                <JobFailureDisplay
                  key={failure.jobId}
                  event={failure}
                  variant="text"
                  onDismiss={() => onDismissJobFailure?.(failure.jobId)}
                />
              ))}
            </div>
          )}
          
          {/* Real-time progress indicator */}
          {workflowProgress && (runStatus === 'running' || runStatus === 'pending') && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{translateLogMessage(workflowProgress.currentStep)}</span>
                <span>
                  {workflowProgress.completedSteps} / {workflowProgress.totalSteps} {t('workflowLogs.steps')}
                  {workflowProgress.progress !== undefined && ` (${workflowProgress.progress}%)`}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${workflowProgress.progress || 0}%` }}
                />
              </div>
              {workflowProgress.estimatedSecondsRemaining && workflowProgress.estimatedSecondsRemaining > 0 && (
                <div className="text-xs text-gray-500">
                  {t('workflowLogs.estimatedTimeRemaining')}: {Math.floor(workflowProgress.estimatedSecondsRemaining / 60)}m {workflowProgress.estimatedSecondsRemaining % 60}s
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto ${variant === 'inline' ? 'space-y-4 p-3' : 'p-4 space-y-3'}`}
      >
        {logs.length === 0 ? (
          <div className="text-center py-8">
            {pollingError ? (
              <div className="space-y-2">
                <div className="text-red-400 font-semibold">{t('workflowPage.errorFetchingStatus')}</div>
                <div className="text-gray-400 text-sm">{pollingError}</div>
                <div className="text-gray-500 text-xs mt-4">{t('workflowPage.stillChecking')}</div>
              </div>
            ) : runningWorkflowId && (runStatus === 'running' || runStatus === 'pending') ? (
              <div className="space-y-2">
                <div className="text-blue-400 font-semibold">{t('workflowPage.workflowStarting')}</div>
                <div className="text-gray-400 text-sm">{t('workflowPage.waitingForLogs')}</div>
                {isPolling && (
                  <div className="text-gray-500 text-xs mt-2">{t('workflowPage.fetchingStatus')}</div>
                )}
              </div>
            ) : !runId ? (
              <div className="text-gray-500 text-center py-8">
                <Info className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p>{t('workflowLogs.waiting')}</p>
              </div>
            ) : isLoading && logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p>{t('workflowLogs.loading')}</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p>{t('workflowLogs.noLogs')}</p>
              </div>
            ) : (
              <div className="text-gray-500 italic">{t('workflowPage.noLogsAvailable')}</div>
            )}
          </div>
        ) : (
          <>
            {logs.map((log, index) => {
              const logId = log.id || `log-${index}`;

              const translatedMessage = log.localizedMessage || 
                (log.formattedMessage ? translateLogMessage(log.formattedMessage) : 
                 (log.message ? translateLogMessage(log.message) : ''));
              
              const baseLog: BaseLogEntry = {
                id: logId,
                timestamp: log.timestamp || new Date(),
                message: log.message || '',
                formattedMessage: translatedMessage,
                localizedMessage: translatedMessage,
                thoughtBubble: log.thoughtBubble,
                level: (log.level && (log.level === 'info' || log.level === 'warn' || log.level === 'error' || log.level === 'debug')) ? log.level as 'info' | 'warn' | 'error' | 'debug' : 'info',
                isComplete: runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled' || log.isComplete || false,
                icon: log.icon || '🤖',
                color: log.color || (log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-400' :
                    'text-gray-200')
              };

              return (
                <LogBubble
                  key={logId}
                  log={baseLog}
                  variant={variant}
                  enableFadeOut={false}
                  nextLog={index < logs.length - 1 ? logs[index + 1] : null}
                />
              );
            })}
            <div ref={logEndRef} id="log-end" />
          </>
        )}
      </div>
    </div>
  );
}
