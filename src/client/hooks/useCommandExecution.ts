import { useState, useCallback, useEffect } from 'react';
import { TestApiService, QueuedCommand } from '../services/api/TestApiService';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { useWebSocket } from './useWebSocket';

const LONG_RUNNING_THRESHOLD_MS = 5000;
const QUEUE_POLLING_INTERVAL_MS = 2000;

export interface UseCommandExecutionResult {
  outputPaneOpen: boolean;
  setOutputPaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
  outputPaneCommand: string;
  outputPaneOutput: string[];
  setOutputPaneOutput: React.Dispatch<React.SetStateAction<string[]>>;
  outputPaneStatus: 'idle' | 'running' | 'success' | 'error';
  handleExecuteCommand: (command: string, commandType?: string) => Promise<void>;
  queue: QueuedCommand[];
  refreshQueue: () => Promise<void>;
  cancelQueuedCommand: (id: string) => Promise<void>;
  clearQueue: () => Promise<void>;
}

// Type guard to check if result has reportPath
function hasReportPath(result: unknown): result is { reportPath: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'reportPath' in result &&
    typeof (result as Record<string, unknown>).reportPath === 'string'
  );
}

export function useCommandExecution(
  testApi: TestApiService,
  showCommandCompletionNotification: (command: string, success: boolean, duration: number) => void
): UseCommandExecutionResult {
  const [outputPaneOpen, setOutputPaneOpen] = useState(false);
  const [outputPaneCommand, setOutputPaneCommand] = useState('');
  const [outputPaneOutput, setOutputPaneOutput] = useState<string[]>([]);
  const [outputPaneStatus, setOutputPaneStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [queue, setQueue] = useState<QueuedCommand[]>([]);

  // Refresh queue function
  const refreshQueue = useCallback(async () => {
    try {
      const { queue: newQueue } = await testApi.getCommandQueue();
      setQueue(newQueue);
    } catch (err) {
      console.error('Failed to refresh queue:', err);
    }
  }, [testApi]);

  // Poll queue status
  useEffect(() => {
    // Initial fetch
    refreshQueue();

    // Set up polling
    const interval = setInterval(() => {
      refreshQueue();
    }, QUEUE_POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refreshQueue]);

  // Cancel queued command
  const cancelQueuedCommand = useCallback(async (id: string) => {
    try {
      await testApi.cancelQueuedCommand(id);
      toast.success('Command cancelled');
      refreshQueue();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel command';
      toast.error('Failed to cancel command', errorMessage);
    }
  }, [testApi, refreshQueue]);

  // Clear all queued commands
  const clearQueue = useCallback(async () => {
    try {
      await testApi.clearCommandQueue();
      toast.success('Queue cleared');
      refreshQueue();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear queue';
      toast.error('Failed to clear queue', errorMessage);
    }
  }, [testApi, refreshQueue]);

  // Handle command execution (centralized handler for all commands)
  const handleExecuteCommand = useCallback(async (command: string, commandType?: string) => {
    // Open output pane and set command
    setOutputPaneOpen(true);
    setOutputPaneCommand(command);
    setOutputPaneOutput([]);
    setOutputPaneStatus('running');
    const startTime = Date.now();

    try {
      // Use the appropriate API method based on commandType if provided
      let result;
      if (commandType === 'health') {
        result = await testApi.runWorkflowStepsHealthCheck();
      } else if (commandType === 'run') {
        result = await testApi.runWorkflowStepsTests();
      } else if (commandType === 'collect-bugs') {
        result = await testApi.collectWorkflowStepsBugs();
      } else if (commandType === 'generate-report') {
        result = await testApi.generateWorkflowStepsReport();
      } else {
        // Fallback to generic executeCommand for custom commands
        result = await testApi.executeCommand(command);
      }

      // Handle queued status
      if ('status' in result && result.status === 'queued') {
        setOutputPaneOpen(false); // Close output pane since execution is queued
        const message = 'message' in result ? result.message : 'Command added to execution queue';
        toast.success('Command Queued', message);
        refreshQueue();
        return;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Update output with result
      setOutputPaneOutput(result.output || []);
      setOutputPaneStatus(result.success ? 'success' : 'error');

      if (result.error) {
        setOutputPaneOutput(prev => [...prev, `Error: ${result.error}`]);
      }

      // If report path is provided (for generate-report), show it in output
      if (commandType === 'generate-report' && hasReportPath(result) && result.reportPath) {
        setOutputPaneOutput(prev => [...prev, `\nReport generated at: ${result.reportPath}`]);
      }

      // Check for long-running command notification
      if (duration > LONG_RUNNING_THRESHOLD_MS) {
        const durationSec = (duration / 1000).toFixed(1);

        // In-app toast
        if (result.success) {
          toast.success(t('command.completedSuccess'), t('command.completedDesc').replace('{{command}}', command).replace('{{duration}}', durationSec));
        } else {
          toast.error(t('command.failed'), t('command.failedDesc').replace('{{command}}', command).replace('{{duration}}', durationSec));
        }

        // Browser notification
        showCommandCompletionNotification(command, result.success, duration);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('command.executeFailed');
      setOutputPaneOutput([`Error: ${errorMessage}`]);
      setOutputPaneStatus('error');
      // Ensure output pane is open to show the error
      setOutputPaneOpen(true);
      console.error('Failed to execute command:', error);

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (duration > LONG_RUNNING_THRESHOLD_MS) {
        toast.error(t('command.failed'), t('command.failedDesc').replace('{{command}}', command).replace('{{duration}}', (duration / 1000).toFixed(1)));
      }
    }
  }, [testApi, showCommandCompletionNotification, refreshQueue]);

  return {
    outputPaneOpen,
    setOutputPaneOpen,
    outputPaneCommand,
    outputPaneOutput,
    setOutputPaneOutput,
    outputPaneStatus,
    handleExecuteCommand,
    queue,
    refreshQueue,
    cancelQueuedCommand,
    clearQueue
  };
}
