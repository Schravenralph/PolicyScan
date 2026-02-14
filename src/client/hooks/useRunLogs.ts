import { useState, useEffect, useRef } from 'react';
import { BaseLogEntry } from '../components/shared/LogBubble';
import { translateLogMessage } from '../utils/logTranslations';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { useSSE, type LogEventData } from './useSSE';

interface UseRunLogsOptions {
  runId: string | null;
  pollDelay?: number;
  autoClearOnComplete?: boolean;
  clearDelay?: number;
}

interface UseRunLogsResult {
  logs: BaseLogEntry[];
  status: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Helper function to convert a log entry to BaseLogEntry format
 */
function convertLogToBaseEntry(log: LogEventData['log'], runStatus?: string): BaseLogEntry {
  const logId = `${String(log.timestamp ?? Date.now())}-${typeof log.message === 'string' ? log.message.substring(0, 50) : ''}`;
  
  // Filter out debug logs from user-facing UI
  if (log.level === 'debug') {
    return null as unknown as BaseLogEntry; // Will be filtered out
  }
  
  const baseMessage = typeof log.message === 'string' ? log.message : '';
  const localizedMessage = translateLogMessage(baseMessage);
  
  // Convert timestamp to Date if it's a string
  let timestamp: Date | string;
  if (typeof log.timestamp === 'string') {
    const date = new Date(log.timestamp);
    timestamp = isNaN(date.getTime()) ? new Date() : date;
  } else if (log.timestamp instanceof Date) {
    timestamp = isNaN(log.timestamp.getTime()) ? new Date() : log.timestamp;
  } else {
    timestamp = new Date();
  }
  
  return {
    id: logId,
    timestamp,
    message: baseMessage,
    formattedMessage: localizedMessage,
    localizedMessage,
    thoughtBubble: undefined,
    level: (log.level === 'error' || log.level === 'info' || log.level === 'warn' || log.level === 'debug') ? log.level : 'info',
    isComplete: runStatus === 'completed' || runStatus === 'failed' || runStatus === 'cancelled',
    icon: log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️',
    color: log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-blue-400'
  };
}

/**
 * Shared hook for fetching run logs via WebSocket (with HTTP polling fallback).
 * Uses WebSocket for real-time updates, falls back to polling if WebSocket unavailable.
 */
export function useRunLogs({ 
  runId, 
  pollDelay = 2000,
  autoClearOnComplete = false,
  clearDelay = 10000
}: UseRunLogsOptions): UseRunLogsResult {
  const [logs, setLogs] = useState<BaseLogEntry[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [usePolling, setUsePolling] = useState(false); // Fallback to polling if SSE fails
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedLogIdsRef = useRef<Set<string>>(new Set());
  const currentPollDelayRef = useRef(pollDelay);
  const pendingLogsRef = useRef<BaseLogEntry[]>([]);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sseConnectedRef = useRef(false);

  // SSE connection for real-time log streaming (per TOOL-006)
  const { isConnected: sseConnected, hasError: sseError } = useSSE(
    runId ? `/api/runs/${runId}/events` : '',
    {
      enabled: !!runId && !usePolling,
      onLog: (data: LogEventData) => {
        if (data.runId !== runId) return; // Ignore logs for other runs
        
        if (!sseConnectedRef.current) {
          console.debug('[useRunLogs] SSE connection active and receiving logs');
          sseConnectedRef.current = true;
        }
        setError(null); // Clear any errors on successful SSE message
        
        // Ensure polling is disabled when SSE is receiving logs
        if (usePolling) {
          setUsePolling(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
        
        // Get current status for log conversion
        setStatus(currentStatus => {
          const baseEntry = convertLogToBaseEntry(data.log, currentStatus);
          if (!baseEntry) return currentStatus; // Skip debug logs
          
          const logId = baseEntry.id;
          if (!processedLogIdsRef.current.has(logId)) {
            processedLogIdsRef.current.add(logId);
            
            // Debounce log updates to reduce re-renders
            pendingLogsRef.current.push(baseEntry);
            
            if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
            }
            
            debounceTimeoutRef.current = setTimeout(() => {
              if (pendingLogsRef.current.length > 0) {
                setLogs(prev => {
                  const existingLogIds = new Set(prev.map(log => log.id));
                  const trulyNewLogs = pendingLogsRef.current.filter(log => !existingLogIds.has(log.id));
                  
                  if (trulyNewLogs.length === 0) {
                    return prev;
                  }
                  
                  const allLogs = [...prev, ...trulyNewLogs];
                  const maxLogs = 500;
                  return allLogs.length > maxLogs 
                    ? allLogs.slice(-maxLogs)
                    : allLogs;
                });
                pendingLogsRef.current = [];
              }
            }, 500);
          }
          return currentStatus;
        });
      },
      onJobStatus: (data) => {
        // Update status when job status changes
        if (data.runId === runId && data.status) {
          setStatus(data.status);
          
          // Flush pending logs immediately when workflow completes
          if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
              debounceTimeoutRef.current = null;
            }
            // Flush pending logs synchronously
            if (pendingLogsRef.current.length > 0) {
              setLogs(prev => {
                const existingLogIds = new Set(prev.map(log => log.id));
                const trulyNewLogs = pendingLogsRef.current.filter(log => !existingLogIds.has(log.id));
                
                if (trulyNewLogs.length === 0) {
                  return prev;
                }
                
                const allLogs = [...prev, ...trulyNewLogs];
                const maxLogs = 500;
                const result = allLogs.length > maxLogs 
                  ? allLogs.slice(-maxLogs)
                  : allLogs;
                pendingLogsRef.current = [];
                return result;
              });
            }
          }
        }
      },
      onCompleted: (data) => {
        // Mark workflow as completed
        if (data.runId === runId) {
          // Flush pending logs immediately before marking complete
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
          }
          // Flush pending logs synchronously
          if (pendingLogsRef.current.length > 0) {
            setLogs(prev => {
              const existingLogIds = new Set(prev.map(log => log.id));
              const trulyNewLogs = pendingLogsRef.current.filter(log => !existingLogIds.has(log.id));
              
              if (trulyNewLogs.length === 0) {
                return prev;
              }
              
              const allLogs = [...prev, ...trulyNewLogs];
              const maxLogs = 500;
              const result = allLogs.length > maxLogs 
                ? allLogs.slice(-maxLogs)
                : allLogs;
              pendingLogsRef.current = [];
              return result;
            });
          }
          
          setStatus('completed');
        }
      },
      onConnectionError: (error?: Error | Event) => {
        // SSE connection error - fall back to polling with exponential backoff
        if (!usePolling) {
          // Handle both Error and Event objects
          // Event objects from EventSource.onerror don't have message/statusCode properties
          const errorWithStatusCode = error instanceof Error ? (error as Error & { statusCode?: number; code?: string }) : null;
          const errorMessage = error instanceof Error ? error.message : '';
          
          const is404 = 
            errorWithStatusCode?.statusCode === 404 ||
            errorWithStatusCode?.code === 'NOT_FOUND' ||
            (errorMessage && errorMessage.toLowerCase().includes('not found')) ||
            (errorMessage && errorMessage.includes('404'));
          
          // For 404s, wait a bit before falling back (race condition - run may not exist yet)
          if (is404) {
            console.debug('[useRunLogs] SSE endpoint not found (404), will retry before falling back to polling');
            // Don't immediately fall back for 404s - may be a timing issue
            return;
          }
          
          console.warn('[useRunLogs] SSE connection error, falling back to HTTP polling', error);
          setUsePolling(true);
        }
      },
    }
  );

