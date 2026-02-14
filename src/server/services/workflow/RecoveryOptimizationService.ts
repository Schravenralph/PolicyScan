/**
 * Recovery Optimization Service
 * 
 * Optimizes recovery processes for speed and reduced overhead.
 * Provides caching, batch operations, and optimized checkpoint management.
 */

import { logger } from '../../utils/logger.js';
import type { IRunManager } from './interfaces/IRunManager.js';

export interface RecoveryOptimizationConfig {
  /** Maximum checkpoint history size (default: 20) */
  maxCheckpointHistory: number;
  /** Maximum step checkpoint history size (default: 20) */
  maxStepCheckpointHistory: number;
  /** Enable checkpoint caching (default: true) */
  enableCheckpointCache: boolean;
  /** Checkpoint cache TTL in milliseconds (default: 300000 = 5 minutes) */
  checkpointCacheTTL: number;
  /** Maximum cached checkpoints (default: 50) */
  maxCachedCheckpoints: number;
  /** Enable parallel recovery attempts (default: true) */
  enableParallelRecovery: boolean;
  /** Batch cleanup size (default: 10) */
  batchCleanupSize: number;
}

/**
 * Cached checkpoint entry
 */
interface CachedCheckpoint {
  checkpoint: unknown;
  timestamp: number;
  expiresAt: number;
}

/**
 * Recovery Optimization Service
 */
