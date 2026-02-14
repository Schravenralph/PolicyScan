/**
 * useLoadDocuments Hook
 *
 * Handles the async loading of documents for Step 3 of the Beleidsscan wizard.
 * Uses a state machine pattern to manage loading states and prevent race conditions.
 *
 * @see WI-WIZ-006 for implementation details
 */
import { type BronDocument } from '../services/api';
/**
 * Loading states for the document fetching flow
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
/**
 * Result type for the useLoadDocuments hook
 */
interface UseLoadDocumentsResult {
    /** Current loading state */
    loadingState: LoadingState;
    /** Loaded documents (normalized) */
    documents: BronDocument[];
    /** Error message if loading failed */
    error: string | null;
    /** Whether documents are currently loading */
    isLoading: boolean;
    /** Retry the load operation */
    retry: () => void;
    /** Reset the state (useful when queryId changes) */
    reset: () => void;
}
interface UseLoadDocumentsOptions {
    /** Enable/disable auto-loading when queryId changes */
    autoLoad?: boolean;
    /** Callback when documents are successfully loaded */
    onSuccess?: (documents: BronDocument[]) => void;
    /** Callback when loading fails */
    onError?: (error: string) => void;
    /** Debounce time in milliseconds (default: 1000) */
    debounceMs?: number;
}
/**
 * Hook for loading documents by query ID with race condition protection
 *
 * @param queryId - The query ID to load documents for (null means don't load)
 * @param currentStep - Current wizard step (only loads on step 3)
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { documents, isLoading, error, retry } = useLoadDocuments(queryId, step);
 *
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorMessage message={error} onRetry={retry} />;
 * return <DocumentList documents={documents} />;
 * ```
 */
export declare function useLoadDocuments(queryId: string | null, currentStep: number, options?: UseLoadDocumentsOptions): UseLoadDocumentsResult;
export default useLoadDocuments;
