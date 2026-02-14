/**
 * Query Cache Service
 *
 * Provides caching for query results to reduce computation and improve performance.
 * Uses distributed caching with Redis (with in-memory fallback) for multi-instance deployments.
 *
 * Features:
 * - Cache key generation based on query + parameters
 * - TTL-based expiration (default: 1 hour)
 * - Cache invalidation on document updates
 * - Cache hit/miss metrics tracking
 * - LRU eviction when cache size limit is reached
 * - Distributed caching via Redis (enabled via CACHE_REDIS_ENABLED=true)
 *
 * Environment Variables:
 * - QUERY_CACHE_TTL: Cache TTL in milliseconds (default: 3600000 = 1 hour)
 * - QUERY_CACHE_MAX_SIZE: Maximum number of cached entries (default: 1000)
 * - QUERY_CACHE_ENABLED: Enable/disable caching (default: true)
 * - CACHE_REDIS_ENABLED: Enable Redis for distributed caching (default: false)
 */

import * as crypto from 'crypto';
import { Cache } from '../infrastructure/cache.js';

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

export interface CacheKeyOptions {
  query: string;
  keywordWeight?: number;
  semanticWeight?: number;
  maxKeywordResults?: number;
  maxSemanticResults?: number;
  similarityThreshold?: number;
  mergeMethod?: 'weighted' | 'rrf';
  [key: string]: unknown;
}

export class QueryCache {
  private cache: Cache<unknown>;
  private readonly ttl: number;
  private readonly maxSize: number;
  private readonly enabled: boolean;
  private metrics: CacheMetrics;
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.ttl = parseInt(process.env.QUERY_CACHE_TTL || '3600000', 10); // Default: 1 hour
    this.maxSize = parseInt(process.env.QUERY_CACHE_MAX_SIZE || '1000', 10); // Default: 1000 entries
    this.enabled = process.env.QUERY_CACHE_ENABLED !== 'false'; // Default: enabled