  // Fallback to polling if SSE fails or is unavailable
  useEffect(() => {
    if (!runId) {
      setLogs([]);
      setStatus('pending');
      setIsLoading(false);
      setError(null);
      processedLogIdsRef.current.clear();
      setUsePolling(false);
      return;
    }

    // Check SSE error immediately - if there's an error, fall back right away
    if (sseError && !usePolling) {
      console.warn('[useRunLogs] SSE error, falling back to HTTP polling');
      setUsePolling(true);
      return;
    }

    // If SSE is not connected after a reasonable delay, fall back to polling
    // Note: We check sseConnected (actual connection status) not sseConnectedRef (log receipt)
    // This prevents false fallbacks when SSE is connected but no logs have arrived yet
    // Use exponential backoff: check at 4s, 8s, then 16s before falling back
    const fallbackTimeout1 = setTimeout(() => {
      if (!sseConnected && !usePolling) {
        console.debug('[useRunLogs] SSE not connected after 4s, will check again...');
      }
    }, 4000);
    
    const fallbackTimeout2 = setTimeout(() => {
      if (!sseConnected && !usePolling) {
        console.debug('[useRunLogs] SSE not connected after 8s, will check again...');
      }
    }, 8000);
    
    const fallbackTimeout3 = setTimeout(() => {
      if (!sseConnected && !usePolling) {
        console.warn('[useRunLogs] SSE not connected after 16s, falling back to HTTP polling');
        setUsePolling(true);
      } else if (sseConnected && !sseConnectedRef.current) {
        // SSE is connected but no logs received yet - this is normal, don't fall back
        console.debug('[useRunLogs] SSE connected but no logs received yet - waiting...');
      }
    }, 16000);

    return () => {
      clearTimeout(fallbackTimeout1);
      clearTimeout(fallbackTimeout2);
      clearTimeout(fallbackTimeout3);
    };
  }, [runId, sseError, sseConnected, usePolling]);

