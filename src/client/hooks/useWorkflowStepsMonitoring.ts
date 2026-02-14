import { useState, useCallback, useRef, useEffect } from 'react';
import { TestApiService } from '../services/api/TestApiService';

export interface WorkflowStepsStatus {
  running: boolean;
  pipelineRunId?: string;
  currentStep?: {
    stepNumber: number;
    stepName?: string;
    workflowId?: string;
  };
  progress?: {
    percentage: number;
    completed: number;
    total: number;
    estimatedTimeRemaining?: number;
  };
  stepProgress?: Array<{
    stepNumber: number;
    stepName: string;
    status: 'completed' | 'running' | 'pending';
  }>;
  startTime?: Date | string;
  lastUpdate?: Date | string;
  message?: string;
}

interface UseWorkflowStepsMonitoringResult {
  workflowStepsStatus: WorkflowStepsStatus | null;
  workflowStepsStatusLoading: boolean;
  loadWorkflowStepsStatus: () => Promise<void>;
  startWorkflowStepsStatusPolling: () => void;
  stopWorkflowStepsStatusPolling: () => void;
}

export function useWorkflowStepsMonitoring(testApi: TestApiService): UseWorkflowStepsMonitoringResult {
  const [workflowStepsStatus, setWorkflowStepsStatus] = useState<WorkflowStepsStatus | null>(null);
  const [workflowStepsStatusLoading, setWorkflowStepsStatusLoading] = useState(false);
  const workflowStepsStatusPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load workflow steps test status
  const loadWorkflowStepsStatus = useCallback(async () => {
    setWorkflowStepsStatusLoading(true);

    try {
      const status = await testApi.getWorkflowStepsStatus();
      setWorkflowStepsStatus(status as unknown as WorkflowStepsStatus);

      // Start polling if tests are running
      if (status.running) {
        startWorkflowStepsStatusPolling();
      } else {
        stopWorkflowStepsStatusPolling();
      }
    } catch (err) {
      console.error('Error loading workflow steps status:', err);
      // Don't show error - this is optional monitoring
      setWorkflowStepsStatus(null);
    } finally {
      setWorkflowStepsStatusLoading(false);
    }
  }, [testApi]); // Removed workflowStepsStatus dependency to prevent infinite loops

  // Start polling workflow steps status
  const startWorkflowStepsStatusPolling = useCallback(() => {
    if (workflowStepsStatusPollIntervalRef.current) {
      clearInterval(workflowStepsStatusPollIntervalRef.current);
    }

    // Poll every 3 seconds when tests are running
    workflowStepsStatusPollIntervalRef.current = setInterval(() => {
      testApi.getWorkflowStepsStatus()
        .then(status => {
          setWorkflowStepsStatus(status as unknown as WorkflowStepsStatus);
          if (!status.running) {
            if (workflowStepsStatusPollIntervalRef.current) {
              clearInterval(workflowStepsStatusPollIntervalRef.current);
              workflowStepsStatusPollIntervalRef.current = null;
            }
          }
        })
        .catch(err => {
          console.error('Polling error workflow steps:', err);
        });
    }, 3000);
  }, [testApi]);

  // Stop polling workflow steps status
  const stopWorkflowStepsStatusPolling = useCallback(() => {
    if (workflowStepsStatusPollIntervalRef.current) {
      clearInterval(workflowStepsStatusPollIntervalRef.current);
      workflowStepsStatusPollIntervalRef.current = null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadWorkflowStepsStatus();

    return () => {
      stopWorkflowStepsStatusPolling();
    };
  }, [loadWorkflowStepsStatus, stopWorkflowStepsStatusPolling]);

  return {
    workflowStepsStatus,
    workflowStepsStatusLoading,
    loadWorkflowStepsStatus,
    startWorkflowStepsStatusPolling,
    stopWorkflowStepsStatusPolling
  };
}