export class RecoveryOptimizationService {
  private config: RecoveryOptimizationConfig;
  private checkpointCache: Map<string, CachedCheckpoint> = new Map();
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<RecoveryOptimizationConfig>) {
    this.config = {
      maxCheckpointHistory: config?.maxCheckpointHistory || parseInt(
        process.env.RECOVERY_MAX_CHECKPOINT_HISTORY || '20',
        10
      ),
      maxStepCheckpointHistory: config?.maxStepCheckpointHistory || parseInt(
        process.env.RECOVERY_MAX_STEP_CHECKPOINT_HISTORY || '20',
        10
      ),
      enableCheckpointCache: config?.enableCheckpointCache ?? true,
      checkpointCacheTTL: config?.checkpointCacheTTL || parseInt(
        process.env.RECOVERY_CHECKPOINT_CACHE_TTL_MS || '300000',
        10
      ), // 5 minutes
      maxCachedCheckpoints: config?.maxCachedCheckpoints || parseInt(
        process.env.RECOVERY_MAX_CACHED_CHECKPOINTS || '50',
        10
      ),
      enableParallelRecovery: config?.enableParallelRecovery ?? true,
      batchCleanupSize: config?.batchCleanupSize || parseInt(
        process.env.RECOVERY_BATCH_CLEANUP_SIZE || '10',
        10
      ),
    };

    // Start cache cleanup interval
    if (this.config.enableCheckpointCache) {
      this.startCacheCleanup();
    }
  }

  /**
   * Get optimized checkpoint history limit
   */
  getMaxCheckpointHistory(): number {
    return this.config.maxCheckpointHistory;
  }

  /**
   * Get optimized step checkpoint history limit
   */
  getMaxStepCheckpointHistory(): number {
    return this.config.maxStepCheckpointHistory;
  }

  /**
   * Cache a checkpoint for faster retrieval
   */
  cacheCheckpoint(key: string, checkpoint: unknown): void {
    if (!this.config.enableCheckpointCache) {
      return;
    }

    // Evict oldest entries if cache is full
    if (this.checkpointCache.size >= this.config.maxCachedCheckpoints) {
      this.evictOldestCacheEntry();
    }

    const now = Date.now();
    this.checkpointCache.set(key, {
      checkpoint,
      timestamp: now,
      expiresAt: now + this.config.checkpointCacheTTL,
    });
  }

  /**
   * Get cached checkpoint
   */
  getCachedCheckpoint(key: string): unknown | null {
    if (!this.config.enableCheckpointCache) {
      return null;
    }

    const cached = this.checkpointCache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.checkpointCache.delete(key);
      return null;
    }

    return cached.checkpoint;
  }

  /**
   * Clear checkpoint cache
   */
  clearCheckpointCache(runId?: string): void {
    if (runId) {
      // Clear cache entries for specific run
      for (const [key] of this.checkpointCache.entries()) {
        if (key.startsWith(`${runId}:`)) {
          this.checkpointCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.checkpointCache.clear();
    }
  }

  /**
   * Optimize checkpoint history by trimming to limit
   */
  optimizeCheckpointHistory<T>(history: T[], maxSize: number): T[] {
    if (history.length <= maxSize) {
      return history;
    }

    // Keep only the most recent entries
    return history.slice(-maxSize);
  }

  /**
   * Batch cleanup old checkpoints
   */
  async batchCleanupCheckpoints(
    runManager: IRunManager,
    runId: string,
    checkpointHistory: unknown[],
    maxSize: number
  ): Promise<void> {
    if (checkpointHistory.length <= maxSize) {
      return;
    }

    // Calculate how many to remove
    const toRemove = checkpointHistory.length - maxSize;
    
    // Remove in batches to avoid blocking
    const batchSize = this.config.batchCleanupSize;
    for (let i = 0; i < toRemove; i += batchSize) {
      const batch = checkpointHistory.slice(0, Math.min(batchSize, toRemove - i));
      
      // Remove batch from history
      checkpointHistory.splice(0, batch.length);
      
      // Small delay to avoid blocking
      if (i + batchSize < toRemove) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    logger.debug(
      { runId, removed: toRemove, remaining: checkpointHistory.length },
      'Batch cleaned up old checkpoints'
    );
  }

  /**
   * Attempt parallel recovery from multiple sources
   */
  async attemptParallelRecovery<T>(
    recoveryMethods: Array<() => Promise<{ success: boolean; result?: T }>>,
    timeoutMs: number = 5000
  ): Promise<{ success: boolean; result?: T; source?: string }> {
    if (!this.config.enableParallelRecovery || recoveryMethods.length === 0) {
      // Fallback to sequential if parallel is disabled or no methods
      for (const method of recoveryMethods) {
        const result = await method();
        if (result.success) {
          return result;
        }
      }
      return { success: false };
    }

    // Try all recovery methods in parallel with timeout
    const promises = recoveryMethods.map(async (method, index) => {
      try {
        const result = await Promise.race([
          method(),
          new Promise<{ success: boolean }>((_, reject) =>
            setTimeout(() => reject(new Error('Recovery timeout')), timeoutMs)
          ),
        ]);
        return { ...result, index };
      } catch (error) {
        return { success: false, index };
      }
    });

    const results = await Promise.allSettled(promises);
    
    // Find first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        return {
          success: true,
          result: result.value.result,
          source: `method-${result.value.index}`,
        };
      }
    }

    return { success: false };
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldestCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, cached] of this.checkpointCache.entries()) {
      if (cached.timestamp < oldestTimestamp) {
        oldestKey = key;
        oldestTimestamp = cached.timestamp;
      }
    }

    if (oldestKey) {
      this.checkpointCache.delete(oldestKey);
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    // Clean up expired cache entries every minute
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, cached] of this.checkpointCache.entries()) {
        if (now > cached.expiresAt) {
          this.checkpointCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug({ cleaned }, 'Cleaned up expired checkpoint cache entries');
      }
    }, 60 * 1000); // Every minute
  }

  /**
   * Stop cache cleanup interval
   */
  stop(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    this.checkpointCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttl: number;
  } {
    return {
      size: this.checkpointCache.size,
      maxSize: this.config.maxCachedCheckpoints,
      ttl: this.config.checkpointCacheTTL,
    };
  }
}

// Singleton instance
let recoveryOptimizationInstance: RecoveryOptimizationService | null = null;

/**
 * Get or create the recovery optimization service instance
 */
export function getRecoveryOptimizationService(): RecoveryOptimizationService {
  if (!recoveryOptimizationInstance) {
    recoveryOptimizationInstance = new RecoveryOptimizationService();
  }
  return recoveryOptimizationInstance;
}





