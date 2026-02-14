import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { logError } from '../utils/errorHandler';
import { getApiBaseUrl } from '../utils/apiUrl';

export interface MetricsUpdate {
    users: { total: number; active_today: number };
    workflows: { total: number; automated: number; running: number };
    runs: { today: number; success_rate: number };
    storage: { knowledge_base_size_mb: number; database_size_mb: number };
    errors: { last_24h: number; critical: number };
    threshold_alerts?: Array<{
        metric: string;
        current_value: number;
        threshold: number;
        severity: 'warning' | 'critical';
        timestamp: string;
    }>;
}

export interface ThresholdAlert {
    metric: string;
    current_value: number;
    threshold: number;
    severity: 'warning' | 'critical';
    timestamp: string;
}

export interface ScraperProgressUpdate {
    type: 'scraper_progress';
    runId: string;
    data: {
        progress: number;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
        estimatedSecondsRemaining?: number;
        currentStep: string;
        totalSteps: number;
        completedSteps: number;
        scrapers: Array<{
            scraperId: string;
            scraperName: string;
            status: 'pending' | 'running' | 'completed' | 'failed';
            progress: number;
            documentsFound: number;
            errors: number;
            currentUrl?: string;
        }>;
        totalDocumentsFound: number;
        totalSourcesFound: number;
        totalErrors: number;
        startedAt: number;
        lastUpdated: number;
        completedAt?: number;
        error?: string;
    };
}

export interface JobProgressEvent {
    type: 'job_started' | 'job_progress' | 'job_step' | 'job_completed' | 'job_failed' | 'job_cancelled';
    jobId: string;
    jobType: 'scan' | 'embedding' | 'processing' | 'export';
    timestamp: string;
    queryId?: string;
    data: {
        status?: 'active' | 'completed' | 'failed' | 'cancelled';
        progress?: number;
        message?: string;
        step?: string;
        stepNumber?: number;
        totalSteps?: number;
        metadata?: Record<string, unknown>;
        error?: string;
        errorDetails?: unknown;
        result?: unknown;
    };
}

export interface WorkflowLogUpdate {
    type: 'workflow_log';
    runId: string;
    log: {
        timestamp: Date | string;
        level: 'info' | 'warn' | 'error' | 'debug';
        message: string;
        metadata?: Record<string, unknown>;
    };
}

export interface TestExecutionUpdate {
    type: 'test_execution_update';
    runId: string;
    data: {
        status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
        progress: number; // 0-100
        currentTest?: string;
        totalTests?: number;
        completedTests?: number;
        passedTests?: number;
        failedTests?: number;
        skippedTests?: number;
        output?: string[];
        startedAt: number;
        lastUpdated: number;
        completedAt?: number;
        error?: string;
        estimatedSecondsRemaining?: number;
    };
}

export interface TestResultUpdate {
    type: 'test_result';
    runId: string;
    testId: string;
    result: {
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
        error?: string;
        output?: string;
    };
}

export interface QueueUpdate {
    type: 'queue_update';
    action: 'job_added' | 'job_updated' | 'job_removed' | 'job_active';
    timestamp: Date | string;
    job?: {
        jobId: string;
        workflowId: string;
        runId?: string;
        status?: 'active' | 'waiting' | 'paused';
        createdAt?: string;
        startedAt?: string;
        params?: Record<string, unknown>;
    };
    nextJob?: {
        jobId: string;
        workflowId: string;
        runId?: string;
        status: 'active';
        createdAt?: string;
        startedAt?: string;
        params?: Record<string, unknown>;
    } | null;
}

export interface UseWebSocketOptions {
    enabled?: boolean;
    onMetricsUpdate?: (metrics: MetricsUpdate) => void;
    onThresholdAlert?: (alert: ThresholdAlert) => void;
    onScraperProgress?: (progress: ScraperProgressUpdate) => void;
    onJobProgress?: (event: JobProgressEvent) => void;
    onWorkflowLog?: (update: WorkflowLogUpdate) => void;
    onTestExecutionUpdate?: (update: TestExecutionUpdate) => void;
    onTestResult?: (result: TestResultUpdate) => void;
    onQueueUpdate?: (update: QueueUpdate) => void;
    runId?: string; // Subscribe to specific run progress
    jobId?: string; // Subscribe to specific job progress
    queryId?: string; // Subscribe to all jobs for a query
    testRunId?: string; // Subscribe to specific test run progress
}

