import { WorkflowDocument } from '../../services/api';
interface WorkflowDetailsDialogProps {
    workflow: WorkflowDocument;
    onClose: () => void;
}
export declare function WorkflowDetailsDialog({ workflow, onClose }: WorkflowDetailsDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
