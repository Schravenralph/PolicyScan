import { useState, useCallback } from 'react';
import { useSSE, type JobStatusEventData, type QueuePositionEventData, type ProgressEventData, type LogEventData, type ErrorEventData, type CompletedEventData } from './useSSE';
import type { RunLog } from '../../server/services/infrastructure/types';

/**
 * Options for useWorkflowEvents hook
 */
export interface UseWorkflowEventsOptions {
  /** Whether to enable the SSE connection (default: true) */
  enabled?: boolean;
  /** Callback for job status changes */
  onStatusChange?: (status: JobStatusEventData['status']) => void;
  /** Callback for queue position updates */
  onQueuePositionChange?: (position: number, totalWaiting: number) => void;
  /** Callback for progress updates */
  onProgressChange?: (progress: number, message?: string) => void;
  /** Callback for new log entries */
  onLogEntry?: (log: RunLog) => void;
  /** Callback for errors */
  onError?: (error: string, details?: unknown) => void;
  /** Callback when workflow completes */
  onComplete?: (status: string, results?: unknown) => void;
}

/**
 * Return type for useWorkflowEvents hook
 */
export interface UseWorkflowEventsResult {
  /** Current job status */
  status: JobStatusEventData['status'] | null;
  /** Current queue position (0 if not queued) */
  queuePosition: number | null;
  /** Total jobs waiting in queue */
  totalWaiting: number | null;
  /** Current progress (0-100) */
  progress: number | null;
  /** Progress message */
  progressMessage: string | null;
  /** All log entries received */
  logs: RunLog[];
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
 * React hook for consuming workflow events via SSE
 * 
 * Provides a high-level interface for workflow event streaming with
 * built-in state management for status, queue position, progress, and logs.
 * 
 * @param runId - The workflow run ID
 * @param options - Configuration options and event callbacks
 * @returns Workflow state and control functions
 * 
 * @example
 * ```tsx
 * const { status, progress, logs, isConnected } = useWorkflowEvents(runId, {
 *   onStatusChange: (status) => console.log('Status:', status),
 *   onProgressChange: (progress) => setProgressBar(progress),
 * });
 * ```
 */
export function useWorkflowEvents(
  runId: string | null,
  options: UseWorkflowEventsOptions = {}
): UseWorkflowEventsResult {
  const {
    enabled = true,
    onStatusChange,
    onQueuePositionChange,
    onProgressChange,
    onLogEntry,
    onError,
    onComplete,
  } = options;

  const [status, setStatus] = useState<JobStatusEventData['status'] | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [totalWaiting, setTotalWaiting] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<RunLog[]>([]);

  const handleJobStatus = useCallback((data: JobStatusEventData) => {
    setStatus(data.status);
    onStatusChange?.(data.status);
  }, [onStatusChange]);

  const handleQueuePosition = useCallback((data: QueuePositionEventData) => {
    setQueuePosition(data.position);
    setTotalWaiting(data.totalWaiting);
    onQueuePositionChange?.(data.position, data.totalWaiting);
  }, [onQueuePositionChange]);

  const handleProgress = useCallback((data: ProgressEventData) => {
    setProgress(data.progress);
    setProgressMessage(data.message || null);
    onProgressChange?.(data.progress, data.message);
  }, [onProgressChange]);

  const handleLog = useCallback((data: LogEventData) => {
    const log: RunLog = {
      timestamp: typeof data.log.timestamp === 'string' ? new Date(data.log.timestamp) : data.log.timestamp,
      level: data.log.level,
      message: data.log.message,
      metadata: data.log.metadata,
    };
    setLogs(prev => [...prev, log]);
    onLogEntry?.(log);
  }, [onLogEntry]);

  const handleError = useCallback((data: ErrorEventData) => {
    onError?.(data.error, data.details);
  }, [onError]);

  const handleCompleted = useCallback((data: CompletedEventData) => {
    setStatus('completed');
    onComplete?.(data.status, data.results);
  }, [onComplete]);

  const sse = useSSE(
    runId ? `/api/runs/${runId}/events` : '',
    {
      enabled: enabled && !!runId,
      onJobStatus: handleJobStatus,
      onQueuePosition: handleQueuePosition,
      onProgress: handleProgress,
      onLog: handleLog,
      onError: handleError,
      onCompleted: handleCompleted,
    }
  );

  return {
    status,
    queuePosition,
    totalWaiting,
    progress,
    progressMessage,
    logs,
    isConnected: sse.isConnected,
    hasError: sse.hasError,
    close: sse.close,
    reconnect: sse.reconnect,
  };
}
