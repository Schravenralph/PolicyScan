/**
 * Optimization Metrics Service
 * 
 * Tracks metrics for performance optimizations:
 * - Log cleanup effectiveness
 * - Health check cache hit rates
 * - Retry success rates
 * - Recovery performance
 */

import { logger } from '../../utils/logger.js';
import { Counter, Histogram, Gauge } from 'prom-client';
import { metricsRegistry } from '../../utils/metrics.js';

/**
 * Optimization metrics tracked
 */
export interface OptimizationMetrics {
  logCleanup: {
    filesDeleted: number;
    filesCompressed: number;
    totalSizeFreedMB: number;
    lastCleanupTime: Date | null;
  };
  healthCheckCache: {
    hits: number;
    misses: number;
    hitRate: number;
    cacheSize: number;
  };
  retryOptimization: {
    totalRetries: number;
    successfulRetries: number;
    failedRetries: number;
    averageRetryDelay: number;
    retrySuccessRate: number;
  };
  recoveryOptimization: {
    totalRecoveries: number;
    successfulRecoveries: number;
    averageRecoveryTime: number;
    cacheHits: number;
    cacheMisses: number;
    recoverySuccessRate: number;
  };
}

/**
 * Optimization Metrics Service
 */
export class OptimizationMetricsService {
  // Prometheus metrics
  private logCleanupFilesDeleted: Counter<string>;
  private logCleanupFilesCompressed: Counter<string>;
  private logCleanupSizeFreedMB: Counter<string>;
  private healthCheckCacheHits: Counter<string>;
  private healthCheckCacheMisses: Counter<string>;
  private healthCheckCacheSize: Gauge<string>;
  private retryAttempts: Counter<string>;
  private retrySuccesses: Counter<string>;
  private retryFailures: Counter<string>;
  private retryDelayHistogram: Histogram<string>;
  private recoveryAttempts: Counter<string>;
  private recoverySuccesses: Counter<string>;
  private recoveryTimeHistogram: Histogram<string>;
  private recoveryCacheHits: Counter<string>;
  private recoveryCacheMisses: Counter<string>;

  // In-memory tracking
  private metrics: OptimizationMetrics = {
    logCleanup: {
      filesDeleted: 0,
      filesCompressed: 0,
      totalSizeFreedMB: 0,
      lastCleanupTime: null,
    },
    healthCheckCache: {
      hits: 0,
      misses: 0,
      hitRate: 0,
      cacheSize: 0,
    },
    retryOptimization: {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryDelay: 0,
      retrySuccessRate: 0,
    },
    recoveryOptimization: {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      averageRecoveryTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      recoverySuccessRate: 0,
    },
  };

  constructor() {
    // Initialize Prometheus metrics
    this.logCleanupFilesDeleted = new Counter({
      name: 'optimization_log_cleanup_files_deleted_total',
      help: 'Total number of log files deleted by cleanup service',
      registers: [metricsRegistry],
    });

    this.logCleanupFilesCompressed = new Counter({
      name: 'optimization_log_cleanup_files_compressed_total',
      help: 'Total number of log files compressed by cleanup service',
      registers: [metricsRegistry],
    });

    this.logCleanupSizeFreedMB = new Counter({
      name: 'optimization_log_cleanup_size_freed_mb_total',
      help: 'Total size freed by log cleanup in MB',
      registers: [metricsRegistry],
    });

    this.healthCheckCacheHits = new Counter({
      name: 'optimization_health_check_cache_hits_total',
      help: 'Total number of health check cache hits',
      registers: [metricsRegistry],
    });

    this.healthCheckCacheMisses = new Counter({
      name: 'optimization_health_check_cache_misses_total',
      help: 'Total number of health check cache misses',
      registers: [metricsRegistry],
    });

    this.healthCheckCacheSize = new Gauge({
      name: 'optimization_health_check_cache_size',
      help: 'Current size of health check cache',
      registers: [metricsRegistry],
    });

    this.retryAttempts = new Counter({
      name: 'optimization_retry_attempts_total',
      help: 'Total number of retry attempts',
      labelNames: ['operation_type', 'status'],
      registers: [metricsRegistry],
    });

    this.retrySuccesses = new Counter({
      name: 'optimization_retry_successes_total',
      help: 'Total number of successful retries',
      labelNames: ['operation_type'],
      registers: [metricsRegistry],
    });

    this.retryFailures = new Counter({
      name: 'optimization_retry_failures_total',
      help: 'Total number of failed retries',
      labelNames: ['operation_type'],
      registers: [metricsRegistry],
    });

    this.retryDelayHistogram = new Histogram({
      name: 'optimization_retry_delay_ms',
      help: 'Retry delay in milliseconds',
      labelNames: ['operation_type'],
      buckets: [100, 500, 1000, 2000, 5000, 10000, 30000],
      registers: [metricsRegistry],
    });

    this.recoveryAttempts = new Counter({
      name: 'optimization_recovery_attempts_total',
      help: 'Total number of recovery attempts',
      registers: [metricsRegistry],
    });

    this.recoverySuccesses = new Counter({
      name: 'optimization_recovery_successes_total',
      help: 'Total number of successful recoveries',
      registers: [metricsRegistry],
    });

    this.recoveryTimeHistogram = new Histogram({
      name: 'optimization_recovery_time_ms',
      help: 'Recovery time in milliseconds',
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [metricsRegistry],
    });

    this.recoveryCacheHits = new Counter({
      name: 'optimization_recovery_cache_hits_total',
      help: 'Total number of recovery cache hits',
      registers: [metricsRegistry],
    });

    this.recoveryCacheMisses = new Counter({
      name: 'optimization_recovery_cache_misses_total',
      help: 'Total number of recovery cache misses',
      registers: [metricsRegistry],
    });
  }

