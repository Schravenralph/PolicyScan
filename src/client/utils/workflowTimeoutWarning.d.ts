/**
 * Workflow Timeout Warning Utility
 *
 * Monitors workflow execution time and warns users before timeout.
 * Provides options to extend timeout or save progress.
 */
export interface WorkflowTimeoutWarningOptions {
    /** Timeout duration in milliseconds */
    timeoutMs: number;
    /** Warning threshold in milliseconds before timeout (default: 5 minutes) */
    warningThresholdMs?: number;
    /** Callback when warning should be shown */
    onWarning: (remainingMs: number) => void;
    /** Callback when timeout is reached */
    onTimeout: () => void;
    /** Callback to check if workflow is still running */
    isRunning: () => boolean;
}
export interface WorkflowTimeoutWarningResult {
    stop: () => void;
    getRemainingTime: () => number | null;
    getTimeUntilWarning: () => number | null;
}
/**
 * Monitor workflow timeout and show warnings
 */
export declare function monitorWorkflowTimeout(startTime: number, options: WorkflowTimeoutWarningOptions): WorkflowTimeoutWarningResult;
/**
 * Format remaining time for display
 */
export declare function formatRemainingTime(remainingMs: number): string;
