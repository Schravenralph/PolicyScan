import type { WorkflowConfigurationTemplate } from '../../services/api/WorkflowConfigurationApiService';
import type { WorkflowDocument } from '../../services/api';
interface TemplatePreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    template: WorkflowConfigurationTemplate | null;
    availableWorkflows: WorkflowDocument[];
    onUseTemplate: (template: WorkflowConfigurationTemplate, activate: boolean) => Promise<void>;
    isSaving: boolean;
}
export declare function TemplatePreviewDialog({ open, onOpenChange, template, availableWorkflows, onUseTemplate, isSaving, }: TemplatePreviewDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
