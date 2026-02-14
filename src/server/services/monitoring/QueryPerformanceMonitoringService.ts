/**
 * Query Performance Monitoring Service
 * 
 * Tracks and analyzes database query performance to identify slow queries,
 * optimization opportunities, and performance trends.
 * 
 * Features:
 * - Aggregated performance metrics (p50, p95, p99)
 * - Performance trend tracking
 * - Slow query identification
 * - Optimization recommendations
 * - Historical performance data
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { Histogram } from 'prom-client';
import { metricsRegistry } from '../../utils/metrics.js';

/**
 * Query performance metrics for a specific operation
 */
export interface QueryPerformanceMetrics {
  operation: string;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number; // Median
  p95: number; // 95th percentile
  p99: number; // 99th percentile
  slowQueryCount: number; // Queries above threshold
  lastExecuted: Date;
}

/**
 * Performance trend data point
 */
export interface PerformanceTrendPoint {
  timestamp: Date;
  operation: string;
  averageDuration: number;
  p95: number;
  count: number;
}

/**
 * Optimization recommendation
 */
export interface OptimizationRecommendation {
  operation: string;
  issue: string;
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
  estimatedImprovement?: string;
}

/**
 * Query Performance Monitoring Service
 */
export class QueryPerformanceMonitoringService {
  private performanceData: Map<string, number[]> = new Map(); // operation -> durations[]
  private slowQueries: Array<{ operation: string; duration: number; timestamp: Date; context?: string }> = [];
  private readonly maxDataPoints = 1000; // Keep last 1000 data points per operation
  private readonly slowQueryThreshold: number;
  private readonly maxSlowQueries = 100; // Keep last 100 slow queries
  
  // Prometheus histogram for query duration
  private queryDurationHistogram: Histogram<string>;
  
  constructor() {
    this.slowQueryThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10);
    
