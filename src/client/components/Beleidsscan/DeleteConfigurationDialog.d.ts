/**
 * DeleteConfigurationDialog Component
 *
 * Confirmation dialog for deleting a workflow configuration.
 */
import type { WorkflowConfiguration } from '../../services/api/WorkflowConfigurationApiService';
interface DeleteConfigurationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: WorkflowConfiguration | null;
    onConfirm: () => void;
    isDeleting: boolean;
}
export declare function DeleteConfigurationDialog({ open, onOpenChange, config, onConfirm, isDeleting, }: DeleteConfigurationDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
