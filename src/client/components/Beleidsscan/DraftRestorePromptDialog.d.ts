import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence';
interface DraftRestorePromptDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    pendingDraft: BeleidsscanDraft | null;
    overheidslagen: Array<{
        id: string;
        label: string;
    }>;
    onRestore: () => void;
    onDiscard: () => void;
    formatDraftTimestamp: (timestamp?: string | null) => string | null;
}
export declare function DraftRestorePromptDialog({ isOpen, onOpenChange, pendingDraft, overheidslagen, onRestore, onDiscard, formatDraftTimestamp, }: DraftRestorePromptDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
