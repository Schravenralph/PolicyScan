/**
 * Dashboard Widgets Component
 *
 * Provides compact widgets for displaying recommendations, alerts, and dependencies
 * on the main test dashboard.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface DashboardWidgetsProps {
    testApiService?: TestApiService;
    compact?: boolean;
}
export declare function DashboardWidgets({ testApiService: injectedTestApiService, compact }: DashboardWidgetsProps): import("react/jsx-runtime").JSX.Element | null;
export {};
