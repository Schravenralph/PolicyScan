/**
 * Master data fetching hook for Beleidsscan component
 * 
 * Consolidates all data fetching hooks to reduce component size.
 * This hook orchestrates:
 * - Query management
 * - Website suggestions
 * - Scan operations
 * - Jurisdictions
 * - Workflow output
 * - Document filtering
 * - Filter presets
 * - Wizard session
 * - Document loading
 * - Workflow configuration
 * 
 * @see WI-IMPL-017: Component Decomposition
 */

import { useQuery } from './useQuery';
import { useWebsiteSuggestions } from './useWebsiteSuggestions';
import { useScan } from './useScan';
import { useJurisdictions } from './useJurisdictions';
import { useWorkflow } from './useWorkflow';
import { useDocumentFiltering } from './useDocumentFiltering';
import { useFilterPresets } from './useFilterPresets';
import { useWizardSession } from './useWizardSession';
import { useDocumentLoading } from './useDocumentLoading';
import { useWorkflowConfiguration } from './useWorkflowConfiguration';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';

interface UseBeleidsscanDataProps {
  // Context values
  queryId: string | undefined;
  currentStep: number;
  selectedWebsites: string[];
  documents: CanonicalDocument[];
  setIsLoadingDocuments: (loading: boolean) => void;
  setDocuments: React.Dispatch<React.SetStateAction<LightweightDocument[]>>;
  setDocumentsError: (error: Error | null) => void;
}

