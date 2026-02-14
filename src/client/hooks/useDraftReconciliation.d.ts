/**
 * Hook for managing draft reconciliation handlers
 * Extracted from Beleidsscan component to reduce component size
 */
import { type ServerSessionState } from '../services/draftReconciliation.js';
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
export declare function useDraftReconciliation({ pendingDraft, serverSessionState, reconciliationResult, handleDraftRestore, saveDraftToStorage, setShowReconciliationDialog, setReconciliationResult, onIgnoreConflict, }: UseDraftReconciliationProps): {
    handleUseClientDraft: () => void;
    handleUseServerState: () => void;
    handleMergeDrafts: () => void;
    handleIgnoreConflict: () => Promise<void>;
};
export {};
