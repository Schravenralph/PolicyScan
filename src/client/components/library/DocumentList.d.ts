/**
 * Document List Component
 *
 * Displays the list of documents with:
 * - Header with export menu
 * - Loading/empty states
 * - Document cards with validation and error handling
 * - Pagination controls
 */
import type { CanonicalDocument } from '../../services/api';
interface DocumentListProps {
    filteredDocuments: CanonicalDocument[];
    loading: boolean;
    searchQuery: string;
    total: number;
    selectedIds: Set<string>;
    toggleSelection: (docId: string) => void;
    toggleSelectAll: () => void;
    handleExport: (format: 'csv' | 'pdf') => void;
    exportSingleDocument: (doc: CanonicalDocument, format: 'csv' | 'pdf') => void;
    copyDocumentUrl: (url: string) => void;
    onDeleteDocument?: (docId: string) => void;
    exporting: boolean;
    includeCitations: boolean;
    citationFormat: 'apa' | 'custom';
    setIncludeCitations: (value: boolean) => void;
    setCitationFormat: (value: 'apa' | 'custom') => void;
    setShowEmailDialog: (value: boolean) => void;
    page: number;
    totalPages: number;
    setPage: (page: number | ((prev: number) => number)) => void;
}
export declare function DocumentList({ filteredDocuments, loading, searchQuery, total, selectedIds, toggleSelection, toggleSelectAll, handleExport, exportSingleDocument, copyDocumentUrl, onDeleteDocument, exporting, includeCitations, citationFormat, setIncludeCitations, setCitationFormat, setShowEmailDialog, page, totalPages, setPage, }: DocumentListProps): import("react/jsx-runtime").JSX.Element;
export {};
