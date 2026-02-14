import { useEffect, useRef, useCallback, useState } from 'react';

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
export function useOptimizedPolling(options: UseOptimizedPollingOptions): UseOptimizedPollingReturn {
  const {
    pollFn,
    baseInterval = 2000,
    activeInterval = 1000,
    idleInterval = 5000,
    enabled = true,
    startActive = false,
    onActivityDetected,
    onIdleDetected,
    maxErrors = 3,
    backoffMultiplier = 2,
    maxBackoffInterval = 30000,
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [isActive, setIsActive] = useState(startActive);
  const [errorCount, setErrorCount] = useState(0);
  const [currentInterval, setCurrentInterval] = useState(baseInterval);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const isActiveRef = useRef(startActive);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollFnRef = useRef(pollFn);

  // Prevent state updates after unmount (avoids React warnings and test flakiness)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update pollFn ref when it changes
  useEffect(() => {
    pollFnRef.current = pollFn;
  }, [pollFn]);

  // Calculate current interval based on mode and errors
  const calculateInterval = useCallback(() => {
    let interval = isActiveRef.current ? activeInterval : idleInterval;
    
    // Apply error backoff
    if (errorCount > 0) {
      const backoffInterval = baseInterval * Math.pow(backoffMultiplier, Math.min(errorCount, maxErrors));
      interval = Math.min(backoffInterval, maxBackoffInterval);
    }
    
    return interval;
  }, [activeInterval, idleInterval, baseInterval, errorCount, backoffMultiplier, maxErrors, maxBackoffInterval]);

  // Perform a single poll
  const performPoll = useCallback(async () => {
    try {
      await pollFnRef.current();
      // Reset error count on success
      if (errorCount > 0) {
        if (!isMountedRef.current) return;
        setErrorCount(0);
        setCurrentInterval(calculateInterval());
      }
    } catch (error) {
      // Increment error count
      if (!isMountedRef.current) return;
      setErrorCount(prev => {
        const newCount = prev + 1;
        setCurrentInterval(calculateInterval());
        return newCount;
      });
      // Continue polling even on errors
      console.warn('[useOptimizedPolling] Poll error:', error);
    }
  }, [errorCount, calculateInterval]);

  // Mark activity and switch to active mode
  const markActivity = useCallback(() => {
    if (!isActiveRef.current) {
      isActiveRef.current = true;
      setIsActive(true);
      setCurrentInterval(calculateInterval());
      onActivityDetected?.();
    }
    lastActivityRef.current = Date.now();
    
    // Clear idle timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    
    // Set new idle timeout (switch to idle after 30 seconds of no activity)
    idleTimeoutRef.current = setTimeout(() => {
      if (isActiveRef.current && Date.now() - lastActivityRef.current >= 30000) {
        isActiveRef.current = false;
        setIsActive(false);
        setCurrentInterval(calculateInterval());
        onIdleDetected?.();
      }
    }, 30000);
  }, [calculateInterval, onActivityDetected, onIdleDetected]);

  // Mark idle and switch to idle mode
  const markIdle = useCallback(() => {
    if (isActiveRef.current) {
      isActiveRef.current = false;
      setIsActive(false);
      setCurrentInterval(calculateInterval());
      onIdleDetected?.();
    }
    
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, [calculateInterval, onIdleDetected]);

  // Start polling
  const start = useCallback(() => {
    if (intervalRef.current) {
      return; // Already polling
    }
    
    setIsPolling(true);
    const interval = calculateInterval();
    setCurrentInterval(interval);
    
    const poll = async () => {
      await performPoll();
      
      // Schedule next poll with current interval
      if (intervalRef.current) {
        const nextInterval = calculateInterval();
        setCurrentInterval(nextInterval);
        intervalRef.current = setTimeout(poll, nextInterval);
      }
    };
    
    // Start first poll immediately
    performPoll();
    
    // Schedule subsequent polls
    intervalRef.current = setTimeout(poll, interval);
  }, [performPoll, calculateInterval]);

  // Stop polling
  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
    
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  // Trigger immediate poll
  const triggerPoll = useCallback(() => {
    performPoll();
    markActivity();
  }, [performPoll, markActivity]);

  // Update interval when it changes
  useEffect(() => {
    if (isPolling && intervalRef.current) {
      // Restart polling with new interval
      stop();
      start();
    }
  }, [currentInterval, isPolling, start, stop]);

  // Auto-start/stop based on enabled flag
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    
    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  // Update interval when mode changes
  useEffect(() => {
    setCurrentInterval(calculateInterval());
  }, [isActive, calculateInterval]);

  return {
    isPolling,
    currentInterval,
    isActive,
    errorCount,
    triggerPoll,
    start,
    stop,
    markActivity,
    markIdle,
  };
}

