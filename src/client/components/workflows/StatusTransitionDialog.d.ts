import { WorkflowDocument } from '../../services/api';
type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';
interface StatusTransitionDialogProps {
    workflow: WorkflowDocument;
    validNextStatuses: WorkflowStatus[];
    onSubmit: (newStatus: WorkflowStatus, comment?: string, runningInstanceBehavior?: 'complete' | 'cancel') => void;
    onCancel: () => void;
}
export declare function StatusTransitionDialog({ workflow, validNextStatuses, onSubmit, onCancel, }: StatusTransitionDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
