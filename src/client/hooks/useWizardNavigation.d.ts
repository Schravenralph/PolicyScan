/**
 * useWizardNavigation Hook
 *
 * Manages wizard navigation and step transitions.
 * Handles navigation errors and revision conflicts.
 */
export interface UseWizardNavigationReturn {
    isNavigating: boolean;
    error: Error | null;
    navigate: (sessionId: string, targetStepId: string, revision?: number) => Promise<void>;
    clearError: () => void;
}
/**
 * Custom hook for wizard navigation
 *
 * Provides methods for navigating between wizard steps with proper error handling
 * and revision conflict management.
 */
export declare function useWizardNavigation(): UseWizardNavigationReturn;
