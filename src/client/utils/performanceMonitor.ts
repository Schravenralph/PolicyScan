/**
 * Performance Monitoring Utilities
 * 
 * Provides utilities for tracking and monitoring component performance
 * in development and production environments.
 */

import { useEffect, useRef } from 'react';

interface PerformanceMetric {
  component: string;
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics
  private enabled = process.env.NODE_ENV === 'development' || 
                   (typeof window !== 'undefined' && (window as any).__PERF_MONITOR__);

  /**
   * Measure the performance of an async operation
   */
  async measure<T>(
    component: string,
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(component, operation, duration, metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(component, operation, duration, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Measure the performance of a sync operation
   */
  measureSync<T>(
    component: string,
    operation: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(component, operation, duration, metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(component, operation, duration, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    component: string,
    operation: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      component,
      operation,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Keep only last maxMetrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations in development
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.warn(`[Performance] Slow operation detected: ${component}.${operation} took ${duration.toFixed(2)}ms`, metadata);
    }
  }

  /**
   * Get performance metrics for a component
   */
  getMetrics(component?: string, operation?: string): PerformanceMetric[] {
    let filtered = this.metrics;

    if (component) {
      filtered = filtered.filter(m => m.component === component);
    }

    if (operation) {
      filtered = filtered.filter(m => m.operation === operation);
    }

    return filtered;
  }

  /**
   * Get performance statistics for a component/operation
   */
  getStats(component?: string, operation?: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const metrics = this.getMetrics(component, operation);
    if (metrics.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const percentile = (arr: number[], p: number) => {
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, index)];
    };

    return {
      count: metrics.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Enable/disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// React hook for measuring component render performance
export function usePerformanceMeasure(componentName: string) {
  const renderStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (performanceMonitor.isEnabled()) {
      renderStartRef.current = performance.now();
    }

    return () => {
      if (renderStartRef.current !== null && performanceMonitor.isEnabled()) {
        const duration = performance.now() - renderStartRef.current;
        performanceMonitor.recordMetric(componentName, 'render', duration);
        renderStartRef.current = null;
      }
    };
  });
}

// Export types
export type { PerformanceMetric };

