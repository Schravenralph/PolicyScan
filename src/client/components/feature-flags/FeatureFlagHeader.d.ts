interface FeatureFlagHeaderProps {
    bulkEditMode: boolean;
    draftMode: boolean;
    databaseFlagsCount: number;
    savingDraft: boolean;
    refreshing: boolean;
    hasPendingChanges: boolean;
    pendingChangesCount: number;
    onNavigateToTemplates: () => void;
    onSaveTemplate: () => void;
    onEnableDraftMode: () => void;
    onStartBulkEdit: () => void;
    onCancelDraftMode: () => void;
    onSaveDraftChanges: () => void;
    onRefreshCache: () => void;
}
export declare function FeatureFlagHeader({ bulkEditMode, draftMode, databaseFlagsCount, savingDraft, refreshing, hasPendingChanges, pendingChangesCount, onNavigateToTemplates, onSaveTemplate, onEnableDraftMode, onStartBulkEdit, onCancelDraftMode, onSaveDraftChanges, onRefreshCache, }: FeatureFlagHeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
