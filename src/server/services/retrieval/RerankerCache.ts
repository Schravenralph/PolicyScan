/**
 * Simple in-memory cache for re-ranker scores
 * 
 * This cache stores relevance scores from the LLM re-ranker to avoid
 * redundant API calls for the same query-document pairs.
 * 
 * Cache key format: `query_hash|document_url_hash`
 * Cache TTL: Configurable (default: 7 days)
 * Eviction: LRU (Least Recently Used)
 * 
 * Note: This is a simple in-memory implementation. For production,
 * consider upgrading to Redis or MongoDB for distributed caching.
 * 
 * How to use:
 * 1. Check cache before calling re-ranker: `cache.getCachedScore(query, documentUrl)`
 * 2. Store results after re-ranking: `cache.setCachedScore(query, documentUrl, score)`
 * 3. Clear expired entries periodically: `cache.clearExpired()`
 */
import { getMemoryUsage } from '../../utils/memoryUtils.js';

interface CacheEntry {
  score: number;
  timestamp: number;
  expiresAt: number;
  lastAccessed: number; // For LRU eviction
}

export class RerankerCache {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[] = []; // For LRU tracking
  private readonly ttlSeconds: number;
  private readonly maxSize: number;
  private evictions: number = 0;

  constructor(ttlSeconds: number = 604800, maxSize: number = 10000) {
    // Default TTL: 7 days (604800 seconds)
    this.ttlSeconds = ttlSeconds;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Generate cache key from query and document URL
   */
  private getCacheKey(query: string, documentUrl: string): string {
    // Simple hash function (for production, consider crypto.createHash)
    const queryHash = this.simpleHash(query);
    const urlHash = this.simpleHash(documentUrl);
    return `${queryHash}|${urlHash}`;
  }

  /**
   * Simple hash function for cache keys
   * For production, consider using crypto.createHash('sha256')
   */
  private simpleHash(str: string): string {
    // Validate input type to prevent type confusion attacks
    if (typeof str !== 'string') {
      throw new TypeError('Input must be a string');
    }
    // Prevent extremely long strings that could cause DoS
    if (str.length > 100000) {
      throw new RangeError('Input string exceeds maximum length');
    }
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached score for a query-document pair
   * Updates access order for LRU tracking
   * 
   * @param query The search query
   * @param documentUrl The document URL
   * @returns Cached score if available and not expired, null otherwise
   */
  getCachedScore(query: string, documentUrl: string): number | null {
    const key = this.getCacheKey(query, documentUrl);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.deleteFromCache(key);
      return null;
    }

    // Update access order for LRU
    this.updateAccessOrder(key);
    entry.lastAccessed = Date.now();

    return entry.score;
  }

  /**
   * Store a score in the cache
   * Evicts LRU entry if cache is at capacity
   * 
   * @param query The search query
   * @param documentUrl The document URL
   * @param score The relevance score to cache
   */
  setCachedScore(query: string, documentUrl: string, score: number): void {
    const key = this.getCacheKey(query, documentUrl);
    
    // Evict LRU entry if cache is full and key doesn't already exist
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    
    this.cache.set(key, {
      score,
      timestamp: now,
      expiresAt: now + (this.ttlSeconds * 1000),
      lastAccessed: now
    });
    
    this.updateAccessOrder(key);
  }

  /**
   * Evict least recently used entry (LRU)
   */
  private evictLRU(): void {
    if (this.accessOrder.length > 0) {
      const lruKey = this.accessOrder[0];
      this.deleteFromCache(lruKey);
      this.evictions++;
    }
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
   * Delete entry from cache and access order
   */
  private deleteFromCache(key: string): void {
    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Clear all expired entries from cache
   * Call this periodically to free memory
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.deleteFromCache(key);
      cleared++;
    }

    return cleared;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.evictions = 0;
  }

  /**
   * Get cache statistics including memory usage
   */
  getStats(): { 
    size: number; 
    maxSize: number; 
    ttlSeconds: number;
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
      ttlSeconds: this.ttlSeconds,
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
}

