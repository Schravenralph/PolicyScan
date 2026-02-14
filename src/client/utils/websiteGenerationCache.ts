/**
 * Website Generation Cache - Persists partial and complete results
 * 
 * Saves website generation results to localStorage for recovery and caching.
 */

import type { BronWebsite } from '../hooks/useWebsiteSuggestions';

export interface CachedWebsiteGeneration {
  queryId: string;
  websites: BronWebsite[];
  timestamp: number;
  progress: number;
  status: string;
  queryParams: {
    overheidslaag?: string;
    entity?: string;
    onderwerp?: string;
  };
}

const CACHE_KEY_PREFIX = 'website_generation_cache_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save website generation results to cache
 */
export function saveWebsiteGenerationCache(
  queryId: string,
  websites: BronWebsite[],
  progress: number,
  status: string,
  queryParams: CachedWebsiteGeneration['queryParams']
): void {
  try {
    const cache: CachedWebsiteGeneration = {
      queryId,
      websites,
      timestamp: Date.now(),
      progress,
      status,
      queryParams,
    };
    localStorage.setItem(`${CACHE_KEY_PREFIX}${queryId}`, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to save website generation cache:', error);
  }
}

/**
 * Get cached website generation results
 */
export function getWebsiteGenerationCache(queryId: string): CachedWebsiteGeneration | null {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${queryId}`);
    if (!cached) {
      return null;
    }

    const cache: CachedWebsiteGeneration = JSON.parse(cached);
    
    // Check if cache is expired
    if (Date.now() - cache.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${queryId}`);
      return null;
    }

    return cache;
  } catch (error) {
    console.warn('Failed to get website generation cache:', error);
    return null;
  }
}

/**
 * Save partial results (for progress persistence)
 */
export function savePartialResults(
  queryId: string,
  websites: BronWebsite[],
  progress: number,
  status: string
): void {
  try {
    const partialKey = `${CACHE_KEY_PREFIX}partial_${queryId}`;
    const partial: Partial<CachedWebsiteGeneration> = {
      queryId,
      websites,
      timestamp: Date.now(),
      progress,
      status,
    };
    localStorage.setItem(partialKey, JSON.stringify(partial));
  } catch (error) {
    console.warn('Failed to save partial results:', error);
  }
}

/**
 * Get partial results
 */
export function getPartialResults(queryId: string): BronWebsite[] | null {
  try {
    const partialKey = `${CACHE_KEY_PREFIX}partial_${queryId}`;
    const cached = localStorage.getItem(partialKey);
    if (!cached) {
      return null;
    }

    const partial: Partial<CachedWebsiteGeneration> = JSON.parse(cached);
    return partial.websites || null;
  } catch (error) {
    console.warn('Failed to get partial results:', error);
    return null;
  }
}

/**
 * Clear partial results (when generation completes)
 */
export function clearPartialResults(queryId: string): void {
  try {
    const partialKey = `${CACHE_KEY_PREFIX}partial_${queryId}`;
    localStorage.removeItem(partialKey);
  } catch (error) {
    console.warn('Failed to clear partial results:', error);
  }
}

/**
 * Find cached results by query parameters (for graceful degradation)
 */
export function findCachedByParams(
  queryParams: CachedWebsiteGeneration['queryParams']
): CachedWebsiteGeneration | null {
  try {
    // Search through all cache entries
    const keys = Object.keys(localStorage).filter(key => key.startsWith(CACHE_KEY_PREFIX) && !key.includes('partial_'));
    
    for (const key of keys) {
      const cached = localStorage.getItem(key);
      if (!cached) continue;

      try {
        const cache: CachedWebsiteGeneration = JSON.parse(cached);
        
        // Check if cache matches query parameters
        if (
          cache.queryParams.onderwerp === queryParams.onderwerp &&
          cache.queryParams.overheidslaag === queryParams.overheidslaag &&
          cache.queryParams.entity === queryParams.entity
        ) {
          // Check if cache is still valid
          if (Date.now() - cache.timestamp < CACHE_EXPIRY_MS) {
            return cache;
          }
        }
      } catch {
        // Skip invalid cache entries
        continue;
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to find cached results by params:', error);
    return null;
  }
}

/**
 * Clear all website generation cache
 */
export function clearAllWebsiteGenerationCache(): void {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(CACHE_KEY_PREFIX));
    keys.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.warn('Failed to clear website generation cache:', error);
  }
}


