interface WorkflowStep {
    id: string;
    name: string;
    action: string;
    params?: Record<string, unknown>;
    next?: string;
    moduleId?: string;
}
interface CreateWorkflowDialogProps {
    onSubmit: (workflow: {
        id: string;
        name: string;
        description?: string;
        steps: WorkflowStep[];
    }) => void;
    onCancel: () => void;
    initialData?: {
        id: string;
        name: string;
        description?: string;
        steps: WorkflowStep[];
    };
}
export declare function CreateWorkflowDialog({ onSubmit, onCancel, initialData }: CreateWorkflowDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
