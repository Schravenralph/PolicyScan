/**
 * TestDashboardLoadingError Component
 *
 * Extracted from TestDashboardPage to improve maintainability.
 * Handles initial loading state and error display for the test dashboard.
 */
interface TestDashboardLoadingErrorProps {
    loading: boolean;
    hasData: boolean;
    dashboardError: string | null;
    error: string | null;
}
/**
 * Component that displays loading state or error messages for the test dashboard.
 */
export declare function TestDashboardLoadingError({ loading, hasData, dashboardError, error, }: TestDashboardLoadingErrorProps): import("react/jsx-runtime").JSX.Element | null;
export {};
