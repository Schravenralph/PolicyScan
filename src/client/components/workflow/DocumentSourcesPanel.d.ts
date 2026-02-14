/**
 * DocumentSourcesPanel Component
 *
 * Displays documents discovered during workflow execution in real-time.
 * Shows document titles and sources as they are found.
 */
interface DocumentSourcesPanelProps {
    queryId: string | null;
    workflowRunId: string | null;
    isWorkflowRunning: boolean;
    className?: string;
}
export declare function DocumentSourcesPanel({ queryId, workflowRunId: _workflowRunId, isWorkflowRunning, className, }: DocumentSourcesPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
