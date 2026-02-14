/**
 * Workflow Details Panel Component
 *
 * Displays detailed information about a workflow including runs, analytics, logs, and errors.
 */
interface WorkflowDetailsPanelProps {
    workflowId: string;
    workflowName: string;
    onClose: () => void;
}
export declare function WorkflowDetailsPanel({ workflowId, workflowName, onClose }: WorkflowDetailsPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
