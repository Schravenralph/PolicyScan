export interface UseRecentSearchesReturn {
    recentSearches: string[];
    saveRecentSearch: (search: string) => void;
    clearRecentSearches: () => void;
}
/**
 * Hook for managing recent searches in localStorage.
 *
 * Provides functionality to save, retrieve, and clear recent searches.
 * Maintains a maximum of 5 recent searches, with the most recent first.
 *
 * @returns Object containing recent searches array and management functions
 *
 * @example
 * ```typescript
 * const { recentSearches, saveRecentSearch, clearRecentSearches } = useRecentSearches();
 *
 * // Save a new search
 * saveRecentSearch('urban planning');
 *
 * // Clear all searches
 * clearRecentSearches();
 * ```
 */
export declare function useRecentSearches(): UseRecentSearchesReturn;
