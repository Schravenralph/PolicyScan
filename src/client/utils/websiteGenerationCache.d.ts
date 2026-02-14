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
/**
 * Save website generation results to cache
 */
export declare function saveWebsiteGenerationCache(queryId: string, websites: BronWebsite[], progress: number, status: string, queryParams: CachedWebsiteGeneration['queryParams']): void;
/**
 * Get cached website generation results
 */
export declare function getWebsiteGenerationCache(queryId: string): CachedWebsiteGeneration | null;
/**
 * Save partial results (for progress persistence)
 */
export declare function savePartialResults(queryId: string, websites: BronWebsite[], progress: number, status: string): void;
/**
 * Get partial results
 */
export declare function getPartialResults(queryId: string): BronWebsite[] | null;
/**
 * Clear partial results (when generation completes)
 */
export declare function clearPartialResults(queryId: string): void;
/**
 * Find cached results by query parameters (for graceful degradation)
 */
export declare function findCachedByParams(queryParams: CachedWebsiteGeneration['queryParams']): CachedWebsiteGeneration | null;
/**
 * Clear all website generation cache
 */
export declare function clearAllWebsiteGenerationCache(): void;
