/**
 * WorkflowList Component
 *
 * Displays a list of workflow cards with inputs and execution controls.
 */
interface Workflow {
    id: string;
    name: string;
    description: string;
    steps: unknown[];
}
interface WorkflowListProps {
    workflows: Workflow[];
    workflowsError: Error | null;
    workflowsLoading: boolean;
    currentWorkflowId: string | null;
    runStatus: string | null;
    runningWorkflowId: string | null;
    onRunWorkflow: (id: string, params: Record<string, unknown>) => Promise<void>;
    onResumeWorkflow: () => void;
    onPauseWorkflow: () => void;
    onStopWorkflow: () => void;
    onRefetchWorkflows: () => void;
}
export declare function WorkflowList({ workflows, workflowsError, workflowsLoading, currentWorkflowId, runStatus, runningWorkflowId, onRunWorkflow, onResumeWorkflow, onPauseWorkflow, onStopWorkflow, onRefetchWorkflows, }: WorkflowListProps): import("react/jsx-runtime").JSX.Element;
export {};
