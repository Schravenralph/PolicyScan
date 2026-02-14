/**
 * BeleidsscanModals Component
 * 
 * Consolidated modal component that manages all modals and dialogs
 * used in the Beleidsscan wizard.
 */

import React from 'react';
import { useBeleidsscan } from '../../context/BeleidsscanContext';
import { beleidsscanActions } from '../../reducers/beleidsscanReducer';
import { PreviousSetsDialog } from './PreviousSetsDialog';
import { WorkflowImportModal } from './WorkflowImportModal';
import { GraphVisualizerModal } from './GraphVisualizerModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { ApiKeysErrorDialog } from './ApiKeysErrorDialog';
import { DraftRestorePromptDialog } from './DraftRestorePromptDialog';
import { FilterPresetDialog } from './FilterPresetDialog';
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
  workflowOutput: any; // WorkflowOutput type
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
  overheidslagen: Array<{ id: string; label: string }>;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  formatDraftTimestamp: (timestamp?: string | null) => string | null;
  apiKeysError: any; // ApiKeysError type
  onUseMockSuggestions: () => void;
}

export function BeleidsscanModals({
  onLoadCompletedSet,
  availableWorkflowOutputs,
  selectedWorkflowOutput,
  workflowOutput,
  isLoadingWorkflowOutputs,
  isImportingWorkflow,
  onSelectWorkflowOutput,
  onImportWorkflowResults,
  onLoadWorkflowOutputs,
  onCloseWorkflowImport,
  currentFilters,
  onSaveFilterPreset,
  onStatusChange,
  showDraftRestorePrompt,
  setShowDraftRestorePrompt,
  pendingDraft,
  overheidslagen,
  onRestoreDraft,
  onDiscardDraft,
  formatDraftTimestamp,
  apiKeysError,
  onUseMockSuggestions,
}: BeleidsscanModalsProps) {
  const { state, dispatch, queryConfig } = useBeleidsscan();
  const { queryId } = queryConfig;

  return (
    <>
      {/* Previous Sets Dialog */}
      <PreviousSetsDialog
        isOpen={state.showPreviousSets}
        onClose={() => dispatch(beleidsscanActions.setShowPreviousSets(false))}
        onSelectSet={onLoadCompletedSet}
      />

      {/* Workflow Import Modal */}
      <WorkflowImportModal
        isOpen={state.showWorkflowImport}
        onClose={onCloseWorkflowImport}
        availableOutputs={availableWorkflowOutputs}
        selectedOutput={selectedWorkflowOutput}
        workflowOutput={workflowOutput}
        isLoading={isLoadingWorkflowOutputs}
        isImporting={isImportingWorkflow}
        onSelectOutput={onSelectWorkflowOutput}
        onImport={onImportWorkflowResults}
        onLoadOutputs={onLoadWorkflowOutputs}
      />

      {/* Graph Visualizer Modal */}
      <GraphVisualizerModal
        isOpen={state.showGraphVisualizer}
        scrapingRunId={state.scrapingRunId}
        queryId={queryId}
        onClose={() => {
          dispatch(beleidsscanActions.setShowGraphVisualizer(false));
          dispatch(beleidsscanActions.setScrapingRunId(null));
        }}
      />

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={state.showDocumentPreview}
        onClose={() => dispatch(beleidsscanActions.setShowDocumentPreview(false))}
        document={state.previewDocument}
        onStatusChange={onStatusChange}
      />

      {/* API Keys Error Dialog */}
      <ApiKeysErrorDialog
        isOpen={state.showApiKeysError}
        onOpenChange={(open) => dispatch(beleidsscanActions.setShowApiKeysError(open))}
        apiKeysError={apiKeysError}
        onUseMockSuggestions={onUseMockSuggestions}
      />

      {/* Draft Restore Prompt Dialog */}
      <DraftRestorePromptDialog
        isOpen={showDraftRestorePrompt}
        onOpenChange={setShowDraftRestorePrompt}
        pendingDraft={pendingDraft}
        overheidslagen={overheidslagen}
        onRestore={onRestoreDraft}
        onDiscard={onDiscardDraft}
        formatDraftTimestamp={formatDraftTimestamp}
      />

      {/* Filter Preset Dialog */}
      <FilterPresetDialog
        isOpen={state.showPresetDialog}
        onClose={() => dispatch(beleidsscanActions.setShowPresetDialog(false))}
        presetName={state.presetName}
        onPresetNameChange={(name) => dispatch(beleidsscanActions.setPresetName(name))}
        currentFilters={currentFilters}
        onSave={onSaveFilterPreset}
      />
    </>
  );
}
