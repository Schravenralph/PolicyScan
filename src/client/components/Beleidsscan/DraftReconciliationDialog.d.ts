/**
 * Draft Reconciliation Dialog Component
 *
 * Dialog for resolving divergences between client-side draft
 * and server-side session state.
 */
import type { ReconciliationResult } from '../../services/draftReconciliation.js';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence.js';
interface DraftReconciliationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reconciliationResult: ReconciliationResult;
    clientDraft: BeleidsscanDraft | null;
    onUseClient: () => void;
    onUseServer: () => void;
    onMerge: () => void;
    onIgnore?: () => void;
    formatTimestamp: (timestamp?: string | null) => string | null;
}
export declare function DraftReconciliationDialog({ open, onOpenChange, reconciliationResult, clientDraft, onUseClient, onUseServer, onMerge, onIgnore, formatTimestamp, }: DraftReconciliationDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
