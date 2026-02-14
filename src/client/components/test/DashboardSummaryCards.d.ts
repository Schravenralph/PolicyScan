/**
 * Dashboard Summary Cards Component
 *
 * Displays summary statistics cards for test dashboard.
 */
import type { DashboardData } from '../../services/api/TestApiService';
interface DashboardSummaryCardsProps {
    dashboardData: DashboardData;
    flakyTestMetrics: {
        totalFlakyTests: number;
    } | null;
    flakyTestMetricsLoading: boolean;
}
export declare function DashboardSummaryCards({ dashboardData, flakyTestMetrics, flakyTestMetricsLoading, }: DashboardSummaryCardsProps): import("react/jsx-runtime").JSX.Element | null;
export {};