  /**
   * Record log cleanup metrics
   */
  recordLogCleanup(filesDeleted: number, filesCompressed: number, sizeFreedMB: number): void {
    this.metrics.logCleanup.filesDeleted += filesDeleted;
    this.metrics.logCleanup.filesCompressed += filesCompressed;
    this.metrics.logCleanup.totalSizeFreedMB += sizeFreedMB;
    this.metrics.logCleanup.lastCleanupTime = new Date();

    this.logCleanupFilesDeleted.inc(filesDeleted);
    this.logCleanupFilesCompressed.inc(filesCompressed);
    this.logCleanupSizeFreedMB.inc(sizeFreedMB);
  }

  /**
   * Record disk cleanup metrics
   * @param category - Type of cleanup (e.g., 'commoncrawl', 'nx-cache', 'workflow-outputs')
   * @param sizeBytes - Size freed in bytes
   */
  recordDiskCleanup(category: string, sizeBytes: number): void {
    const sizeMB = sizeBytes / (1024 * 1024);
    // Track as log cleanup for now (can be extended with separate metrics if needed)
    this.logCleanupSizeFreedMB.inc(sizeMB);
    logger.debug(`Recorded disk cleanup: ${category}, ${sizeMB.toFixed(2)}MB`);
  }

  /**
   * Record health check cache hit
   */
  recordHealthCheckCacheHit(): void {
    this.metrics.healthCheckCache.hits++;
    this.updateHealthCheckCacheHitRate();
    this.healthCheckCacheHits.inc();
  }

  /**
   * Record health check cache miss
   */
  recordHealthCheckCacheMiss(): void {
    this.metrics.healthCheckCache.misses++;
    this.updateHealthCheckCacheHitRate();
    this.healthCheckCacheMisses.inc();
  }

  /**
   * Update health check cache size
   */
  updateHealthCheckCacheSize(size: number): void {
    this.metrics.healthCheckCache.cacheSize = size;
    this.healthCheckCacheSize.set(size);
  }

  /**
   * Record retry attempt
   */
  recordRetryAttempt(operationType: string, delayMs: number, success: boolean): void {
    this.metrics.retryOptimization.totalRetries++;
    
    if (success) {
      this.metrics.retryOptimization.successfulRetries++;
      this.retrySuccesses.inc({ operation_type: operationType });
    } else {
      this.metrics.retryOptimization.failedRetries++;
      this.retryFailures.inc({ operation_type: operationType });
    }

    this.updateRetryMetrics();
    this.retryAttempts.inc({ operation_type: operationType, status: success ? 'success' : 'failure' });
    this.retryDelayHistogram.observe({ operation_type: operationType }, delayMs);
  }

