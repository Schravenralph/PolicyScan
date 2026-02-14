/**
 * Test Execution Section Component
 *
 * Extracted from TestDashboardPage to improve maintainability.
 * Handles test execution controls, status display, progress, logs, and workflow monitoring.
 */
import { TestApiService, TestStatus } from '../../services/api/TestApiService';
interface TestExecutionSectionProps {
    testStatus: TestStatus | null;
    testApiService: TestApiService;
    onRunTests: () => void;
    onStopTests: () => void;
    logFiles: Array<{
        suite: string;
        date: string;
        timestamp: string;
        type?: string;
        size?: number;
        path: string;
        content?: any;
    }>;
    selectedLogFile: number | null;
    onSelectLogFile: (index: number | null) => void;
    logDirectory?: string | null;
    logFilesLoading: boolean;
    onLoadLogFiles: (runId: string) => void;
    logs: string[];
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
    onClearLogs: () => void;
    logsContainerRef: React.RefObject<HTMLDivElement | null>;
    workflowStepsStatus: {
        running: boolean;
        pipelineRunId?: string;
        currentStep?: {
            stepNumber: number;
            stepName?: string;
            workflowId?: string;
        };
        progress?: {
            completed: number;
            total: number;
            percentage: number;
            estimatedTimeRemaining?: number;
        };
        stepProgress?: Array<{
            stepNumber: number;
            stepName?: string;
            status: 'completed' | 'running' | 'pending';
        }>;
        startTime?: string | Date;
        message?: string;
    } | null;
    workflowStepsStatusLoading: boolean;
    onLoadWorkflowStepsStatus: () => void;
}
export declare function TestExecutionSection({ testStatus, onRunTests, onStopTests, logFiles, selectedLogFile, onSelectLogFile, logDirectory, logFilesLoading, onLoadLogFiles, logs, autoScroll, onToggleAutoScroll, onClearLogs, logsContainerRef, workflowStepsStatus, workflowStepsStatusLoading, onLoadWorkflowStepsStatus, }: TestExecutionSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
