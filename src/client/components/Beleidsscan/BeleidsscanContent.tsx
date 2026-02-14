/**
 * BeleidsscanContent Component
 * 
 * Handles the JSX rendering for the Beleidsscan wizard.
 * Extracted from Beleidsscan.tsx to reduce component size.
 * 
 * Performance optimizations:
 * - Lazy loading of step components to reduce initial bundle size
 * - Pre-loading of next step components in background
 * - Error boundaries for all lazy-loaded steps (graceful error handling)
 * - Suspense boundaries with StepLoader fallback for smooth transitions
 */

import { lazy, Suspense, useEffect, useRef } from 'react';
import { StepLoader } from './StepLoader';
import { StepNavigation } from './StepNavigation';
import { Breadcrumb } from './Breadcrumb';

// Lazy load step components to reduce initial bundle size and prevent forced reflow
const Step1QueryConfiguration = lazy(() => import('./Step1QueryConfiguration').then(m => ({ default: m.Step1QueryConfiguration })));
const Step2WebsiteSelection = lazy(() => import('./Step2WebsiteSelection').then(m => ({ default: m.Step2WebsiteSelection })));
const Step3DocumentReview = lazy(() => import('./Step3DocumentReview').then(m => ({ default: m.Step3DocumentReview })));

// Lazy load modal components to further reduce initial bundle size (~3080 lines of modal code)
const DraftManagementDialog = lazy(() => import('./DraftManagementDialog').then(m => ({ default: m.DraftManagementDialog })));
const WorkflowImportModal = lazy(() => import('./WorkflowImportModal').then(m => ({ default: m.WorkflowImportModal })));
const FilterPresetDialog = lazy(() => import('./FilterPresetDialog').then(m => ({ default: m.FilterPresetDialog })));
const DocumentPreviewModal = lazy(() => import('./DocumentPreviewModal').then(m => ({ default: m.DocumentPreviewModal })));
const PreviousSetsDialog = lazy(() => import('./PreviousSetsDialog').then(m => ({ default: m.PreviousSetsDialog })));
const ApiKeysErrorDialog = lazy(() => import('./ApiKeysErrorDialog').then(m => ({ default: m.ApiKeysErrorDialog })));
const GraphVisualizerModal = lazy(() => import('./GraphVisualizerModal').then(m => ({ default: m.GraphVisualizerModal })));
const ConsolidatedHelpDialog = lazy(() => import('./ConsolidatedHelpDialog').then(m => ({ default: m.ConsolidatedHelpDialog })));

// Import UnifiedWorkflowLogs for workflow panel (not lazy loaded - used conditionally)
import { UnifiedWorkflowLogs } from '../workflow/UnifiedWorkflowLogs';
import { DocumentSourcesPanel } from '../workflow/DocumentSourcesPanel';
import { useRunLogs } from '../../hooks/useRunLogs';

import { DraftBanner } from './DraftBanner';
import { BeleidsscanHeader } from './BeleidsscanHeader';
import { DraftStatusIndicator } from './DraftStatusIndicator';
import { BeleidsscanErrorBoundary } from './BeleidsscanErrorBoundary';
import { useBeleidsscan } from '../../context/BeleidsscanContext';
import { beleidsscanActions } from '../../reducers/beleidsscanReducer';
import type { BronWebsite, QueryData, WorkflowOutput, CanonicalDocument } from '../../services/api';
import type { BronDocument } from '../../utils/transformations';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import type { BeleidsscanDraft, DraftSummary } from '../../hooks/useDraftPersistence';
import type { ReconciliationResult } from '../../services/draftReconciliation';
import type { FilterPreset } from '../../hooks/useFilterPresets';
import type { OverheidslaagConfig } from './constants';
import type { DocumentCounts, WebsiteInfo } from './utils';
import type { DocumentFilter, DocumentSortBy, DocumentDateFilter } from '../../hooks/useDocumentFiltering';
import { t } from '../../utils/i18n';

// Document type that can be either CanonicalDocument, LightweightDocument or BronDocument (during migration)
type Document = CanonicalDocument | LightweightDocument | BronDocument;

interface BeleidsscanContentProps {
  // State
  currentStep: number;
  queryId: string | null | undefined;
  isEditingCompletedSet: boolean;
  originalQueryId: string | null | undefined;
  hasDraft: boolean;
  lastDraftSavedAt: string | null;
  lastDraftSummary: DraftSummary | null;
  showReconciliationDialog: boolean;
  reconciliationResult: ReconciliationResult | null;
  pendingDraft: BeleidsscanDraft | null;
  
