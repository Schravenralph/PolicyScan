import { useEffect, useRef, useState, useCallback } from 'react';
import { logError } from '../utils/errorHandler';
import { getApiBaseUrl } from '../utils/apiUrl';

/**
 * Get authentication token from localStorage
 * Safe for non-browser contexts (SSR, test runners, privacy contexts)
 */
function getAuthToken(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  } catch {
    return null;
  }
}

/**
 * SSE event types matching server-side SSEService
 */
export type SSEEventType =
  | 'job_status'
  | 'queue_position'
  | 'progress'
  | 'log'
  | 'error'
  | 'completed'
  | 'ping'
  | 'graph_update';

/**
 * Job status event data
 */
export interface JobStatusEventData {
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  jobId?: string;
  workflowId?: string;
  runId: string;
  timestamp: string;
  message?: string;
}

/**
 * Queue position event data
 */
export interface QueuePositionEventData {
  runId: string;
  position: number;
  totalWaiting: number;
  timestamp: string;
}

/**
 * Progress event data
 */
export interface ProgressEventData {
  runId: string;
  progress: number; // 0-100
  message?: string;
  currentStep?: string;
  totalSteps?: number;
  timestamp: string;
}

/**
 * Log event data
 */
export interface LogEventData {
  runId: string;
  log: {
    timestamp: Date | string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    metadata?: Record<string, unknown>;
  };
  timestamp: string;
}

/**
 * Error event data
 */
export interface ErrorEventData {
  runId: string;
  error: string;
  details?: unknown;
  timestamp: string;
}

/**
 * Completed event data
 */
export interface CompletedEventData {
  runId: string;
  status: string;
  timestamp: string;
  results?: unknown;
}

/**
 * Graph update event data
 */
export interface GraphUpdateEventData {
  runId: string;
  timestamp: string;
  nodes: Array<{
    id: string;
    url: string;
    title: string;
    type: 'page' | 'section' | 'document';
    children: string[];
    lastVisited?: string;
    hasChildren?: boolean;
    childCount?: number;
    score?: number;
    depth?: number;
  }>;
  edges: Array<{ source: string; target: string }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    displayedNode?: string;
    childCount?: number;
    navigatedCount?: number;
  };
  message?: string;
}

/**
 * Options for useSSE hook
 */
export interface UseSSEOptions {
  /** Whether to enable the SSE connection (default: true) */
  enabled?: boolean;
  /** Callback for job status events */
  onJobStatus?: (data: JobStatusEventData) => void;
  /** Callback for queue position events */
  onQueuePosition?: (data: QueuePositionEventData) => void;
  /** Callback for progress events */
  onProgress?: (data: ProgressEventData) => void;
  /** Callback for log events */
  onLog?: (data: LogEventData) => void;
  /** Callback for error events */
  onError?: (data: ErrorEventData) => void;
  /** Callback for completed events */
  onCompleted?: (data: CompletedEventData) => void;
  /** Callback for connection errors */
  onConnectionError?: (error: Event) => void;
  /** Callback when connection opens */
  onOpen?: () => void;
  /** Callback when connection closes */
  onClose?: () => void;
}

/**
 * Return type for useSSE hook
 */
export interface UseSSEResult {
  /** Whether the SSE connection is currently open */
  isConnected: boolean;
  /** Whether the connection is in an error state */
  hasError: boolean;
  /** Manually close the connection */
  close: () => void;
  /** Manually reconnect the connection */
  reconnect: () => void;
}

/**
 * Safely parse SSE event data
 * Validates that event.data exists and is a non-empty string before parsing
 * @param event - The MessageEvent from SSE
 * @param eventType - The event type for logging purposes
 * @returns Parsed data or null if invalid
 */
function safeParseEventData<T>(event: MessageEvent, eventType: string): T | null {
  // Check if event.data exists and is a valid string
  if (event.data === undefined || event.data === null) {
    // Only log for non-ping events to reduce noise
    // Ping events are keep-alive and may not always have data
    if (eventType !== 'ping') {
      console.debug(`[SSE] Skipping ${eventType} event: data is undefined or null`);
    }
    return null;
  }

  if (typeof event.data !== 'string') {
    console.debug(`[SSE] Skipping ${eventType} event: data is not a string`, { data: event.data });
    return null;
  }

  if (event.data.trim() === '') {
    // Only log for non-ping events to reduce noise
    if (eventType !== 'ping') {
      console.debug(`[SSE] Skipping ${eventType} event: data is empty`);
    }
    return null;
  }

  try {
    return JSON.parse(event.data) as T;
  } catch (error) {
    console.debug(`[SSE] Failed to parse ${eventType} event data as JSON:`, error);
    return null;
  }
}

/**
 * React hook for consuming Server-Side Events (SSE) streams
 * 
 * @param url - The SSE endpoint URL (relative or absolute)
 * @param options - Configuration options and event callbacks
 * @returns Connection state and control functions
 * 
 * @example
 * ```tsx
 * const { isConnected, hasError } = useSSE(`/api/runs/${runId}/events`, {
 *   onJobStatus: (data) => console.log('Job status:', data.status),
 *   onProgress: (data) => setProgress(data.progress),
 *   onLog: (data) => setLogs(prev => [...prev, data.log]),
 * });
 * ```
 */
