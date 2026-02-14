interface DraftBannerProps {
    hasDraft: boolean;
    lastDraftSavedAt: string | null;
    lastDraftSummary?: {
        step: number;
        selectedWebsites: number;
        documents: number;
    } | null;
    onRestoreDraft: () => void;
    onDiscardDraft: () => void;
    loadDraftFromStorage: () => unknown;
}
export declare function DraftBanner({ hasDraft, lastDraftSavedAt, lastDraftSummary, onRestoreDraft, onDiscardDraft, loadDraftFromStorage, }: DraftBannerProps): import("react/jsx-runtime").JSX.Element | null;
export {};
