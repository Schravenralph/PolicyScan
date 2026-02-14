import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for tracking scroll positions per step in a multi-step wizard
 * 
 * @param currentStep - The current step number (1-indexed)
 * @param options - Configuration options
 * @returns Object with scroll positions and restore function
 */
export function useScrollTracking(
  currentStep: number,
  options: {
    /**
     * Number of steps to track (default: 3)
     */
    stepCount?: number;
    /**
     * Whether to automatically restore scroll position when step changes (default: false)
     */
    autoRestore?: boolean;
    /**
     * Callback when scroll position is restored
     */
    onRestore?: (step: number, position: number) => void;
  } = {}
) {
  const { stepCount = 3, autoRestore = false, onRestore } = options;
  
  // Track scroll positions per step
  const scrollPositionsRef = useRef<Record<number, number>>({});
  
  // Initialize scroll positions for all steps
  useEffect(() => {
    if (Object.keys(scrollPositionsRef.current).length === 0) {
      for (let i = 1; i <= stepCount; i++) {
        scrollPositionsRef.current[i] = 0;
      }
    }
  }, [stepCount]);

  // Track previous step to detect step changes
  const previousStepRef = useRef<number>(currentStep);

  /**
   * Restore scroll position for a specific step
   */
  const restoreScrollPosition = useCallback((step: number, position?: number) => {
    const targetPosition = position ?? scrollPositionsRef.current[step] ?? 0;
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetPosition, behavior: 'auto' });
      if (onRestore) {
        onRestore(step, targetPosition);
      }
    });
  }, [onRestore]);

  /**
   * Update scroll position for a specific step
   */
  const updateScrollPosition = useCallback((step: number, position: number) => {
    scrollPositionsRef.current[step] = position;
  }, []);

  /**
   * Get scroll position for a specific step
   */
  const getScrollPosition = useCallback((step: number): number => {
    return scrollPositionsRef.current[step] ?? 0;
  }, []);

  /**
   * Get all scroll positions
   */
  const getAllScrollPositions = useCallback((): Record<number, number> => {
    return { ...scrollPositionsRef.current };
  }, []);

  /**
   * Set all scroll positions (useful for restoring from draft)
   */
  const setScrollPositions = useCallback((positions: Record<number, number>) => {
    scrollPositionsRef.current = {
      ...scrollPositionsRef.current,
      ...positions,
    };
  }, []);

  // Track scroll position for current step
  useEffect(() => {
    const handleScroll = () => {
      scrollPositionsRef.current[currentStep] = window.scrollY;
    };

    // Update immediately to capture current position
    handleScroll();
    
    // Listen for scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [currentStep]);

  // Auto-restore scroll position when step changes (if enabled)
  useEffect(() => {
    if (autoRestore && previousStepRef.current !== currentStep) {
      previousStepRef.current = currentStep;
      
      // Restore scroll position for the new step
      restoreScrollPosition(currentStep);
    } else {
      previousStepRef.current = currentStep;
    }
  }, [currentStep, autoRestore, restoreScrollPosition]);

  return {
    /**
     * Current scroll positions for all steps
     */
    scrollPositions: getAllScrollPositions(),
    /**
     * Restore scroll position for a specific step
     */
    restoreScrollPosition,
    /**
     * Update scroll position for a specific step
     */
    updateScrollPosition,
    /**
     * Get scroll position for a specific step
     */
    getScrollPosition,
    /**
     * Set all scroll positions (for restoring from draft)
     */
    setScrollPositions,
  };
}

