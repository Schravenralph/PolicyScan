/**
 * Workflow Steps Section Component
 *
 * Displays the list of steps in a workflow.
 */
interface WorkflowStep {
    id: string;
    name: string;
    action?: string;
    next?: string;
}
interface WorkflowStepsSectionProps {
    steps: WorkflowStep[];
}
export declare function WorkflowStepsSection({ steps }: WorkflowStepsSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
