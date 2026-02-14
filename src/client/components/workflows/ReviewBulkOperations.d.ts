/**
 * Review Bulk Operations Component
 *
 * Bulk action buttons for selecting, accepting, and rejecting candidates.
 */
interface ReviewBulkOperationsProps {
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onBulkAccept: () => void;
    onBulkReject: () => void;
}
export declare function ReviewBulkOperations({ onSelectAll, onDeselectAll, onBulkAccept, onBulkReject, }: ReviewBulkOperationsProps): import("react/jsx-runtime").JSX.Element;
export {};
