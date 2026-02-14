/**
 * Workflow Actions Section Component
 *
 * Action buttons for workflow operations (export, duplicate, share, close).
 */
interface WorkflowActionsSectionProps {
    onExport: () => void;
    onDuplicate: () => void;
    onShare: () => void;
    onClose: () => void;
    isDuplicating: boolean;
}
export declare function WorkflowActionsSection({ onExport, onDuplicate, onShare, onClose, isDuplicating, }: WorkflowActionsSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
