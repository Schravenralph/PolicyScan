export interface WorkflowSelectorProps {
    selectedWorkflows: string[];
    onSelectionChange: (workflowIds: string[]) => void;
    maxSelection?: number;
    minSelection?: number;
    label?: string;
    description?: string;
}
export declare function WorkflowSelector({ selectedWorkflows, onSelectionChange, maxSelection, minSelection, label, description, }: WorkflowSelectorProps): import("react/jsx-runtime").JSX.Element;
