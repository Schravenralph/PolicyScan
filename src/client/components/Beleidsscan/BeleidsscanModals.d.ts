/**
 * BeleidsscanModals Component
 *
 * Consolidated modal component that manages all modals and dialogs
 * used in the Beleidsscan wizard.
 */
import type { QueryData } from '../../services/api';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence';
import type { FilterPreset } from '../../hooks/useFilterPresets';
export interface WorkflowOutputSummary {
    name: string;
    createdAt: Date | string;
}
export interface BeleidsscanModalsProps {
    onLoadCompletedSet: (query: QueryData) => void;
    availableWorkflowOutputs: WorkflowOutputSummary[];
    selectedWorkflowOutput: string | null;
    workflowOutput: any;
    isLoadingWorkflowOutputs: boolean;
    isImportingWorkflow: boolean;
    onSelectWorkflowOutput: (outputName: string) => void;
    onImportWorkflowResults: () => void;
    onLoadWorkflowOutputs: () => void;
    onCloseWorkflowImport: () => void;
    currentFilters: {
        documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
        documentTypeFilter: string | null;
        documentDateFilter: 'all' | 'week' | 'month' | 'year';
        documentWebsiteFilter: string | null;
        documentSearchQuery: string;
    };
    onSaveFilterPreset: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
    onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
    showDraftRestorePrompt: boolean;
    setShowDraftRestorePrompt: (show: boolean) => void;
    pendingDraft: BeleidsscanDraft | null;
    overheidslagen: Array<{
        id: string;
        label: string;
    }>;
    onRestoreDraft: () => void;
    onDiscardDraft: () => void;
    formatDraftTimestamp: (timestamp?: string | null) => string | null;
    apiKeysError: any;
    onUseMockSuggestions: () => void;
}
export declare function BeleidsscanModals({ onLoadCompletedSet, availableWorkflowOutputs, selectedWorkflowOutput, workflowOutput, isLoadingWorkflowOutputs, isImportingWorkflow, onSelectWorkflowOutput, onImportWorkflowResults, onLoadWorkflowOutputs, onCloseWorkflowImport, currentFilters, onSaveFilterPreset, onStatusChange, showDraftRestorePrompt, setShowDraftRestorePrompt, pendingDraft, overheidslagen, onRestoreDraft, onDiscardDraft, formatDraftTimestamp, apiKeysError, onUseMockSuggestions, }: BeleidsscanModalsProps): import("react/jsx-runtime").JSX.Element;
