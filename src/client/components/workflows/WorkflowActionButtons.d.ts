/**
 * Workflow Action Buttons Component
 *
 * Cancel and submit buttons for workflow form.
 */
interface WorkflowActionButtonsProps {
    onCancel: () => void;
    isEditing?: boolean;
}
export declare function WorkflowActionButtons({ onCancel, isEditing, }: WorkflowActionButtonsProps): import("react/jsx-runtime").JSX.Element;
export {};
