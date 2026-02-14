/**
 * Workflow Info Form Component
 *
 * Basic form fields for workflow ID, name, and description.
 */
interface WorkflowInfoFormProps {
    id: string;
    name: string;
    description: string;
    onIdChange: (id: string) => void;
    onNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    isEditing?: boolean;
}
export declare function WorkflowInfoForm({ id, name, description, onIdChange, onNameChange, onDescriptionChange, isEditing, }: WorkflowInfoFormProps): import("react/jsx-runtime").JSX.Element;
export {};
