export interface UseOptimizedPollingOptions {
    /**
     * The function to call on each poll
     */
    pollFn: () => Promise<void> | void;
    /**
     * Base polling interval in milliseconds
     * Default: 2000ms (2 seconds)
     */
    baseInterval?: number;
    /**
     * Active interval (when activity is detected) in milliseconds
     * Default: 1000ms (1 second)
     */
    activeInterval?: number;
    /**
     * Idle interval (when no activity) in milliseconds
     * Default: 5000ms (5 seconds)
     */
    idleInterval?: number;
    /**
     * Whether polling is enabled
     * Default: true
     */
    enabled?: boolean;
    /**
     * Whether to start in active mode (faster polling)
     * Default: false
     */
    startActive?: boolean;
    /**
     * Callback when activity is detected (triggers switch to active mode)
     */
    onActivityDetected?: () => void;
    /**
     * Callback when idle is detected (triggers switch to idle mode)
     */
    onIdleDetected?: () => void;
    /**
     * Maximum consecutive errors before backing off
     * Default: 3
     */
    maxErrors?: number;
    /**
     * Backoff multiplier for errors
     * Default: 2
     */
    backoffMultiplier?: number;
    /**
     * Maximum backoff interval in milliseconds
     * Default: 30000ms (30 seconds)
     */
    maxBackoffInterval?: number;
}
export interface UseOptimizedPollingReturn {
    /**
     * Whether polling is currently active
     */
    isPolling: boolean;
    /**
     * Current polling interval
     */
    currentInterval: number;
    /**
     * Whether in active mode (faster polling)
     */
    isActive: boolean;
    /**
     * Number of consecutive errors
     */
    errorCount: number;
    /**
     * Manually trigger a poll immediately
     */
    triggerPoll: () => void;
    /**
     * Start polling
     */
    start: () => void;
    /**
     * Stop polling
     */
    stop: () => void;
    /**
     * Mark activity (switch to active mode)
     */
    markActivity: () => void;
    /**
     * Mark idle (switch to idle mode)
     */
    markIdle: () => void;
}
/**
 * Optimized polling hook with adaptive intervals and error handling
 *
 * Features:
 * - Adaptive intervals: faster when active, slower when idle
 * - Error backoff: increases interval on errors
 * - Activity detection: switches to active mode on activity
 * - Graceful error handling: continues polling on errors
 * - Manual control: start, stop, trigger poll
 */
export declare function useOptimizedPolling(options: UseOptimizedPollingOptions): UseOptimizedPollingReturn;
