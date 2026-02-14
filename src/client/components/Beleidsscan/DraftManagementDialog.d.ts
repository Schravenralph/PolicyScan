/**
 * Draft Management Dialog Component
 *
 * Consolidated dialog that handles both draft restoration and reconciliation
 * in a single, clean user experience.
 */
import type { ReconciliationResult } from '../../services/draftReconciliation.js';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence.js';
interface DraftManagementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pendingDraft: BeleidsscanDraft | null;
    showRestorePrompt: boolean;
    overheidslagen: Array<{
        id: string;
        label: string;
    }>;
    onRestore: () => void;
    onDiscard: () => void;
    reconciliationResult: ReconciliationResult | null;
    onUseClient: () => void;
    onUseServer: () => void;
    onMerge: () => void;
    onIgnore?: () => void;
    onStartFresh?: () => void;
    formatTimestamp: (timestamp?: string | null) => string | null;
}
export declare function DraftManagementDialog({ open, onOpenChange, pendingDraft, showRestorePrompt, overheidslagen, onRestore, onDiscard, reconciliationResult, onUseClient, onUseServer, onMerge, onIgnore, onStartFresh, formatTimestamp, }: DraftManagementDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
