/**
 * AI-Guided Crawling Performance Monitor
 * 
 * Tracks performance metrics for AI-guided crawling operations:
 * - Latency measurements
 * - Cache hit rates
 * - LLM API call counts and costs
 * - Memory usage
 * - Error rates
 */

export interface PerformanceMetrics {
  component: string;
  operation: string;
  latency: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface AggregatedMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  cacheHitRate?: number;
  llmApiCalls?: number;
  memoryUsage?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

/**
 * Performance monitoring service for AI-guided crawling
 */
export class AICrawlingPerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics: number = 10000; // Keep last 10k metrics

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Trim old metrics if we exceed max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Record latency for an operation
   */
  recordLatency(
    component: string,
    operation: string,
    latency: number,
    success: boolean = true,
    metadata?: Record<string, unknown>
  ): void {
    this.recordMetric({
      component,
      operation,
      latency,
      timestamp: Date.now(),
      success,
      metadata
    });
  }

  /**
   * Get aggregated metrics for a component/operation
   */
  getAggregatedMetrics(
    component?: string,
    operation?: string
  ): AggregatedMetrics {
    let filtered = this.metrics;

    if (component) {
      filtered = filtered.filter(m => m.component === component);
    }
    if (operation) {
      filtered = filtered.filter(m => m.operation === operation);
    }

    if (filtered.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        minLatency: 0,
        maxLatency: 0
      };
    }

    const latencies = filtered.map(m => m.latency).sort((a, b) => a - b);
    const successful = filtered.filter(m => m.success);
    const failed = filtered.filter(m => !m.success);

    const averageLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99Latency = latencies[Math.floor(latencies.length * 0.99)] || 0;

    // Extract cache hit rate if available
    const cacheMetrics = filtered.filter(m => 
      m.metadata?.cacheHit !== undefined
    );
    const cacheHitRate = cacheMetrics.length > 0
      ? cacheMetrics.filter(m => m.metadata?.cacheHit === true).length / cacheMetrics.length
      : undefined;

    // Extract LLM API calls if available
    const llmMetrics = filtered.filter(m => 
      m.metadata?.llmCall !== undefined
    );
    const llmApiCalls = llmMetrics.length > 0
      ? llmMetrics.filter(m => m.metadata?.llmCall === true).length
      : undefined;

    // Get latest memory usage if available
    const memoryMetrics = filtered
      .filter(m => m.metadata?.memoryUsage !== undefined)
      .slice(-1);
    const memoryUsage = memoryMetrics.length > 0
      ? memoryMetrics[0].metadata?.memoryUsage as AggregatedMetrics['memoryUsage']
      : undefined;

    return {
      totalOperations: filtered.length,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      averageLatency,
      p95Latency,
      p99Latency,
      minLatency: latencies[0] || 0,
      maxLatency: latencies[latencies.length - 1] || 0,
      cacheHitRate,
      llmApiCalls,
      memoryUsage
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    totalMetrics: number;
    components: string[];
    operations: string[];
    overallSuccessRate: number;
    overallAverageLatency: number;
  } {
    const components = Array.from(new Set(this.metrics.map(m => m.component)));
    const operations = Array.from(new Set(this.metrics.map(m => m.operation)));
    const successful = this.metrics.filter(m => m.success).length;
    const total = this.metrics.length;
    const averageLatency = this.metrics.length > 0
      ? this.metrics.reduce((sum, m) => sum + m.latency, 0) / this.metrics.length
      : 0;

    return {
      totalMetrics: total,
      components,
      operations,
      overallSuccessRate: total > 0 ? (successful / total) * 100 : 0,
      overallAverageLatency: averageLatency
    };
  }
}

// Singleton instance
let performanceMonitorInstance: AICrawlingPerformanceMonitor | null = null;

/**
 * Get the global performance monitor instance
 */
export function getPerformanceMonitor(): AICrawlingPerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new AICrawlingPerformanceMonitor();
  }
  return performanceMonitorInstance;
}

