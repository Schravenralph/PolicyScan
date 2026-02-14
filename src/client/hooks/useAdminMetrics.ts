import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';

export interface ErrorDetail {
    _id: string;
    message: string;
    component: string;
    severity?: string;
    last_seen?: string;
    timestamp?: string;
    occurrence_count?: number;
}

export interface ErrorDetails {
    recent?: ErrorDetail[];
    bySeverity?: Record<string, number>;
    byComponent?: Record<string, number>;
}

export interface StorageBreakdown {
    knowledge_base: {
        size_mb: number;
        path: string;
    };
    logs: {
        size_mb: number;
        path: string;
    };
    database: {
        size_mb: number;
        type: string;
    };
    total_mb: number;
}

export interface CleanupRecommendation {
    component: string;
    recommendation: string;
    potential_savings_mb: number;
    priority: 'low' | 'medium' | 'high';
}

export interface SystemMetrics {
    users: { total: number; active_today: number };
    workflows: { total: number; automated: number; running: number };
    runs: { today: number; success_rate: number };
    storage: {
        knowledge_base_size_mb: number;
        database_size_mb: number;
        breakdown?: StorageBreakdown;
        cleanup_recommendations?: CleanupRecommendation[];
    };
    errors: {
        last_24h: number;
        critical: number;
        details?: ErrorDetails;
    };
    threshold_alerts?: unknown;
}

export interface UseAdminMetricsOptions {
    refreshInterval?: number; // in milliseconds, default 30000 (30 seconds)
    enabled?: boolean; // whether auto-refresh is enabled, default true
}

export interface UseAdminMetricsReturn {
    metrics: SystemMetrics | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    isRefreshing: boolean;
}

/**
 * Custom hook for fetching admin dashboard metrics with automatic refresh capability
 * 
 * @param options Configuration options for the hook
 * @returns Metrics data, loading state, error state, and refresh function
 * 
 * @example
 * ```tsx
 * const { metrics, loading, refresh, isRefreshing } = useAdminMetrics({
 *   refreshInterval: 60000, // 1 minute
 *   enabled: true
 * });
 * ```
 */
export function useAdminMetrics(options: UseAdminMetricsOptions = {}): UseAdminMetricsReturn {
    const {
        refreshInterval = 30000, // 30 seconds default
        enabled = true
    } = options;

    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);
    const fetchMetricsRef = useRef<((showRefreshing: boolean) => Promise<void>) | undefined>(undefined);

    // Define fetch function that will be stored in ref
    const fetchMetrics = useCallback(async (showRefreshing = false) => {
        try {
            if (showRefreshing) {
                setIsRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            const data = await api.get<SystemMetrics>('/admin/metrics');
            
            if (mountedRef.current) {
                setMetrics(data);
                // Clear error on successful fetch
                setError(null);
            }
        } catch (err) {
            if (mountedRef.current) {
                const error = err instanceof Error ? err : new Error('Failed to fetch metrics');
                setError(error);
                logError(error, 'fetch-admin-metrics');
                // Don't clear metrics on error - keep showing last known good data
                // This allows the dashboard to still be usable even if metrics fail
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setIsRefreshing(false);
            }
        }
    }, []);

    // Store latest fetch function in ref
    fetchMetricsRef.current = fetchMetrics;

    // Manual refresh function
    const refresh = useCallback(async () => {
        await fetchMetricsRef.current?.(true);
    }, []);

    // Initial load and setup auto-refresh
    useEffect(() => {
        mountedRef.current = true;
        
        // Initial load
        fetchMetricsRef.current?.(false);

        // Set up auto-refresh if enabled
        if (enabled && refreshInterval > 0) {
            intervalRef.current = setInterval(() => {
                fetchMetricsRef.current?.(true);
            }, refreshInterval);
        }

        // Cleanup on unmount or when dependencies change
        return () => {
            mountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, refreshInterval]);

    return {
        metrics,
        loading,
        error,
        refresh,
        isRefreshing
    };
}

