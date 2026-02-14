import { useState, useEffect, useRef } from 'react';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { BaseLogEntry } from '../components/shared/LogBubble';
import { translateLogMessage } from '../utils/logTranslations';
import { api } from '../services/api';
import { logError, parseError } from '../utils/errorHandler';
import { WORKFLOWS } from '../config/constants';
import { useWebSocket, type ScraperProgressUpdate, type JobProgressEvent } from '../hooks/useWebSocket';
import { useSSE, type LogEventData, type JobStatusEventData, type CompletedEventData } from './useSSE';

// Use a function to access env to make it testable
const getWorkflowDebugEnabled = () => {
    try {
        return (import.meta.env as Record<string, string | undefined>).VITE_WORKFLOW_DEBUG === 'true';
    } catch {
        // Fallback for test environments where import.meta.env might not be available
        return false;
    }
};

const WORKFLOW_DEBUG_ENABLED = getWorkflowDebugEnabled();

const debugLog = (...args: unknown[]) => {
    if (WORKFLOW_DEBUG_ENABLED) {
        console.debug(...args);
    }
};

export function useWorkflowRun() {
    const [logs, setLogs] = useState<BaseLogEntry[]>([]);
    const [runStatus, setRunStatus] = useState<string | null>(null);
    const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null); // This stores the runId
    const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null); // This stores the workflow.id
    const [runHasCompleted, setRunHasCompleted] = useState(false);
    const [showReviewDialog, setShowReviewDialog] = useState(false);
    const [pollingError, setPollingError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [workflowProgress, setWorkflowProgress] = useState<ScraperProgressUpdate['data'] | null>(null);
    const [jobFailures, setJobFailures] = useState<JobProgressEvent[]>([]);
    const [missingRequiredFields, setMissingRequiredFields] = useState<{ action: string; fields: string[] } | null>(null);

    const processedLogIdsRef = useRef<Set<string>>(new Set());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const stuckWarningShownRef = useRef<boolean>(false);
    const completionToastShownRef = useRef<string | null>(null); // Track which status toast was shown

    // WebSocket connection for real-time progress updates
    useWebSocket({
        enabled: !!runningWorkflowId,
        runId: runningWorkflowId || undefined,
        onScraperProgress: (progress: ScraperProgressUpdate) => {
            if (progress.runId === runningWorkflowId) {
                debugLog('[useWorkflowRun] Received progress update:', progress);
                setWorkflowProgress(progress.data);

                // Update run status based on progress status
                if (progress.data.status === 'completed') {
                    // Check if there are errors to determine if it's a partial failure
                    if (progress.data.error) {
                        setRunStatus('completed_with_errors');
                    } else {
                        setRunStatus('completed');
                    }
                    setRunHasCompleted(true);
                } else if (progress.data.status === 'failed') {
                    setRunStatus('failed');
                } else if (progress.data.status === 'cancelled') {
                    setRunStatus('cancelled');
                } else if (progress.data.status === 'running') {
                    setRunStatus('running');
                } else if (progress.data.status === 'pending') {
                    setRunStatus('pending');
                }
            }
        },
        onJobProgress: (event: JobProgressEvent) => {
            // Check for job failures or completed with errors (check error field)
            const isPartialFailure = event.type === 'job_completed' && event.data.status === 'completed' && event.data.error;
            if (event.type === 'job_failed' || isPartialFailure) {
                debugLog('[useWorkflowRun] Received job failure/partial failure event:', event);
                setJobFailures(prev => {
                    // Avoid duplicates
                    if (prev.some(f => f.jobId === event.jobId)) {
                        return prev;
                    }
                    return [...prev, event];
                });
                // Also update run status if this is a workflow job (check metadata for jobType)
                const jobType = (event.data.metadata && typeof event.data.metadata === 'object' && 'jobType' in event.data.metadata) 
                    ? event.data.metadata.jobType 
                    : event.jobType;
                // Check if jobType is workflow (might be in metadata or check queryId to infer workflow)
                const isWorkflowJob = jobType === 'workflow' || (typeof jobType === 'string' && jobType === 'workflow') || event.queryId;
                if (isWorkflowJob) {
                    setRunStatus(event.type === 'job_failed' ? 'failed' : 'completed_with_errors');
                }
            }
        },
    });

    // SSE connection for real-time logs and status (per TOOL-006)
    // WebSocket still used for scraper_progress and job_progress (different use cases)
    const { isConnected: sseConnected } = useSSE(
        runningWorkflowId ? `/api/runs/${runningWorkflowId}/events` : '',
        {
            enabled: !!runningWorkflowId,
            onLog: (data: LogEventData) => {
                if (data.runId !== runningWorkflowId) return;
                
                // Process log using existing logic
                const log = data.log;
                const logLevel = log.level || 'info';
                const isDebugLog = logLevel === 'debug';
                const shouldShowDebug = WORKFLOW_DEBUG_ENABLED;
                
                if (isDebugLog && !shouldShowDebug) {
                    return; // Skip debug logs in production/normal mode
                }
                
                const logId = `${String(log.timestamp ?? Date.now())}-${typeof log.message === 'string' ? log.message.substring(0, 50) : ''}`;
                
                if (!processedLogIdsRef.current.has(logId)) {
                    processedLogIdsRef.current.add(logId);
                    
                    const formattedMessage = typeof log.message === 'string' ? log.message : '';
                    if (!formattedMessage.trim()) return;
                    
                    const localizedMessage = translateLogMessage(formattedMessage);
                    const thoughtBubble = typeof log.metadata?.thoughtBubble === 'string' ? log.metadata.thoughtBubble : undefined;
                    
                    let timestamp: Date | string;
                    if (log.timestamp instanceof Date) {
                        timestamp = isNaN(log.timestamp.getTime()) ? new Date() : log.timestamp;
                    } else if (typeof log.timestamp === 'string') {
                        const date = new Date(log.timestamp);
                        timestamp = isNaN(date.getTime()) ? new Date() : date;
                    } else {
                        timestamp = new Date();
                    }
                    
                    const level: 'info' | 'warn' | 'error' | 'debug' = (logLevel === 'error' || logLevel === 'info' || logLevel === 'warn' || logLevel === 'debug') 
                        ? logLevel as 'info' | 'warn' | 'error' | 'debug' 
                        : 'info';
                    
                    // Check for missing required fields error messages
                    if (level === 'error' && formattedMessage) {
                        const missingFieldsMatch = formattedMessage.match(/Ontbrekende verplichte invoervelden voor ([^:]+):\s*(.+)/i);
                        if (missingFieldsMatch) {
                            const action = missingFieldsMatch[1].trim();
                            const fieldsStr = missingFieldsMatch[2].trim();
                            const fields = fieldsStr.split(',').map(f => f.trim()).filter(f => f.length > 0);
                            setMissingRequiredFields({ action, fields });
                        }
                    }
                    
                    const icon = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '🤖';
                    const color = level === 'error' ? 'text-red-400' : level === 'warn' ? 'text-yellow-400' : 'text-blue-400';
                    
                    const newLog: BaseLogEntry = {
                        id: logId,
                        timestamp,
                        message: formattedMessage,
                        formattedMessage: localizedMessage,
                        localizedMessage,
                        thoughtBubble,
                        level,
                        isComplete: runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled',
                        icon,
                        color
                    };
                    
                    setLogs(prev => {
                        const existingLogIds = new Set(prev.map(l => l.id));
                        if (existingLogIds.has(logId)) return prev;
                        
                        const allLogs = [...prev, newLog];
                        // Apply clustering (simplified - full clustering logic is in WorkflowPage)
                        return allLogs;
                    });
                    
                    // Reset stuck warning on new log
                    stuckWarningShownRef.current = false;
                }
            },
            onJobStatus: (data: JobStatusEventData) => {
                if (data.runId !== runningWorkflowId) return;
                
                // Update status from SSE
                setRunStatus(data.status);
                setPollingError(null); // Clear errors on successful status update
                
                // Ensure polling is stopped when SSE is receiving status updates
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                    setIsPolling(false);
                }
                
                // Handle status-specific logic
                if (data.status === 'paused') {
                    setShowReviewDialog(true);
                } else if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                    setRunHasCompleted(true);
                    setLogs(prev => prev.map(log => ({ ...log, isComplete: true })));
                }
            },
            onCompleted: (data: CompletedEventData) => {
                if (data.runId !== runningWorkflowId) return;
                
                setRunStatus('completed');
                setRunHasCompleted(true);
                setLogs(prev => prev.map(log => ({ ...log, isComplete: true })));
            },
            onConnectionError: () => {
                // SSE connection error - could fall back to polling if needed
                // For now, just log it
                debugLog('[useWorkflowRun] SSE connection error');
            },
        }
    );

    // Fallback polling (only if SSE fails) - simplified version
    useEffect(() => {
        if (!runningWorkflowId || sseConnected) {
            // SSE is connected, no polling needed
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setIsPolling(false);
            return;
        }

        // SSE not connected - use simplified polling as fallback
        let pollDelay = 3000;
        let consecutiveErrors = 0;
        let isPolling = false;
        let lastLogCount = 0;
        let lastLogUpdateTime = Date.now();
        const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

        const pollRun = async () => {
            // Prevent concurrent polls
            if (isPolling) {
                debugLog(`[useWorkflowRun] Poll already in progress, skipping`);
                return;
            }
            isPolling = true;
            setIsPolling(true);
            setPollingError(null);

            try {
                debugLog(`[useWorkflowRun] Fallback polling run ${runningWorkflowId}`);
                const run = await api.workflow.getRun(runningWorkflowId);

                consecutiveErrors = 0;
                pollDelay = 3000;

                if (run) {
                    const currentLogCount = run.logs?.length || 0;
                    debugLog(`[useWorkflowRun] Run status: ${run.status}, logs: ${currentLogCount}`);

                    // Basic stuck detection
                    if (run.status === 'running' || run.status === 'pending' || run.status === 'completed_with_errors') {
                        if (currentLogCount > lastLogCount) {
                            lastLogCount = currentLogCount;
                            lastLogUpdateTime = Date.now();
                            stuckWarningShownRef.current = false;
                        } else {
                            const timeSinceLastLog = Date.now() - lastLogUpdateTime;
                            if (timeSinceLastLog > STUCK_THRESHOLD_MS && !stuckWarningShownRef.current) {
                                toast.warning(
                                    'Workflow lijkt vast te zitten',
                                    `Geen voortgang gedurende ${Math.floor(timeSinceLastLog / 60000)} minuten.`
                                );
                                stuckWarningShownRef.current = true;
                            }
                        }
                    } else {
                        stuckWarningShownRef.current = false;
                    }
                    // Process new logs and apply clustering
                    const rawLogs = run.logs || [];
                    const newLogs: BaseLogEntry[] = [];

                        debugLog(`[useWorkflowRun] Polling run ${runningWorkflowId}: ${rawLogs.length} total logs, ${processedLogIdsRef.current.size} already processed`);

                        rawLogs.forEach((log: Record<string, unknown>) => {
                            // Filter out debug logs from user-facing UI (unless in development with debug enabled)
                            const logLevel = typeof log.level === 'string' ? log.level : 'info';
                            const isDebugLog = logLevel === 'debug';
                            const shouldShowDebug = WORKFLOW_DEBUG_ENABLED;

                            if (isDebugLog && !shouldShowDebug) {
                                return; // Skip debug logs in production/normal mode
                            }

                            // Use the ID from the formatted log - server provides unique IDs like "log-{index}-{timestamp}"
                            // Fallback to generating one if missing
                            const logId = (typeof log.id === 'string' ? log.id : undefined)
                                || `${log.timestamp || Date.now()}-${typeof log.message === 'string' ? log.message.substring(0, 50) : Math.random()}`;

                            if (!processedLogIdsRef.current.has(logId)) {
                                processedLogIdsRef.current.add(logId);
                                const formatted = typeof log.formattedMessage === 'string'
                                    ? log.formattedMessage
                                    : typeof log.message === 'string'
                                        ? log.message
                                        : '';
                                debugLog(`[useWorkflowRun] New log detected: ${logId} - ${formatted}`);

                                const formattedMessage = formatted;
                                const localizedMessage = translateLogMessage(formattedMessage);
                                const thoughtBubble = typeof log.thoughtBubble === 'string' ? log.thoughtBubble : undefined;

                                // Check for missing required fields error messages
                                if (logLevel === 'error' && formattedMessage) {
                                    const missingFieldsMatch = formattedMessage.match(/Ontbrekende verplichte invoervelden voor ([^:]+):\s*(.+)/i);
                                    if (missingFieldsMatch) {
                                        const action = missingFieldsMatch[1].trim();
                                        const fieldsStr = missingFieldsMatch[2].trim();
                                        const fields = fieldsStr.split(',').map(f => f.trim()).filter(f => f.length > 0);
                                        if (fields.length > 0) {
                                            setMissingRequiredFields({ action, fields });
                                        }
                                    }
                                }

                                // Handle timestamp - could be Date, ISO string, or formatted time string
                                let timestamp: Date | string;
                                const rawTimestamp = log.timestamp;
                                if (rawTimestamp instanceof Date) {
                                    // Check if date is valid
                                    timestamp = isNaN(rawTimestamp.getTime()) ? new Date() : rawTimestamp;
                                } else if (typeof rawTimestamp === 'string') {
                                    // Try to parse as ISO date first
                                    const date = new Date(rawTimestamp);
                                    if (!isNaN(date.getTime())) {
                                        timestamp = date;
                                    } else {
                                        // If it's a formatted time string (like "14:23:45"), use current date with that time
                                        // or just use current date
                                        timestamp = new Date();
                                    }
                                } else {
                                    timestamp = new Date();
                                }

                                const level: 'info' | 'warn' | 'error' | 'debug' = (typeof log.level === 'string' && (log.level === 'info' || log.level === 'warn' || log.level === 'error' || log.level === 'debug')) ? log.level as 'info' | 'warn' | 'error' | 'debug' : 'info';
                                const icon = typeof log.icon === 'string' ? log.icon : (level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '🤖');
                                const color = typeof log.color === 'string'
                                    ? log.color
                                    : (level === 'error' ? 'text-red-400' : level === 'warn' ? 'text-yellow-400' : 'text-blue-400');

                                newLogs.push({
                                    id: logId,
                                    timestamp,
                                    message: formattedMessage,
                                    formattedMessage: localizedMessage, // Use translated message
                                    localizedMessage,
                                    thoughtBubble,
                                    level,
                                    isComplete: run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled',
                                    icon,
                                    color
                                });
                            }
                        });

                        // Only update logs if we have new ones to avoid unnecessary re-renders
                        if (newLogs.length > 0) {
                            debugLog(`[useWorkflowRun] Adding ${newLogs.length} new logs`);

                            setLogs(prev => {
                                // Simple: just append new logs, no clustering
                                const existingLogIds = new Set(prev.map(log => log.id));
                                const trulyNewLogs = newLogs.filter(log => !existingLogIds.has(log.id));
                                
                                if (trulyNewLogs.length === 0) {
                                    return prev;
                                }
                                
                                // Append new logs directly (no clustering)
                                const allLogs = [...prev, ...trulyNewLogs];
                                
                                debugLog(`[useWorkflowRun] Added ${trulyNewLogs.length} new logs, total: ${allLogs.length}`);
                                
                                return allLogs;
                            });
                        }

                        setRunStatus(run.status);

                        // Show review dialog if workflow is paused and has pending reviews
                        if (run.status === 'paused' && runningWorkflowId) {
                            // Check if a review exists before opening the dialog
                            // This prevents 404 errors when workflow is manually paused without a review
                            try {
                                const reviews = await api.getAllReviews(runningWorkflowId);
                                if (reviews && Array.isArray(reviews) && reviews.length > 0) {
                                    // Only open dialog if there are pending reviews
                                    setShowReviewDialog(true);
                                }
                                // If no reviews exist, silently skip opening the dialog
                                // This is expected behavior when workflow is manually paused
                            } catch (error) {
                                // If checking for reviews fails, don't open the dialog
                                // This prevents showing an error dialog when no review exists
                                const errorObj = error as Error & { statusCode?: number };
                                if (errorObj.statusCode === 404) {
                                    // 404 is expected when no review exists - don't log as error
                                    debugLog('[useWorkflowRun] No reviews found for paused workflow - not opening dialog');
                                } else {
                                    // For other errors, log but don't open dialog
                                    debugLog('[useWorkflowRun] Error checking for reviews:', error);
                                }
                            }
                        }
                        // Update current workflow ID from run params
                        if (run.params?.workflowId && typeof run.params.workflowId === 'string') {
                            setCurrentWorkflowId(run.params.workflowId);
                        }

                        if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
                            // Mark all logs as complete WITHOUT re-clustering to preserve word visibility
                            setLogs(prev => {
                                // Only update isComplete flag, don't re-cluster
                                return prev.map(log => ({ ...log, isComplete: true }));
                            });

                            // Show appropriate message based on status (only once per status change)
                            if (completionToastShownRef.current !== run.status) {
                                if (run.status === 'failed') {
                                    // Check if there are error logs
                                    const errorLogs = run.logs?.filter((log: Record<string, unknown>) =>
                                        log.level === 'error' || (typeof log.message === 'string' && log.message.toLowerCase().includes('error'))
                                    ) || [];

                                    if (errorLogs.length > 0) {
                                        const lastError = errorLogs[errorLogs.length - 1];
                                        // Use parseError to get user-friendly error message
                                        const errorInfo = parseError(lastError);
                                        const displayMessage = errorInfo.message || errorInfo.title || 'De workflow is gestopt met een fout.';
                                        toast.error(errorInfo.title || t('workflow.failed'), displayMessage);
                                    } else {
                                        toast.error(t('workflow.failed'), t('workflow.failedDesc'));
                                    }
                                } else if (run.status === 'completed') {
                                    toast.success(t('workflow.completed'), t('workflow.completedDesc'));
                                } else if ((run.status as string) === 'completed_with_errors') {
                                    toast.warning(t('workflow.completedWithErrors'), t('workflow.completedWithErrorsDesc'));
                                } else if (run.status === 'cancelled') {
                                    toast.info(t('workflow.cancelled'), t('workflow.cancelledDesc'));
                                }
                                completionToastShownRef.current = run.status;
                            }

                            // Stop polling when run completes
                            setRunHasCompleted(true);
                            if (intervalRef.current) {
                                clearInterval(intervalRef.current);
                                intervalRef.current = null;
                            }
                            setRunningWorkflowId(null);
                            setCurrentWorkflowId(null);
                            setRunStatus(null);
                            completionToastShownRef.current = null; // Reset completion toast tracking
                            stuckWarningShownRef.current = false; // Reset stuck warning tracking
                            // Don't clear logs - they should persist until a new workflow run starts
                            debugLog(`[useWorkflowRun] Run ${runningWorkflowId} completed with status: ${run.status}`);
                        } else if (run.status === 'pending') {
                            // Run is still pending (queued but not started yet) - continue polling
                            debugLog(`[useWorkflowRun] Run ${runningWorkflowId} is still pending`);

                            // Check if pending for too long (might indicate queue issue)
                            const runStartTime = run.startTime ? new Date(run.startTime).getTime() : Date.now();
                            const pendingTime = Date.now() - runStartTime;
                            if (pendingTime > 2 * 60 * 1000) { // 2 minutes
                                debugLog(`[useWorkflowRun] Run ${runningWorkflowId} has been pending for ${Math.floor(pendingTime / 1000)}s`);
                            }
                        }
                    } else {
                        debugLog(`[useWorkflowRun] Run ${runningWorkflowId} not found`);
                    }
                } catch (error) {
                    // Handle specific error cases
                    if (error instanceof Error) {
                        const errorWithStatusCode = error as Error & { statusCode?: number; code?: string };
                        const is404 = 
                            errorWithStatusCode.statusCode === 404 ||
                            errorWithStatusCode.code === 'NOT_FOUND' ||
                            error.message.toLowerCase().includes('not found') ||
                            error.message.includes('404');
                        
                        if (is404) {
                            // Run not found - don't log as error, it's expected during startup
                            debugLog(`[useWorkflowRun] Run ${runningWorkflowId} not found (404)`);
                            consecutiveErrors++;
                            
                            // Use parseError to get user-friendly error message
                            const errorInfo = parseError(error);
                            const displayMessage = errorInfo.message || errorInfo.title || 'Workflow run niet gevonden. De workflow is mogelijk nog niet gestart.';
                            setPollingError(displayMessage);
                            
                            // Exponential backoff on errors
                            if (consecutiveErrors > 3) {
                                pollDelay = Math.min(pollDelay * 2, 30000);
                                debugLog(`[useWorkflowRun] Backing off to ${pollDelay}ms due to ${consecutiveErrors} consecutive 404 errors`);
                                if (intervalRef.current) {
                                    clearInterval(intervalRef.current);
                                    intervalRef.current = null;
                                }
                                intervalRef.current = setInterval(pollRun, pollDelay);
                            }
                            // Don't show error toast for 404s - they're expected during startup
                        } else {
                            // Check if it's a 429 (rate limited)
                            const is429 = 
                                errorWithStatusCode.statusCode === 429 ||
                                errorWithStatusCode.code === 'RATE_LIMIT_EXCEEDED' ||
                                error.message.toLowerCase().includes('too many requests') ||
                                error.message.includes('429');
                            
                            if (is429) {
                                // Rate limited - back off more aggressively
                                pollDelay = Math.min(pollDelay * 3, 60000);
                                debugLog(`[useWorkflowRun] Rate limited, backing off to ${pollDelay}ms`);
                                if (intervalRef.current) {
                                    clearInterval(intervalRef.current);
                                    intervalRef.current = null;
                                }
                                intervalRef.current = setInterval(pollRun, pollDelay);
                                // Don't log rate limits as errors
                                return;
                            }
                            
                            // Log other errors
                            debugLog(`[useWorkflowRun] Error polling run ${runningWorkflowId}:`, error);
                            logError(error, 'poll-run');
                            consecutiveErrors++;

                            // Use parseError to get user-friendly error message
                            const errorInfo = parseError(error);
                            const displayMessage = errorInfo.message || errorInfo.title || 'Er is een fout opgetreden bij het ophalen van de workflow status.';
                            setPollingError(displayMessage);

                            // Exponential backoff on errors
                            if (consecutiveErrors > 3) {
                                pollDelay = Math.min(pollDelay * 2, 30000);
                                debugLog(`[useWorkflowRun] Backing off to ${pollDelay}ms due to ${consecutiveErrors} consecutive errors`);
                                if (intervalRef.current) {
                                    clearInterval(intervalRef.current);
                                    intervalRef.current = null;
                                }
                                intervalRef.current = setInterval(pollRun, pollDelay);
                            }

                            // Show error toast if too many consecutive errors
                            if (consecutiveErrors === 5) {
                                toast.error(t('workflow.statusFetchFailed'), t('workflow.statusFetchFailedDesc'));
                            }
                        }
                    } else {
                        // Non-Error object - log and handle generically
                        debugLog(`[useWorkflowRun] Error polling run ${runningWorkflowId}:`, error);
                        logError(error, 'poll-run');
                        consecutiveErrors++;
                        setPollingError('Er is een fout opgetreden bij het ophalen van de workflow status.');
                    }
                } finally {
                    isPolling = false;
                    setIsPolling(false);
                }
            };

        // Start polling immediately, then continue with interval
        pollRun(); // First poll immediately
        intervalRef.current = setInterval(pollRun, pollDelay);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [runningWorkflowId, sseConnected]);

    const startWorkflow = async (id: string, customParams: Record<string, unknown> = {}) => {
        setLogs([]); // Clear previous logs
        processedLogIdsRef.current.clear(); // Clear processed log IDs
        completionToastShownRef.current = null; // Reset completion toast tracking
        stuckWarningShownRef.current = false; // Reset stuck warning tracking
        setRunHasCompleted(false);
        setPollingError(null); // Clear any previous polling errors
        setIsPolling(false); // Reset polling state
        setMissingRequiredFields(null); // Clear any previous missing fields errors

        try {
            // Build params object - backend accepts any parameters via passthrough
            const params: Record<string, unknown> = {
                mode: 'dev',
                ...customParams
            };

            // Validate required parameters for workflows that need onderwerp
            if (id.startsWith(WORKFLOWS.BELEIDSSCAN_STEP_PREFIX) || WORKFLOWS.REQUIRING_ONDERWERP.includes(id as typeof WORKFLOWS.REQUIRING_ONDERWERP[number])) {
                // Ensure onderwerp is present and non-empty
                const onderwerp = params.onderwerp;
                if (!onderwerp || (typeof onderwerp === 'string' && !onderwerp.trim())) {
                    toast.error(
                        t('workflow.subjectRequired'),
                        t('workflow.subjectRequiredDesc')
                    );
                    return;
                }
                // Trim onderwerp value if it's a string
                if (typeof onderwerp === 'string') {
                    params.onderwerp = onderwerp.trim();
                }
            }

            // Filter out empty string values to avoid validation errors
            const requiresOnderwerp = id.startsWith(WORKFLOWS.BELEIDSSCAN_STEP_PREFIX) ||
                                     WORKFLOWS.REQUIRING_ONDERWERP.includes(id as typeof WORKFLOWS.REQUIRING_ONDERWERP[number]);
            Object.keys(params).forEach(key => {
                if (key === 'onderwerp' && requiresOnderwerp) {
                    return;
                }
                if (params[key] === '' || (typeof params[key] === 'string' && !params[key].trim())) {
                    delete params[key];
                }
            });

            debugLog(`[useWorkflowRun] Starting workflow ${id} with params:`, params);

            const result = await api.workflow.runWorkflow(id, params);

            // The API returns { runId: '...' }
            if (result?.runId) {
                debugLog(`[useWorkflowRun] Workflow started successfully, runId: ${result.runId}`);
                setRunningWorkflowId(result.runId);
                setCurrentWorkflowId(id); // Store the workflow ID
                setRunStatus('pending'); // Set initial status so UI shows workflow is starting

                try {
                    const run = await api.workflow.getRun(result.runId);
                    setRunStatus(run.status); // Update with actual status
                    if (run.status === 'paused') {
                        toast.info(t('workflow.pausedFound'), t('workflow.pausedFoundDesc'));
                    } else {
                        toast.success(t('workflow.started'), t('workflow.startedDesc'));
                    }
                } catch (statusError) {
                    debugLog(`[useWorkflowRun] Failed to check run status: ${statusError}`);
                    toast.success(t('workflow.started'), t('workflow.startedDesc'));
                }
            } else {
                const error = new Error('No runId returned from API');
                logError(error, 'start-workflow');
                console.error('[useWorkflowRun] API response missing runId:', result);
                toast.warning(t('workflow.startedNoProgress'), t('workflow.startedNoProgressDesc'));
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            debugLog(`[useWorkflowRun] Error starting workflow ${id}:`, error);
            
            // Detect error type for appropriate handling
            let isConnectionError = false;
            let isValidationError = false;
            let errorDetails: string[] = [];
            
            // Handle specific error cases
            if (error instanceof Error) {
                const errorWithStatusCode = error as Error & { statusCode?: number; code?: string };
                
                // Check if it's a connection error (ECONNREFUSED)
                isConnectionError = 
                    errorWithStatusCode.code === 'ECONNREFUSED' ||
                    (errorWithStatusCode.statusCode === 500 && (
                        errorMessage.includes('ECONNREFUSED') ||
                        errorMessage.includes('connection refused') ||
                        errorMessage.includes('niet bereikbaar') ||
                        errorMessage.includes('not reachable')
                    ));
                
                if (isConnectionError) {
                    // Connection errors are logged but with less verbosity
                    // The error message from BaseApiService is already user-friendly
                    console.warn('[useWorkflowRun] Backend connection error:', errorMessage);
                    // Still log for debugging but don't spam with full error details
                    logError(error, 'start-workflow-connection-error');
                } else {
                    // Log other errors normally
                    logError(error, 'start-workflow');
                }
            } else {
                // Non-Error object - log normally
                logError(error, 'start-workflow');
            }

            // Try to extract detailed error information from the error object
            if (error && typeof error === 'object' && 'response' in error) {
                const apiError = error as { response?: { data?: { error?: string; details?: string[]; message?: string } } };
                if (apiError.response?.data) {
                    errorDetails = Array.isArray(apiError.response.data.details)
                        ? apiError.response.data.details
                        : apiError.response.data.message
                            ? [apiError.response.data.message]
                            : [];
                    isValidationError = apiError.response.data.error === 'Ongeldige parameters' ||
                                       errorMessage.includes('onderwerp') ||
                                       errorMessage.includes('required');
                }
            }

            // Provide more specific error messages
            if (isConnectionError) {
                // Connection errors already have user-friendly messages from BaseApiService
                // The message includes helpful Docker commands if applicable
                toast.error(
                    t('errors.backend.title') || 'Backend niet bereikbaar',
                    errorMessage
                );
            } else if (isValidationError || errorMessage.includes('400') || errorMessage.includes('Ongeldige parameters') || errorMessage.includes('onderwerp')) {
                const missingOnderwerp = errorMessage.includes('onderwerp') &&
                                        (errorMessage.includes('required') || errorMessage.includes('ontbreekt'));

                if (missingOnderwerp || errorDetails.some(d => d.includes('onderwerp'))) {
                    toast.error(
                        t('workflow.subjectRequired'),
                        t('workflow.subjectRequiredDesc')
                    );
                } else if (errorDetails.length > 0) {
                    const detailsText = errorDetails.slice(0, 3).join(', '); // Show first 3 errors
                    toast.error(t('workflow.validationError'), detailsText);
                } else {
                    toast.error(t('workflow.invalidParameters'), t('workflow.invalidParametersDesc'));
                }
            } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                toast.error(t('workflow.notFound'), t('workflow.notFoundDesc'));
            } else if (errorMessage.includes('503') || errorMessage.includes('queue is full')) {
                toast.error(t('workflow.queueFull'), t('workflow.queueFullDesc'));
            } else {
                const displayMessage = errorMessage.length > 150
                    ? errorMessage.substring(0, 150) + '...'
                    : errorMessage;
                toast.error(t('workflowPage.failedToStart'), displayMessage);
            }
        }
    };

    const pauseWorkflow = async () => {
        if (!runningWorkflowId) return;

        if (runStatus === 'paused' || runStatus === 'cancelled' || runStatus === 'completed' || runStatus === 'failed') {
            return;
        }

        try {
            await api.workflow.pauseRun(runningWorkflowId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAlreadyPausedOrTerminal =
                errorMessage.includes('already paused') ||
                errorMessage.includes('status is') ||
                runStatus === 'paused' ||
                runStatus === 'cancelled' ||
                runStatus === 'completed' ||
                runStatus === 'failed';

            if (isAlreadyPausedOrTerminal) {
                console.debug('Run is already paused or in terminal state, skipping pause');
                return;
            }

            logError(error, 'pause-workflow');
            toast.error(t('workflowPage.failedToPause'), 'Probeer het opnieuw.');
        }
    };

    const resumeWorkflow = async () => {
        if (!runningWorkflowId) return;

        if (runStatus !== 'paused') {
            return;
        }

        try {
            await api.workflow.resumeRun(runningWorkflowId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isNotPaused =
                errorMessage.includes('Run is not paused') ||
                errorMessage.includes('not paused') ||
                runStatus !== 'paused';

            if (isNotPaused) {
                console.debug('Run is not paused, cannot resume');
                return;
            }

            logError(error, 'resume-workflow');
            toast.error(t('workflowPage.failedToResume'), 'Probeer het opnieuw.');
        }
    };

    const stopWorkflow = async () => {
        if (!runningWorkflowId) return;

        if (runStatus === 'cancelled' || runStatus === 'completed' || runStatus === 'failed') {
            return;
        }

        try {
            await api.workflow.cancelRun(runningWorkflowId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAlreadyTerminal =
                errorMessage.includes('status is') ||
                errorMessage.includes('already completed') ||
                errorMessage.includes('already cancelled') ||
                errorMessage.includes('Cannot cancel run') ||
                errorMessage.includes('Run is already cancelled or completed') ||
                runStatus === 'cancelled' ||
                runStatus === 'completed' ||
                runStatus === 'failed';

            if (isAlreadyTerminal) {
                console.debug('Run is already in terminal state, skipping cancellation');
                return;
            }

            logError(error, 'stop-workflow');
            toast.error(t('workflowPage.failedToStop'), 'Probeer het opnieuw.');
        }
    };

    const downloadLogs = () => {
        if (logs.length === 0) return;

        const logText = logs.map((log) => {
            const formattedMessage = log.localizedMessage || log.formattedMessage || log.message || '';
            const thoughtBubble = log.thoughtBubble;
            const timestamp = log.timestamp || '';
            const level = log.level || 'info';

            let text = `[${timestamp}] ${level.toUpperCase()}\n`;
            text += `${formattedMessage}\n`;
            if (thoughtBubble && !/Ik werk de navigatiegrafiek bij|Navigation graph.*updated|graph.*updated|Updating graph|Merging.*graph|Consolidating.*graph/i.test(thoughtBubble)) {
                text += `💭 ${thoughtBubble}\n`;
            }
            text += '\n';
            return text;
        }).join('---\n');

        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const runId = runningWorkflowId || currentWorkflowId || 'unknown';
        link.download = `workflow-logs-${runId}-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return {
        logs,
        runStatus,
        runningWorkflowId,
        currentWorkflowId,
        runHasCompleted,
        showReviewDialog,
        setShowReviewDialog,
        pollingError,
        isPolling,
        workflowProgress,
        jobFailures,
        setJobFailures,
        missingRequiredFields,
        setMissingRequiredFields,
        startWorkflow,
        pauseWorkflow,
        resumeWorkflow,
        stopWorkflow,
        downloadLogs
    };
}
