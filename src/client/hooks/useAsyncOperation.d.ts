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
    execute: <TArgs extends unknown[]>(operation: (...args: TArgs) => Promise<TData>, ...args: TArgs) => Promise<TData | null>;
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
export declare function useAsyncOperation<TData, TError = Error>(options?: UseAsyncOperationOptions<TData, TError>): UseAsyncOperationReturn<TData, TError>;
