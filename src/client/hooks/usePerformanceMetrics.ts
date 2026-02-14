import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';

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
    refreshInterval?: number; // in milliseconds, default 30000 (30 seconds)
    enabled?: boolean; // whether auto-refresh is enabled, default true
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
export function usePerformanceMetrics(
    options: UsePerformanceMetricsOptions = {}
): UsePerformanceMetricsReturn {
    const {
        refreshInterval = 30000, // 30 seconds default
        enabled = true,
        startDate,
        endDate,
        endpoint,
        method,
        timeRange = '24h',
    } = options;

    const [statistics, setStatistics] = useState<PerformanceStatistics | null>(null);
    const [baseline, setBaseline] = useState<PerformanceBaseline | null>(null);
    const [comparison, setComparison] = useState<PerformanceComparison | null>(null);
    const [timeSeries, setTimeSeries] = useState<TimeSeriesDataPoint[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);

    // Calculate date range from timeRange
    const getDateRange = useCallback(() => {
        if (startDate && endDate) {
            return { startDate, endDate };
        }

        const end = endDate || new Date();
        const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '24h' ? 24 : 24 * 7;
        const start = startDate || new Date(end.getTime() - hours * 60 * 60 * 1000);
        return { startDate: start, endDate: end };
    }, [startDate, endDate, timeRange]);

    // Determine interval for time-series based on time range
    const getTimeSeriesInterval = useCallback(() => {
        if (timeRange === '1h') return '5m';
        if (timeRange === '6h') return '15m';
        if (timeRange === '24h') return '1h';
        return '1h'; // 7d default
    }, [timeRange]);

    const fetchMetrics = useCallback(async (showRefreshing = false) => {
        try {
            if (showRefreshing) {
                setIsRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const { startDate: start, endDate: end } = getDateRange();
            const params = new URLSearchParams();
            if (start) params.append('startDate', start.toISOString());
            if (end) params.append('endDate', end.toISOString());
            if (endpoint) params.append('endpoint', endpoint);
            if (method) params.append('method', method);

            // Fetch all metrics in parallel
            const [statsRes, baselineRes, compareRes, timeSeriesRes] = await Promise.allSettled([
                api.get<PerformanceStatistics>(`/admin/performance/statistics?${params.toString()}`),
                api.get<PerformanceBaseline>(`/admin/performance/baseline?${params.toString()}`).catch(() => null),
                api.get<PerformanceComparison>(`/admin/performance/compare?${params.toString()}`),
                api.get<TimeSeriesResponse>(
                    `/admin/performance/timeseries?${params.toString()}&interval=${getTimeSeriesInterval()}`
                ),
            ]);

            if (mountedRef.current) {
                if (statsRes.status === 'fulfilled') {
                    setStatistics(statsRes.value);
                }
                if (baselineRes.status === 'fulfilled' && baselineRes.value) {
                    setBaseline(baselineRes.value);
                }
                if (compareRes.status === 'fulfilled') {
                    setComparison(compareRes.value);
                }
                if (timeSeriesRes.status === 'fulfilled') {
                    setTimeSeries(timeSeriesRes.value.timeSeries);
                }

                // Set error if any critical request failed
                if (statsRes.status === 'rejected' || compareRes.status === 'rejected') {
                    const err = statsRes.status === 'rejected' ? (statsRes as PromiseRejectedResult).reason : (compareRes as PromiseRejectedResult).reason;
                    throw err instanceof Error ? err : new Error('Failed to fetch performance metrics');
                }
            }
        } catch (err) {
            if (mountedRef.current) {
                const error = err instanceof Error ? err : new Error('Failed to fetch performance metrics');
                setError(error);
                logError(error, 'fetch-performance-metrics');
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setIsRefreshing(false);
            }
        }
    }, [getDateRange, getTimeSeriesInterval, endpoint, method]);

    const fetchMetricsRef = useRef(fetchMetrics);
    fetchMetricsRef.current = fetchMetrics;

    const refresh = useCallback(async () => {
        await fetchMetricsRef.current?.(true);
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        fetchMetricsRef.current?.(false);

        if (enabled && refreshInterval > 0) {
            intervalRef.current = setInterval(() => {
                fetchMetricsRef.current?.(true);
            }, refreshInterval);
        }

        return () => {
            mountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, refreshInterval, fetchMetrics]);

    return {
        statistics,
        baseline,
        comparison,
        timeSeries,
        loading,
        error,
        refresh,
        isRefreshing,
    };
}





