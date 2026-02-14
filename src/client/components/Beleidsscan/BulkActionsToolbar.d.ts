/**
 * Bulk Actions Toolbar Component
 *
 * Toolbar for performing bulk actions on selected documents
 * (approve, reject, deselect) with selection count display.
 */
interface BulkActionsToolbarProps {
    selectedCount: number;
    onBulkApprove: () => Promise<void>;
    onBulkReject: () => Promise<void>;
    onDeselectAll: () => void;
}
declare function BulkActionsToolbarComponent({ selectedCount, onBulkApprove, onBulkReject, onDeselectAll, }: BulkActionsToolbarProps): import("react/jsx-runtime").JSX.Element | null;
export declare const BulkActionsToolbar: import("react").MemoExoticComponent<typeof BulkActionsToolbarComponent>;
export {};