    // Use distributed Cache service (Redis + in-memory fallback)
    this.cache = new Cache<unknown>(
      this.maxSize,
      this.ttl,
      'query-results' // Cache name for Redis key prefix
    );

    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0
    };

    // Start periodic cleanup of expired entries
    this.startCleanupInterval();
  }

  /**
   * Clean up the interval (for testing)
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.cache.clear();
  }

  /**
   * Generate cache key from query and options
   * Uses SHA-256 hash for consistent key generation
   * Includes sanitized query prefix to enable pattern-based invalidation
   */
  generateCacheKey(options: CacheKeyOptions): string {
    // Normalize query (lowercase, trim)
    const normalizedQuery = options.query.toLowerCase().trim();

    // Create a stable object for hashing
    const keyData = {
      query: normalizedQuery,
      keywordWeight: options.keywordWeight ?? 0.4,
      semanticWeight: options.semanticWeight ?? 0.6,
      maxKeywordResults: options.maxKeywordResults ?? 50,
      maxSemanticResults: options.maxSemanticResults ?? 50,
      similarityThreshold: options.similarityThreshold ?? 0.7,
      mergeMethod: options.mergeMethod ?? 'weighted'
    };

    // Create deterministic string representation
    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());

    // Generate SHA-256 hash
    const hash = crypto.createHash('sha256').update(keyString).digest('hex');

    // Create safe query prefix for pattern matching (max 64 chars, alphanumeric only)
    // This allows us to invalidate cache entries by query prefix using Redis SCAN
    const safeQuery = normalizedQuery
      .substring(0, 64)
      .replace(/[^a-z0-9]/g, '_');

    // Return composite key: query:<safeQuery>:<hash>
    return `query:${safeQuery}:${hash}`;
  }

  /**
   * Generate generic cache key from any data object
   */
  generateKey(data: Record<string, unknown>): string {
    // Helper for deterministic stringification (recursively sorts keys)
    const stableStringify = (obj: unknown): string => {
      if (typeof obj !== 'object' || obj === null) {
        return JSON.stringify(obj);
      }

      if (obj instanceof Date) {
        return JSON.stringify(obj);
      }

      if (obj instanceof RegExp) {
        return JSON.stringify(obj.toString());
      }

      if (Array.isArray(obj)) {
        return '[' + obj.map(stableStringify).join(',') + ']';
      }

      const keys = Object.keys(obj as object).sort();
      return '{' + keys.map(key => JSON.stringify(key) + ':' + stableStringify((obj as Record<string, unknown>)[key])).join(',') + '}';
    };

    // Create deterministic string representation
    const keyString = stableStringify(data);

    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Get cached result if available and not expired
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      return null;
    }

    const entry = await this.cache.get(key) as CacheEntry<unknown> | undefined;

    if (!entry) {
      this.metrics.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if expired (Cache service handles this, but we check for safety)
    if (Date.now() > entry.expiresAt) {
      await this.cache.delete(key);
      this.metrics.misses++;
      this.updateHitRate();
      this.updateMetrics();
      return null;
    }

    // Cache hit
    this.metrics.hits++;
    this.updateHitRate();
    return entry.data as T;
  }

  /**
   * Get multiple cached results if available and not expired
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.enabled || keys.length === 0) {
      return new Array(keys.length).fill(null);
    }

    const entries = await this.cache.mget(keys);
    const results: (T | null)[] = [];

    for (const entry of entries) {
      if (entry === undefined) {
        this.metrics.misses++;
        results.push(null);
      } else {
        this.metrics.hits++;
        // The entry is CacheEntry<T>
        const typedEntry = entry as CacheEntry<T>;
        results.push(typedEntry.data);
      }
    }

    this.updateHitRate();
    return results;
  }

  /**
   * Store result in cache with TTL
   */
  async set<T>(key: string, data: T, customTtl?: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const ttl = customTtl ?? this.ttl;
    const now = Date.now();

    // Create cache entry
    const entry: CacheEntry<T> = {
      data,
      expiresAt: now + ttl,
      createdAt: now
    };

    // Store in distributed cache (Redis + in-memory fallback)
    await this.cache.set(key, entry, ttl).catch((error) => {
      // Log but don't fail if caching fails
      console.warn('[QueryCache] Failed to cache query result:', error instanceof Error ? error.message : String(error));
    });

    this.updateMetrics();
  }

  /**
   * Invalidate cache entry by key
   */
  async invalidate(key: string): Promise<boolean> {
    const deleted = await this.cache.delete(key);
    if (deleted) {
      this.updateMetrics();
    }
    return deleted;
  }

  /**
   * Invalidate all cache entries
   */
  async invalidateAll(): Promise<void> {
    await this.cache.clear();
    this.updateMetrics();
  }

  /**
   * Invalidate cache entries matching a pattern (by query prefix)
   * Useful for invalidating related queries when documents are updated
   */
  async invalidateByQueryPrefix(queryPrefix: string): Promise<number> {
    if (!queryPrefix) {
      return 0;
    }

    // Sanitize query prefix to match key generation logic
    const normalizedPrefix = queryPrefix.toLowerCase().trim();
    const safePrefix = normalizedPrefix
      .substring(0, 64)
      .replace(/[^a-z0-9]/g, '_');

    if (!safePrefix) {
      return 0;
    }

    // Use deleteByPattern to efficiently remove matching keys from Redis/Memory
    // Pattern: query:<safePrefix>* matches any query starting with this prefix
    const count = await this.cache.deleteByPattern(`query:${safePrefix}*`);

    if (count > 0) {
      this.updateMetrics();
    }

    return count;
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0, // Will be updated by updateMetrics()
      hitRate: 0
    };
    this.updateMetrics(); // Update size asynchronously
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    maxSize: number;
    ttl: number;
    enabled: boolean;
    metrics: CacheMetrics;
  }> {
    // Get cache size from distributed cache
    const cacheStats = await this.cache.getStats();

    return {
      size: cacheStats.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      enabled: this.enabled,
      metrics: this.getMetrics()
    };
  }

  /**
   * Evict least recently used entry
   * Note: LRU eviction is handled by the Cache service automatically
   * This method is kept for compatibility but may not be called
   */
  private async evictLRU(): Promise<void> {
    // LRU eviction is handled automatically by the Cache service
    // when maxSize is reached
    this.metrics.evictions++;
  }

  /**
   * Update hit rate metric
   */
  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  /**
   * Update size metric
   */
  private updateMetrics(): void {
    // Size is tracked by Cache service internally
    // We update it asynchronously when needed
    try {
      const stats = this.cache.getStats();
      this.metrics.size = stats.size;
    } catch {
      // Ignore errors in metric updates
    }
  }

  /**
   * Start periodic cleanup of expired entries
   * Runs every 5 minutes
   */
  private startCleanupInterval(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Remove all expired entries from cache
   * Note: Expired entry cleanup is handled automatically by the Cache service
   * This method is kept for compatibility but may not be needed
   */
  private cleanupExpired(): void {
    // Expired entry cleanup is handled automatically by the Cache service
    // This method is kept for compatibility
    this.updateMetrics();
  }
}

// Export singleton instance
export const queryCache = new QueryCache();

/**
 * Clean up the singleton instance (for testing)
 */
export async function destroyQueryCache(): Promise<void> {
    await queryCache.destroy();
}
