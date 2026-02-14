/**
 * Document Operations Hook
 * 
 * ✅ **MIGRATED** - Now works directly with CanonicalDocument[].
 * All document state management uses CanonicalDocument format.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useCallback } from 'react';
import { wizardService } from '../services/wizard/WizardService';
import { toast } from '../utils/toast';
import { logError, createErrorWithRetry, getOperationErrorMessage } from '../utils/errorHandler';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
import { getCanonicalDocumentId } from '../utils/canonicalDocumentUtils';

interface UseDocumentOperationsProps {
  documents: LightweightDocument[];
  setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => void;
  selectedDocuments: string[];
  setSelectedDocuments: (updater: (prev: string[]) => string[]) => void;
  filteredDocuments: LightweightDocument[];
  saveDraft: () => void;
}

/**
 * Helper to get document ID from CanonicalDocument or LightweightDocument
 */
function getDocumentId(doc: CanonicalDocument | LightweightDocument): string | undefined {
  return getCanonicalDocumentId(doc);
}

/**
 * Hook for managing document operations (status changes, bulk actions, selection)
 * Extracted from Beleidsscan component to reduce component size and improve maintainability
 */
export function useDocumentOperations({
  documents: _documents,
  setDocuments,
  selectedDocuments: _selectedDocuments,
  setSelectedDocuments,
  filteredDocuments,
  saveDraft,
}: UseDocumentOperationsProps) {
  /**
   * Update individual document status (approved/rejected/pending)
   * Works with CanonicalDocument format using reviewStatus
   */
  const handleStatusChange = useCallback(async (
    id: string,
    status: 'approved' | 'rejected' | 'pending'
  ) => {
    const reviewStatus: 'approved' | 'rejected' | 'pending_review' = 
      status === 'approved' ? 'approved' : 
      status === 'rejected' ? 'rejected' : 
      'pending_review';

    // Update local state
    setDocuments(docs => docs.map(doc => {
      const docId = getDocumentId(doc);
      if (docId === id) {
        return {
          ...doc,
          reviewStatus,
        } as LightweightDocument;
      }
      return doc;
    }));

    // Update in backend (uses canonical API internally)
    try {
      const accepted = status === 'approved';
      await wizardService.updateDocumentAcceptance(id, accepted);
      // Save draft after status change
      saveDraft();
    } catch (error) {
      logError(error as Error, 'update-document-status');
      const errorWithRetry = createErrorWithRetry(error, () => {
        handleStatusChange(id, status);
      }, 'update-document-status');
      toast.errorWithRetry(errorWithRetry);
    }
  }, [setDocuments, saveDraft]);

  /**
   * Toggle document selection
   */
  const toggleDocumentSelection = useCallback((docId: string) => {
    setSelectedDocuments(prev => {
      if (prev.includes(docId)) {
        return prev.filter(id => id !== docId);
      } else {
        return [...prev, docId];
      }
    });
  }, [setSelectedDocuments]);

  /**
   * Select or deselect all filtered documents
   * Works with CanonicalDocument format
   */
  const handleSelectAllDocuments = useCallback(() => {
    // Use current filteredDocuments from the hook (captured in closure)
    const currentFilteredIds = filteredDocuments
      .map(doc => getDocumentId(doc))
      .filter((id): id is string => Boolean(id));
    setSelectedDocuments(prev => {
      if (prev.length === currentFilteredIds.length && currentFilteredIds.length > 0) {
        return [];
      } else {
        return currentFilteredIds;
      }
    });
  }, [filteredDocuments, setSelectedDocuments]);

  /**
   * Bulk approve selected documents
   */
  const handleBulkApprove = useCallback(async () => {
    // Capture selectedDocuments before async operations to prevent stale closure
    let documentIdsToApprove: string[] = [];
    setSelectedDocuments(prev => {
      documentIdsToApprove = [...prev];
      return prev; // Don't modify state here, just capture
    });

    if (documentIdsToApprove.length === 0) return;

    const count = documentIdsToApprove.length; // Capture count for toast messages
    toast.loading(`${count} documenten goedkeuren...`);

    try {
      await Promise.all(
        documentIdsToApprove.map(id => wizardService.updateDocumentAcceptance(id, true))
      );

      setDocuments(prev => prev.map(doc => {
        const docId = getDocumentId(doc);
        if (docId && documentIdsToApprove.includes(docId)) {
          return {
            ...doc,
            reviewStatus: 'approved' as const,
          } as LightweightDocument;
        }
        return doc;
      }));

      setSelectedDocuments(() => []);

      // Save draft after bulk approve
      saveDraft();

      toast.success(
        'Documenten goedgekeurd',
        `${count} document${count !== 1 ? 'en' : ''} ${count === 1 ? 'is' : 'zijn'} goedgekeurd.`
      );
    } catch (error) {
      logError(error as Error, 'bulk-approve-documents');
      const errorInfo = getOperationErrorMessage('update-document', error);
      toast.error(
        errorInfo.title,
        `${errorInfo.message} ${errorInfo.action || ''}`
      );
    }
  }, [setDocuments, setSelectedDocuments, saveDraft]);

  /**
   * Bulk reject selected documents
   */
  const handleBulkReject = useCallback(async () => {
    // Capture selectedDocuments before async operations to prevent stale closure
    let documentIdsToReject: string[] = [];
    setSelectedDocuments(prev => {
      documentIdsToReject = [...prev];
      return prev; // Don't modify state here, just capture
    });

    if (documentIdsToReject.length === 0) return;

    const count = documentIdsToReject.length; // Capture count for toast messages
    toast.loading(`${count} documenten afkeuren...`);

    try {
      await Promise.all(
        documentIdsToReject.map(id => wizardService.updateDocumentAcceptance(id, false))
      );

      setDocuments(prev => prev.map(doc => {
        const docId = getDocumentId(doc);
        if (docId && documentIdsToReject.includes(docId)) {
          return {
            ...doc,
            reviewStatus: 'rejected' as const,
          } as LightweightDocument;
        }
        return doc;
      }));

      setSelectedDocuments(() => []);

      // Save draft after bulk reject
      saveDraft();

      toast.success(
        'Documenten afgekeurd',
        `${count} document${count !== 1 ? 'en' : ''} ${count === 1 ? 'is' : 'zijn'} afgekeurd.`
      );
    } catch (error) {
      logError(error as Error, 'bulk-reject-documents');
      const errorInfo = getOperationErrorMessage('update-document', error);
      toast.error(
        errorInfo.title,
        `${errorInfo.message} ${errorInfo.action || ''}`
      );
    }
  }, [setDocuments, setSelectedDocuments, saveDraft]);

  return {
    handleStatusChange,
    toggleDocumentSelection,
    handleSelectAllDocuments,
    handleBulkApprove,
    handleBulkReject,
  };
}

