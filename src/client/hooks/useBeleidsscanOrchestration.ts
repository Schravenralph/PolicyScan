/**
 * useBeleidsscanOrchestration Hook
 * 
 * Orchestrates all hook setup and data preparation for the Beleidsscan component.
 * This hook consolidates all the hook calls and data transformations to reduce
 * the main component size.
 */

import { useCallback, useRef, useState } from 'react';
import { useQuery } from './useQuery';
import { useWebsiteSuggestions } from './useWebsiteSuggestions';
import { useScan } from './useScan';
import { useJurisdictions } from './useJurisdictions';
import { useWorkflow } from './useWorkflow';
import { useDocumentFiltering } from './useDocumentFiltering';
import { useFilterPresets } from './useFilterPresets';
import { useScrollTracking } from './useScrollTracking';
import { useWizardSession } from './useWizardSession';
import { useDocumentLoading } from './useDocumentLoading';
import { useWorkflowConfiguration } from './useWorkflowConfiguration';
import { useBeleidsscanComputed } from './useBeleidsscanComputed';
import { useDraftRestoration } from './useDraftRestoration';
import { useDraftPersistence } from './useDraftPersistence';
import { useDraftStateValidation } from './useDraftStateValidation';
import { useDraftReconciliation } from './useDraftReconciliation';
import { useWizardEffects } from './useWizardEffects';
import { useRecentSearches } from './useRecentSearches';
import { useBeleidsscanValidation } from './useBeleidsscanValidation';
import { useWebsiteHandlers } from './useWebsiteHandlers';
import { useWizardSessionInitialization } from './useWizardSessionInitialization';
import { useBeleidsscanHandlers } from './useBeleidsscanHandlers';
import { useBeleidsscanEffects } from './useBeleidsscanEffects';
import { useWorkflowHandlers } from './useWorkflowHandlers';
import { useDocumentOperations } from './useDocumentOperations';
import { useQueryManagement } from './useQueryManagement';
import { useWizardAccessibility } from './useWizardAccessibility';
import { useBeleidsscanKeyboardNavigation } from './useBeleidsscanKeyboardNavigation';
import { reconcileDraftState, type ServerSessionState } from '../services/draftReconciliation';
import type { BeleidsscanDraft } from './useDraftPersistence';
import { SELECTED_WEBSITES_KEY_PREFIX, overheidslagen, rijksorganisaties } from '../components/Beleidsscan/constants';
import { formatDraftTimestamp } from '../components/Beleidsscan/utils';
import { logError } from '../utils/errorHandler';
import type { BronDocument } from '../services/api';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
import type { BeleidsscanContextValue } from '../context/BeleidsscanContext';
import { beleidsscanActions } from '../reducers/beleidsscanReducer';

interface UseBeleidsscanOrchestrationProps {
  context: BeleidsscanContextValue;
  onBack: () => void;
}