    // Initialize Prometheus histogram and register with shared metrics registry
    this.queryDurationHistogram = new Histogram({
      name: 'database_query_duration_ms',
      help: 'Database query duration in milliseconds',
      labelNames: ['operation', 'status'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000], // Duration buckets in ms
      registers: [metricsRegistry],
    });
  }
  
  /**
   * Record a query execution
   */
  recordQuery(operation: string, duration: number, context?: string): void {
    // Store duration for this operation
    const durations = this.performanceData.get(operation) || [];
    durations.push(duration);
    
    // Keep only last N data points
    if (durations.length > this.maxDataPoints) {
      durations.shift();
    }
    this.performanceData.set(operation, durations);
    
    // Record in Prometheus
    this.queryDurationHistogram.observe(
      { operation, status: duration > this.slowQueryThreshold ? 'slow' : 'normal' },
      duration
    );
    
    // Track slow queries
    if (duration > this.slowQueryThreshold) {
      this.slowQueries.push({
        operation,
        duration,
        timestamp: new Date(),
        context,
      });
      
      // Keep only last N slow queries
      if (this.slowQueries.length > this.maxSlowQueries) {
        this.slowQueries.shift();
      }
    }
  }
  
  /**
   * Get performance metrics for an operation
   */
  getMetrics(operation: string): QueryPerformanceMetrics | null {
    const durations = this.performanceData.get(operation);
    if (!durations || durations.length === 0) {
      return null;
    }
    
    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;
    const totalDuration = sorted.reduce((sum, d) => sum + d, 0);
    const averageDuration = totalDuration / count;
    const minDuration = sorted[0];
    const maxDuration = sorted[count - 1];
    
    // Calculate percentiles
    const p50 = this.percentile(sorted, 0.5);
    const p95 = this.percentile(sorted, 0.95);
    const p99 = this.percentile(sorted, 0.99);
    
    // Count slow queries
    const slowQueryCount = sorted.filter(d => d > this.slowQueryThreshold).length;
    
    // Get last execution time (approximate - use current time)
    const lastExecuted = new Date();
    
    return {
      operation,
      count,
      totalDuration,
      averageDuration,
      minDuration,
      maxDuration,
      p50,
      p95,
      p99,
      slowQueryCount,
      lastExecuted,
    };
  }
  
  /**
   * Get all performance metrics
   */
  getAllMetrics(): QueryPerformanceMetrics[] {
    const operations = Array.from(this.performanceData.keys());
    return operations
      .map(op => this.getMetrics(op))
      .filter((m): m is QueryPerformanceMetrics => m !== null)
      .sort((a, b) => b.averageDuration - a.averageDuration); // Sort by average duration descending
  }
  
  /**
   * Get slow queries
   */
  getSlowQueries(limit: number = 50): Array<{ operation: string; duration: number; timestamp: Date; context?: string }> {
    return this.slowQueries
      .slice(-limit)
      .sort((a, b) => b.duration - a.duration); // Sort by duration descending
  }
  
  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    const metrics = this.getAllMetrics();
    
    for (const metric of metrics) {
      // High impact: p95 > 2000ms and slow query count > 10%
      if (metric.p95 > 2000 && metric.slowQueryCount / metric.count > 0.1) {
        recommendations.push({
          operation: metric.operation,
          issue: `High p95 latency (${metric.p95.toFixed(0)}ms) with ${((metric.slowQueryCount / metric.count) * 100).toFixed(1)}% slow queries`,
          recommendation: 'Consider adding database indexes, optimizing query structure, or implementing caching',
          impact: 'high',
          estimatedImprovement: '50-70% reduction in query time',
        });
      }
      // Medium impact: p95 > 1000ms
      else if (metric.p95 > 1000) {
        recommendations.push({
          operation: metric.operation,
          issue: `Elevated p95 latency (${metric.p95.toFixed(0)}ms)`,
          recommendation: 'Review query performance and consider optimization',
          impact: 'medium',
          estimatedImprovement: '30-50% reduction in query time',
        });
      }
      // Low impact: average > 500ms
      else if (metric.averageDuration > 500) {
        recommendations.push({
          operation: metric.operation,
          issue: `Above-average latency (${metric.averageDuration.toFixed(0)}ms average)`,
          recommendation: 'Monitor and optimize if performance degrades',
          impact: 'low',
          estimatedImprovement: '10-30% reduction in query time',
        });
      }
    }
    
    return recommendations.sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    });
  }
  
  /**
   * Get performance trends (simplified - returns recent data points)
   */
  getPerformanceTrends(operation?: string, limit: number = 100): PerformanceTrendPoint[] {
    const operations = operation ? [operation] : Array.from(this.performanceData.keys());
    const trends: PerformanceTrendPoint[] = [];
    
    for (const op of operations) {
      const durations = this.performanceData.get(op);
      if (!durations || durations.length === 0) continue;
      
      // Group recent durations into time windows (simplified - use last N queries)
      const recentDurations = durations.slice(-limit);
      const sorted = [...recentDurations].sort((a, b) => a - b);
      
      trends.push({
        timestamp: new Date(),
        operation: op,
        averageDuration: recentDurations.reduce((sum, d) => sum + d, 0) / recentDurations.length,
        p95: this.percentile(sorted, 0.95),
        count: recentDurations.length,
      });
    }
    
    return trends.sort((a, b) => b.averageDuration - a.averageDuration);
  }
  
  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
  
  /**
   * Clear all performance data (for testing)
   */
  clear(): void {
    this.performanceData.clear();
    this.slowQueries = [];
    // Reset the histogram to prevent "metric already registered" errors during vi.resetModules()
    try {
      metricsRegistry.removeSingleMetric('database_query_duration_ms');
    } catch (error) {
      // Metric might not be registered yet, ignore error
    }
  }
  
  /**
   * Get summary statistics
   */
  getSummary(): {
    totalOperations: number;
    totalQueries: number;
    slowQueryCount: number;
    averageLatency: number;
    topSlowOperations: Array<{ operation: string; averageDuration: number }>;
  } {
    const allMetrics = this.getAllMetrics();
    const totalQueries = allMetrics.reduce((sum, m) => sum + m.count, 0);
    const totalDuration = allMetrics.reduce((sum, m) => sum + m.totalDuration, 0);
    const averageLatency = totalQueries > 0 ? totalDuration / totalQueries : 0;
    
    const topSlowOperations = allMetrics
      .slice(0, 10)
      .map(m => ({ operation: m.operation, averageDuration: m.averageDuration }));
    
    return {
      totalOperations: allMetrics.length,
      totalQueries,
      slowQueryCount: this.slowQueries.length,
      averageLatency,
      topSlowOperations,
    };
  }
}

// Export singleton instance
export const queryPerformanceMonitoring = new QueryPerformanceMonitoringService();