export function useSSE(url: string, options: UseSSEOptions = {}): UseSSEResult {
  const {
    enabled = true,
    onJobStatus,
    onQueuePosition,
    onProgress,
    onLog,
    onError: onErrorEvent,
    onCompleted,
    onGraphUpdate,
    onConnectionError,
    onOpen,
    onClose,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds
  const notFoundRetryAttemptsRef = useRef(0);
  const maxNotFoundRetries = 10; // More retries for 404 (race condition handling)
  const notFoundRetryDelay = 500; // Shorter delay for 404 retries (500ms)
  
  // Store callbacks in refs to avoid recreating connect on every render
  // This prevents unnecessary reconnections when callbacks change
  const callbacksRef = useRef({
    onJobStatus,
    onQueuePosition,
    onProgress,
    onLog,
    onError: onErrorEvent,
    onCompleted,
    onGraphUpdate,
    onConnectionError,
    onOpen,
    onClose,
  });
  
  // Update refs when callbacks change (without triggering re-renders or reconnections)
  useEffect(() => {
    callbacksRef.current = {
      onJobStatus,
      onQueuePosition,
      onProgress,
      onLog,
      onError: onErrorEvent,
      onCompleted,
      onGraphUpdate,
      onConnectionError,
      onOpen,
      onClose,
    };
  }, [onJobStatus, onQueuePosition, onProgress, onLog, onErrorEvent, onCompleted, onGraphUpdate, onConnectionError, onOpen, onClose]);

  // Build full URL
  // If URL is already absolute (starts with http), use it as-is
  // Otherwise, check if it already starts with the base URL to avoid double prefix
  let fullUrl: string;
  if (url.startsWith('http')) {
    fullUrl = url;
  } else {
    const baseUrl = getApiBaseUrl();
    // If URL already starts with the base URL, don't prepend it again
    // This prevents /api/api/runs/... when baseUrl is /api and url is /api/runs/...
    if (url.startsWith(baseUrl)) {
      fullUrl = url;
    } else {
      // Ensure proper joining: baseUrl might end with /, url might start with /
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
      fullUrl = `${normalizedBase}${normalizedUrl}`;
    }
  }

  // Add authentication token as query parameter
  // EventSource API doesn't support custom headers, so we pass the token in the URL
  // The server will extract it from the query string and validate it
  const token = getAuthToken();
  if (token) {
    try {
      // Handle both absolute and relative URLs
      let urlObj: URL;
      if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
        urlObj = new URL(fullUrl);
      } else {
        // For relative URLs, use current origin
        urlObj = new URL(fullUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      }
      urlObj.searchParams.set('token', token);
      fullUrl = urlObj.toString();
    } catch (error) {
      // If URL parsing fails, append token as query parameter manually
      const separator = fullUrl.includes('?') ? '&' : '?';
      fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
    }
  }

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      // Close the EventSource connection
      // Note: EventSource doesn't support removing individual listeners,
      // so we just close the connection which stops all event processing
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
    setHasError(false);
    reconnectAttemptsRef.current = 0;
    notFoundRetryAttemptsRef.current = 0; // Reset 404 retry counter
    callbacksRef.current.onClose?.();
  }, []);

  const connect = useCallback(() => {
    // Explicitly close and cleanup old connection first to prevent duplicate connections
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Don't connect if disabled
    if (!enabled) {
      return;
    }

    // Validate URL before connecting
    if (!fullUrl || fullUrl.trim() === '') {
      console.warn('[SSE] Cannot connect: URL is empty');
      setHasError(true);
      return;
    }

    // Add a delay before connecting to allow MongoDB write to commit
    // This helps avoid race conditions where the run might not be immediately visible
    // Only delay on first connection attempt (when reconnectAttemptsRef is 0)
    const shouldDelay = reconnectAttemptsRef.current === 0 && notFoundRetryAttemptsRef.current === 0;
    const initialDelay = shouldDelay ? 1000 : 0; // 1 second delay for first connection to ensure MongoDB write is committed

    const attemptConnection = () => {
      // Guard against multiple simultaneous connection attempts
      if (eventSourceRef.current) {
        return;
      }
      
      try {
        const eventSource = new EventSource(fullUrl);
        eventSourceRef.current = eventSource;

        // Connection opened
        eventSource.onopen = () => {
          setIsConnected(true);
          setHasError(false);
          reconnectAttemptsRef.current = 0;
          notFoundRetryAttemptsRef.current = 0; // Reset 404 retry counter on successful connection
          callbacksRef.current.onOpen?.();
        };

        // Connection error
        eventSource.onerror = (error) => {
          setHasError(true);
          setIsConnected(false);
          callbacksRef.current.onConnectionError?.(error);

          // Attempt to reconnect if not manually closed
          if (eventSourceRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
              }
              connect();
            }, reconnectDelay);
          } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            // Max reconnect attempts reached
            logError(
              new Error(`SSE connection failed after ${maxReconnectAttempts} attempts`),
              'useSSE-connection-failed'
            );
            close();
          }
        };

        // Event handlers for specific event types
        // Use callbacksRef.current to access latest callbacks without triggering reconnections
        eventSource.addEventListener('job_status', (event: MessageEvent) => {
          try {
            const data = safeParseEventData<JobStatusEventData>(event, 'job_status');
            if (data) {
              callbacksRef.current.onJobStatus?.(data);
            }
          } catch (error) {
            logError(error as Error, 'useSSE-job-status-parse');
          }
        });

        eventSource.addEventListener('queue_position', (event: MessageEvent) => {
          try {
            const data = safeParseEventData<QueuePositionEventData>(event, 'queue_position');
            if (data) {
              callbacksRef.current.onQueuePosition?.(data);
            }
          } catch (error) {
            logError(error as Error, 'useSSE-queue-position-parse');
          }
        });

        eventSource.addEventListener('progress', (event: MessageEvent) => {
          try {
            const data = safeParseEventData<ProgressEventData>(event, 'progress');
            if (data) {
              callbacksRef.current.onProgress?.(data);
            }
          } catch (error) {
            logError(error as Error, 'useSSE-progress-parse');
          }
        });

        eventSource.addEventListener('log', (event: MessageEvent) => {
          try {
            const data = safeParseEventData<LogEventData>(event, 'log');
            if (data) {
              callbacksRef.current.onLog?.(data);
            }
          } catch (error) {
            logError(error as Error, 'useSSE-log-parse');
          }
        });

        eventSource.addEventListener('error', (event: MessageEvent) => {
          try {
            // Only process if this is a custom error event from the server (has data)
            // Connection errors are handled by onerror, not this listener
            const data = safeParseEventData<ErrorEventData & { statusCode?: number }>(event, 'error');
            if (data) {
              // Check if this is a 404 error (run not found - possible race condition)
              const isNotFound = (data as { statusCode?: number }).statusCode === 404 || 
                                (data as { error?: string }).error?.includes('NOT_FOUND') ||
                                (data as { error?: string }).error?.includes('not found');
              
              if (isNotFound && notFoundRetryAttemptsRef.current < maxNotFoundRetries) {
                // This might be a race condition - retry with shorter delay
                notFoundRetryAttemptsRef.current++;
                console.debug(`[SSE] Run not found (attempt ${notFoundRetryAttemptsRef.current}/${maxNotFoundRetries}), retrying in ${notFoundRetryDelay}ms...`);
                
                // Close current connection
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                  eventSourceRef.current = null;
                }
                
                // Retry after short delay
                reconnectTimeoutRef.current = setTimeout(() => {
                  notFoundRetryAttemptsRef.current = 0; // Reset on successful connection
                  connect();
                }, notFoundRetryDelay);
                
                return; // Don't call onErrorEvent for retryable 404s
              }
              
              // For other errors or max retries reached, call the error handler
              callbacksRef.current.onError?.(data as ErrorEventData);
            }
            // If no data, this is likely a connection error being misinterpreted
            // Don't log it here as it's already handled by onerror
          } catch (error) {
            logError(error as Error, 'useSSE-error-parse');
          }
        });

        eventSource.addEventListener('completed', (event: MessageEvent) => {
          try {
            const data = safeParseEventData<CompletedEventData>(event, 'completed');
            if (data) {
              callbacksRef.current.onCompleted?.(data);
              // Close connection when workflow completes
              setTimeout(() => close(), 1000);
            }
          } catch (error) {
            logError(error as Error, 'useSSE-completed-parse');
          }
        });

        // Ignore ping events (keep-alive)
        eventSource.addEventListener('ping', () => {
          // No-op, just keeps connection alive
        });

        eventSource.addEventListener('graph_update', (event: MessageEvent) => {
          try {
            const data = safeParseEventData<GraphUpdateEventData>(event, 'graph_update');
            if (data) {
              callbacksRef.current.onGraphUpdate?.(data);
            }
          } catch (error) {
            logError(error as Error, 'useSSE-graph-update-parse');
          }
        });
      } catch (error) {
        logError(error as Error, 'useSSE-connection');
        setHasError(true);
        setIsConnected(false);
      }
    };

    if (initialDelay > 0) {
      // Delay first connection to allow MongoDB write to commit
      setTimeout(attemptConnection, initialDelay);
    } else {
      attemptConnection();
    }
  }, [fullUrl, enabled, close]);

  const reconnect = useCallback(() => {
    close();
    reconnectAttemptsRef.current = 0;
    setTimeout(() => connect(), 100);
  }, [close, connect]);

  // Setup connection on mount or when URL/enabled changes
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      close();
    }

    // Cleanup on unmount
    return () => {
      close();
    };
  }, [enabled, fullUrl, connect, close]);

  return {
    isConnected,
    hasError,
    close,
    reconnect,
  };
}
