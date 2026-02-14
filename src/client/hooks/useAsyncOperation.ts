import { useState, useCallback, useRef, useEffect } from 'react';
import { logError } from '../utils/errorHandler';

/**
 * Options for useAsyncOperation hook
 */
export interface UseAsyncOperationOptions<TData, TError = Error> {
  /**
   * Initial data value
   */
  initialData?: TData | null;
  
  /**
   * Initial loading state
   */
  initialLoading?: boolean;
  
  /**
   * Initial error value
   */
  initialError?: TError | null;
  
  /**
   * Context string for error logging
   */
  errorContext?: string;
  
  /**
   * Callback invoked on successful operation
   */
  onSuccess?: (data: TData) => void;
  
  /**
   * Callback invoked on error
   */
  onError?: (error: TError) => void;
  
  /**
   * Whether to log errors automatically
   */
  logErrors?: boolean;
  
  /**
   * Whether to clear error on new operation start
   */
  clearErrorOnStart?: boolean;
}

/**
 * Return type for useAsyncOperation hook
 */
export interface UseAsyncOperationReturn<TData, TError = Error> {
  /**
   * Current data value
   */
  data: TData | null;
  
  /**
   * Current loading state
   */
  isLoading: boolean;
  
  /**
   * Current error value
   */
  error: TError | null;
  
  /**
   * Execute async operation
   */
  execute: <TArgs extends unknown[]>(
    operation: (...args: TArgs) => Promise<TData>,
    ...args: TArgs
  ) => Promise<TData | null>;
  
  /**
   * Reset state to initial values
   */
  reset: () => void;
  
  /**
   * Set data directly
   */
  setData: (data: TData | null) => void;
  
  /**
   * Set error directly
   */
  setError: (error: TError | null) => void;
  
  /**
   * Set loading state directly
   */
  setLoading: (loading: boolean) => void;
  
  /**
   * Clear error
   */
  clearError: () => void;
}

/**
 * Reusable hook for managing async operations with standardized error handling,
 * loading states, and error logging.
 * 
 * This hook provides a consistent pattern for async operations across the codebase,
 * reducing code duplication and ensuring consistent error handling.
 * 
 * @example
 * ```typescript
 * const { data, isLoading, error, execute } = useAsyncOperation<string>({
 *   errorContext: 'fetch-user-data',
 *   onSuccess: (data) => console.log('Success:', data),
 *   onError: (error) => console.error('Error:', error),
 * });
 * 
 * // Execute operation
 * const result = await execute(fetchUserData, userId);
 * ```
 * 
 * @example
 * ```typescript
 * const { data, isLoading, error, execute } = useAsyncOperation<Document[]>({
 *   initialData: [],
 *   errorContext: 'load-documents',
 *   clearErrorOnStart: true,
 * });
 * 
 * // In component
 * useEffect(() => {
 *   execute(loadDocuments, queryId);
 * }, [queryId]);
 * ```
 */
export function useAsyncOperation<TData, TError = Error>(
  options: UseAsyncOperationOptions<TData, TError> = {}
): UseAsyncOperationReturn<TData, TError> {
  const {
    initialData = null,
    initialLoading = false,
    initialError = null,
    errorContext = 'async-operation',
    onSuccess,
    onError,
    logErrors = true,
    clearErrorOnStart = true,
  } = options;

  const [data, setData] = useState<TData | null>(initialData);
  const [isLoading, setLoading] = useState<boolean>(initialLoading);
  const [error, setError] = useState<TError | null>(initialError);

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abort any pending operations on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Execute async operation with standardized error handling
   */
  const execute = useCallback(
    async <TArgs extends unknown[]>(
      operation: (...args: TArgs) => Promise<TData>,
      ...args: TArgs
    ): Promise<TData | null> => {
      // Abort any previous operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Clear error if configured
      if (clearErrorOnStart && mountedRef.current) {
        setError(null);
      }

      // Set loading state
      if (mountedRef.current) {
        setLoading(true);
      }

      try {
        const result = await operation(...args);

        // Check if operation was aborted
        if (abortControllerRef.current?.signal.aborted || !mountedRef.current) {
          return null;
        }

        // Update state
        if (mountedRef.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }

        // Invoke success callback
        if (onSuccess) {
          try {
            onSuccess(result);
          } catch (callbackError) {
            // Log callback errors but don't fail the operation
            console.error('[useAsyncOperation] onSuccess callback failed:', callbackError);
          }
        }

        return result;
      } catch (err) {
        // Check if operation was aborted (not a real error)
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }

        // Check if component is still mounted
        if (!mountedRef.current) {
          return null;
        }

        // Convert error to TError type
        const error = (err instanceof Error ? err : new Error(String(err))) as TError;

        // Update error state
        setError(error);
        setLoading(false);

        // Log error if configured
        if (logErrors) {
          try {
            logError(err, errorContext);
          } catch (logError) {
            // Fallback to console.error if logError fails
            console.error(`[useAsyncOperation] Failed to log error for ${errorContext}:`, logError);
            console.error(`[useAsyncOperation] Original error:`, err);
          }
        }

        // Invoke error callback
        if (onError) {
          try {
            onError(error);
          } catch (callbackError) {
            // Log callback errors but don't fail the operation
            console.error('[useAsyncOperation] onError callback failed:', callbackError);
          }
        }

        return null;
      }
    },
    [errorContext, onSuccess, onError, logErrors, clearErrorOnStart]
  );

  /**
   * Reset state to initial values
   */
  const reset = useCallback(() => {
    if (mountedRef.current) {
      setData(initialData);
      setLoading(initialLoading);
      setError(initialError);
    }
  }, [initialData, initialLoading, initialError]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    if (mountedRef.current) {
      setError(null);
    }
  }, []);

  return {
    data,
    isLoading,
    error,
    execute,
    reset,
    setData,
    setError,
    setLoading,
    clearError,
  };
}


