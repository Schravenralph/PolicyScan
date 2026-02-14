/**
 * FeatureFlagDraftModeControls Component
 *
 * Handles draft mode UI and controls for feature flags.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
export interface FeatureFlagDraftModeControlsProps {
    draftMode: boolean;
    savingDraft: boolean;
    hasPendingChanges: boolean;
    pendingChangesCount: number;
    onEnableDraftMode: () => void;
    onCancelDraftMode: () => void;
    onSaveDraftChanges: () => Promise<void>;
    onSaveAsTemplate: () => void;
}
/**
 * Draft mode controls component for feature flags
 */
export declare function FeatureFlagDraftModeControls({ draftMode, savingDraft, hasPendingChanges, pendingChangesCount, onEnableDraftMode, onCancelDraftMode, onSaveDraftChanges, onSaveAsTemplate, }: FeatureFlagDraftModeControlsProps): import("react/jsx-runtime").JSX.Element;