export function useBeleidsscanData({
  queryId,
  currentStep,
  selectedWebsites,
  documents,
  setIsLoadingDocuments,
  setDocuments,
  setDocumentsError,
}: UseBeleidsscanDataProps) {
  // Query management
  const { createQuery: createQueryHook } = useQuery();

  // Website suggestions
  const websiteSuggestions = useWebsiteSuggestions();

  // Scan operations
  const scan = useScan();

  // Jurisdictions
  const jurisdictions = useJurisdictions();

  // Workflow output integration
  const workflow = useWorkflow();

  // Document filtering
  const documentFiltering = useDocumentFiltering(documents, {
    initialFilter: 'all',
    initialSortBy: 'relevance',
    initialSortDirection: 'desc',
    debounceMs: 300,
  });

  // Filter presets
  const filterPresets = useFilterPresets();

  // Wizard session management
  const wizardSession = useWizardSession();

  // Document loading - create wrapper functions to adapt types
  const documentLoading = useDocumentLoading({
    queryId: queryId || null,
    currentStep,
    isScrapingWebsites: scan.isScanning,
    scanProgress: scan.progress,
    wizardSessionId: wizardSession.sessionId,
    selectedWebsites,
    markWizardStepCompleted: wizardSession.markStepCompleted,
    setIsLoadingDocuments,
    setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => {
      setDocuments(updater);
    },
    setDocumentsError: (error: string | null) => {
      setDocumentsError(error ? new Error(error) : null);
    },
  });

  // Workflow configuration
  const workflowConfiguration = useWorkflowConfiguration();

  // Derive progress values
  const scrapingProgress = scan.progress.progress;
  const scrapingStatus = scan.progress.status;
  const scrapingDocumentsFound = scan.progress.documentsFound;
  const scrapingEstimatedTime = scan.progress.estimatedTime;

  const websiteGenerationProgress = websiteSuggestions.progress.progress;
  const websiteGenerationStatus = websiteSuggestions.progress.status;
  const websiteGenerationEstimatedTime = websiteSuggestions.progress.estimatedSecondsRemaining;

  return {
    // Query
    createQueryHook,

    // Website suggestions
    suggestedWebsites: websiteSuggestions.suggestedWebsites,
    isLoadingWebsites: websiteSuggestions.isLoading,
    websiteGenerationProgress,
    websiteGenerationStatus,
    websiteGenerationEstimatedTime,
    websiteSuggestionsError: websiteSuggestions.error,
    apiKeysError: websiteSuggestions.apiKeysError,
    generateWebsiteSuggestionsHook: websiteSuggestions.generateSuggestions,
    generateSuggestionsViaWizardHook: websiteSuggestions.generateSuggestionsViaWizard,
    generateMockWebsiteSuggestionsHook: websiteSuggestions.generateMockSuggestions,
    clearWebsiteSuggestionsError: websiteSuggestions.clearError,
    restoreWebsiteGenerationProgress: websiteSuggestions.restoreProgressForQuery,
    cancelWebsiteGeneration: websiteSuggestions.cancelGeneration,

    // Scan operations
    isScrapingWebsites: scan.isScanning,
    scanProgress: scan.progress,
    scrapingProgress,
    scrapingStatus,
    scrapingDocumentsFound,
    scrapingEstimatedTime,
    startScan: scan.startScan,
    startScanViaWizard: scan.startScanViaWizard,

    // Jurisdictions
    gemeenten: jurisdictions.gemeenten,
    waterschappen: jurisdictions.waterschappen,
    provincies: jurisdictions.provincies,
    isLoadingJurisdictions: jurisdictions.isLoading,

    // Workflow output
    availableWorkflowOutputs: workflow.availableOutputs,
    selectedWorkflowOutput: workflow.selectedOutput,
    workflowOutput: workflow.workflowOutput,
    isLoadingWorkflowOutputs: workflow.isLoading,
    isImportingWorkflow: workflow.isImporting,
    loadWorkflowOutputsHook: workflow.loadOutputs,
    loadWorkflowOutputHook: workflow.loadOutput,
    importWorkflowOutputHook: workflow.importOutput,
    setSelectedWorkflowOutput: workflow.setSelectedOutput,
    setWorkflowOutputState: workflow.setWorkflowOutput,

    // Document filtering
    filteredDocuments: documentFiltering.filteredDocuments,
    documentFilter: documentFiltering.documentFilter,
    setDocumentFilter: documentFiltering.setDocumentFilter,
    documentSortBy: documentFiltering.documentSortBy,
    setDocumentSortBy: documentFiltering.setDocumentSortBy,
    documentSortDirection: documentFiltering.documentSortDirection,
    setDocumentSortDirection: documentFiltering.setDocumentSortDirection,
    documentSearchQuery: documentFiltering.documentSearchQuery,
    setDocumentSearchQuery: documentFiltering.setDocumentSearchQuery,
    debouncedDocumentSearchQuery: documentFiltering.debouncedDocumentSearchQuery,
    documentTypeFilter: documentFiltering.documentTypeFilter,
    setDocumentTypeFilter: documentFiltering.setDocumentTypeFilter,
    documentDateFilter: documentFiltering.documentDateFilter,
    setDocumentDateFilter: documentFiltering.setDocumentDateFilter,
    documentWebsiteFilter: documentFiltering.documentWebsiteFilter,
    setDocumentWebsiteFilter: documentFiltering.setDocumentWebsiteFilter,
    availableDocumentTypes: documentFiltering.availableDocumentTypes,

    // Filter presets
    filterPresets: filterPresets.filterPresets,
    saveFilterPreset: filterPresets.savePreset,
    deleteFilterPreset: filterPresets.deletePreset,

    // Wizard session
    wizardSession: wizardSession.session,
    wizardSessionId: wizardSession.sessionId,
    createWizardSession: wizardSession.createSession,
    navigateWizard: wizardSession.navigate,
    validateWizardInput: wizardSession.validateInput,
    executeWizardAction: wizardSession.executeAction,
    markWizardStepCompleted: wizardSession.markStepCompleted,
    getWizardResult: wizardSession.getResult,

    // Document loading
    documentsLoadAttemptedRef: documentLoading.documentsLoadAttemptedRef,

    // Workflow configuration
    activeConfiguration: workflowConfiguration.activeConfiguration,
    availableWorkflows: workflowConfiguration.availableWorkflows,
    isLoadingWorkflowConfig: workflowConfiguration.isLoading,
    workflowConfigError: workflowConfiguration.error,
  };
}

