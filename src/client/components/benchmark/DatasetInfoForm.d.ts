/**
 * Dataset Info Form Component
 *
 * Name and description inputs for dataset (shared between manual and canonical modes).
 */
interface DatasetInfoFormProps {
    name: string;
    description: string;
    onNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    nameId?: string;
    descriptionId?: string;
    disabled?: boolean;
}
export declare function DatasetInfoForm({ name, description, onNameChange, onDescriptionChange, nameId, descriptionId, disabled, }: DatasetInfoFormProps): import("react/jsx-runtime").JSX.Element;
export {};
