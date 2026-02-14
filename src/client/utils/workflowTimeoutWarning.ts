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
export function monitorWorkflowTimeout(
  startTime: number,
  options: WorkflowTimeoutWarningOptions
): WorkflowTimeoutWarningResult {
  const {
    timeoutMs,
    warningThresholdMs = 5 * 60 * 1000, // 5 minutes
    onWarning,
    onTimeout,
    isRunning,
  } = options;

  let isMonitoring = true;
  let warningShown = false;
  let checkInterval: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;

  const checkTimeout = (): void => {
    if (!isMonitoring || !isRunning()) {
      stopMonitoring();
      return;
    }

    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    // timeUntilWarning not used, only remaining is checked

    // Show warning if threshold reached
    if (!warningShown && remaining <= warningThresholdMs && remaining > 0) {
      warningShown = true;
      onWarning(remaining);
    }

    // Trigger timeout if exceeded
    if (remaining <= 0) {
      stopMonitoring();
      onTimeout();
      return;
    }
  };

  const stopMonitoring = (): void => {
    isMonitoring = false;
    
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  // Check every 10 seconds
  checkInterval = setInterval(checkTimeout, 10000);
  
  // Also set a timer for the exact timeout moment
  timeoutTimer = setTimeout(() => {
    if (isMonitoring && isRunning()) {
      stopMonitoring();
      onTimeout();
    }
  }, timeoutMs);

  // Initial check
  checkTimeout();

  return {
    stop: stopMonitoring,
    getRemainingTime: () => {
      if (!isMonitoring) {
        return null;
      }
      const elapsed = Date.now() - startTime;
      return Math.max(0, timeoutMs - elapsed);
    },
    getTimeUntilWarning: () => {
      if (!isMonitoring || warningShown) {
        return null;
      }
      const elapsed = Date.now() - startTime;
      const remaining = timeoutMs - elapsed;
      return Math.max(0, remaining - warningThresholdMs);
    },
  };
}

/**
 * Format remaining time for display
 */
export function formatRemainingTime(remainingMs: number): string {
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes} min ${seconds} sec`;
  }
  return `${seconds} sec`;
}


