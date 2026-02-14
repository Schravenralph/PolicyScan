/**
 * useTestDashboardCallbacks Hook
 * 
 * Extracted from TestDashboardPage to improve maintainability.
 * Handles execution callbacks, export functions, and keyboard shortcuts.
 */

import { useMemo, useCallback } from 'react';
import { TestStatus } from '../services/api/TestApiService';
import type { UseTestExecutionCallbacks } from './useTestExecution';
import type { DashboardData } from '../services/api/TestApiService';
import type { ActiveFailuresState } from './useActiveFailures';

interface UseTestDashboardCallbacksProps {
  // For execution callbacks
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
  
  // For export functions
  dashboardData: DashboardData | null;
  testRunsFilteredData: {
    filter: { status?: string; dateRange?: string; testFile?: string; testType?: string };
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
export function useTestDashboardCallbacks({
  showTestCompletionNotification,
  loadLogFiles,
  loadDashboardData,
  loadActiveFailures,
  loadFlakyTestMetrics,
  loadErrorLogs,
  dashboardPolling,
  setError,
  clearLogs,
  startLogPolling,
  stopLogPolling,
  dashboardData,
  testRunsFilteredData,
  activeFailures,
  flakyTestMetrics,
}: UseTestDashboardCallbacksProps): UseTestDashboardCallbacksResult {
  
  // Execution callbacks for useTestExecution hook
  const executionCallbacks = useMemo<UseTestExecutionCallbacks>(() => ({
    onTestsComplete: (status: TestStatus) => {
      showTestCompletionNotification(status);
      if (status.lastRunId) {
        loadLogFiles(status.lastRunId);
      }
      if (status?.filesReady) {
        setTimeout(() => {
          loadDashboardData();
          loadActiveFailures();
          loadFlakyTestMetrics();
          loadErrorLogs();
          dashboardPolling.markActivity();
        }, 2000);
      }
    },
    onActivity: () => dashboardPolling.markActivity(),
    onError: setError,
    clearLogs,
    startLogPolling: () => startLogPolling(() => dashboardPolling.markActivity()),
    stopLogPolling
  }), [
    showTestCompletionNotification,
    loadLogFiles,
    loadDashboardData,
    loadActiveFailures,
    loadFlakyTestMetrics,
    loadErrorLogs,
    dashboardPolling,
    setError,
    clearLogs,
    startLogPolling,
    stopLogPolling
  ]);

  // Export dashboard data as JSON
  const exportDashboardDataJSON = useCallback(() => {
    if (!dashboardData) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      filters: testRunsFilteredData?.filter || {},
      summary: dashboardData.summary,
      statistics: {
        totalRuns: dashboardData.totalRuns,
        recentRunsCount: testRunsFilteredData?.filteredTestRuns.length || dashboardData.recentRuns.length,
        displayedRunsCount: testRunsFilteredData?.displayedTestRuns.length || dashboardData.recentRuns.length,
      },
      recentRuns: testRunsFilteredData?.displayedTestRuns || dashboardData.recentRuns,
      activeFailures,
      flakyTestMetrics,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `test-dashboard-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [dashboardData, testRunsFilteredData, activeFailures, flakyTestMetrics]);

  // Export test runs as CSV
  const exportTestRunsCSV = useCallback(() => {
    const runsToExport = testRunsFilteredData?.displayedTestRuns || dashboardData?.recentRuns || [];
    if (!runsToExport || runsToExport.length === 0) return;

    // CSV header
    const headers = ['ID', 'Timestamp', 'Test File', 'Status', 'Passed', 'Failed', 'Skipped', 'Total', 'Duration (ms)', 'Pass Rate (%)'];
    const rows = runsToExport.map((run) => {
      const status = (run.results?.failed || 0) > 0 ? 'Failed' : 
                     (run.results?.skipped || 0) > 0 ? 'Skipped' : 'Passed';
      const passRate = run.results?.total && run.results.total > 0
        ? ((run.results.passed || 0) / run.results.total * 100).toFixed(2)
        : '0.00';
      
      return [
        run.id || '',
        run.timestamp || '',
        run.testFile || '',
        status,
        (run.results?.passed || 0).toString(),
        (run.results?.failed || 0).toString(),
        (run.results?.skipped || 0).toString(),
        (run.results?.total || 0).toString(),
        (run.results?.duration || 0).toString(),
        passRate,
      ];
    });

    // Escape CSV values
    const escapeCSV = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `test-runs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [testRunsFilteredData, dashboardData]);

  // Export test runs as JSON
  const exportTestRunsJSON = useCallback(() => {
    const runsToExport = testRunsFilteredData?.displayedTestRuns || dashboardData?.recentRuns || [];
    if (!runsToExport || runsToExport.length === 0) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      filters: testRunsFilteredData?.filter || {},
      count: runsToExport.length,
      testRuns: runsToExport,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `test-runs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [testRunsFilteredData, dashboardData]);


  return {
    executionCallbacks,
    exportDashboardDataJSON,
    exportTestRunsJSON,
    exportTestRunsCSV,
  };
}
