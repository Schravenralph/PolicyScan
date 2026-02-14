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
    users: {
        total: number;
        active_today: number;
    };
    workflows: {
        total: number;
        automated: number;
        running: number;
    };
    runs: {
        today: number;
        success_rate: number;
    };
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
    refreshInterval?: number;
    enabled?: boolean;
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
export declare function useAdminMetrics(options?: UseAdminMetricsOptions): UseAdminMetricsReturn;
