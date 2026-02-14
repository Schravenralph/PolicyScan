/**
 * Simple in-memory cache for review statistics
 * Cache expires after 5 minutes to balance freshness and performance
 * Implements LRU eviction and size limits to prevent memory growth
 */

import { getMemoryUsage } from '../../utils/memoryUtils.js';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number; // Time to live in milliseconds
    lastAccessed: number; // For LRU eviction
}

export class ReviewServiceCache {
    private cache = new Map<string, CacheEntry<unknown>>();
    private accessOrder: string[] = []; // For LRU tracking
    private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes
    private readonly maxSize: number;
    private evictions: number = 0;

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize;
    }

    /**
     * Get cached value or null if expired/missing
     * Updates access order for LRU tracking
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            // Expired, remove from cache
            this.deleteFromCache(key);
            return null;
        }

        // Update access order for LRU
        this.updateAccessOrder(key);
        entry.lastAccessed = now;

        return entry.data as T;
    }

    /**
     * Set a cache value
     * Evicts LRU entry if cache is at capacity
     */
    set<T>(key: string, data: T, ttl?: number): void {
        const now = Date.now();
        
        // Evict LRU entry if at capacity and key doesn't already exist
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }

        this.cache.set(key, {
            data,
            timestamp: now,
            ttl: ttl || this.defaultTTL,
            lastAccessed: now
        });
        
        this.updateAccessOrder(key);
    }

    /**
     * Clear a specific cache entry
     */
    clear(key: string): void {
        this.deleteFromCache(key);
    }

    /**
     * Clear all cache entries
     */
    clearAll(): void {
        this.cache.clear();
        this.accessOrder = [];
        this.evictions = 0;
    }

    /**
     * Clear expired entries (cleanup)
     */
    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.deleteFromCache(key);
        }
    }

    /**
     * Get cache statistics including memory usage
     */
    getStats(): { 
        size: number; 
        maxSize: number;
        keys: string[]; 
        evictions: number;
        memoryUsage?: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
    } {
        const stats: ReturnType<typeof this.getStats> = {
            size: this.cache.size,
            maxSize: this.maxSize,
            keys: Array.from(this.cache.keys()),
            evictions: this.evictions
        };

        // Add memory usage if available
        try {
            const memUsage = getMemoryUsage();
            stats.memoryUsage = {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                rss: memUsage.rss
            };
        } catch (error) {
            // Memory utils might not be available in all environments
        }

        return stats;
    }

    /**
     * Update access order for LRU tracking
     */
    private updateAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            // Move to end (most recently used)
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }

    /**
     * Evict least recently used entry
     */
    private evictLRU(): void {
        if (this.accessOrder.length > 0) {
            const lruKey = this.accessOrder[0];
            this.deleteFromCache(lruKey);
            this.evictions++;
        }
    }

    /**
     * Delete entry from cache and access order
     */
    private deleteFromCache(key: string): void {
        this.cache.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }
}

// Singleton instance
let cacheInstance: ReviewServiceCache | null = null;
let cleanupIntervalId: NodeJS.Timeout | null = null;

export function getReviewServiceCache(): ReviewServiceCache {
    if (!cacheInstance) {
        // Default max size: 1000 entries
        const maxSize = parseInt(process.env.REVIEW_SERVICE_CACHE_MAX_SIZE || '1000', 10);
        cacheInstance = new ReviewServiceCache(maxSize);
        // Cleanup expired entries every 10 minutes
        cleanupIntervalId = setInterval(() => {
            cacheInstance?.cleanup();
        }, 10 * 60 * 1000);
    }
    return cacheInstance;
}

/**
 * Clean up the singleton instance and interval (for testing)
 */
export function destroyReviewServiceCache(): void {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
    }
    if (cacheInstance) {
        cacheInstance.clearAll();
        cacheInstance = null;
    }
}

