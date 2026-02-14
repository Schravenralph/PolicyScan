export interface UseJurisdictionsReturn {
    gemeenten: string[];
    waterschappen: string[];
    provincies: string[];
    isLoading: boolean;
    error: string | null;
}
/**
 * Hook for loading jurisdictions (gemeenten, waterschappen, provincies) from the API.
 * Falls back to CSV file if API fails.
 *
 * Loads jurisdictions on mount and provides loading state and error handling.
 *
 * @returns Object containing jurisdictions arrays, loading state, and error
 *
 * @example
 * ```typescript
 * const { gemeenten, waterschappen, provincies, isLoading, error } = useJurisdictions();
 * ```
 */
export declare function useJurisdictions(): UseJurisdictionsReturn;