export interface UseWebSocketReturn {
    connected: boolean;
    error: Error | null;
    reconnect: () => void;
    disconnect: () => void;
}

/**
 * Hook for WebSocket connection to receive real-time admin dashboard updates
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
    const { enabled = true, onMetricsUpdate, onThresholdAlert, onScraperProgress, onJobProgress, onWorkflowLog, onTestExecutionUpdate, onTestResult, onQueueUpdate, runId, jobId, queryId, testRunId } = options;
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // Store callbacks in refs to avoid recreating connect/disconnect on every render
    const callbacksRef = useRef({
        onMetricsUpdate,
        onThresholdAlert,
        onScraperProgress,
        onJobProgress,
        onWorkflowLog,
        onTestExecutionUpdate,
        onTestResult,
        onQueueUpdate,
    });
    
    // Update refs when callbacks change (without triggering re-renders)
    useEffect(() => {
        callbacksRef.current = {
            onMetricsUpdate,
            onThresholdAlert,
            onScraperProgress,
            onJobProgress,
            onWorkflowLog,
            onTestExecutionUpdate,
            onTestResult,
            onQueueUpdate,
        };
    }, [onMetricsUpdate, onThresholdAlert, onScraperProgress, onJobProgress, onWorkflowLog, onTestExecutionUpdate, onTestResult, onQueueUpdate]);

    const connect = useCallback(() => {
        if (!enabled) {
            return;
        }

        // Prevent duplicate connections
        if (socketRef.current?.connected) {
            return;
        }

        // Disconnect any existing socket first
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        // Use the same API URL utility as the rest of the app for consistency
        const apiBaseUrl = getApiBaseUrl();
        
        // Socket.IO connection URL handling:
        // - For relative URLs (like '/api'), pass undefined to use window.location.origin
        //   The 'path' option will handle the Socket.IO endpoint path
        // - For absolute URLs, use them directly (Socket.IO handles http/https -> ws/wss automatically)
        let socketUrl: string | undefined;
        if (apiBaseUrl.startsWith('/')) {
            // Relative URL - pass undefined to use current window location
            // Socket.IO will use window.location.origin + the 'path' option
            socketUrl = undefined;
        } else {
            // Absolute URL - use as-is (Socket.IO handles http/https -> ws/wss automatically)
            socketUrl = apiBaseUrl;
        }

        const socket = io(socketUrl, {
            path: '/api/socket.io/', // Match server path configuration
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            withCredentials: true, // Include credentials for CORS
            autoConnect: true,
        });

        socket.on('connect', () => {
            setConnected(true);
            setError(null);
            
            // Subscribe to run progress if runId provided
            if (runId) {
                socket.emit('subscribe_run', runId);
            }
            
            // Join job room if jobId provided
            if (jobId) {
                socket.emit('join', `job:${jobId}`);
            }
            
            // Join query room if queryId provided
            if (queryId) {
                socket.emit('join', `query:${queryId}`);
            }
            
            // Subscribe to test run if testRunId provided
            if (testRunId) {
                socket.emit('subscribe', `test_run:${testRunId}`);
            }
            
            // Clear any pending reconnection timeout
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        });

        socket.on('disconnect', (reason) => {
            setConnected(false);
            // Don't set error on normal disconnects (e.g., server restart, manual disconnect)
            // Socket.IO will automatically attempt to reconnect for most disconnect reasons
            if (reason === 'io server disconnect') {
                // Server initiated disconnect - don't try to reconnect
                setError(new Error('Server disconnected'));
            } else if (reason === 'io client disconnect') {
                // Client initiated disconnect - clear error
                setError(null);
            } else {
                // Network error or other - Socket.IO will attempt reconnection
                // Only set error if reconnection attempts are exhausted
            }
        });

        socket.on('connect_error', (err) => {
            const actualUrl = socketUrl || (typeof window !== 'undefined' ? window.location.origin : 'unknown');
            console.error('[useWebSocket] ❌ Connection error:', err.message, {
                type: 'type' in err ? err.type : undefined,
                description: 'description' in err ? err.description : undefined,
                url: actualUrl,
                path: '/api/socket.io/',
                apiBaseUrl,
            });
            logError(err, 'websocket-connect-error');
            setError(err);
            setConnected(false);
        });

        socket.on('reconnect', (attemptNumber) => {
            setConnected(true);
            setError(null);
            
            // Re-subscribe to rooms on reconnect to ensure we don't miss messages
            // Socket.IO may not preserve room membership across reconnections
            if (runId) {
                socket.emit('subscribe_run', runId);
            }
            if (jobId) {
                socket.emit('join', `job:${jobId}`);
            }
            if (queryId) {
                socket.emit('join', `query:${queryId}`);
            }
        });

        socket.on('reconnect_error', (err) => {
            console.error('[useWebSocket] ❌ Reconnection error:', err.message);
        });

        socket.on('reconnect_failed', () => {
            console.error('[useWebSocket] ❌ Reconnection failed - all attempts exhausted');
            setError(new Error('Failed to reconnect after multiple attempts'));
        });

        socket.on('metrics_update', (metrics: MetricsUpdate) => {
            if (callbacksRef.current.onMetricsUpdate) {
                callbacksRef.current.onMetricsUpdate(metrics);
            }
        });

        socket.on('threshold_alert', (alert: ThresholdAlert) => {
            if (callbacksRef.current.onThresholdAlert) {
                callbacksRef.current.onThresholdAlert(alert);
            }
        });

        socket.on('scraper_progress', (progress: ScraperProgressUpdate) => {
            if (callbacksRef.current.onScraperProgress) {
                callbacksRef.current.onScraperProgress(progress);
            }
        });

        socket.on('job_progress', (event: JobProgressEvent) => {
            if (callbacksRef.current.onJobProgress) {
                callbacksRef.current.onJobProgress(event);
            }
        });

        socket.on('workflow_log', (update: WorkflowLogUpdate) => {
            if (callbacksRef.current.onWorkflowLog) {
                callbacksRef.current.onWorkflowLog(update);
            }
        });

        socket.on('test_execution_update', (update: TestExecutionUpdate) => {
            if (callbacksRef.current.onTestExecutionUpdate) {
                callbacksRef.current.onTestExecutionUpdate(update);
            }
        });

        socket.on('test_result', (result: TestResultUpdate) => {
            if (callbacksRef.current.onTestResult) {
                callbacksRef.current.onTestResult(result);
            }
        });

        socket.on('queue_update', (update: QueueUpdate) => {
            if (callbacksRef.current.onQueueUpdate) {
                callbacksRef.current.onQueueUpdate(update);
            }
        });

        socketRef.current = socket;
    }, [enabled, runId, jobId, queryId, testRunId]);

    const disconnect = useCallback(() => {
        if (socketRef.current) {
            // Unsubscribe from run if subscribed
            if (runId) {
                socketRef.current.emit('unsubscribe_run', runId);
            }
            // Leave job room if joined
            if (jobId) {
                socketRef.current.emit('leave', `job:${jobId}`);
            }
            // Leave query room if joined
            if (queryId) {
                socketRef.current.emit('leave', `query:${queryId}`);
            }
            // Unsubscribe from test run if subscribed
            if (testRunId) {
                socketRef.current.emit('unsubscribe', `test_run:${testRunId}`);
            }
            socketRef.current.disconnect();
            socketRef.current = null;
            setConnected(false);
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, [runId, jobId, queryId, testRunId]);

    const reconnect = useCallback(() => {
        disconnect();
        // Small delay before reconnecting
        reconnectTimeoutRef.current = setTimeout(() => {
            connect();
        }, 1000);
    }, [connect, disconnect]);

    useEffect(() => {
        if (enabled) {
            connect();
        } else {
            disconnect();
        }

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect]);

    return {
        connected,
        error,
        reconnect,
        disconnect,
    };
}
