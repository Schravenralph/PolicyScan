interface BeleidsscanHeaderProps {
    currentStep: number;
    queryId: string | null;
    isEditingCompletedSet: boolean;
    originalQueryId: string | null;
    hasDraft: boolean;
    lastDraftSavedAt: string | null;
    onBack: () => void;
    onShowPreviousSets: () => void;
    onSaveDraft: () => void;
    onFinalizeDraft: () => void;
    onUpdateCompletedSet: () => void;
    onDuplicateCompletedSet: () => void;
    onDiscardLoadedSet: () => void;
    onStartFresh?: () => void;
    onShowHelp?: () => void;
    formatDraftTimestamp: (timestamp?: string | null) => string | null;
}
declare function BeleidsscanHeaderComponent({ currentStep, queryId, isEditingCompletedSet, originalQueryId, hasDraft, lastDraftSavedAt, onBack, onShowPreviousSets, onSaveDraft, onFinalizeDraft, onUpdateCompletedSet, onDuplicateCompletedSet, onDiscardLoadedSet, onStartFresh, onShowHelp, formatDraftTimestamp, }: BeleidsscanHeaderProps): import("react/jsx-runtime").JSX.Element;
export declare const BeleidsscanHeader: import("react").MemoExoticComponent<typeof BeleidsscanHeaderComponent>;
export {};
