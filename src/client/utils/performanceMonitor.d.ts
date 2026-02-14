/**
 * Performance Monitoring Utilities
 *
 * Provides utilities for tracking and monitoring component performance
 * in development and production environments.
 */
interface PerformanceMetric {
    component: string;
    operation: string;
    duration: number;
    timestamp: number;
    metadata?: Record<string, unknown>;
}
declare class PerformanceMonitor {
    private metrics;
    private maxMetrics;
    private enabled;
    /**
     * Measure the performance of an async operation
     */
    measure<T>(component: string, operation: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>;
    /**
     * Measure the performance of a sync operation
     */
    measureSync<T>(component: string, operation: string, fn: () => T, metadata?: Record<string, unknown>): T;
    /**
     * Record a performance metric
     */
    recordMetric(component: string, operation: string, duration: number, metadata?: Record<string, unknown>): void;
    /**
     * Get performance metrics for a component
     */
    getMetrics(component?: string, operation?: string): PerformanceMetric[];
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
    };
    /**
     * Clear all metrics
     */
    clear(): void;
    /**
     * Enable/disable performance monitoring
     */
    setEnabled(enabled: boolean): void;
    /**
     * Check if performance monitoring is enabled
     */
    isEnabled(): boolean;
}
export declare const performanceMonitor: PerformanceMonitor;
export declare function usePerformanceMeasure(componentName: string): void;
export type { PerformanceMetric };
