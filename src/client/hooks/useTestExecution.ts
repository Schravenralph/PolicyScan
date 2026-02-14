import { useRef, useCallback, useEffect } from 'react';
import { TestApiService, TestStatus } from '../services/api/TestApiService';

export interface UseTestExecutionCallbacks {
  onTestsComplete: (status: TestStatus) => void;
  onActivity: () => void;
  onError: (error: string) => void;
  clearLogs: () => void;
  startLogPolling: () => void;
  stopLogPolling: () => void;
}

export interface UseTestExecutionResult {
  handleRunAllTests: () => Promise<void>;
  handleStopTests: () => void;
  startStatusPolling: () => void;
  stopStatusPolling: () => void;
}

export function useTestExecution(
  testApi: TestApiService,
  testStatus: TestStatus | null,
  setTestStatus: (status: TestStatus | null | ((prev: TestStatus | null) => TestStatus | null)) => void,
  loadTestStatus: () => Promise<TestStatus | null>,
  callbacks: UseTestExecutionCallbacks
): UseTestExecutionResult {
  const statusPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousRunningStateRef = useRef<boolean>(false);

  // Stop status polling
  const stopStatusPolling = useCallback(() => {
    if (statusPollIntervalRef.current) {
      clearInterval(statusPollIntervalRef.current);
      statusPollIntervalRef.current = null;
    }
  }, []);

  // Start status polling
  const startStatusPolling = useCallback(() => {
    if (statusPollIntervalRef.current) {
      clearInterval(statusPollIntervalRef.current);
    }

    // Initialize previous state from current test status
    if (testStatus?.running) {
      previousRunningStateRef.current = true;
    }

    statusPollIntervalRef.current = setInterval(async () => {
      const status = await loadTestStatus();
      const wasRunning = previousRunningStateRef.current;
      const isRunning = status?.running || false;

      // Detect test completion: was running, now not running
      if (wasRunning && !isRunning && status) {
        // Show notification when tests complete
        callbacks.onTestsComplete(status);

        // Clear localStorage when tests complete
        localStorage.removeItem('testExecutionStatus');
        stopStatusPolling();
        callbacks.stopLogPolling();

        previousRunningStateRef.current = false;
      } else if (isRunning) {
        // Update localStorage with current status
        localStorage.setItem('testExecutionStatus', JSON.stringify({
          running: true,
          startTime: status?.startTime || new Date().toISOString(),
          lastRunId: status?.lastRunId,
        }));
        previousRunningStateRef.current = true;
        // Mark activity for dashboard polling
        callbacks.onActivity();
      } else {
        previousRunningStateRef.current = false;
      }
    }, 2000);
  }, [loadTestStatus, testStatus?.running, callbacks, stopStatusPolling]);

  // Run all tests
  const handleRunAllTests = useCallback(async () => {
    try {
      callbacks.clearLogs();

      const response = await testApi.runTests();
      setTestStatus(response.status);

      // Store test execution state in localStorage
      if (response.status?.running) {
        localStorage.setItem('testExecutionStatus', JSON.stringify({
          running: true,
          startTime: response.status.startTime || new Date().toISOString(),
          lastRunId: response.status.lastRunId,
        }));
      }

      // Start polling
      startStatusPolling();
      callbacks.startLogPolling();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start tests';
      callbacks.onError(errorMessage);
      console.error('Error starting tests:', err);
    }
  }, [testApi, callbacks, setTestStatus, startStatusPolling]);

  // Stop tests (stops polling, tests continue in background)
  const handleStopTests = useCallback(() => {
    stopStatusPolling();
    callbacks.stopLogPolling();
    // Clear localStorage when user stops polling
    localStorage.removeItem('testExecutionStatus');
    setTestStatus((prev: TestStatus | null) => prev ? { ...prev, running: false } : null);
  }, [stopStatusPolling, callbacks, setTestStatus]);

  // Initial check for running tests (resume polling if needed)
  useEffect(() => {
    // We don't call loadTestStatus here because it's called by the parent component (useTestDashboardData)
    // But we check if we should start polling

    // We need to wait for the initial status to be loaded by parent
    // However, if we mount, we should check localStorage as well.
    // The parent (TestDashboardPage) does this logic in useEffect.
    // We should move that logic here or keep it in parent.
    // Given the complexity of dependencies (loadDashboardData etc), maybe keeping the initialization logic in parent
    // and calling startStatusPolling from there is better.
    // But wait, we want to extract logic.

    // Let's expose startStatusPolling and let the parent call it on mount if needed.
    // In TestDashboardPage.tsx, there was a useEffect that did this.

    return () => {
      stopStatusPolling();
    };
  }, [stopStatusPolling]);

  return {
    handleRunAllTests,
    handleStopTests,
    startStatusPolling,
    stopStatusPolling
  };
}