  // Data
  overheidslagen: OverheidslaagConfig[];
  gemeenten: string[];
  waterschappen: string[];
  provincies: string[];
  rijksorganisaties: string[];
  isLoadingJurisdictions: boolean;
  suggestedWebsites: BronWebsite[];
  isScrapingWebsites: boolean;
  scrapingProgress: number;
  scrapingStatus: string;
  scrapingDocumentsFound: number;
  scrapingEstimatedTime: number | null;
  filteredDocuments: Document[];
  documentFilter: DocumentFilter;
  documentSortBy: DocumentSortBy;
  documentSortDirection: 'asc' | 'desc';
  documentSearchQuery: string;
  debouncedDocumentSearchQuery: string;
  documentTypeFilter: string | null;
  documentDateFilter: DocumentDateFilter;
  documentWebsiteFilter: string | null;
  uniqueDocumentTypes: string[];
  uniqueDocumentWebsites: WebsiteInfo[];
  documentCounts: DocumentCounts;
  filterPresets: FilterPreset[];
  
  // Progress/Status
  isLoadingWebsites: boolean;
  websiteGenerationProgress: number;
  websiteGenerationStatus: string;
  websiteGenerationEstimatedTime: number | undefined;
  websiteSuggestionsError: Error | null;
  
  // Handlers
  onBack: () => void;
  setShowReconciliationDialog: (show: boolean) => void;
  handleGenerateWebsites: () => Promise<void>;
  handleSelectAllWebsites: () => void;
  handleScrapeWebsites: () => Promise<void>;
  handleStepNavigation: (step: number) => Promise<void>;
  handleRestoreDraft: () => void;
  handleDiscardDraft: () => void;
  handleStartFresh?: () => void;
  handleFinalizeDraft: () => void;
  handleUpdateCompletedSet: () => void;
  handleDuplicateCompletedSet: () => void;
  handleDiscardLoadedSet: () => void;
  handleSelectAllDocuments: () => void;
  handleStatusChange: (documentId: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
  handleBulkApprove: () => Promise<void>;
  handleBulkReject: () => Promise<void>;
  handleExportDocuments: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => Promise<void>;
  handlePreviewDocument: (document: CanonicalDocument | LightweightDocument) => void;
  handleOpenWorkflowImport: () => void;
  handleUseClientDraft: () => void;
  handleUseServerState: () => void;
  handleMergeDrafts: () => void;
  handleIgnoreConflict?: () => Promise<void>;
  handleLoadCompletedSet: (query: QueryData) => Promise<void>;
  clearWebsiteSuggestionsError: () => void;
  cancelWebsiteGeneration: () => void;
  saveDraftToStorage: () => void;
  loadDraftFromStorage: () => BeleidsscanDraft | null;
  restoreDraft: () => void;
  saveFilterPreset: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
  deleteFilterPreset: (id: string) => void;
  setDocumentFilter: (filter: DocumentFilter) => void;
  setDocumentSortBy: (sortBy: DocumentSortBy) => void;
  setDocumentSortDirection: (direction: 'asc' | 'desc') => void;
  setDocumentSearchQuery: (query: string) => void;
  setDocumentTypeFilter: (filter: string | null) => void;
  setDocumentDateFilter: (filter: DocumentDateFilter) => void;
  setDocumentWebsiteFilter: (filter: string | null) => void;
  setShowPreviousSets: (show: boolean) => void;
  getCharacterCounterColor: () => string;
  formatDraftTimestamp: (timestamp?: string | null) => string | null;
  
  // Workflow import modal props
  availableWorkflowOutputs: Array<{ name: string; createdAt: string }>;
  selectedWorkflowOutput: string | null;
  workflowOutput: WorkflowOutput | null;
  isLoadingWorkflowOutputs: boolean;
  isImportingWorkflow: boolean;
  onSelectWorkflowOutput: (outputId: string) => Promise<void>;
  onImportWorkflowResults: () => Promise<void>;
  onLoadWorkflowOutputs: () => Promise<void>;
  onCloseWorkflowImport: () => void;
  
  // Draft restore prompt props
  showDraftRestorePrompt: boolean;
  setShowDraftRestorePrompt: (show: boolean) => void;
  
  // API keys error props
  apiKeysError: { message: string; missingKeys?: { openai?: boolean; google?: boolean }; canUseMock?: boolean } | null;
  onUseMockSuggestions: () => void;
  
  // Refs
  documentsLoadAttemptedRef: React.MutableRefObject<Map<string, number>>;
  
  // Wizard session
  wizardSession: any;
}

export function BeleidsscanContent({
  currentStep,
  queryId,
  isEditingCompletedSet,
  originalQueryId,
  hasDraft,
  lastDraftSavedAt,
  lastDraftSummary,
  showReconciliationDialog,
  reconciliationResult,
  pendingDraft,
  overheidslagen,
  gemeenten,
  waterschappen,
  provincies,
  rijksorganisaties,
  isLoadingJurisdictions,
  suggestedWebsites,
  isScrapingWebsites,
  scrapingProgress,
  scrapingStatus,
  scrapingDocumentsFound,
  scrapingEstimatedTime,
  filteredDocuments,
  documentFilter,
  documentSortBy,
  documentSortDirection,
  documentSearchQuery,
  debouncedDocumentSearchQuery,
  documentTypeFilter,
  documentDateFilter,
  documentWebsiteFilter,
  uniqueDocumentTypes,
  uniqueDocumentWebsites,
  documentCounts,
  filterPresets,
  isLoadingWebsites,
  websiteGenerationProgress,
  websiteGenerationStatus,
  websiteGenerationEstimatedTime,
  websiteSuggestionsError,
  onBack,
  setShowReconciliationDialog,
  handleGenerateWebsites,
  handleSelectAllWebsites,
  handleScrapeWebsites,
  handleStepNavigation,
  handleRestoreDraft,
  handleDiscardDraft,
  handleStartFresh,
  handleFinalizeDraft,
  handleUpdateCompletedSet,
  handleDuplicateCompletedSet,
  handleDiscardLoadedSet,
  handleSelectAllDocuments,
  handleStatusChange,
  handleBulkApprove,
  handleBulkReject,
  handleExportDocuments,
  handlePreviewDocument,
  handleOpenWorkflowImport,
  handleUseClientDraft,
  handleUseServerState,
  handleMergeDrafts,
  handleIgnoreConflict,
  handleLoadCompletedSet,
  clearWebsiteSuggestionsError,
  cancelWebsiteGeneration,
  saveDraftToStorage,
  loadDraftFromStorage,
  restoreDraft,
  saveFilterPreset,
  deleteFilterPreset,
  setDocumentFilter,
  setDocumentSortBy,
  setDocumentSortDirection,
  setDocumentSearchQuery,
  setDocumentTypeFilter,
  setDocumentDateFilter,
  setDocumentWebsiteFilter,
  setShowPreviousSets,
  getCharacterCounterColor,
  formatDraftTimestamp,
  availableWorkflowOutputs,
  selectedWorkflowOutput,
  workflowOutput,
  isLoadingWorkflowOutputs,
  isImportingWorkflow,
  onSelectWorkflowOutput,
  onImportWorkflowResults,
  onLoadWorkflowOutputs,
  onCloseWorkflowImport,
  showDraftRestorePrompt,
  setShowDraftRestorePrompt,
  apiKeysError,
  onUseMockSuggestions,
  documentsLoadAttemptedRef,
  wizardSession,
}: BeleidsscanContentProps) {
  const { state, dispatch, actions } = useBeleidsscan();
  
  // Get workflow run status to determine if workflow is running
  const { status: workflowRunStatus } = useRunLogs({
    runId: state.workflowRunId || null,
    pollDelay: 3000,
    autoClearOnComplete: false,
  });
  
  // Determine if workflow is running (for DocumentSourcesPanel)
  const isWorkflowRunning = workflowRunStatus === 'running' || workflowRunStatus === 'pending';
  
  // Pre-load next step component in background to reduce perceived latency
  const nextStepRef = useRef<number | null>(null);
  useEffect(() => {
    // Pre-load next step when current step changes
    const nextStep = currentStep < 3 ? currentStep + 1 : null;
    if (nextStep && nextStep !== nextStepRef.current) {
      nextStepRef.current = nextStep;
      // Use requestIdleCallback for low-priority pre-loading
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          switch (nextStep) {
            case 2:
              import('./Step2WebsiteSelection');
              break;
            case 3:
              import('./Step3DocumentReview');
              break;
          }
        }, { timeout: 2000 });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          switch (nextStep) {
            case 2:
              import('./Step2WebsiteSelection');
              break;
            case 3:
              import('./Step3DocumentReview');
              break;
          }
        }, 100);
      }
    }
  }, [currentStep]);
  
  // Prepare current filters for FilterPresetDialog
  const currentFilters = {
    documentFilter: documentFilter || 'all',
    documentTypeFilter: documentTypeFilter || null,
    documentDateFilter: documentDateFilter || 'all',
    documentWebsiteFilter: documentWebsiteFilter || null,
    documentSearchQuery,
  };
  
  return (
    <>
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-3 focus:bg-primary focus:text-primary-foreground focus:rounded-br focus:font-medium focus:shadow-lg"
        aria-label={t('common.skipToMainContent')}
      >
        {t('common.skipToMainContent')}
      </a>

      {/* Header */}
      <BeleidsscanHeader
        currentStep={currentStep}
        queryId={queryId ?? null}
        isEditingCompletedSet={isEditingCompletedSet}
        originalQueryId={originalQueryId ?? null}
        hasDraft={hasDraft}
        lastDraftSavedAt={lastDraftSavedAt}
        onBack={onBack}
        onShowPreviousSets={() => setShowPreviousSets(true)}
        onSaveDraft={saveDraftToStorage}
        onFinalizeDraft={handleFinalizeDraft}
        onUpdateCompletedSet={handleUpdateCompletedSet}
        onDuplicateCompletedSet={handleDuplicateCompletedSet}
        onDiscardLoadedSet={handleDiscardLoadedSet}
        onStartFresh={handleStartFresh}
        onShowHelp={() => dispatch(actions.setShowHelp(true))}
        formatDraftTimestamp={formatDraftTimestamp}
      />

      {/* Main Content */}
      <main className="min-h-screen bg-background" aria-label={t('beleidsscanContent.application')} id="main-content">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-5xl mx-auto">
            <Breadcrumb
              currentStep={currentStep}
              onStepClick={handleStepNavigation}
              onHomeClick={onBack}
              wizardSession={wizardSession}
            />

            {/* Title */}
            <header className="mb-12">
              <h1 className="text-5xl mb-4 font-serif font-extrabold text-foreground">
                {t('beleidsscanContent.title')}
              </h1>
              <p className="text-xl text-muted-foreground" role="doc-subtitle">
                {t('beleidsscanContent.subtitle')}
              </p>
            </header>

            <DraftBanner
              hasDraft={hasDraft}
              lastDraftSavedAt={lastDraftSavedAt}
              lastDraftSummary={lastDraftSummary}
              onRestoreDraft={handleRestoreDraft}
              onDiscardDraft={handleDiscardDraft}
              loadDraftFromStorage={loadDraftFromStorage}
            />

            <StepNavigation
              currentStep={currentStep}
              onStepClick={handleStepNavigation}
              wizardSession={wizardSession}
            />

            {/* Step 1: Combined Form - Overheidslaag, Instantie, Onderwerp */}
            {currentStep === 1 && (
              <BeleidsscanErrorBoundary
                hasDraft={hasDraft}
                draftSummary={lastDraftSummary}
                currentStep={1}
                queryId={queryId}
                onRestoreDraft={handleRestoreDraft}
                onGoHome={onBack}
              >
                <Suspense fallback={<StepLoader />}>
                  <Step1QueryConfiguration
                  showStep1Info={state.showStep1Info}
                  setShowStep1Info={(show: boolean) => dispatch(actions.setShowStep1Info(show))}
                  overheidslagen={overheidslagen}
                  gemeenten={gemeenten}
                  waterschappen={waterschappen}
                  provincies={provincies}
                  rijksorganisaties={rijksorganisaties}
                  isLoadingJurisdictions={isLoadingJurisdictions}
                  handleGenerateWebsites={handleGenerateWebsites}
                  getCharacterCounterColor={getCharacterCounterColor}
                  isLoadingWebsites={isLoadingWebsites}
                  websiteGenerationProgress={websiteGenerationProgress}
                  websiteGenerationStatus={websiteGenerationStatus}
                  websiteGenerationEstimatedTime={websiteGenerationEstimatedTime}
                  saveDraftToStorage={saveDraftToStorage}
                  hasDraft={hasDraft}
                  loadDraftFromStorage={loadDraftFromStorage}
                  restoreDraft={restoreDraft}
                  cancelWebsiteGeneration={cancelWebsiteGeneration}
                />
                </Suspense>
              </BeleidsscanErrorBoundary>
            )}

            {/* Step 2: Website Selection */}
            {currentStep === 2 && (
              <BeleidsscanErrorBoundary
                hasDraft={hasDraft}
                draftSummary={lastDraftSummary}
                currentStep={2}
                queryId={queryId}
                onRestoreDraft={handleRestoreDraft}
                onGoHome={onBack}
              >
                <Suspense fallback={<StepLoader />}>
                  <Step2WebsiteSelection
                  suggestedWebsites={suggestedWebsites}
                  isScrapingWebsites={isScrapingWebsites}
                  scrapingProgress={scrapingProgress}
                  scrapingStatus={scrapingStatus}
                  scrapingDocumentsFound={scrapingDocumentsFound}
                  scrapingEstimatedTime={scrapingEstimatedTime ?? undefined}
                  websiteSuggestionsError={websiteSuggestionsError?.message ?? websiteSuggestionsError?.toString() ?? null}
                  clearWebsiteSuggestionsError={clearWebsiteSuggestionsError}
                  handleSelectAllWebsites={handleSelectAllWebsites}
                  handleScrapeWebsites={handleScrapeWebsites}
                  handleStepNavigation={handleStepNavigation}
                  saveDraftToStorage={saveDraftToStorage}
                />
                </Suspense>
              </BeleidsscanErrorBoundary>
            )}

            {/* Step 3: Document Results */}
            {currentStep === 3 && (
              <BeleidsscanErrorBoundary
                hasDraft={hasDraft}
                draftSummary={lastDraftSummary}
                currentStep={3}
                queryId={queryId}
                onRestoreDraft={handleRestoreDraft}
                onGoHome={onBack}
              >
                {/* Step 3 Layout: Documents Pane + Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Documents Pane - Show when workflow has run */}
                  {queryId && state.workflowRunId && (
                    <div className="lg:col-span-1 flex flex-col min-h-0">
                      <div className="sticky top-6 h-[calc(100vh-8rem)]">
                        <DocumentSourcesPanel
                          queryId={queryId}
                          workflowRunId={state.workflowRunId}
                          isWorkflowRunning={isWorkflowRunning}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Main Document Review Content */}
                  <div className={queryId && state.workflowRunId ? 'lg:col-span-3' : 'lg:col-span-4'}>
                    <Suspense fallback={<StepLoader />}>
                      <Step3DocumentReview
                    filteredDocuments={filteredDocuments as (CanonicalDocument | LightweightDocument)[]}
                    documentFilter={documentFilter}
                    documentSortBy={documentSortBy}
                    documentSortDirection={documentSortDirection}
                    documentSearchQuery={documentSearchQuery}
                    documentTypeFilter={documentTypeFilter}
                    documentDateFilter={documentDateFilter}
                    documentWebsiteFilter={documentWebsiteFilter}
                    debouncedDocumentSearchQuery={debouncedDocumentSearchQuery}
                    setDocumentFilter={setDocumentFilter}
                    setDocumentSortBy={setDocumentSortBy}
                    setDocumentSortDirection={setDocumentSortDirection}
                    setDocumentSearchQuery={setDocumentSearchQuery}
                    setDocumentTypeFilter={setDocumentTypeFilter}
                    setDocumentDateFilter={setDocumentDateFilter}
                    setDocumentWebsiteFilter={setDocumentWebsiteFilter}
                    handleSelectAllDocuments={handleSelectAllDocuments}
                    handleStatusChange={handleStatusChange}
                    handleBulkApprove={handleBulkApprove}
                    handleBulkReject={handleBulkReject}
                    handleExportDocuments={handleExportDocuments}
                    handlePreviewDocument={handlePreviewDocument}
                    handleOpenWorkflowImport={handleOpenWorkflowImport}
                    setScrapingDocumentsFound={() => { }} // No-op: scrapingDocumentsFound is derived from scanProgress
                    documentsLoadAttemptedRef={documentsLoadAttemptedRef}
                    filterPresets={filterPresets}
                    saveFilterPreset={saveFilterPreset}
                    deleteFilterPreset={deleteFilterPreset}
                    uniqueDocumentTypes={uniqueDocumentTypes}
                    uniqueDocumentWebsites={uniqueDocumentWebsites}
                    documentCounts={documentCounts}
                    overheidslagen={overheidslagen}
                    saveDraftToStorage={saveDraftToStorage}
                    onFinalize={handleFinalizeDraft}
                  />
                  </Suspense>
                  </div>
                </div>
              </BeleidsscanErrorBoundary>
            )}
          </div>

          {/* Workflow Execution Log Panel - Same implementation as WorkflowPage */}
          {/* Show panel whenever workflowRunId exists (no separate flag needed) */}
          {state.workflowRunId && (
            <div className="mt-6 border-t pt-6">
              <UnifiedWorkflowLogs
                runId={state.workflowRunId}
                variant="inline"
                className="w-full"
                showHeader={true}
              />
            </div>
          )}
        </div>
      </main>

      {/* Modals - Lazy loaded for better performance */}
      
      {/* Consolidated Draft Management Dialog */}
      <Suspense fallback={null}>
        <DraftManagementDialog
          open={showDraftRestorePrompt || showReconciliationDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDraftRestorePrompt(false);
            setShowReconciliationDialog(false);
          } else {
            // If opening, prioritize reconciliation if it exists
            if (reconciliationResult?.hasDivergence) {
              setShowReconciliationDialog(true);
            } else if (pendingDraft) {
              setShowDraftRestorePrompt(true);
            }
          }
        }}
        pendingDraft={pendingDraft}
        showRestorePrompt={showDraftRestorePrompt && !(reconciliationResult?.hasDivergence)}
        overheidslagen={overheidslagen}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
        reconciliationResult={reconciliationResult}
        onUseClient={handleUseClientDraft}
        onUseServer={handleUseServerState}
        onMerge={handleMergeDrafts}
        onIgnore={handleIgnoreConflict}
        onStartFresh={handleStartFresh}
        formatTimestamp={formatDraftTimestamp}
      />
      </Suspense>

      {/* API Keys Error Dialog */}
      <Suspense fallback={null}>
        <ApiKeysErrorDialog
          isOpen={state.showApiKeysError}
          onOpenChange={(open) => dispatch(beleidsscanActions.setShowApiKeysError(open))}
          apiKeysError={apiKeysError}
          onUseMockSuggestions={onUseMockSuggestions}
        />
      </Suspense>

      {/* Graph Visualizer Modal */}
      <Suspense fallback={null}>
        <GraphVisualizerModal
          isOpen={state.showGraphVisualizer}
          scrapingRunId={state.scrapingRunId}
          queryId={queryId}
          onClose={() => {
            dispatch(beleidsscanActions.setShowGraphVisualizer(false));
            dispatch(beleidsscanActions.setScrapingRunId(null));
          }}
        />
      </Suspense>

      {/* Previous Sets Dialog */}
      <Suspense fallback={null}>
        <PreviousSetsDialog
          isOpen={state.showPreviousSets}
          onClose={() => dispatch(beleidsscanActions.setShowPreviousSets(false))}
          onSelectSet={handleLoadCompletedSet}
        />
      </Suspense>

      {/* Workflow Import Modal */}
      <Suspense fallback={null}>
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
      </Suspense>

      {/* Execution Log Modal - Removed: Panel underneath is sufficient during wizard */}

      {/* Filter Preset Save Dialog */}
      <Suspense fallback={null}>
        <FilterPresetDialog
          isOpen={state.showPresetDialog}
          onClose={() => dispatch(beleidsscanActions.resetPresetDialog())}
          presetName={state.presetName}
          onPresetNameChange={(name) => dispatch(beleidsscanActions.setPresetName(name))}
          currentFilters={currentFilters}
          onSave={(preset: Omit<FilterPreset, 'id'>) => saveFilterPreset(preset)}
        />
      </Suspense>

      {/* Document Preview Modal */}
      <Suspense fallback={null}>
        <DocumentPreviewModal
          isOpen={state.showDocumentPreview}
          onClose={() => dispatch(beleidsscanActions.setShowDocumentPreview(false))}
          document={state.previewDocument}
          onStatusChange={handleStatusChange}
        />
      </Suspense>

      {/* Consolidated Help Dialog */}
      <Suspense fallback={null}>
        <ConsolidatedHelpDialog
          open={state.showHelp ?? false}
          onOpenChange={(open) => dispatch(beleidsscanActions.setShowHelp(open))}
          currentStep={currentStep}
        />
      </Suspense>

      {/* Draft Status Indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <DraftStatusIndicator
          hasDraft={hasDraft}
          lastDraftSavedAt={lastDraftSavedAt}
          lastDraftSummary={lastDraftSummary}
          formatTimestamp={formatDraftTimestamp}
        />
      </div>
    </>
  );
}
