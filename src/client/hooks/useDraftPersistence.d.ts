export interface BeleidsscanDraft {
    overheidslaag?: string | null;
    selectedEntity?: string;
    onderwerp?: string;
    queryId?: string | null;
    selectedWebsites?: string[];
    websiteSearchQuery?: string;
    websiteSortBy?: 'relevance' | 'name' | 'type';
    websiteFilterType?: string | null;
    documents?: unknown[];
    documentFilter?: 'all' | 'pending' | 'approved' | 'rejected';
    documentSortBy?: 'relevance' | 'date' | 'title' | 'website';
    documentSortDirection?: 'asc' | 'desc';
    documentSearchQuery?: string;
    documentTypeFilter?: string | null;
    documentDateFilter?: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter?: string | null;
    selectedDocuments?: string[];
    step?: number;
    scrollPositions?: Record<number, number>;
    timestamp?: string;
}
export interface DraftSummary {
    step: number;
    selectedWebsites: number;
    documents: number;
}
export interface UseDraftPersistenceOptions {
    autoSaveDelay?: number;
    onDraftLoaded?: (draft: BeleidsscanDraft) => void;
    showManualSaveToast?: boolean;
}
export interface UseDraftPersistenceReturn {
    draftExists: boolean;
    lastDraftSavedAt: string | null;
    lastDraftSummary: DraftSummary | null;
    pendingDraft: BeleidsscanDraft | null;
    showDraftRestorePrompt: boolean;
    hasDraft: boolean;
    saveDraft: () => void;
    saveDraftSync: () => void;
    loadDraft: () => BeleidsscanDraft | null;
    discardDraft: () => void;
    clearDraft: () => void;
    restoreDraft: () => void;
    setShowDraftRestorePrompt: (show: boolean) => void;
    setPendingDraft: (draft: BeleidsscanDraft | null) => void;
}
/**
 * Custom hook for managing draft persistence in Beleidsscan component
 * Handles saving, loading, and restoring drafts from localStorage
 */
export declare function useDraftPersistence(draftState: BeleidsscanDraft, options?: UseDraftPersistenceOptions): UseDraftPersistenceReturn;
