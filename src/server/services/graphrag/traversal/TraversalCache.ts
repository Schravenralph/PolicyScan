import { Cache } from '../../infrastructure/cache.js';
import { TraversalResult } from './BFSTraversal.js';
import { PathResult, SubgraphResult } from '../GraphTraversalService.js';
import { logger } from '../../../utils/logger.js';

export type CachedTraversalResult = TraversalResult | PathResult | SubgraphResult;

interface CacheMetadata {
    cachedAt: number;
    operation: 'traverse' | 'findPath' | 'extractSubgraph' | 'pattern';
    nodeId?: string;
    depth?: number;
}

/**
 * Traversal Cache Service
 * 
 * Provides caching for graph traversal operations with:
 * - Configurable TTL
 * - LRU eviction
 * - Pattern-based caching
 * - Cache statistics and monitoring
 */
export class TraversalCache {
    private cache: Cache<CachedTraversalResult>;
    private metadata: Map<string, CacheMetadata> = new Map();
    private defaultTTL: number;
    private maxSize: number;

    // Statistics
    private hits: number = 0;
    private misses: number = 0;
    private evictions: number = 0;

    constructor(maxSize: number = 1000, defaultTTL: number = 60 * 60 * 1000) {
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL; // Default: 1 hour
        this.cache = new Cache<CachedTraversalResult>(maxSize, defaultTTL);
    }

    /**
     * Get cached traversal result
     */
    async get(key: string): Promise<CachedTraversalResult | undefined> {
        const result = await this.cache.get(key);
        
        if (result) {
            this.hits++;
            logger.debug(`[TraversalCache] Cache hit for key: ${key.substring(0, 20)}...`);
            return result;
        } else {
            this.misses++;
            logger.debug(`[TraversalCache] Cache miss for key: ${key.substring(0, 20)}...`);
            return undefined;
        }
    }

    /**
     * Set cached traversal result
     */
    async set(
        key: string,
        value: CachedTraversalResult,
        ttl?: number,
        metadata?: CacheMetadata
    ): Promise<void> {
        await this.cache.set(key, value, ttl || this.defaultTTL);
        
        if (metadata) {
            this.metadata.set(key, metadata);
        }
        
        logger.debug(`[TraversalCache] Cached result for key: ${key.substring(0, 20)}...`);
    }

    /**
     * Delete cached entry
     */
    async delete(key: string): Promise<boolean> {
        const removed = await this.cache.delete(key);
        if (removed) {
            this.metadata.delete(key);
        }
        return removed;
    }

    /**
     * Check if key exists in cache
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.metadata.clear();
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        logger.debug('[TraversalCache] Cache cleared');
    }

    /**
     * Invalidate entries by prefix
     * Used for node-based or relationship-based invalidation
     */
    async invalidateByPrefix(prefix: string): Promise<number> {
        let count = 0;
        const keysToDelete: string[] = [];

        // Note: Cache doesn't expose keys, so we track via metadata
        // For now, we'll need to clear all if prefix matches
        // In production, consider using a more sophisticated key tracking system
        for (const [key, meta] of this.metadata.entries()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            if (await this.delete(key)) {
                count++;
            }
        }

        return count;
    }

    /**
     * Invalidate entries older than specified timestamp
     */
    async invalidateOlderThan(timestamp: number): Promise<number> {
        let count = 0;
        const keysToDelete: string[] = [];

        for (const [key, meta] of this.metadata.entries()) {
            if (meta.cachedAt < timestamp) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            if (await this.delete(key)) {
                count++;
            }
        }

        return count;
    }

    /**
     * Invalidate entries matching a pattern
     */
    async invalidateByPattern(pattern: RegExp): Promise<number> {
        let count = 0;
        const keysToDelete: string[] = [];

        for (const key of this.metadata.keys()) {
            if (pattern.test(key)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            if (await this.delete(key)) {
                count++;
            }
        }

        return count;
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        hits: number;
        misses: number;
        hitRate: number;
        evictions: number;
    } {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? this.hits / total : 0;
        const cacheStats = this.cache.getStats();

        return {
            size: cacheStats.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: Number(hitRate.toFixed(4)),
            evictions: this.evictions,
        };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        this.cache.resetStats();
    }

    /**
     * Clean up expired entries
     */
    async cleanExpired(): Promise<number> {
        const cleaned = await this.cache.cleanExpired();
        
        // Also clean up metadata for expired entries
        const now = Date.now();
        const keysToDelete: string[] = [];
        
        for (const [key, meta] of this.metadata.entries()) {
            // Check if entry is still in cache (if not, it was expired)
            if (!this.has(key)) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.metadata.delete(key);
        }
        
        return cleaned;
    }

    /**
     * Get cache metadata for a key
     */
    getMetadata(key: string): CacheMetadata | undefined {
        return this.metadata.get(key);
    }

    /**
     * Set default TTL
     */
    setDefaultTTL(ttl: number): void {
        this.defaultTTL = ttl;
    }

    /**
     * Get default TTL
     */
    getDefaultTTL(): number {
        return this.defaultTTL;
    }
}

