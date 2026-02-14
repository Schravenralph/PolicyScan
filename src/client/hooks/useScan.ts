import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { withRevisionConflictRetry } from '../utils/revisionRetry';
import { useWebSocket, type ScraperProgressUpdate, type JobProgressEvent } from './useWebSocket';

export interface ScanProgress {
  progress: number;
  status: string;
  documentsFound: number;
  estimatedTime: number | null;
}

export interface UseScanReturn {
  isScanning: boolean;
  progress: ScanProgress;
  runId: string | null;
  error: Error | null;
  jobFailures: JobProgressEvent[];
  startScan: (params: {
    queryId: string;
    websiteIds: string[];
    onderwerp: string;
    overheidslaag?: string;
    overheidsinstantie?: string;
  }) => Promise<string>;
  startScanViaWizard: (
    sessionId: string,
    queryId: string,
    revision?: number,
    executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>
  ) => Promise<string>;
  stopScan: () => void;
  clearError: () => void;
}

/**
 * Custom hook for scan operations
 * Handles website scraping with progress tracking and workflow integration
 */
export function useScan(): UseScanReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress>({
    progress: 0,
    status: '',
    documentsFound: 0,
    estimatedTime: null,
  });
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [jobFailures, setJobFailures] = useState<JobProgressEvent[]>([]);

  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const currentQueryIdRef = useRef<string | null>(null);
  const currentProgressRef = useRef(0);
  const PROGRESS_STORAGE_KEY_PREFIX = 'scraping_progress_';
  const hasRestoredProgressRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  // Restore progress from localStorage when runId is available
  // This handles page refresh scenarios where runId exists but progress state is lost
  const restoreProgressIfNeeded = useCallback((runId: string) => {
    // Only restore once per runId
    if (hasRestoredProgressRef.current.has(runId)) {
      return;
    }

    try {
      const stored = localStorage.getItem(`${PROGRESS_STORAGE_KEY_PREFIX}${runId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ScanProgress;
        // Only restore if progress is not complete
        if (parsed.progress < 100) {
          if (isMountedRef.current) {
            setProgress(parsed);
          }
          hasRestoredProgressRef.current.add(runId);
        } else {
          // Clear completed progress
          localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${runId}`);
        }
      }
    } catch (e) {
      // Ignore errors restoring progress, but log for tracking
      logError(e instanceof Error ? e : new Error('Failed to restore scraping progress from localStorage'), 'restore-scan-progress');
    }
  }, []);

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    if (currentRunIdRef.current && (progress.progress > 0 || progress.status)) {
      try {
        localStorage.setItem(
          `${PROGRESS_STORAGE_KEY_PREFIX}${currentRunIdRef.current}`,
          JSON.stringify(progress)
        );
      } catch (e) {
        // Ignore quota errors, but log for tracking
        logError(e instanceof Error ? e : new Error('Failed to save scraping progress to localStorage'), 'save-scan-progress');
      }
    }
  }, [progress]);

  // WebSocket connection for real-time progress updates
  useWebSocket({
    enabled: !!currentRunIdRef.current && isScanning,
    runId: currentRunIdRef.current || undefined,
    onScraperProgress: (progressUpdate: ScraperProgressUpdate) => {
      if (!isMountedRef.current) return;
      if (progressUpdate.runId === currentRunIdRef.current) {
        // Update progress from WebSocket
        setProgress((prev) => ({
          progress: progressUpdate.data.progress,
          status: progressUpdate.data.currentStep || prev.status,
          documentsFound: progressUpdate.data.totalDocumentsFound || prev.documentsFound,
          estimatedTime: progressUpdate.data.estimatedSecondsRemaining || null,
        }));

        // Update scanning state based on status
        if (progressUpdate.data.status === 'completed') {
          setIsScanning(false);
          // Clear completed progress from localStorage
          if (currentRunIdRef.current) {
            try {
              localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentRunIdRef.current}`);
            } catch (_e) {
              // ignore
            }
          }
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
        } else if (progressUpdate.data.status === 'failed' || progressUpdate.data.status === 'cancelled') {
          setIsScanning(false);
          // Clear failed/cancelled progress from localStorage
          if (currentRunIdRef.current) {
            try {
              localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentRunIdRef.current}`);
            } catch (_e) {
              // ignore
            }
          }
          if (progressUpdate.data.error) {
            setError(new Error(progressUpdate.data.error));
          }
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
        }
      }
    },
    onJobProgress: (event: JobProgressEvent) => {
      if (!isMountedRef.current) return;
      if (event.type === 'job_failed') {
        setJobFailures(prev => {
          // Avoid duplicates
          if (prev.some(f => f.jobId === event.jobId)) {
            return prev;
          }
          return [...prev, event];
        });
        // Also set error state
        if (event.data.error) {
          setError(new Error(event.data.error));
        }
        setIsScanning(false);
      }
    },
  });

  // Poll for logs and fallback status (SSE handles progress, polling handles logs)
  useEffect(() => {
    if (!currentRunIdRef.current || !isScanning) {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      return;
    }

    let pollCount = 0;
    const maxPolls = 300; // Stop after 5 minutes (300 * 1s)
    let isCurrentPollActive = true;

    const pollProgress = async () => {
      if (!currentRunIdRef.current || !isCurrentPollActive || !isMountedRef.current) return;

      try {
        if (!runId) return;
        const run = await api.getRun(runId);

        if (!isMountedRef.current || !isCurrentPollActive) return;

        pollCount++;

        // Update status and documents from logs (WebSocket handles progress percentage)
        if (run.status === 'running') {
          // Count documents from logs if available
          const documentLogs =
            run.logs?.filter(
              (log) =>
                log.message?.toLowerCase().includes('document') ||
                log.message?.toLowerCase().includes('gevonden')
            ) || [];
          setProgress((prev) => ({
            ...prev,
            documentsFound: documentLogs.length,
          }));

          // Update status from latest log
          if (run.logs && run.logs.length > 0) {
            const latestLog = run.logs[run.logs.length - 1];
            setProgress((prev) => ({
              ...prev,
              status: latestLog.message || prev.status || 'Bezig met scrapen...',
            }));
          }

          // Schedule next poll
          if (pollCount < maxPolls && isScanning) {
            pollTimeoutRef.current = setTimeout(pollProgress, 3000);
          } else if (pollCount >= maxPolls) {
            setIsScanning(false);
            logError(new Error('Stopped polling after max attempts'), 'poll-run-progress-max-attempts');
          }
        } else if (run.status === 'completed') {
          setProgress((prev) => ({
            progress: 100,
            status: 'Scraping voltooid',
            documentsFound: prev.documentsFound,
            estimatedTime: null,
          }));
          // Clear completed progress from localStorage
          if (runId) {
            try {
              localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${runId}`);
            } catch (_e) {
              // ignore
            }
          }
          setIsScanning(false);

          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          return;
        } else if (run.status === 'failed') {
          setProgress({
            progress: 0,
            status: 'Fout opgetreden',
            documentsFound: 0,
            estimatedTime: null,
          });
          setIsScanning(false);
          const error = new Error(run.error || 'Onbekende fout opgetreden');
          setError(error);

          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          return;
        }
      } catch (err) {
        if (!isMountedRef.current || !isCurrentPollActive) return;

        logError(err, 'poll-run-progress');
        // Don't stop polling on error, just log it and retry
        if (pollCount < maxPolls && isScanning) {
          pollTimeoutRef.current = setTimeout(pollProgress, 3000);
        }
      }
    };

    // Start polling immediately
    pollProgress();

    return () => {
      isCurrentPollActive = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [isScanning, runId]);

  const startScanViaWizard = useCallback(
    async (
      sessionId: string,
      queryId: string,
      revision?: number,
      executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>
    ): Promise<string> => {
      setIsScanning(true);
      setError(null);
      currentQueryIdRef.current = queryId;

      // Reset progress
      currentProgressRef.current = 0;
      setProgress({
        progress: 0,
        status: 'Scan wordt gestart...',
        documentsFound: 0,
        estimatedTime: null,
      });

      try {
        let output: { runId: string; status: string } | undefined;

        if (executor) {
          // Use provided executor (which handles retry logic)
          const result = await executor('document-review', 'startScan', { queryId });
          if (!isMountedRef.current) return ''; // Return empty string if unmounted
          output = result as typeof output;
        } else {
          // Call wizard session endpoint to execute startScan action with revision conflict retry
          const response = await withRevisionConflictRetry(
            (getCurrentRevision) => {
              const currentRevision = getCurrentRevision();
              return api.wizard.executeAction(
                sessionId,
                'document-review',
                'startScan',
                {
                  input: { queryId },
                  revision: currentRevision,
                }
              );
            },
            async () => (await api.wizard.getSessionState(sessionId)).revision,
            () => revision,
            3
          );
          if (!isMountedRef.current) return ''; // Return empty string if unmounted
          output = response.output as typeof output;
        }
        if (!output || !output.runId) {
          throw new Error('Invalid response from wizard startScan action');
        }

        if (!isMountedRef.current) return output.runId;

        setRunId(output.runId);
        currentRunIdRef.current = output.runId;
        
        // Try to restore progress from localStorage first (in case of page refresh)
        restoreProgressIfNeeded(output.runId);
        
        return output.runId;
      } catch (err) {
        if (!isMountedRef.current) throw err;

        const apiError = err as {
          response?: {
            data?: {
              message?: string;
            };
          };
          message?: string;
        };

        const error =
          err instanceof Error
            ? err
            : new Error(
                apiError?.response?.data?.message ||
                  apiError?.message ||
                  'Failed to start scan via wizard'
              );
        setError(error);
        logError(error, 'start-scan-via-wizard');
        setIsScanning(false);
        setProgress({
          progress: 0,
          status: 'Fout opgetreden',
          documentsFound: 0,
          estimatedTime: null,
        });
        throw error;
      }
    },
    [restoreProgressIfNeeded]
  );

  const startScan = useCallback(
    async (params: {
      queryId: string;
      websiteIds: string[];
      onderwerp: string;
      overheidslaag?: string;
      overheidsinstantie?: string;
    }): Promise<string> => {
      if (params.websiteIds.length === 0) {
        throw new Error('No websites selected');
      }

      setIsScanning(true);
      setError(null);
      currentQueryIdRef.current = params.queryId;

      // Reset progress
      currentProgressRef.current = 0;
      setProgress({
        progress: 0,
        status: 'Scan wordt gestart...',
        documentsFound: 0,
        estimatedTime: Math.ceil(params.websiteIds.length * 2), // ~2 min per website
      });

      try {
        const workflowId = 'standard-scan'; // Use the standard scan workflow

        // Validate onderwerp before sending (backend will also validate, but early validation provides better UX)
        // The standard-scan workflow requires a non-empty onderwerp parameter
        if (!params.onderwerp || !params.onderwerp.trim()) {
          const error = new Error('Onderwerp is vereist om de scan te starten.');
          setError(error);
          setIsScanning(false);
          throw error;
        }

        const data = await api.runWorkflow(workflowId, {
          mode: 'prod',
          query: params.onderwerp.trim(), // Backend maps query -> onderwerp
          queryId: params.queryId,
          selectedWebsites: params.websiteIds,
          overheidstype: params.overheidslaag,
          overheidsinstantie: params.overheidsinstantie,
        });

        if (!isMountedRef.current) return data.runId || '';

        // Store runId for progress tracking
        if (data.runId) {
          setRunId(data.runId);
          currentRunIdRef.current = data.runId;
          
          // Try to restore progress from localStorage first (in case of page refresh)
          restoreProgressIfNeeded(data.runId);
          
          return data.runId;
        } else {
          throw new Error('No runId returned from API');
        }
      } catch (err) {
        if (!isMountedRef.current) throw err;

        const error = err instanceof Error ? err : new Error('Failed to start scan');
        setError(error);
        setIsScanning(false);
        setProgress({
          progress: 0,
          status: 'Fout opgetreden',
          documentsFound: 0,
          estimatedTime: null,
        });
        throw error;
      }
    },
    [restoreProgressIfNeeded]
  );

  const stopScan = useCallback(() => {
    const runIdToCancel = currentRunIdRef.current;

    setIsScanning(false);
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    // Clear progress from localStorage when stopping
    if (currentRunIdRef.current) {
      try {
        localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentRunIdRef.current}`);
      } catch (_e) {
        // ignore
      }
    }
    currentRunIdRef.current = null;
    currentQueryIdRef.current = null;

    // Call API to cancel if we have a run ID (fire-and-forget)
    if (runIdToCancel) {
      api.workflow.cancelRun(runIdToCancel).catch((err) => {
        logError(err instanceof Error ? err : new Error('Failed to cancel run'), 'stop-scan-cancel');
      });
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isScanning,
    progress,
    runId,
    error,
    jobFailures,
    startScan,
    startScanViaWizard,
    stopScan,
    clearError,
  };
}
