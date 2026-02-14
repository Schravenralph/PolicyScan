/**
 * Workflow Comparison Panes Component
 *
 * Two-pane layout for displaying workflow execution logs side-by-side
 * with synchronized scrolling support.
 */
interface ComparisonStatus {
    _id?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    name?: string;
    description?: string;
    workflowA?: {
        workflowId: string;
        label?: string;
    };
    workflowB?: {
        workflowId: string;
        label?: string;
    };
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    currentRunIds?: {
        workflowA?: string;
        workflowB?: string;
    };
    results?: {
        workflowA?: {
            runId?: string;
            error?: string;
            [key: string]: unknown;
        };
        workflowB?: {
            runId?: string;
            error?: string;
            [key: string]: unknown;
        };
    };
    [key: string]: unknown;
}
interface WorkflowDocument {
    id: string;
    name: string;
}
interface WorkflowComparisonPanesProps {
    activeComparison: ComparisonStatus;
    workflowDocuments: WorkflowDocument[];
    synchronizedScrolling: boolean;
    onSynchronizedScrollingChange: (enabled: boolean) => void;
    pollingError: string | null;
    onRetryPolling: () => void;
}
export declare function WorkflowComparisonPanes({ activeComparison, workflowDocuments, synchronizedScrolling, onSynchronizedScrollingChange, pollingError, onRetryPolling, }: WorkflowComparisonPanesProps): import("react/jsx-runtime").JSX.Element;
export {};