export function useBeleidsscanOrchestration({ context, onBack }: UseBeleidsscanOrchestrationProps) {
  const {
    state,
    dispatch,
    actions,
    queryConfig,
    setOverheidslaag,
    setSelectedEntity,
    setOnderwerp,
    setTopicSearchQuery,
    setQueryId,
    websiteSelection,
    setSelectedWebsites,
    setWebsiteSearchQuery,
    setWebsiteSortBy,
    setWebsiteFilterType,
    documentReview,
    setDocuments,
    setSelectedDocuments,
    setIsLoadingDocuments,
    setDocumentsError,
    validationErrors,
    setValidationErrors,
    isEditingCompletedSet,
    originalQueryId,
    setIsEditingCompletedSet,
    setOriginalQueryId,
  } = context;

  const {
    overheidslaag,
    selectedEntity,
    onderwerp,
    queryId,
  } = queryConfig;

  // Refs
  const shouldTransitionToStep2Ref = useRef(false);
  const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionCreatedRef = useRef(false);

  // Query management
  const { createQuery: createQueryHook } = useQuery();

  // Website suggestions
  const {
    suggestedWebsites,
    isLoading: isLoadingWebsites,
    progress: websiteGenerationProgressData,
    error: websiteSuggestionsError,
    apiKeysError,
    generateSuggestions: generateWebsiteSuggestionsHook,
    generateSuggestionsViaWizard: generateSuggestionsViaWizardHook,
    generateMockSuggestions: generateMockWebsiteSuggestionsHook,
    clearError: clearWebsiteSuggestionsError,
    restoreProgressForQuery: restoreWebsiteGenerationProgress,
    cancelGeneration: cancelWebsiteGeneration,
  } = useWebsiteSuggestions();

  // Context values - extract from context
  const selectedWebsites = websiteSelection.selectedWebsites;
  const websiteSearchQuery = websiteSelection.websiteSearchQuery;
  const websiteSortBy = websiteSelection.websiteSortBy;
  const websiteFilterType = websiteSelection.websiteFilterType;
  const documents = documentReview.documents;
  const selectedDocuments = documentReview.selectedDocuments;

  // Scan operations
  const {
    isScanning: isScrapingWebsites,
    progress: scanProgress,
    startScan,
    startScanViaWizard,
  } = useScan();

  const scrapingProgress = scanProgress.progress;
  const scrapingStatus = scanProgress.status;
  const scrapingDocumentsFound = scanProgress.documentsFound;
  const scrapingEstimatedTime = scanProgress.estimatedTime;

  // Jurisdictions
  const {
    gemeenten,
    waterschappen,
    provincies,
    isLoading: isLoadingJurisdictions
  } = useJurisdictions();

  // Workflow output
  const {
    availableOutputs: availableWorkflowOutputs,
    selectedOutput: selectedWorkflowOutput,
    workflowOutput,
    isLoading: isLoadingWorkflowOutputs,
    isImporting: isImportingWorkflow,
    loadOutputs: loadWorkflowOutputsHook,
    loadOutput: loadWorkflowOutputHook,
    importOutput: importWorkflowOutputHook,
    setSelectedOutput: setSelectedWorkflowOutput,
    setWorkflowOutput: setWorkflowOutputState,
  } = useWorkflow();

  const websiteGenerationProgress = websiteGenerationProgressData.progress;
  const websiteGenerationStatus = websiteGenerationProgressData.status;
  const websiteGenerationEstimatedTime = websiteGenerationProgressData.estimatedSecondsRemaining;

  // Document filtering
  const {
    filteredDocuments,
    documentFilter,
    setDocumentFilter,
    documentSortBy,
    setDocumentSortBy,
    documentSortDirection,
    setDocumentSortDirection,
    documentSearchQuery,
    setDocumentSearchQuery,
    debouncedDocumentSearchQuery,
    documentTypeFilter,
    setDocumentTypeFilter,
    documentDateFilter,
    setDocumentDateFilter,
    documentWebsiteFilter,
    setDocumentWebsiteFilter,
    availableDocumentTypes,
  } = useDocumentFiltering(documents, {
    initialFilter: 'all',
    initialSortBy: 'relevance',
    initialSortDirection: 'desc',
    debounceMs: 300,
  });

  // Filter presets
  const {
    filterPresets,
    savePreset: saveFilterPreset,
    deletePreset: deleteFilterPreset,
  } = useFilterPresets();

  // Scroll tracking
  const { scrollPositions, setScrollPositions } = useScrollTracking(state.step, {
    stepCount: 3,
    autoRestore: false,
  });

  // Wizard session
  const {
    session: wizardSession,
    sessionId: wizardSessionId,
    createSession: createWizardSession,
    navigate: navigateWizard,
    validateInput: validateWizardInput,
    executeAction: executeWizardAction,
    markStepCompleted: markWizardStepCompleted,
    getResult: getWizardResult,
    loadSession: loadWizardSession,
    getState: getWizardState,
  } = useWizardSession();

  // Document loading
  const {
    documentsLoadAttemptedRef,
  } = useDocumentLoading({
    queryId,
    currentStep: state.step,
    isScrapingWebsites,
    scanProgress,
    wizardSessionId,
    selectedWebsites,
    markWizardStepCompleted,
    setIsLoadingDocuments,
    setDocuments,
    setDocumentsError,
  });

  // Workflow configuration
  const {
    activeConfiguration,
    availableWorkflows,
    isLoading: isLoadingWorkflowConfig,
    error: workflowConfigError,
  } = useWorkflowConfiguration();

  // Computed values
  const {
    draftState,
    uniqueDocumentWebsites,
    documentCounts,
  } = useBeleidsscanComputed({
    overheidslaag,
    selectedEntity,
    onderwerp,
    queryId,
    selectedWebsites,
    websiteSearchQuery,
    websiteSortBy,
    websiteFilterType,
    documents,
    documentFilter,
    documentSortBy,
    documentSortDirection,
    documentSearchQuery,
    documentTypeFilter,
    documentDateFilter,
    documentWebsiteFilter,
    selectedDocuments,
    currentStep: state.step,
    scrollPositions,
  });

  // Draft restoration
  const { handleDraftRestore } = useDraftRestoration({
    setOverheidslaag,
    setSelectedEntity,
    setOnderwerp,
    setTopicSearchQuery,
    setQueryId,
    restoreWebsiteGenerationProgress,
    setSelectedWebsites,
    setWebsiteSearchQuery,
    setWebsiteSortBy,
    setWebsiteFilterType,
    setDocuments,
    setDocumentFilter,
    setDocumentSortBy,
    setDocumentSortDirection,
    setDocumentSearchQuery,
    setDocumentTypeFilter,
    setDocumentDateFilter,
    setDocumentWebsiteFilter,
    setSelectedDocuments,
    setScrollPositions,
    dispatch,
    setStep: (step: number) => dispatch(actions.setStep(step)),
  });

  // Draft persistence
  const {
    lastDraftSavedAt,
    lastDraftSummary,
    pendingDraft,
    showDraftRestorePrompt,
    hasDraft,
    saveDraft: saveDraftToStorage,
    saveDraftSync,
    loadDraft: loadDraftFromStorage,
    discardDraft,
    clearDraft,
    restoreDraft,
    setShowDraftRestorePrompt,
  } = useDraftPersistence(draftState, {
    showManualSaveToast: true,
    autoSaveDelay: 1000,
    onDraftLoaded: handleDraftRestore,
  });

  // Draft state validation
  const { hasMeaningfulState } = useDraftStateValidation({ draftState });

  // Draft reconciliation state
  const [showReconciliationDialog, setShowReconciliationDialog] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<ReturnType<typeof reconcileDraftState> | null>(null);
  const [serverSessionState, setServerSessionState] = useState<ServerSessionState | null>(null);

  // Helper function to map wizard step ID to step number
  const stepIdToStepNumber = useCallback((stepId: string): number => {
    const stepIdMap: Record<string, number> = {
      'query-configuration': 1,
      'website-selection': 2,
      'document-review': 3,
    };
    return stepIdMap[stepId] || 1;
  }, []);

  // Ignore conflict handler - clears draft and reloads fresh state from server
  const handleIgnoreConflict = useCallback(async () => {
    try {
      // Clear reconciliation state first to prevent dialog from reappearing
      setReconciliationResult(null);
      setShowReconciliationDialog(false);
      
      // Clear local draft
      discardDraft();
      clearDraft();
      
      // If no wizard session, reset to step 1 and return
      if (!wizardSessionId) {
        dispatch(beleidsscanActions.setStep(1));
        return;
      }

      // Reload wizard session from server to get fresh state
      if (loadWizardSession) {
        try {
          await loadWizardSession(wizardSessionId);
        } catch (loadError) {
          // If session load fails, log but continue - we'll try to get state anyway
          logError(loadError instanceof Error ? loadError : new Error('Failed to reload wizard session'), 'ignore-conflict-reload-session');
        }
      }
      
      // Get fresh server state and update UI
      if (getWizardState) {
        try {
          const freshState = await getWizardState();
          if (freshState) {
            // Update UI state from server
            const serverState: ServerSessionState = {
              sessionId: freshState.sessionId,
              currentStepId: freshState.currentStepId,
              context: freshState.context || {},
              updatedAt: freshState.updatedAt,
              queryId: freshState.linkedQueryId || null,
            };
            
            // Always update step based on server state (even if context is empty)
            const stepNumber = stepIdToStepNumber(serverState.currentStepId);
            dispatch(beleidsscanActions.setStep(stepNumber));

            // Restore state from server context if available (this will update all UI fields)
            if (serverState.context && Object.keys(serverState.context).length > 0) {
              const serverDraft: BeleidsscanDraft = {
                step: stepNumber,
                onderwerp: (serverState.context as any).onderwerp || '',
                overheidslaag: (serverState.context as any).overheidslaag || '',
                selectedEntity: (serverState.context as any).selectedEntity || null,
                queryId: serverState.queryId || null,
                timestamp: serverState.updatedAt || new Date().toISOString(),
              };

              handleDraftRestore(serverDraft);
            }
          } else {
            // If no state available, reset to step 1
            dispatch(beleidsscanActions.setStep(1));
          }
        } catch (stateError) {
          // If state fetch fails, reset to step 1
          logError(stateError instanceof Error ? stateError : new Error('Failed to get wizard state'), 'ignore-conflict-get-state');
          dispatch(beleidsscanActions.setStep(1));
        }
      } else {
        // If getWizardState is not available, reset to step 1
        dispatch(beleidsscanActions.setStep(1));
      }
    } catch (error) {
      // Handle any unexpected errors
      logError(error instanceof Error ? error : new Error('Failed to ignore conflict'), 'ignore-conflict-reload');
      
      // Even if reload fails, clear the draft and reset to step 1 so user can start fresh
      setReconciliationResult(null);
      setShowReconciliationDialog(false);
      discardDraft();
      clearDraft();
      dispatch(beleidsscanActions.setStep(1));
    }
  }, [wizardSessionId, loadWizardSession, getWizardState, discardDraft, clearDraft, handleDraftRestore, dispatch, stepIdToStepNumber, setReconciliationResult, setShowReconciliationDialog]);

  // Draft reconciliation handlers
  const {
    handleUseClientDraft,
    handleUseServerState,
    handleMergeDrafts,
    handleIgnoreConflict: handleIgnoreConflictFromHook,
  } = useDraftReconciliation({
    pendingDraft,
    serverSessionState,
    reconciliationResult,
    handleDraftRestore,
    saveDraftToStorage,
    setShowReconciliationDialog,
    setReconciliationResult,
    onIgnoreConflict: handleIgnoreConflict,
  });

  // Wizard effects
  useWizardEffects({
    wizardSession,
    wizardSessionId,
    getWizardResult,
    clearDraft,
    queryId,
    selectedWebsites,
    setSelectedWebsites,
    suggestedWebsites,
    SELECTED_WEBSITES_KEY_PREFIX,
    saveDraftSync,
    hasMeaningfulState,
    logError,
  });

  // Recent searches
  const {
    saveRecentSearch
  } = useRecentSearches();

  // Validation
  const {
    validateOnderwerp,
    validateForm,
    canProceedStep1,
    getCharacterCounterColor,
  } = useBeleidsscanValidation({
    onderwerp,
    overheidslaag,
    selectedEntity,
    validationErrors,
    setValidationErrors,
  });

  // Website handlers
  const {
    handleGenerateWebsites,
    handleUseMockSuggestions,
    handleSelectAllWebsites,
    handleScrapeWebsites,
  } = useWebsiteHandlers({
    queryId,
    overheidslaag,
    selectedEntity,
    onderwerp,
    selectedWebsites,
    suggestedWebsites,
    websiteSearchQuery,
    websiteFilterType,
    websiteSortBy,
    wizardSession,
    wizardSessionId,
    apiKeysError,
    state,
    setQueryId,
    setSelectedWebsites,
    saveDraftToStorage,
    saveRecentSearch,
    createQueryHook,
    generateWebsiteSuggestionsHook,
    generateSuggestionsViaWizardHook,
    generateMockWebsiteSuggestionsHook,
    clearWebsiteSuggestionsError,
    validateWizardInput,
    executeWizardAction,
    markWizardStepCompleted,
    navigateWizard,
    startScan,
    startScanViaWizard,
    dispatch,
    actions: {
      setStep: beleidsscanActions.setStep,
      setShowApiKeysError: actions.setShowApiKeysError,
      setWorkflowRunId: actions.setWorkflowRunId,
      setScrapingRunId: actions.setScrapingRunId,
      setShowGraphVisualizer: actions.setShowGraphVisualizer,
    },
    validateForm,
    shouldTransitionToStep2Ref,
    draftSaveTimerRef,
  });

  // Query management handlers
  const {
    handleLoadCompletedSet,
    handleUpdateCompletedSet,
    handleDuplicateCompletedSet,
    handleFinalizeDraft,
    handleDiscardLoadedSet,
  } = useQueryManagement({
    queryId,
    overheidslaag,
    selectedEntity,
    onderwerp,
    selectedWebsites,
    documents: documents as Array<{ url?: string }>,
    originalQueryId,
    isEditingCompletedSet,
    setQueryId,
    setOverheidslaag,
    setSelectedEntity,
    setOnderwerp,
    setTopicSearchQuery,
    setSelectedWebsites,
    setOriginalQueryId,
    setIsEditingCompletedSet,
    setStep: (step: number) => dispatch(actions.setStep(step)),
    discardDraft,
    clearDraft,
    overheidslagen,
  });

  // Wizard session initialization
  useWizardSessionInitialization({
    isLoadingWorkflowConfig,
    availableWorkflows,
    workflowConfigError,
    activeWorkflowId: activeConfiguration?.workflowId,
    createWizardSession,
    loadDraftFromStorage,
    sessionCreatedRef,
  });

  // Beleidsscan handlers
  const {
    handleStepNavigation,
    handleRestoreDraft,
    handleDiscardDraft: handleDiscardDraftBase,
  } = useBeleidsscanHandlers({
    wizardSession,
    wizardSessionId,
    navigateWizard,
    dispatch,
    setStep: (step: number) => dispatch(actions.setStep(step)),
    restoreDraft,
    discardDraft,
  });

  // Wrap handleDiscardDraft to also clear reconciliation state
  const handleDiscardDraft = useCallback(() => {
    // Clear reconciliation state to prevent dialog from reappearing
    setReconciliationResult(null);
    setShowReconciliationDialog(false);
    // Call the base handler
    handleDiscardDraftBase();
  }, [handleDiscardDraftBase, setReconciliationResult, setShowReconciliationDialog]);

  // Beleidsscan effects
  useBeleidsscanEffects({
    setShowDraftRestorePrompt,
    currentStep: state.step,
    suggestedWebsitesLength: suggestedWebsites.length,
    isLoadingWebsites,
    onTransitionToStep2: () => dispatch(beleidsscanActions.setStep(2)),
    shouldTransitionToStep2Ref,
    onderwerp,
    overheidslaag,
    selectedEntity,
    validationErrors,
    setValidationErrors,
    validateOnderwerp,
    setWebsiteSearchQuery,
    setWebsiteFilterType,
    setWebsiteSortBy,
    setSelectedDocuments,
    setDocumentFilter,
    hasDraft,
    wizardSessionId,
    pendingDraft,
    setServerSessionState,
    setReconciliationResult,
    setShowReconciliationDialog,
  });

  // Workflow handlers
  const {
    handleImportWorkflowResults,
    handleOpenWorkflowImport,
    handleExportDocuments,
    handlePreviewDocument,
    handleLoadWorkflowOutput: loadWorkflowOutput,
  } = useWorkflowHandlers({
    queryId,
    documents,
    selectedDocuments,
    filteredDocuments,
    selectedWorkflowOutput,
    setDocuments,
    setSelectedWorkflowOutput,
    importWorkflowOutput: importWorkflowOutputHook,
    loadWorkflowOutputs: loadWorkflowOutputsHook,
    loadWorkflowOutput: loadWorkflowOutputHook,
    setShowWorkflowImport: (show: boolean) => dispatch(beleidsscanActions.setShowWorkflowImport(show)),
    setPreviewDocument: ((doc: (CanonicalDocument | LightweightDocument | BronDocument) | null) => {
      // CanonicalDocument is compatible with Document type
      dispatch(beleidsscanActions.setPreviewDocument(doc as CanonicalDocument | LightweightDocument | null));
    }) as unknown as (doc: CanonicalDocument | LightweightDocument | null) => void,
    setShowDocumentPreview: (show: boolean) => dispatch(beleidsscanActions.setShowDocumentPreview(show)),
  });

  // Document operations
  const setSelectedDocumentsUpdater = useCallback((updater: (prev: string[]) => string[]) => {
    setSelectedDocuments(updater(selectedDocuments));
  }, [selectedDocuments, setSelectedDocuments]);

  const {
    handleStatusChange,
    handleSelectAllDocuments,
    handleBulkApprove,
    handleBulkReject,
  } = useDocumentOperations({
    documents,
    setDocuments,
    selectedDocuments,
    setSelectedDocuments: setSelectedDocumentsUpdater,
    filteredDocuments,
    saveDraft: saveDraftToStorage,
  });

  const uniqueDocumentTypes = availableDocumentTypes;
  const canProceedStep4 = selectedWebsites.length > 0;

  // Prepare workflow output list with proper date formatting
  const formattedWorkflowOutputs = availableWorkflowOutputs.map(o => ({
    name: o.name,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt
  }));

  // Handle workflow import close
  const onCloseWorkflowImport = () => {
    dispatch(beleidsscanActions.setShowWorkflowImport(false));
    setWorkflowOutputState(null);
    setSelectedWorkflowOutput(null);
  };

  // Wizard accessibility
  useWizardAccessibility({
    currentStep: state.step,
    onPreviousStep: () => {
      if (state.step > 1) {
        dispatch(beleidsscanActions.setStep(state.step - 1));
      }
    },
    onNextStep: () => {
      if (state.step === 1 && canProceedStep1 && !isLoadingWebsites) {
        handleGenerateWebsites();
      } else if (state.step === 2 && canProceedStep4 && !isScrapingWebsites && documents.length === 0) {
        handleScrapeWebsites();
      } else if (state.step === 2 && documents.length > 0) {
        dispatch(beleidsscanActions.setStep(3));
      } else if (state.step === 3 && queryId) {
        handleFinalizeDraft();
      }
    },
  });

  // Keyboard navigation
  useBeleidsscanKeyboardNavigation({
    currentStep: state.step,
    showGraphVisualizer: state.showGraphVisualizer,
    showWorkflowImport: state.showWorkflowImport,
    canProceedStep1,
    canProceedStep4,
    isLoadingWebsites,
    isScrapingWebsites,
    documentsCount: documents.length,
    queryId,
    onGenerateWebsites: handleGenerateWebsites,
    onScrapeWebsites: handleScrapeWebsites,
    onFinalizeDraft: handleFinalizeDraft,
    onPreviousStep: () => {
      if (state.step > 1) {
        dispatch(beleidsscanActions.setStep(state.step - 1));
      }
    },
    onNextStep: () => {
      if (state.step === 2 && documents.length > 0) {
        dispatch(beleidsscanActions.setStep(3));
      }
    },
    onCloseGraphVisualizer: () => {
      dispatch(beleidsscanActions.setShowGraphVisualizer(false));
      dispatch(beleidsscanActions.setScrapingRunId(null));
    },
    onCloseWorkflowImport: () => {
      dispatch(beleidsscanActions.setShowWorkflowImport(false));
      setWorkflowOutputState(null);
      setSelectedWorkflowOutput(null);
    },
  });

  return {
    // State
    state,
    dispatch,
    actions,
    queryId,
    isEditingCompletedSet,
    originalQueryId,
    hasDraft,
    lastDraftSavedAt,
    lastDraftSummary,
    showReconciliationDialog,
    reconciliationResult,
    pendingDraft,
    
    // Data
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
    
    // Handlers
    onBack,
    setShowStep1Info: (show: boolean) => dispatch(actions.setShowStep1Info(show)),
    setShowStep3Info: (show: boolean) => dispatch(actions.setShowStep3Info(show)),
    setShowWorkflowInfo: (show: boolean) => dispatch(actions.setShowWorkflowInfo(show)),
    setShowReconciliationDialog,
    handleGenerateWebsites,
    handleSelectAllWebsites,
    handleScrapeWebsites,
    handleStepNavigation,
    handleRestoreDraft,
    handleDiscardDraft,
    handleStartFresh: useCallback(async () => {
      const SKIP_RECONCILIATION_FLAG = 'beleidsscan.skipReconciliation';
      
      // Set flag to skip reconciliation check
      try {
        localStorage.setItem(SKIP_RECONCILIATION_FLAG, 'true');
      } catch (e) {
        // Ignore localStorage errors
      }
      
      // Clear reconciliation state
      setReconciliationResult(null);
      setShowReconciliationDialog(false);
      setShowDraftRestorePrompt(false);
      
      // Clear local draft volledig
      discardDraft();
      clearDraft();
      
      // Reset state to step 1
      dispatch(beleidsscanActions.setStep(1));
      setQueryId(null);
      setOriginalQueryId(null);
      setIsEditingCompletedSet(false);
      setSelectedWebsites([]);
      setDocuments([]);
      
      // Create a new wizard session
      try {
        if (createWizardSession) {
          const workflowId = activeConfiguration?.workflowId || 'beleidsscan-wizard';
          await createWizardSession(workflowId, 1);
        }
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Failed to create new wizard session'), 'start-fresh-wizard-session');
      }
    }, [discardDraft, clearDraft, dispatch, setQueryId, setOriginalQueryId, setIsEditingCompletedSet, setSelectedWebsites, setDocuments, createWizardSession, activeConfiguration, setReconciliationResult, setShowReconciliationDialog, setShowDraftRestorePrompt]),
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
    handleIgnoreConflict: handleIgnoreConflictFromHook,
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
    setShowPreviousSets: (show: boolean) => dispatch(beleidsscanActions.setShowPreviousSets(show)),
    getCharacterCounterColor,
    formatDraftTimestamp,
    availableWorkflowOutputs: formattedWorkflowOutputs,
    selectedWorkflowOutput,
    workflowOutput,
    isLoadingWorkflowOutputs,
    isImportingWorkflow,
    onSelectWorkflowOutput: loadWorkflowOutput,
    onImportWorkflowResults: handleImportWorkflowResults,
    onLoadWorkflowOutputs: loadWorkflowOutputsHook,
    onCloseWorkflowImport,
    showDraftRestorePrompt,
    setShowDraftRestorePrompt,
    apiKeysError,
    onUseMockSuggestions: handleUseMockSuggestions,
    documentsLoadAttemptedRef,
    wizardSession,
  };
}

