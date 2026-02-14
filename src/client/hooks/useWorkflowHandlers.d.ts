/**
 * Custom hook for workflow-related handlers in Beleidsscan component
 * Handles workflow import, export, and document preview operations
 *
 * ✅ **MIGRATED** - Now works directly with CanonicalDocument[].
 * All document state management uses CanonicalDocument format.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import type { CanonicalDocument } from '../services/api';
import { type LightweightDocument } from '../utils/documentStateOptimization';
export interface UseWorkflowHandlersProps {
    queryId: string | null;
    documents: LightweightDocument[];
    selectedDocuments: string[];
    filteredDocuments: LightweightDocument[];
    selectedWorkflowOutput: string | null;
    setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => void;
    setSelectedWorkflowOutput: (output: string | null) => void;
    importWorkflowOutput: (outputId: string, queryId: string) => Promise<{
        documents: unknown[];
        websites: unknown[];
        documentsCreated: number;
        websitesCreated: number;
    }>;
    loadWorkflowOutputs: () => void;
    loadWorkflowOutput: (outputName: string) => Promise<void>;
    setShowWorkflowImport: (show: boolean) => void;
    setPreviewDocument: (doc: CanonicalDocument | LightweightDocument | null) => void;
    setShowDocumentPreview: (show: boolean) => void;
}
export interface UseWorkflowHandlersReturn {
    handleImportWorkflowResults: () => Promise<void>;
    handleOpenWorkflowImport: () => void;
    handleExportDocuments: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => Promise<void>;
    handlePreviewDocument: (document: CanonicalDocument | LightweightDocument) => void;
    handleLoadWorkflowOutput: (outputName: string) => Promise<void>;
}
/**
 * Hook for workflow-related handlers (import, export, preview)
 */
export declare function useWorkflowHandlers({ queryId, documents, selectedDocuments, filteredDocuments, selectedWorkflowOutput, setDocuments, setSelectedWorkflowOutput, importWorkflowOutput, loadWorkflowOutputs, loadWorkflowOutput: loadWorkflowOutputHook, setShowWorkflowImport, setPreviewDocument, setShowDocumentPreview, }: UseWorkflowHandlersProps): UseWorkflowHandlersReturn;
