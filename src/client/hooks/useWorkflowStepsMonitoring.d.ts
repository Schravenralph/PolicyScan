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
export declare function useWorkflowStepsMonitoring(testApi: TestApiService): UseWorkflowStepsMonitoringResult;
export {};