  /**
   * Record recovery attempt
   */
  recordRecoveryAttempt(recoveryTimeMs: number, success: boolean, cacheHit: boolean): void {
    this.metrics.recoveryOptimization.totalRecoveries++;
    
    if (success) {
      this.metrics.recoveryOptimization.successfulRecoveries++;
      this.recoverySuccesses.inc();
    }

    if (cacheHit) {
      this.metrics.recoveryOptimization.cacheHits++;
      this.recoveryCacheHits.inc();
    } else {
      this.metrics.recoveryOptimization.cacheMisses++;
      this.recoveryCacheMisses.inc();
    }

    this.updateRecoveryMetrics(recoveryTimeMs);
    this.recoveryAttempts.inc();
    this.recoveryTimeHistogram.observe(recoveryTimeMs);
  }

  /**
   * Get current metrics
   */
  getMetrics(): OptimizationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics summary for API endpoint
   */
  getMetricsSummary(): {
    logCleanup: {
      filesDeleted: number;
      filesCompressed: number;
      totalSizeFreedMB: number;
      lastCleanupTime: Date | null;
    };
    healthCheckCache: {
      hits: number;
      misses: number;
      hitRate: number;
      cacheSize: number;
    };
    retryOptimization: {
      totalRetries: number;
      successfulRetries: number;
      failedRetries: number;
      retrySuccessRate: number;
    };
    recoveryOptimization: {
      totalRecoveries: number;
      successfulRecoveries: number;
      averageRecoveryTime: number;
      cacheHitRate: number;
      recoverySuccessRate: number;
    };
  } {
    return {
      logCleanup: {
        ...this.metrics.logCleanup,
      },
      healthCheckCache: {
        ...this.metrics.healthCheckCache,
      },
      retryOptimization: {
        totalRetries: this.metrics.retryOptimization.totalRetries,
        successfulRetries: this.metrics.retryOptimization.successfulRetries,
        failedRetries: this.metrics.retryOptimization.failedRetries,
        retrySuccessRate: this.metrics.retryOptimization.retrySuccessRate,
      },
      recoveryOptimization: {
        totalRecoveries: this.metrics.recoveryOptimization.totalRecoveries,
        successfulRecoveries: this.metrics.recoveryOptimization.successfulRecoveries,
        averageRecoveryTime: this.metrics.recoveryOptimization.averageRecoveryTime,
        cacheHitRate:
          this.metrics.recoveryOptimization.cacheHits + this.metrics.recoveryOptimization.cacheMisses > 0
            ? this.metrics.recoveryOptimization.cacheHits /
              (this.metrics.recoveryOptimization.cacheHits + this.metrics.recoveryOptimization.cacheMisses)
            : 0,
        recoverySuccessRate: this.metrics.recoveryOptimization.recoverySuccessRate,
      },
    };
  }

  /**
   * Update health check cache hit rate
   */
  private updateHealthCheckCacheHitRate(): void {
    const total = this.metrics.healthCheckCache.hits + this.metrics.healthCheckCache.misses;
    this.metrics.healthCheckCache.hitRate = total > 0 ? this.metrics.healthCheckCache.hits / total : 0;
  }

  /**
   * Update retry metrics
   */
  private updateRetryMetrics(): void {
    const total = this.metrics.retryOptimization.totalRetries;
    this.metrics.retryOptimization.retrySuccessRate =
      total > 0 ? this.metrics.retryOptimization.successfulRetries / total : 0;
  }

  /**
   * Update recovery metrics
   */
  private updateRecoveryMetrics(recoveryTimeMs: number): void {
    const total = this.metrics.recoveryOptimization.totalRecoveries;
    this.metrics.recoveryOptimization.recoverySuccessRate =
      total > 0 ? this.metrics.recoveryOptimization.successfulRecoveries / total : 0;

    // Update average recovery time (simple moving average)
    if (total === 1) {
      this.metrics.recoveryOptimization.averageRecoveryTime = recoveryTimeMs;
    } else {
      const currentAvg = this.metrics.recoveryOptimization.averageRecoveryTime;
      this.metrics.recoveryOptimization.averageRecoveryTime =
        (currentAvg * (total - 1) + recoveryTimeMs) / total;
    }
  }
}

// Singleton instance
let optimizationMetricsInstance: OptimizationMetricsService | null = null;

/**
 * Get or create the optimization metrics service instance
 */
export function getOptimizationMetricsService(): OptimizationMetricsService {
  if (!optimizationMetricsInstance) {
    optimizationMetricsInstance = new OptimizationMetricsService();
  }
  return optimizationMetricsInstance;
}

