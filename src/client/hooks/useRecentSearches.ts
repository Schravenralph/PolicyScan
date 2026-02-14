import { useState, useCallback } from 'react';
import { logError } from '../utils/errorHandler';

const RECENT_SEARCHES_STORAGE_KEY = 'beleidsscan_recent_searches';
const MAX_RECENT_SEARCHES = 5;

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
export function useRecentSearches(): UseRecentSearchesReturn {
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveRecentSearch = useCallback((search: string) => {
    if (!search.trim()) return;
    
    setRecentSearches(prev => {
      // Remove duplicate and add to front, limit to MAX_RECENT_SEARCHES
      const updated = [search, ...prev.filter(s => s !== search)].slice(0, MAX_RECENT_SEARCHES);
      
      try {
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        logError(e, 'save-recent-searches');
      }
      
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch (e) {
      logError(e, 'clear-recent-searches');
    }
  }, []);

  return {
    recentSearches,
    saveRecentSearch,
    clearRecentSearches
  };
}

