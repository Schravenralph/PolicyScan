/**
 * Staleness Detection - Detects and handles stale data
 *
 * Provides utilities for detecting stale data and triggering refreshes.
 */
export interface StalenessConfig {
    staleTime: number;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
    refetchInterval?: number | false;
}
/**
 * Default staleness configuration
 */
export declare const DEFAULT_STALENESS_CONFIG: StalenessConfig;
/**
 * Check if data is stale based on query state
 */
export declare function isDataStale(queryState: {
    dataUpdatedAt?: number;
    isStale?: boolean;
}, staleTime?: number): boolean;
/**
 * Hook for detecting stale data and auto-refreshing
 */
export declare function useStalenessDetection<T>(queryKey: readonly unknown[], queryFn: () => Promise<T>, config?: Partial<StalenessConfig>): {
    data: T | undefined;
    isStale: boolean;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
};
/**
 * Hook for detecting stale query data
 */
export declare function useStaleQueryDetection(queryId: string | null): {
    isStale: boolean;
    refresh: () => Promise<void>;
};
