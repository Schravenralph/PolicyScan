/**
 * Workflow Status Polling Utility
 *
 * Provides robust polling with retry logic for workflow status updates.
 * Handles transient failures, stuck workflows, and connection issues.
 */
import type { Run } from '../services/api';
export interface WorkflowStatusPollingOptions {
    /** Polling interval in milliseconds (default: 3000) */
    intervalMs?: number;
    /** Maximum number of consecutive failures before stopping (default: 5) */
    maxConsecutiveFailures?: number;
    /** Maximum polling duration in milliseconds (default: 30 minutes) */
    maxDurationMs?: number;
    /** Retry delay for failed polls in milliseconds (default: 1000) */
    retryDelayMs?: number;
    /** Maximum retries per poll attempt (default: 3) */
    maxRetriesPerPoll?: number;
    /** Callback when status changes */
    onStatusChange?: (status: Run['status']) => void;
    /** Callback when stuck workflow detected */
    onStuckDetected?: (runId: string, lastUpdate: Date) => void;
    /** Callback for each poll result */
    onPoll?: (run: Run) => void;
    /** Callback when polling stops */
    onStop?: (reason: 'completed' | 'failed' | 'cancelled' | 'timeout' | 'max-failures') => void;
}
export interface WorkflowStatusPollingResult {
    stop: () => void;
    getStatus: () => Run['status'] | null;
    getLastUpdate: () => Date | null;
    getConsecutiveFailures: () => number;
}
/**
 * Poll workflow status with retry logic and stuck detection
 */
export declare function pollWorkflowStatus(runId: string, options?: WorkflowStatusPollingOptions): WorkflowStatusPollingResult;
