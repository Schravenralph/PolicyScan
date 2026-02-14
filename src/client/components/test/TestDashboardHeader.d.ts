/**
 * Test Dashboard Header Component
 *
 * Displays the dashboard header with title, action buttons, export menu,
 * keyboard shortcuts dialog, and notification controls.
 */
import type { DashboardData } from '../../services/api/TestApiService';
interface TestDashboardHeaderProps {
    dashboardData: DashboardData | null;
    displayedTestRuns: any[] | null;
    realTimeUpdatesEnabled: boolean;
    notificationsEnabled: boolean;
    notificationPermission: NotificationPermission;
    onToggleRealTimeUpdates: () => void;
    onRefresh: () => void;
    onToggleNotifications: () => void;
    onExportDashboardDataJSON: () => void;
    onExportTestRunsJSON: () => void;
    onExportTestRunsCSV: () => void;
}
export declare function TestDashboardHeader({ dashboardData, displayedTestRuns, realTimeUpdatesEnabled, notificationsEnabled, notificationPermission, onToggleRealTimeUpdates, onRefresh, onToggleNotifications, onExportDashboardDataJSON, onExportTestRunsJSON, onExportTestRunsCSV, }: TestDashboardHeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
