/**
 * SSE event types matching server-side SSEService
 */
export type SSEEventType = 'job_status' | 'queue_position' | 'progress' | 'log' | 'error' | 'completed' | 'ping' | 'graph_update';
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
    progress: number;
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
    edges: Array<{
        source: string;
        target: string;
    }>;
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
export declare function useSSE(url: string, options?: UseSSEOptions): UseSSEResult;