  // HTTP polling fallback (when SSE is unavailable)
  useEffect(() => {
    // Explicitly prevent polling if SSE is connected or enabled
    // This ensures we never poll while SSE is active, preventing duplicate data
    if (!runId || !usePolling || sseConnected) {
      // If SSE is connected, make sure polling is stopped
      if (sseConnected && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsLoading(true);
    let consecutiveErrors = 0;

    const pollRun = async () => {
      try {
        const run = await api.workflow.getRun(runId);

        // Reset backoff on success
        consecutiveErrors = 0;
        currentPollDelayRef.current = pollDelay;
        setError(null);
        
        if (run) {
          setStatus(run.status || 'pending');

          // Process new logs
          const rawLogs = run.logs || [];
          const newLogs: BaseLogEntry[] = [];

          rawLogs.forEach((log: Record<string, unknown>) => {
            // Filter out debug logs from user-facing UI
            const logLevel = typeof log.level === 'string' ? log.level : 'info';
            const isDebugLog = logLevel === 'debug';
            
            // Skip debug logs (they're for developers, not end users)
            if (isDebugLog) {
              return;
            }
            
            const logId = (typeof log.id === 'string' ? log.id : undefined) ||
              `${String(log.timestamp ?? Date.now())}-${typeof log.message === 'string' ? log.message.substring(0, 50) : ''}`;
            
            if (!processedLogIdsRef.current.has(logId)) {
              processedLogIdsRef.current.add(logId);
              
              const baseMessage = typeof log.formattedMessage === 'string'
                ? log.formattedMessage
                : typeof log.message === 'string'
                  ? log.message
                  : '';
              const localizedMessage = translateLogMessage(baseMessage);
              const thoughtBubble = typeof log.thoughtBubble === 'string' ? log.thoughtBubble : undefined;
              
              // Convert timestamp to Date if it's a string
              let timestamp: Date | string;
              if (typeof log.timestamp === 'string') {
                const date = new Date(log.timestamp);
                // Check if date is valid
                timestamp = isNaN(date.getTime()) ? new Date() : date;
              } else if (log.timestamp instanceof Date) {
                // Check if date is valid
                timestamp = isNaN(log.timestamp.getTime()) ? new Date() : log.timestamp;
              } else {
                timestamp = new Date();
              }
              
              newLogs.push({
                id: logId,
                timestamp,
                message: baseMessage,
                formattedMessage: localizedMessage,
                localizedMessage,
                thoughtBubble,
                level: (typeof log.level === 'string' && (log.level === 'error' || log.level === 'info' || log.level === 'warn' || log.level === 'debug')) ? log.level : 'info',
                isComplete: false,
                icon: typeof log.icon === 'string'
                  ? log.icon
                  : (log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️'),
                color: typeof log.color === 'string'
                  ? log.color
                  : (log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-blue-400')
              });
            }
          });

          // Debounce log updates to reduce re-renders
          if (newLogs.length > 0) {
            pendingLogsRef.current = [...pendingLogsRef.current, ...newLogs];
            
            // Clear existing debounce timeout
            if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
            }
            
            // Debounce log updates (batch updates every 500ms for better performance)
            debounceTimeoutRef.current = setTimeout(() => {
              if (pendingLogsRef.current.length > 0) {
                setLogs(prev => {
                  const existingLogIds = new Set(prev.map(log => log.id));
                  const trulyNewLogs = pendingLogsRef.current.filter(log => !existingLogIds.has(log.id));
                  
                  if (trulyNewLogs.length === 0) {
                    return prev;
                  }
                  
                  const allLogs = [...prev, ...trulyNewLogs];
                  const maxLogs = 500;
                  return allLogs.length > maxLogs 
                    ? allLogs.slice(-maxLogs)
                    : allLogs;
                });
                pendingLogsRef.current = [];
              }
            }, 500);
          }

          setIsLoading(false);

          // Mark all logs as complete if workflow is done
          if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
            setLogs(prev => prev.map(log => ({ ...log, isComplete: true })));
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            
            // Clear logs after a delay if enabled
            if (autoClearOnComplete) {
              setTimeout(() => {
                setLogs([]);
                processedLogIdsRef.current.clear();
              }, clearDelay);
            }
          }
        }
      } catch (err) {
        // Handle specific error cases
        if (err instanceof Error) {
          const errorWithStatusCode = err as Error & { statusCode?: number; code?: string };
          const is404 = 
            errorWithStatusCode.statusCode === 404 ||
            errorWithStatusCode.code === 'NOT_FOUND' ||
            err.message.toLowerCase().includes('not found') ||
            err.message.includes('404');
          
          if (is404) {
            setError(err);
            setIsLoading(false);
            consecutiveErrors++;
            if (consecutiveErrors > 3) {
              currentPollDelayRef.current = Math.min(currentPollDelayRef.current * 2, 30000);
              if (intervalRef.current) clearInterval(intervalRef.current);
              intervalRef.current = setInterval(pollRun, currentPollDelayRef.current);
            }
            return;
          }
          
          const is429 = 
            errorWithStatusCode.statusCode === 429 ||
            errorWithStatusCode.code === 'RATE_LIMIT_EXCEEDED' ||
            err.message.toLowerCase().includes('too many requests') ||
            err.message.includes('429');
          
          if (is429) {
            currentPollDelayRef.current = Math.min(currentPollDelayRef.current * 3, 60000);
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(pollRun, currentPollDelayRef.current);
            setError(err);
            setIsLoading(false);
            return;
          }
        }
        
        logError(err, 'poll-run-logs');
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsLoading(false);
        consecutiveErrors++;
        if (consecutiveErrors > 3) {
          currentPollDelayRef.current = Math.min(currentPollDelayRef.current * 2, 30000);
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(pollRun, currentPollDelayRef.current);
        }
      }
    };

    // Initial load
    pollRun();

    // Poll at interval
    intervalRef.current = setInterval(pollRun, currentPollDelayRef.current);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      // Flush any pending logs before cleanup
      if (pendingLogsRef.current.length > 0) {
        setLogs(prev => {
          const existingLogIds = new Set(prev.map(log => log.id));
          const trulyNewLogs = pendingLogsRef.current.filter(log => !existingLogIds.has(log.id));
          
          if (trulyNewLogs.length === 0) {
            return prev;
          }
          
          const allLogs = [...prev, ...trulyNewLogs];
          const maxLogs = 500;
          return allLogs.length > maxLogs 
            ? allLogs.slice(-maxLogs)
            : allLogs;
        });
        pendingLogsRef.current = [];
      }
    };
  }, [runId, pollDelay, autoClearOnComplete, clearDelay, usePolling]);

  // Fetch initial run status and logs when runId changes (for both WebSocket and polling)
  useEffect(() => {
    if (!runId) return;

    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const run = await api.workflow.getRun(runId);
        if (run) {
          setStatus(run.status || 'pending');
          
          // If using SSE, we'll get logs via SSE events (catch-up logs are sent automatically)
          // If using polling, logs will come from polling
          // But we should still load initial logs for catch-up
          if (run.logs && run.logs.length > 0) {
            const initialLogs: BaseLogEntry[] = [];
            run.logs.forEach((log: Record<string, unknown>) => {
              const logLevel = typeof log.level === 'string' ? log.level : 'info';
              if (logLevel === 'debug') return;
              
              const logId = (typeof log.id === 'string' ? log.id : undefined) ||
                `${String(log.timestamp ?? Date.now())}-${typeof log.message === 'string' ? log.message.substring(0, 50) : ''}`;
              
              if (!processedLogIdsRef.current.has(logId)) {
                processedLogIdsRef.current.add(logId);
                
                const baseMessage = typeof log.formattedMessage === 'string'
                  ? log.formattedMessage
                  : typeof log.message === 'string'
                    ? log.message
                    : '';
                const localizedMessage = translateLogMessage(baseMessage);
                
                let timestamp: Date | string;
                if (typeof log.timestamp === 'string') {
                  const date = new Date(log.timestamp);
                  timestamp = isNaN(date.getTime()) ? new Date() : date;
                } else if (log.timestamp instanceof Date) {
                  timestamp = isNaN(log.timestamp.getTime()) ? new Date() : log.timestamp;
                } else {
                  timestamp = new Date();
                }
                
                initialLogs.push({
                  id: logId,
                  timestamp,
                  message: baseMessage,
                  formattedMessage: localizedMessage,
                  localizedMessage,
                  thoughtBubble: typeof log.thoughtBubble === 'string' ? log.thoughtBubble : undefined,
                  level: (typeof log.level === 'string' && (log.level === 'error' || log.level === 'info' || log.level === 'warn' || log.level === 'debug')) ? log.level : 'info',
                  isComplete: run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled',
                  icon: typeof log.icon === 'string'
                    ? log.icon
                    : (log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️'),
                  color: typeof log.color === 'string'
                    ? log.color
                    : (log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-blue-400')
                });
              }
            });
            
            if (initialLogs.length > 0) {
              setLogs(prev => {
                const existingLogIds = new Set(prev.map(log => log.id));
                const newLogs = initialLogs.filter(log => !existingLogIds.has(log.id));
                return [...prev, ...newLogs];
              });
            }
          }
        }
        setIsLoading(false);
      } catch (err) {
        logError(err, 'fetch-initial-run-data');
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [runId]);

  // Update status when workflow completes (for SSE mode)
  useEffect(() => {
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      setLogs(prev => prev.map(log => ({ ...log, isComplete: true })));
      
      if (autoClearOnComplete) {
        setTimeout(() => {
          setLogs([]);
          processedLogIdsRef.current.clear();
        }, clearDelay);
      }
    }
  }, [status, autoClearOnComplete, clearDelay]);

  return { logs, status, isLoading, error };
}
