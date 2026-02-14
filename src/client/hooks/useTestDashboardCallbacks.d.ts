/**
 * useTestDashboardCallbacks Hook
 *
 * Extracted from TestDashboardPage to improve maintainability.
 * Handles execution callbacks, export functions, and keyboard shortcuts.
 */
import { TestStatus } from '../services/api/TestApiService';
import type { UseTestExecutionCallbacks } from './useTestExecution';
import type { DashboardData } from '../services/api/TestApiService';
import type { ActiveFailuresState } from './useActiveFailures';
interface UseTestDashboardCallbacksProps {
    showTestCompletionNotification: (status: TestStatus) => void;
    loadLogFiles: (runId: string) => void;
    loadDashboardData: () => Promise<void>;
    loadActiveFailures: () => Promise<void>;
    loadFlakyTestMetrics: () => Promise<void>;
    loadErrorLogs: () => Promise<void>;
    dashboardPolling: {
        markActivity: () => void;
    };
    setError: (error: string | null) => void;
    clearLogs: () => void;
    startLogPolling: (onActivity?: () => void) => void;
    stopLogPolling: () => void;
    dashboardData: DashboardData | null;
    testRunsFilteredData: {
        filter: {
            status?: string;
            dateRange?: string;
            testFile?: string;
            testType?: string;
        };
        filteredTestRuns: Array<any>;
        displayedTestRuns: Array<any>;
    } | null;
    activeFailures: ActiveFailuresState | null;
    flakyTestMetrics: {
        totalFlakyTests: number;
        flakyTests?: Array<{
            test_id?: string;
            suite?: string;
            pass_rate: number;
            flake_rate: number;
        }>;
    } | null;
}
interface UseTestDashboardCallbacksResult {
    executionCallbacks: UseTestExecutionCallbacks;
    exportDashboardDataJSON: () => void;
    exportTestRunsJSON: () => void;
    exportTestRunsCSV: () => void;
}
/**
 * Hook that provides execution callbacks, export functions, and keyboard shortcuts
 * for the Test Dashboard page.
 */
export declare function useTestDashboardCallbacks({ showTestCompletionNotification, loadLogFiles, loadDashboardData, loadActiveFailures, loadFlakyTestMetrics, loadErrorLogs, dashboardPolling, setError, clearLogs, startLogPolling, stopLogPolling, dashboardData, testRunsFilteredData, activeFailures, flakyTestMetrics, }: UseTestDashboardCallbacksProps): UseTestDashboardCallbacksResult;
export {};
