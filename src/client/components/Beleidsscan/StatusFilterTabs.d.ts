/**
 * Status Filter Tabs Component
 *
 * Tabs for filtering documents by review status (all/pending/approved/rejected)
 * with counts and info popovers.
 */
type DocumentFilter = 'all' | 'pending' | 'approved' | 'rejected';
interface DocumentCounts {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
}
interface StatusFilterTabsProps {
    documentFilter: DocumentFilter;
    setDocumentFilter: (filter: DocumentFilter) => void;
    documentCounts: DocumentCounts;
    isLoadingDocuments: boolean;
    onSelectionClear: () => void;
}
declare function StatusFilterTabsComponent({ documentFilter, setDocumentFilter, documentCounts, isLoadingDocuments, onSelectionClear, }: StatusFilterTabsProps): import("react/jsx-runtime").JSX.Element;
export declare const StatusFilterTabs: import("react").MemoExoticComponent<typeof StatusFilterTabsComponent>;
export {};
