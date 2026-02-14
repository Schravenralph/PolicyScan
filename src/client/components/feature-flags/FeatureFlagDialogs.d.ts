/**
 * FeatureFlagDialogs Component
 *
 * Consolidates all dialogs used in FeatureFlagsPage.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
import type { FeatureFlagTemplate } from '../../types/featureFlags.js';
export interface FeatureFlagDialogsProps {
    showSaveTemplateDialog: boolean;
    onSaveTemplateDialogChange: (open: boolean) => void;
    newTemplateName: string;
    onNewTemplateNameChange: (name: string) => void;
    newTemplateDescription: string;
    onNewTemplateDescriptionChange: (description: string) => void;
    newTemplateIsPublic: boolean;
    onNewTemplateIsPublicChange: (isPublic: boolean) => void;
    savingTemplate: boolean;
    onSaveTemplate: () => void;
    showTemplatePreview: string | null;
    onTemplatePreviewChange: (templateId: string | null) => void;
    templates: FeatureFlagTemplate[];
    getTemplateDifferences: (templateFlags: Record<string, boolean>) => Array<{
        flag: string;
        current: boolean;
        template: boolean;
    }>;
    applyingTemplate: string | null;
    onApplyTemplate: (templateId: string, templateName: string) => void;
    showCancelDraftDialog: boolean;
    onCancelDraftDialogChange: (open: boolean) => void;
    pendingChangesCount: number;
    onConfirmCancelDraft: () => void;
    showDeleteTemplateDialog: boolean;
    onDeleteTemplateDialogChange: (open: boolean) => void;
    templateToDelete: {
        id: string;
        name: string;
    } | null;
    onConfirmDeleteTemplate: () => void;
}
/**
 * Consolidated dialogs component for Feature Flags page
 */
export declare function FeatureFlagDialogs({ showSaveTemplateDialog, onSaveTemplateDialogChange, newTemplateName, onNewTemplateNameChange, newTemplateDescription, onNewTemplateDescriptionChange, newTemplateIsPublic, onNewTemplateIsPublicChange, savingTemplate, onSaveTemplate, showTemplatePreview, onTemplatePreviewChange, templates, getTemplateDifferences, applyingTemplate, onApplyTemplate, showCancelDraftDialog, onCancelDraftDialogChange, pendingChangesCount, onConfirmCancelDraft, showDeleteTemplateDialog, onDeleteTemplateDialogChange, templateToDelete, onConfirmDeleteTemplate, }: FeatureFlagDialogsProps): import("react/jsx-runtime").JSX.Element;
