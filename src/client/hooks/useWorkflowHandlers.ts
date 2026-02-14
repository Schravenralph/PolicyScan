/**
 * Custom hook for workflow-related handlers in Beleidsscan component
 * Handles workflow import, export, and document preview operations
 * 
 * ✅ **MIGRATED** - Now works directly with CanonicalDocument[].
 * All document state management uses CanonicalDocument format.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useCallback } from 'react';
import { toast } from '../utils/toast';
import { logError, getOperationErrorMessage } from '../utils/errorHandler';
import { exportDocuments } from '../utils/exportUtils';
import type { CanonicalDocument } from '../services/api';
import type { BronDocument } from '../utils/transformations';
import { getCanonicalDocumentId } from '../utils/canonicalDocumentUtils';
import { createLightweightDocument, createLightweightDocuments, type LightweightDocument } from '../utils/documentStateOptimization';

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
 * Helper to get document ID from CanonicalDocument or LightweightDocument
 */
function getDocumentId(doc: CanonicalDocument | LightweightDocument): string | undefined {
  return getCanonicalDocumentId(doc);
}

/**
 * Hook for workflow-related handlers (import, export, preview)
 */
export function useWorkflowHandlers({
  queryId,
  documents,
  selectedDocuments,
  filteredDocuments,
  selectedWorkflowOutput,
  setDocuments,
  setSelectedWorkflowOutput,
  importWorkflowOutput,
  loadWorkflowOutputs,
  loadWorkflowOutput: loadWorkflowOutputHook,
  setShowWorkflowImport,
  setPreviewDocument,
  setShowDocumentPreview,
}: UseWorkflowHandlersProps): UseWorkflowHandlersReturn {
  /**
   * Imports workflow results as documents into the current query
   */
  const handleImportWorkflowResults = useCallback(async () => {
    if (!selectedWorkflowOutput || !queryId) return;

    try {
      const result = await importWorkflowOutput(selectedWorkflowOutput, queryId);
      
      // Type safety: Ensure result and documents exist
      if (!result || !result.documents) {
        throw new Error('Geen documenten ontvangen van workflow output');
      }
      
      // Add imported documents to documents
      // Note: Workflow import API should return CanonicalDocument[] format
      // If it returns BronDocument format, we need to convert via API
      const importedDocs: CanonicalDocument[] = Array.isArray(result.documents) 
        ? (result.documents as unknown as CanonicalDocument[])
        : [];

      // Strip fullText from imported documents to prevent React DevTools 64MB limit error
      const lightweightImportedDocs = createLightweightDocuments(importedDocs);

      setDocuments((prev: LightweightDocument[]) => [...prev, ...lightweightImportedDocs]);
      setShowWorkflowImport(false);
      setSelectedWorkflowOutput(null);
      
      toast.success(
        'Workflow resultaten geïmporteerd',
        `${result.documentsCreated || importedDocs.length} document(en) zijn toegevoegd aan uw scan.`
      );
    } catch (error) {
      logError(error as Error, 'import-workflow-results');
      const errorInfo = getOperationErrorMessage('import-workflow', error);
      toast.error(
        errorInfo.title,
        errorInfo.message
      );
    }
  }, [selectedWorkflowOutput, queryId, importWorkflowOutput, setDocuments, setShowWorkflowImport, setSelectedWorkflowOutput]);

  /**
   * Opens the workflow import modal
   */
  const handleOpenWorkflowImport = useCallback(() => {
    loadWorkflowOutputs();
    setShowWorkflowImport(true);
  }, [loadWorkflowOutputs, setShowWorkflowImport]);

  /**
   * Exports documents in the specified format and scope
   */
  const handleExportDocuments = useCallback(async (
    format: 'csv' | 'json' | 'markdown' | 'xlsx',
    scope: 'all' | 'filtered' | 'selected'
  ) => {
    try {
      let documentsToExport: LightweightDocument[] = [];

      if (scope === 'selected') {
        documentsToExport = documents.filter(doc => {
          const docId = getDocumentId(doc);
          return docId && selectedDocuments.includes(docId);
        });
        if (documentsToExport.length === 0) {
          toast.error('Geen documenten geselecteerd', 'Selecteer eerst documenten om te exporteren.');
          return;
        }
      } else if (scope === 'filtered') {
        documentsToExport = filteredDocuments;
        if (documentsToExport.length === 0) {
          toast.error('Geen documenten in filter', 'Er zijn geen documenten die overeenkomen met de huidige filters.');
          return;
        }
      } else {
        documentsToExport = documents;
      }

      if (documentsToExport.length === 0) {
        toast.error('Geen documenten om te exporteren', 'Er zijn geen documenten beschikbaar voor export.');
        return;
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const scopeLabel = scope === 'selected' ? 'selected' : scope === 'filtered' ? 'filtered' : 'all';
      const filename = `beleidsscan-${scopeLabel}-${timestamp}.${format}`;

      // exportDocuments should handle both CanonicalDocument and BronDocument
      // If it doesn't, we may need to transform CanonicalDocument to BronDocument for export
      await exportDocuments(documentsToExport as unknown as BronDocument[], format, {
        queryId: queryId || undefined,
        filename
      });

      toast.success(
        'Export succesvol',
        `${documentsToExport.length} document(en) geëxporteerd als ${format.toUpperCase()}.`
      );
    } catch (error) {
      logError(error, 'export-documents');
      const errorInfo = getOperationErrorMessage('export-documents', error);
      toast.error(
        errorInfo.title,
        errorInfo.message
      );
    }
  }, [documents, selectedDocuments, filteredDocuments, queryId]);

  /**
   * Opens document preview modal
   * Works with CanonicalDocument/LightweightDocument format
   * Strips fullText to prevent React DevTools 64MB limit error
   */
  const handlePreviewDocument = useCallback((document: CanonicalDocument | LightweightDocument) => {
    // Strip fullText before setting preview to prevent React DevTools serialization issues
    const lightweightDocument = createLightweightDocument(document);
    setPreviewDocument(lightweightDocument);
    setShowDocumentPreview(true);
  }, [setPreviewDocument, setShowDocumentPreview]);

  /**
   * Loads a specific workflow output
   */
  const handleLoadWorkflowOutput = useCallback(async (outputName: string) => {
    try {
      await loadWorkflowOutputHook(outputName);
    } catch (error) {
      logError(error as Error, 'load-workflow-output');
      const errorInfo = getOperationErrorMessage('import-workflow', error);
      toast.error(
        errorInfo.title,
        errorInfo.message
      );
    }
  }, [loadWorkflowOutputHook]);

  return {
    handleImportWorkflowResults,
    handleOpenWorkflowImport,
    handleExportDocuments,
    handlePreviewDocument,
    handleLoadWorkflowOutput,
  };
}

