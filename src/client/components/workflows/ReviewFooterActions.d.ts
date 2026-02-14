/**
 * Review Footer Actions Component
 *
 * Footer action buttons for the review dialog.
 */
interface ReviewFooterActionsProps {
    candidateCount: number;
    acceptedCount: number;
    submitting: boolean;
    onCancel: () => void;
    onSubmit: () => void;
}
export declare function ReviewFooterActions({ candidateCount, acceptedCount, submitting, onCancel, onSubmit, }: ReviewFooterActionsProps): import("react/jsx-runtime").JSX.Element;
export {};
