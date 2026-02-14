import { BaseLogEntry } from '../components/shared/LogBubble';
import { type JobProgressEvent } from '../hooks/useWebSocket';
export declare function useWorkflowRun(): {
    logs: BaseLogEntry[];
    runStatus: string | null;
    runningWorkflowId: string | null;
    currentWorkflowId: string | null;
    runHasCompleted: boolean;
    showReviewDialog: boolean;
    setShowReviewDialog: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    pollingError: string | null;
    isPolling: boolean;
    workflowProgress: {
        progress: number;
        status: "pending" | "running" | "completed" | "failed" | "cancelled";
        estimatedSecondsRemaining?: number;
        currentStep: string;
        totalSteps: number;
        completedSteps: number;
        scrapers: Array<{
            scraperId: string;
            scraperName: string;
            status: "pending" | "running" | "completed" | "failed";
            progress: number;
            documentsFound: number;
            errors: number;
            currentUrl?: string;
        }>;
        totalDocumentsFound: number;
        totalSourcesFound: number;
        totalErrors: number;
        startedAt: number;
        lastUpdated: number;
        completedAt?: number;
        error?: string;
    } | null;
    jobFailures: JobProgressEvent[];
    setJobFailures: import("react").Dispatch<import("react").SetStateAction<JobProgressEvent[]>>;
    missingRequiredFields: {
        action: string;
        fields: string[];
    } | null;
    setMissingRequiredFields: import("react").Dispatch<import("react").SetStateAction<{
        action: string;
        fields: string[];
    } | null>>;
    startWorkflow: (id: string, customParams?: Record<string, unknown>) => Promise<void>;
    pauseWorkflow: () => Promise<void>;
    resumeWorkflow: () => Promise<void>;
    stopWorkflow: () => Promise<void>;
    downloadLogs: () => void;
};
