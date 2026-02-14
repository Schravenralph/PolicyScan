/**
 * Workflow Status Polling Utility
 * 
 * Provides robust polling with retry logic for workflow status updates.
 * Handles transient failures, stuck workflows, and connection issues.
 */

import { api } from '../services/api';
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
export function pollWorkflowStatus(
  runId: string,
  options: WorkflowStatusPollingOptions = {}
): WorkflowStatusPollingResult {
  const {
    intervalMs = 3000,
    maxConsecutiveFailures = 5,
    maxDurationMs = 30 * 60 * 1000, // 30 minutes
    retryDelayMs = 1000,
    maxRetriesPerPoll = 3,
    onStatusChange,
    onStuckDetected,
    onPoll,
    onStop,
  } = options;

  let isPolling = true;
  let currentStatus: Run['status'] | null = null;
  let lastUpdate: Date | null = null;
  let consecutiveFailures = 0;
  let pollInterval: NodeJS.Timeout | null = null;
  const startTime = Date.now();
  let lastSuccessfulPoll: Date | null = null;

  const pollWithRetry = async (): Promise<Run | null> => {
    let lastError: unknown;
    
    for (let attempt = 0; attempt <= maxRetriesPerPoll; attempt++) {
      try {
        const run = await api.getRun(runId);
        consecutiveFailures = 0;
        lastSuccessfulPoll = new Date();
        return run;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetriesPerPoll) {
          // Exponential backoff for retries
          const delay = retryDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    consecutiveFailures++;
    console.warn(`Failed to poll workflow status after ${maxRetriesPerPoll + 1} attempts:`, lastError);
    return null;
  };

  const performPoll = async (): Promise<void> => {
    if (!isPolling) {
      return;
    }

    // Check max duration
    if (Date.now() - startTime > maxDurationMs) {
      stopPolling('timeout');
      return;
    }

    // Check max consecutive failures
    if (consecutiveFailures >= maxConsecutiveFailures) {
      stopPolling('max-failures');
      return;
    }

    // Check for stuck workflow (no successful poll in last 5 minutes)
    if (lastSuccessfulPoll && Date.now() - lastSuccessfulPoll.getTime() > 5 * 60 * 1000) {
      if (onStuckDetected && currentStatus === 'running') {
        onStuckDetected(runId, lastSuccessfulPoll);
      }
    }

    const run = await pollWithRetry();
    
    if (!run) {
      // Failed to poll, will retry on next interval
      return;
    }

    lastUpdate = new Date();
    
    // Check for status change
    if (currentStatus !== run.status) {
      // previousStatus not used
      currentStatus = run.status;
      
      if (onStatusChange) {
        onStatusChange(run.status);
      }

      // Stop polling if workflow is in terminal state
      if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        stopPolling(run.status);
        return;
      }
    }

    if (onPoll) {
      onPoll(run);
    }
  };

  const stopPolling = (reason: 'completed' | 'failed' | 'cancelled' | 'timeout' | 'max-failures'): void => {
    if (!isPolling) {
      return;
    }

    isPolling = false;
    
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (onStop) {
      onStop(reason);
    }
  };

  // Start polling immediately, then at intervals
  performPoll();
  pollInterval = setInterval(performPoll, intervalMs);

  return {
    stop: () => stopPolling('cancelled'),
    getStatus: () => currentStatus,
    getLastUpdate: () => lastUpdate,
    getConsecutiveFailures: () => consecutiveFailures,
  };
}


