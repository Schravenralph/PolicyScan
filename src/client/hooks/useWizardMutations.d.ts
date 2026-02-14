/**
 * useWizardMutations Hook
 *
 * Centralized tracking of pending wizard mutations and request cancellation.
 * Prevents double-clicks, multi-tab issues, and navigation mid-request bugs.
 */
export interface UseWizardMutationsReturn {
    isPending: boolean;
    pendingOperations: Set<string>;
    startOperation: (operationId: string) => AbortController;
    completeOperation: (operationId: string) => void;
    cancelOperation: (operationId: string) => void;
    cancelAll: () => void;
    hasUnsavedChanges: boolean;
}
/**
 * Custom hook for tracking wizard mutations and managing request cancellation
 */
export declare function useWizardMutations(): UseWizardMutationsReturn;
