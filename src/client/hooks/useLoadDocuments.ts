/**
 * useLoadDocuments Hook
 * 
 * Handles the async loading of documents for Step 3 of the Beleidsscan wizard.
 * Uses a state machine pattern to manage loading states and prevent race conditions.
 * 
 * @see WI-WIZ-006 for implementation details
 */

/**
 * useLoadDocuments Hook
 * 
 * ✅ **MIGRATED** - Now uses canonical document API internally.
 * Returns canonical documents transformed to Bron format for backward compatibility.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type BronDocument } from '../services/api';
import type { CanonicalDocument } from '../services/api';
import { normalizeBronDocument } from '../utils/documentUtils';
import { transformCanonicalDocumentToBron } from '../utils/transformations';
import { logError } from '../utils/errorHandler';

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
export function useLoadDocuments(
  queryId: string | null,
  currentStep: number,
  options: UseLoadDocumentsOptions = {}
): UseLoadDocumentsResult {
  const { autoLoad = true, onSuccess, onError, debounceMs = 1000 } = options;
  
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [documents, setDocuments] = useState<BronDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Track the queryId we're currently loading/have loaded for
  const loadedQueryIdRef = useRef<string | null>(null);
  // Abort controller for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // Minimum time between load attempts (prevents spam)
  const lastLoadTimeRef = useRef<number>(0);

  /**
   * Reset the state to idle
   */
  const reset = useCallback(() => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoadingState('idle');
    setDocuments([]);
    setError(null);
    loadedQueryIdRef.current = null;
  }, []);

  /**
   * Load documents for the given queryId
   */
  const loadDocuments = useCallback(async (targetQueryId: string) => {
    // Debounce protection
    const now = Date.now();
    if (now - lastLoadTimeRef.current < debounceMs) {
      return;
    }
    lastLoadTimeRef.current = now;

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoadingState('loading');
    setError(null);
    // Optimistically set loadedQueryIdRef to prevent useEffect loop
    loadedQueryIdRef.current = targetQueryId;

    try {
      // Use canonical document API with high limit to avoid capping at 50
      // Set limit to 20,000 to prevent crashes while allowing large document sets
      const response = await api.canonicalDocument.getCanonicalDocumentsByQuery(targetQueryId, {
        limit: 20000,
      });
      
      // Check if this request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Validate response
      const canonicalDocs = response.data || [];
      if (!Array.isArray(canonicalDocs)) {
        throw new Error('Ongeldig documentformaat ontvangen');
      }

      // Transform canonical documents to Bron format for backward compatibility
      const bronDocs = canonicalDocs.map((doc: CanonicalDocument) => 
        transformCanonicalDocumentToBron(doc)
      );

      // Normalize documents (for additional safety)
      // Type assertion: Bron is compatible with BronDocument for normalization
      const normalizedDocs = bronDocs.map((bron) => normalizeBronDocument(bron as unknown as BronDocument));
      
      // Success!
      setDocuments(normalizedDocs);
      setLoadingState('success');
      // loadedQueryIdRef is already set
      
      onSuccess?.(normalizedDocs);
    } catch (err) {
      // Check if this was an abort (not a real error)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      logError(err, 'load-documents');
      
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Fout bij laden documenten';
      
      setError(errorMessage);
      setLoadingState('error');
      // Do not reset loadedQueryIdRef here, otherwise useEffect will trigger reset() and clear the error
      
      onError?.(errorMessage);
    }
  }, [onSuccess, onError, debounceMs]);

  /**
   * Retry the load operation
   */
  const retry = useCallback(() => {
    if (queryId) {
      // Reset the debounce timer to allow immediate retry
      lastLoadTimeRef.current = 0;
      loadDocuments(queryId);
    }
  }, [queryId, loadDocuments]);

  /**
   * Effect: Auto-load documents when queryId changes and we're on step 3
   */
  useEffect(() => {
    // Only load on Step 3
    if (currentStep !== 3) {
      return;
    }

    // No queryId means nothing to load
    if (!queryId) {
      if (loadingState !== 'idle') {
        reset();
      }
      return;
    }

    // If we already loaded for this queryId, don't reload
    if (loadedQueryIdRef.current === queryId && loadingState === 'success') {
      return;
    }

    // If queryId changed, reset and reload
    if (loadedQueryIdRef.current !== queryId) {
      reset();
    }

    // Auto-load if enabled
    if (autoLoad) {
      loadDocuments(queryId);
    }
  }, [queryId, currentStep, autoLoad, loadingState, reset, loadDocuments]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    loadingState,
    documents,
    error,
    isLoading: loadingState === 'loading',
    retry,
    reset,
  };
}

export default useLoadDocuments;

