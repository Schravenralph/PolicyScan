export interface MetricsUpdate {
    users: {
        total: number;
        active_today: number;
    };
    workflows: {
        total: number;
        automated: number;
        running: number;
    };
    runs: {
        today: number;
        success_rate: number;
    };
    storage: {
        knowledge_base_size_mb: number;
        database_size_mb: number;
    };
    errors: {
        last_24h: number;
        critical: number;
    };
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
        progress: number;
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
    runId?: string;
    jobId?: string;
    queryId?: string;
    testRunId?: string;
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
export declare function useWebSocket(options?: UseWebSocketOptions): UseWebSocketReturn;
