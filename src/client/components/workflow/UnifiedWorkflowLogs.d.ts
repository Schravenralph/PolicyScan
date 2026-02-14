/**
 * UnifiedWorkflowLogs Component
 *
 * Unified component that consolidates WorkflowLogsDisplay and WorkflowLogs functionality.
 * Displays workflow execution logs with instant text rendering.
 */
import { BaseLogEntry } from '../shared/LogBubble';
import type { ScraperProgressUpdate, JobProgressEvent } from '../../hooks/useWebSocket';
interface UnifiedWorkflowLogsProps {
    logs?: BaseLogEntry[];
    runId?: string | null;
    runStatus?: string | null;
    runningWorkflowId?: string | null;
    pollingError?: string | null;
    isPolling?: boolean;
    jobFailures?: JobProgressEvent[];
    workflowProgress?: ScraperProgressUpdate['data'] | null;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
    logEndRef?: React.RefObject<HTMLDivElement | null>;
    onDownloadLogs?: () => void;
    onDismissJobFailure?: (jobId: string) => void;
    onPauseWorkflow?: () => void;
    onResumeWorkflow?: () => void;
    onStopWorkflow?: () => void;
    variant?: 'inline' | 'compact';
    className?: string;
    title?: string;
    showHeader?: boolean;
}
export declare function UnifiedWorkflowLogs({ logs: providedLogs, runId: providedRunId, runStatus: providedRunStatus, runningWorkflowId, pollingError, isPolling, jobFailures, workflowProgress, scrollContainerRef: providedScrollContainerRef, logEndRef: providedLogEndRef, onDownloadLogs: providedOnDownloadLogs, onDismissJobFailure, onPauseWorkflow, onResumeWorkflow, onStopWorkflow, variant, className, title, showHeader, }: UnifiedWorkflowLogsProps): import("react/jsx-runtime").JSX.Element;
export {};
