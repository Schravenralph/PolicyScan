/**
 * Hook for tracking scroll positions per step in a multi-step wizard
 *
 * @param currentStep - The current step number (1-indexed)
 * @param options - Configuration options
 * @returns Object with scroll positions and restore function
 */
export declare function useScrollTracking(currentStep: number, options?: {
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
}): {
    /**
     * Current scroll positions for all steps
     */
    scrollPositions: Record<number, number>;
    /**
     * Restore scroll position for a specific step
     */
    restoreScrollPosition: (step: number, position?: number) => void;
    /**
     * Update scroll position for a specific step
     */
    updateScrollPosition: (step: number, position: number) => void;
    /**
     * Get scroll position for a specific step
     */
    getScrollPosition: (step: number) => number;
    /**
     * Set all scroll positions (for restoring from draft)
     */
    setScrollPositions: (positions: Record<number, number>) => void;
};
