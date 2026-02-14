export interface FeatureFlag {
    name: string;
    enabled: boolean;
    description?: string;
    source: string;
}
/**
 * React Query hook for fetching feature flags
 *
 * @param options - Optional query options
 * @example
 * ```tsx
 * const { data: flags, isLoading, error } = useFeatureFlags();
 * ```
 */
export declare function useFeatureFlags(options?: {
    enabled?: boolean;
    filterSource?: 'database' | 'environment' | 'all';
}): import("@tanstack/react-query").UseQueryResult<FeatureFlag[], Error>;
