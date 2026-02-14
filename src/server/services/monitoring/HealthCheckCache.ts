/**
 * Health Check Cache
 * 
 * Caches health check results to reduce load on services and improve response times.
 * Health checks can be expensive (database queries, API calls), so caching prevents
 * excessive checks while still providing recent results.
 */

import { logger } from '../../utils/logger.js';
import { getOptimizationMetricsService } from './OptimizationMetricsService.js';

export interface CachedHealthCheck {
  result: { healthy: boolean; [key: string]: unknown };
  timestamp: Date;
  expiresAt: Date;
}

export interface HealthCheckCacheConfig {
  /** Cache TTL in milliseconds (default: 30 seconds) */
  ttlMs: number;
  /** Maximum cache size (default: 100 entries) */
  maxSize: number;
}

/**
 * Health Check Cache
 * 
 * In-memory cache for health check results with TTL expiration.
 */
export class HealthCheckCache {
  private cache: Map<string, CachedHealthCheck> = new Map();
  private config: HealthCheckCacheConfig;

  constructor(config?: Partial<HealthCheckCacheConfig>) {
    this.config = {
      // Cache TTL: 30 seconds (balances freshness with performance)
      // Health checks run every 2 minutes, so cache prevents redundant checks
      ttlMs: config?.ttlMs || parseInt(process.env.HEALTH_CHECK_CACHE_TTL_MS || '30000', 10),
      maxSize: config?.maxSize || parseInt(process.env.HEALTH_CHECK_CACHE_MAX_SIZE || '100', 10), // Default: 100 entries
    };
  }

  /**
   * Get cached health check result
   * 
   * @param service - Service name
   * @returns Cached result if available and not expired, null otherwise
   */
  get(service: string): { healthy: boolean; [key: string]: unknown } | null {
    const cached = this.cache.get(service);
    
    if (!cached) {
      // Record cache miss
      getOptimizationMetricsService().recordHealthCheckCacheMiss();
      return null;
    }

    // Check if expired
    if (new Date() > cached.expiresAt) {
      this.cache.delete(service);
      // Record cache miss (expired)
      getOptimizationMetricsService().recordHealthCheckCacheMiss();
      return null;
    }

    // Record cache hit
    getOptimizationMetricsService().recordHealthCheckCacheHit();
    return cached.result;
  }

  /**
   * Set cached health check result
   * 
   * @param service - Service name
   * @param result - Health check result
   */
  set(service: string, result: { healthy: boolean; [key: string]: unknown }): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttlMs);

    this.cache.set(service, {
      result,
      timestamp: now,
      expiresAt,
    });
  }

  /**
   * Check if a cached result exists and is valid
   * 
   * @param service - Service name
   * @returns True if cached result exists and is not expired
   */
  has(service: string): boolean {
    const cached = this.cache.get(service);
    
    if (!cached) {
      return false;
    }

    // Check if expired
    if (new Date() > cached.expiresAt) {
      this.cache.delete(service);
      return false;
    }

    return true;
  }

  /**
   * Clear cache for a specific service
   * 
   * @param service - Service name (optional, clears all if not provided)
   */
  clear(service?: string): void {
    if (service) {
      this.cache.delete(service);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Clear expired entries from cache
   */
  clearExpired(): number {
    const now = new Date();
    let cleared = 0;

    for (const [service, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(service);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Evict oldest entry from cache
   */
  private evictOldest(): void {
    let oldestService: string | null = null;
    let oldestTimestamp: Date | null = null;

    for (const [service, cached] of this.cache.entries()) {
      if (!oldestTimestamp || cached.timestamp < oldestTimestamp) {
        oldestService = service;
        oldestTimestamp = cached.timestamp;
      }
    }

    if (oldestService) {
      this.cache.delete(oldestService);
      logger.debug({ service: oldestService }, 'Evicted oldest health check cache entry');
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
    services: string[];
  } {
    const stats = {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
      services: Array.from(this.cache.keys()),
    };
    
    // Update metrics service with current cache size
    getOptimizationMetricsService().updateHealthCheckCacheSize(stats.size);
    
    return stats;
  }
}

// Singleton instance
let healthCheckCacheInstance: HealthCheckCache | null = null;

/**
 * Get or create the health check cache instance
 */
export function getHealthCheckCache(): HealthCheckCache {
  if (!healthCheckCacheInstance) {
    healthCheckCacheInstance = new HealthCheckCache();
    
    // Clear expired entries every minute
    setInterval(() => {
      const cleared = healthCheckCacheInstance?.clearExpired() || 0;
      if (cleared > 0) {
        logger.debug({ cleared }, 'Cleared expired health check cache entries');
      }
    }, 60 * 1000); // Every minute
  }
  return healthCheckCacheInstance;
}

