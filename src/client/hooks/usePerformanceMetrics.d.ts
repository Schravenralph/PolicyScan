export interface PerformanceStatistics {
    p50: number;
    p95: number;
    p99: number;
    error_rate: number;
    throughput: number;
    average_response_time: number;
    total_requests: number;
    error_count: number;
    timestamp?: string;
}
export interface PerformanceBaseline {
    _id?: string;
    endpoint?: string;
    method?: string;
    p50: number;
    p95: number;
    p99: number;
    error_rate: number;
    throughput: number;
    average_response_time: number;
    calculated_at: string;
    period_start: string;
    period_end: string;
    sample_count: number;
    timestamp?: string;
}
export interface PerformanceComparison {
    baseline: PerformanceBaseline | null;
    current: PerformanceStatistics;
    deviations: {
        p50: number;
        p95: number;
        p99: number;
        error_rate: number;
        throughput: number;
        average_response_time: number;
    };
    alerts: Array<{
        metric: string;
        value: number;
        baseline_value: number;
        deviation_percent: number;
        severity: 'warning' | 'critical';
    }>;
    timestamp?: string;
}
export interface TimeSeriesDataPoint {
    timestamp: string;
    p50: number;
    p95: number;
    p99: number;
    error_rate: number;
    throughput: number;
    average_response_time: number;
    total_requests: number;
    error_count: number;
}
export interface TimeSeriesResponse {
    timeSeries: TimeSeriesDataPoint[];
    interval: string;
    startDate: string;
    endDate: string;
    timestamp?: string;
}
export interface UsePerformanceMetricsOptions {
    refreshInterval?: number;
    enabled?: boolean;
    startDate?: Date;
    endDate?: Date;
    endpoint?: string;
    method?: string;
    timeRange?: '1h' | '6h' | '24h' | '7d';
}
export interface UsePerformanceMetricsReturn {
    statistics: PerformanceStatistics | null;
    baseline: PerformanceBaseline | null;
    comparison: PerformanceComparison | null;
    timeSeries: TimeSeriesDataPoint[] | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    isRefreshing: boolean;
}
/**
 * Custom hook for fetching performance metrics with automatic refresh capability
 */
export declare function usePerformanceMetrics(options?: UsePerformanceMetricsOptions): UsePerformanceMetricsReturn;
