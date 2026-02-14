/**
 * Document Operations Hook
 *
 * ✅ **MIGRATED** - Now works directly with CanonicalDocument[].
 * All document state management uses CanonicalDocument format.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import type { LightweightDocument } from '../utils/documentStateOptimization';
interface UseDocumentOperationsProps {
    documents: LightweightDocument[];
    setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => void;
    selectedDocuments: string[];
    setSelectedDocuments: (updater: (prev: string[]) => string[]) => void;
    filteredDocuments: LightweightDocument[];
    saveDraft: () => void;
}
/**
 * Hook for managing document operations (status changes, bulk actions, selection)
 * Extracted from Beleidsscan component to reduce component size and improve maintainability
 */
export declare function useDocumentOperations({ documents: _documents, setDocuments, selectedDocuments: _selectedDocuments, setSelectedDocuments, filteredDocuments, saveDraft, }: UseDocumentOperationsProps): {
    handleStatusChange: (id: string, status: "approved" | "rejected" | "pending") => Promise<void>;
    toggleDocumentSelection: (docId: string) => void;
    handleSelectAllDocuments: () => void;
    handleBulkApprove: () => Promise<void>;
    handleBulkReject: () => Promise<void>;
};
export {};
