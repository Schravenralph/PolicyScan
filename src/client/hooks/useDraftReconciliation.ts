/**
 * Hook for managing draft reconciliation handlers
 * Extracted from Beleidsscan component to reduce component size
 */

import { useCallback } from 'react';
import { mergeDraftStates, type ServerSessionState } from '../services/draftReconciliation.js';
import type { BeleidsscanDraft } from './useDraftPersistence.js';
import type { ReconciliationResult } from '../services/draftReconciliation.js';

interface UseDraftReconciliationProps {
  pendingDraft: BeleidsscanDraft | null;
  serverSessionState: ServerSessionState | null;
  reconciliationResult: ReconciliationResult | null;
  handleDraftRestore: (draft: BeleidsscanDraft) => void;
  saveDraftToStorage: () => void;
  setShowReconciliationDialog: (show: boolean) => void;
  setReconciliationResult?: (result: ReconciliationResult | null) => void;
  onIgnoreConflict?: () => Promise<void>;
}

/**
 * Hook for managing draft reconciliation handlers
 * Provides handlers for client draft, server state, and merge actions
 */
export function useDraftReconciliation({
  pendingDraft,
  serverSessionState,
  reconciliationResult,
  handleDraftRestore,
  saveDraftToStorage,
  setShowReconciliationDialog,
  setReconciliationResult,
  onIgnoreConflict,
}: UseDraftReconciliationProps) {
  const handleUseClientDraft = useCallback(() => {
    if (!pendingDraft) return;
    // Client draft is already loaded, just close dialog
    // Clear reconciliation result since conflict is resolved
    if (setReconciliationResult) {
      setReconciliationResult(null);
    }
    setShowReconciliationDialog(false);
  }, [pendingDraft, setShowReconciliationDialog, setReconciliationResult]);

  const handleUseServerState = useCallback(() => {
    if (!serverSessionState || !pendingDraft) return;
    
    // Merge server state into draft (prefer server)
    const mergedDraft = mergeDraftStates(pendingDraft, serverSessionState, true);
    
    if (mergedDraft) {
      // Restore merged draft
      handleDraftRestore(mergedDraft);
      // Save merged draft to localStorage
      saveDraftToStorage();
    }
    
    // Clear reconciliation result since conflict is resolved
    if (setReconciliationResult) {
      setReconciliationResult(null);
    }
    setShowReconciliationDialog(false);
  }, [serverSessionState, pendingDraft, handleDraftRestore, saveDraftToStorage, setShowReconciliationDialog, setReconciliationResult]);

  const handleMergeDrafts = useCallback(() => {
    if (!serverSessionState || !pendingDraft || !reconciliationResult) return;
    
    // Merge with preference for newer timestamp
    const preferServer = reconciliationResult.serverNewer;
    const mergedDraft = mergeDraftStates(pendingDraft, serverSessionState, preferServer);
    
    if (mergedDraft) {
      // Restore merged draft
      handleDraftRestore(mergedDraft);
      // Save merged draft to localStorage
      saveDraftToStorage();
    }
    
    // Clear reconciliation result since conflict is resolved
    if (setReconciliationResult) {
      setReconciliationResult(null);
    }
    setShowReconciliationDialog(false);
  }, [serverSessionState, pendingDraft, reconciliationResult, handleDraftRestore, saveDraftToStorage, setShowReconciliationDialog, setReconciliationResult]);

  const handleIgnoreConflict = useCallback(async () => {
    // Clear local draft to start fresh
    if (onIgnoreConflict) {
      await onIgnoreConflict();
    }
    setShowReconciliationDialog(false);
  }, [onIgnoreConflict, setShowReconciliationDialog]);

  return {
    handleUseClientDraft,
    handleUseServerState,
    handleMergeDrafts,
    handleIgnoreConflict,
  };
}

