/**
 * Save Template Dialog Component
 *
 * Dialog for saving benchmark configuration templates
 * with name, description, and benchmark type selection.
 */
interface BenchmarkType {
    id: string;
    name: string;
    description: string;
}
interface SaveTemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    templateName: string;
    onTemplateNameChange: (name: string) => void;
    templateDescription: string;
    onTemplateDescriptionChange: (description: string) => void;
    templateTypes: string[];
    onTemplateTypesChange: (types: string[]) => void;
    availableBenchmarkTypes: BenchmarkType[];
    onSave: () => void;
    onCancel: () => void;
}
export declare function SaveTemplateDialog({ open, onOpenChange, templateName, onTemplateNameChange, templateDescription, onTemplateDescriptionChange, templateTypes, onTemplateTypesChange, availableBenchmarkTypes, onSave, onCancel, }: SaveTemplateDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
