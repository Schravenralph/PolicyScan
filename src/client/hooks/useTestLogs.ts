import { useState, useCallback, useRef, useEffect } from 'react';
import { TestApiService } from '../services/api/TestApiService';

export interface UseTestLogsResult {
  logs: string[];
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  autoScroll: boolean;
  setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  logsContainerRef: React.RefObject<HTMLDivElement | null>;
  loadTestLogs: () => Promise<void>;
  startLogPolling: (onActivity?: () => void) => void;
  stopLogPolling: () => void;
  clearLogs: () => void;
}

export function useTestLogs(testApi: TestApiService, isRunning: boolean): UseTestLogsResult {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastLogIndex, setLastLogIndex] = useState(0);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const logPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load test logs
  const loadTestLogs = useCallback(async () => {
    // Only load logs if tests are running or we are manually checking (though typically we only care when running)
    // The original code checked !testStatus?.running.
    if (!isRunning) return;

    try {
      const response = await testApi.getTestOutput(lastLogIndex);

      if (response.output && response.output.length > 0) {
        const newLines = response.output.split('\n').filter(line => line.trim().length > 0);
        setLogs(prev => [...prev, ...newLines]);
        setLastLogIndex(response.totalLines || 0);
      } else if (response.totalLines !== undefined) {
        // Update index even if no new output (to stay in sync)
        setLastLogIndex(response.totalLines);
      }
    } catch (err) {
      console.error('Error loading test logs:', err);
    }
  }, [isRunning, lastLogIndex, testApi]);

  // Start log polling
  const startLogPolling = useCallback((onActivity?: () => void) => {
    if (logPollIntervalRef.current) {
      clearInterval(logPollIntervalRef.current);
    }

    logPollIntervalRef.current = setInterval(() => {
      loadTestLogs();
      if (onActivity) {
        onActivity();
      }
    }, 1000);
  }, [loadTestLogs]);

  // Stop log polling
  const stopLogPolling = useCallback(() => {
    if (logPollIntervalRef.current) {
      clearInterval(logPollIntervalRef.current);
      logPollIntervalRef.current = null;
    }
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    setLastLogIndex(0);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLogPolling();
    };
  }, [stopLogPolling]);

  return {
    logs,
    setLogs,
    autoScroll,
    setAutoScroll,
    logsContainerRef,
    loadTestLogs,
    startLogPolling,
    stopLogPolling,
    clearLogs
  };
}
