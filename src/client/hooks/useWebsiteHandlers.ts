/**
 * Custom hook for website-related handlers in Beleidsscan component
 * Handles website generation, mock suggestions, selection, and scraping operations
 */

import { useCallback, useMemo } from 'react';
import { toast } from '../utils/toast';
import { logError, createErrorWithRetry } from '../utils/errorHandler';
import { beleidsscanActions } from '../reducers/beleidsscanReducer';
import type { BronWebsite } from '../services/api';
import type { WebsiteType } from '../components/Beleidsscan/types';
import { overheidslagen } from '../components/Beleidsscan/constants';

export interface UseWebsiteHandlersProps {
  queryId: string | null;
  overheidslaag: WebsiteType | null;
  selectedEntity: string;
  onderwerp: string;
  selectedWebsites: string[];
  suggestedWebsites: BronWebsite[];
  websiteSearchQuery: string;
  websiteFilterType: string | null;
  websiteSortBy: string;
  wizardSession: { revision?: number } | null;
  wizardSessionId: string | null;
  apiKeysError: { message: string; missingKeys?: { openai?: boolean; google?: boolean }; canUseMock?: boolean } | null;
  state: { step: number };
  setQueryId: (id: string | null) => void;
  setSelectedWebsites: ((websites: string[]) => void) | ((updater: (prev: string[]) => string[]) => void);
  saveDraftToStorage: () => void;
  saveRecentSearch: (query: string) => void;
  createQueryHook: (data: {
    overheidstype: string;
    overheidsinstantie?: string;
    onderwerp: string;
    websiteTypes: WebsiteType[];
  }) => Promise<string>;
  generateWebsiteSuggestionsHook: (queryId: string) => Promise<BronWebsite[]>;
  generateSuggestionsViaWizardHook: (sessionId: string, queryId: string, revision?: number, executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>) => Promise<BronWebsite[]>;
  generateMockWebsiteSuggestionsHook: (queryId: string) => Promise<BronWebsite[]>;
  clearWebsiteSuggestionsError: () => void;
  validateWizardInput: (stepId: string, input: Record<string, unknown>) => Promise<boolean>;
  executeWizardAction: (stepId: string, actionId: string, params: Record<string, unknown>) => Promise<unknown>;
  markWizardStepCompleted: (stepId: string, result?: unknown) => Promise<void>;
  navigateWizard: (stepId: string) => Promise<import('../services/api/WizardApiService').WizardSession>;
  startScan: (params: {
    queryId: string;
    websiteIds: string[];
    onderwerp: string;
    overheidslaag?: string;
    overheidsinstantie?: string;
  }) => Promise<string>;
  startScanViaWizard: (sessionId: string, queryId: string, revision?: number) => Promise<string>;
  dispatch: ((action: unknown) => void) | ((action: any) => void);
  actions: {
    setStep: (step: number) => unknown;
    setShowApiKeysError: (show: boolean) => unknown;
    setWorkflowRunId: (runId: string) => unknown;
    setScrapingRunId: (runId: string) => unknown;
    setShowGraphVisualizer: (show: boolean) => unknown;
  };
  validateForm: () => boolean;
  shouldTransitionToStep2Ref: React.MutableRefObject<boolean>;
  draftSaveTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export interface UseWebsiteHandlersReturn {
  handleGenerateWebsites: () => Promise<void>;
  handleUseMockSuggestions: () => Promise<void>;
  handleSelectAllWebsites: () => void;
  handleScrapeWebsites: () => Promise<void>;
  filteredAndSortedWebsites: BronWebsite[];
}

/**
 * Hook for website-related handlers (generate, mock, select, scrape)
 */
export function useWebsiteHandlers({
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
  actions,
  validateForm,
  shouldTransitionToStep2Ref,
  draftSaveTimerRef,
}: UseWebsiteHandlersProps): UseWebsiteHandlersReturn {
  /**
   * Generates website suggestions for the current query
   */
  const handleGenerateWebsites = useCallback(async () => {
    if (!validateForm()) {
      return;
    }
    
    // Save to recent searches
    saveRecentSearch(onderwerp);
    
    try {
      let currentQueryId: string | null = null;

      // Use wizard session API if available, otherwise fall back to direct query creation
      if (wizardSession && wizardSessionId) {
        // Validate input using wizard session API
        const isValid = await validateWizardInput('query-configuration', {
          overheidslaag: overheidslaag || '',
          entity: overheidslaag !== 'kennisinstituut' ? selectedEntity : undefined,
          onderwerp,
        });

        if (!isValid) {
          toast.error('Validatiefout', 'De ingevoerde gegevens zijn ongeldig');
          return;
        }

        // Execute createQuery action via wizard session API
        const result = await executeWizardAction('query-configuration', 'createQuery', {
          overheidslaag: overheidslaag || '',
          entity: overheidslaag !== 'kennisinstituut' ? selectedEntity : undefined,
          onderwerp,
        }) as { queryId: string; query: unknown; contextUpdates?: { queryId: string } };

        if (result?.queryId) {
          currentQueryId = result.queryId;
          setQueryId(result.queryId);
          
          // Mark step as completed before navigating
          try {
            if (wizardSession && wizardSessionId && markWizardStepCompleted) {
              await markWizardStepCompleted('query-configuration', result);
            }
          } catch (markError) {
            logError(markError instanceof Error ? markError : new Error('Failed to mark step as completed'), 'mark-step-completed');
          }
          
          // Navigate to step 2 after query is created and step is marked as completed
          try {
            await navigateWizard('website-selection');
            dispatch(actions.setStep(2));
          } catch (navError) {
            logError(navError instanceof Error ? navError : new Error('Failed to navigate to step 2'), 'navigate-to-step2');
          }
        }
      } else {
        // Fallback to direct query creation (backward compatibility)
        const queryData = {
          overheidstype: overheidslagen.find(l => l.id === overheidslaag)?.label || '',
          overheidsinstantie: selectedEntity || undefined,
          onderwerp,
          websiteTypes: overheidslaag ? [overheidslaag] : [],
        };

        currentQueryId = await createQueryHook(queryData);
        setQueryId(currentQueryId);
      }

      // Save draft to localStorage
      saveDraftToStorage();

      // Generate website suggestions using wizard session API if available, otherwise fallback to direct hook
      if (currentQueryId) {
        let websites: BronWebsite[] = [];
        if (wizardSession && wizardSessionId && executeWizardAction) {
          // Use wizard session API for generating suggestions (real workflow)
          // Use executeWizardAction which handles revision conflicts automatically
          // Don't fallback to mock - let the real workflow handle errors properly
          // The real workflow can use database matches when API keys are missing
          try {
            // Use executeWizardAction which handles revision conflicts internally
            websites = await generateSuggestionsViaWizardHook(
              wizardSessionId,
              currentQueryId,
              wizardSession.revision,
              (stepId: string, actionId: string, input: unknown) => executeWizardAction(stepId, actionId, input as Record<string, unknown>) // Wrap executor to match expected signature
            );
          } catch (suggestionsError) {
            // Ensure error is caught and logged before re-throwing
            logError(suggestionsError, 'generate-suggestions-via-wizard-handler');
            throw suggestionsError;
          }
        } else {
          // Fallback to direct hook (backward compatibility)
          // Only fallback to mock for direct API (not wizard session)
          try {
            websites = await generateWebsiteSuggestionsHook(currentQueryId);
          } catch (error) {
            // If direct API fails, try mock API as fallback (backward compatibility only)
            logError(error instanceof Error ? error : new Error('Direct API failed, attempting mock API fallback'), 'generate-suggestions-direct-api-fallback');
            try {
              websites = await generateMockWebsiteSuggestionsHook(currentQueryId);
            } catch (mockError) {
              logError(mockError instanceof Error ? mockError : new Error('Mock API fallback also failed'), 'generate-suggestions-mock-fallback');
              throw error; // Re-throw original error if mock also fails
            }
          }
        }
        
        // Transition to step 2 if we have websites and not using wizard session navigation
        if (!wizardSession && websites.length > 0) {
          shouldTransitionToStep2Ref.current = true;
          if (state.step === 1) {
            dispatch(actions.setStep(2));
            shouldTransitionToStep2Ref.current = false;
          }
        }
        
        // Save draft after moving to step 2
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
        }
        draftSaveTimerRef.current = setTimeout(() => {
          saveDraftToStorage();
          draftSaveTimerRef.current = null;
        }, 500);
        
        toast.success(
          'Website suggesties gegenereerd',
          `We hebben ${websites.length} relevante websites gevonden.`
        );
      }
    } catch (error) {
      logError(error, 'generate-website-suggestions');
      
      // Check if this is an API keys missing error (handled by hook)
      if (apiKeysError) {
        dispatch(actions.setShowApiKeysError(true));
      } else {
        const apiError = error as { message?: string };
        toast.error(
          'Fout bij genereren website suggesties',
          apiError?.message || 'Probeer het opnieuw of controleer uw internetverbinding.'
        );
      }
    }
  }, [
    validateForm,
    saveRecentSearch,
    onderwerp,
    wizardSession,
    wizardSessionId,
    validateWizardInput,
    executeWizardAction,
    markWizardStepCompleted,
    navigateWizard,
    overheidslaag,
    selectedEntity,
    setQueryId,
    createQueryHook,
    saveDraftToStorage,
    generateWebsiteSuggestionsHook,
    generateSuggestionsViaWizardHook,
    generateMockWebsiteSuggestionsHook,
    state.step,
    shouldTransitionToStep2Ref,
    draftSaveTimerRef,
    dispatch,
    actions,
    apiKeysError,
  ]);

  /**
   * Uses mock website suggestions (for development/testing)
   */
  const handleUseMockSuggestions = useCallback(async () => {
    if (!queryId) return;
    
    dispatch(actions.setShowApiKeysError(false));
    clearWebsiteSuggestionsError();
    
    try {
      const websites = await generateMockWebsiteSuggestionsHook(queryId);
      
      // Mark that we should transition to step 2
      shouldTransitionToStep2Ref.current = true;
      
      toast.success(
        'Mock website suggesties geladen',
        `We hebben ${websites.length} voorbeeld websites gevonden (development mode).`
      );
    } catch (error) {
      logError(error, 'generate-mock-website-suggestions');
      const apiError = error as { message?: string };
      toast.error(
        'Fout bij genereren mock website suggesties',
        apiError?.message || 'Onbekende fout.'
      );
    }
  }, [queryId, dispatch, actions, clearWebsiteSuggestionsError, generateMockWebsiteSuggestionsHook, shouldTransitionToStep2Ref]);

  /**
   * Memoize lowercased search query to avoid calling toLowerCase() multiple times
   * This optimization is especially important when filtering large website lists
   */
  const searchQueryLower = useMemo(() => 
    websiteSearchQuery ? websiteSearchQuery.toLowerCase() : null,
    [websiteSearchQuery]
  );

  /**
   * Filter and sort websites (memoized for performance)
   * Municipality website is always kept at the top, regardless of sorting
   */
  const filteredAndSortedWebsites = useMemo(() => {
    // Helper function to check if a website is a municipality website
    const isMunicipalityWebsite = (website: typeof suggestedWebsites[0]): boolean => {
      // Check if title starts with "Gemeente" (case-insensitive)
      const title = website?.titel || '';
      if (/^Gemeente\s+/i.test(title)) {
        return true;
      }
      // Check if it's the first website in the original list (municipality is always first)
      const firstWebsite = suggestedWebsites[0];
      if (firstWebsite && website?._id === firstWebsite._id) {
        return true;
      }
      return false;
    };

    const filtered = suggestedWebsites
      .filter(website => {
        // Search filter - use memoized lowercased query
        const matchesSearch = !searchQueryLower || 
          website.titel.toLowerCase().includes(searchQueryLower) ||
          website.url.toLowerCase().includes(searchQueryLower) ||
          website.samenvatting.toLowerCase().includes(searchQueryLower);
        
        // Type filter
        const matchesType = !websiteFilterType || 
          website.website_types?.includes(websiteFilterType);
        
        return matchesSearch && matchesType;
      });

    // Separate municipality website from other websites
    const municipalityWebsite = filtered.find(isMunicipalityWebsite);
    const otherWebsites = filtered.filter(w => !isMunicipalityWebsite(w));

    // Sort other websites according to the selected sort option
    const sortedOtherWebsites = [...otherWebsites].sort((a, b) => {
      if (websiteSortBy === 'name') {
        return a.titel.localeCompare(b.titel, 'nl');
      }
      if (websiteSortBy === 'type') {
        const aType = a.website_types?.[0] || '';
        const bType = b.website_types?.[0] || '';
        return aType.localeCompare(bType, 'nl');
      }
      // Default: relevance (keep original order)
      return 0;
    });

    // Always put municipality website first, then other sorted websites
    return municipalityWebsite 
      ? [municipalityWebsite, ...sortedOtherWebsites]
      : sortedOtherWebsites;
  }, [suggestedWebsites, searchQueryLower, websiteFilterType, websiteSortBy]);

  /**
   * Select or deselect all filtered websites
   */
  const handleSelectAllWebsites = useCallback(() => {
    const currentFilteredIds = filteredAndSortedWebsites.map(w => w._id!).filter(Boolean);
    // Check if all filtered websites are already selected
    if (selectedWebsites.length === currentFilteredIds.length && currentFilteredIds.every(id => selectedWebsites.includes(id))) {
      // Handle both direct setter and updater function patterns
      if (setSelectedWebsites.length === 0 || typeof setSelectedWebsites === 'function') {
        const setter = setSelectedWebsites as (websites: string[]) => void;
        setter([]);
      } else {
        const updater = setSelectedWebsites as (updater: (prev: string[]) => string[]) => void;
        updater(() => []);
      }
    } else {
      // Handle both direct setter and updater function patterns
      if (setSelectedWebsites.length === 0 || typeof setSelectedWebsites === 'function') {
        const setter = setSelectedWebsites as (websites: string[]) => void;
        setter(currentFilteredIds);
      } else {
        const updater = setSelectedWebsites as (updater: (prev: string[]) => string[]) => void;
        updater(() => currentFilteredIds);
      }
    }
  }, [selectedWebsites, filteredAndSortedWebsites, setSelectedWebsites]);

  /**
   * Helper function for wizard-based scraping workflow
   */
  const handleWizardScrapeFlow = useCallback(async () => {
    if (!queryId || !wizardSessionId || !executeWizardAction) {
      throw new Error('Wizard session is not available');
    }

    // Step 1: Ensure we're on the correct step before executing action
    // This handles the case where user navigated back and forward
    try {
      // Check current step and navigate if needed
      const { api } = await import('../services/api');
      const sessionState = await api.wizard.getSessionState(wizardSessionId);
      if (sessionState.currentStepId !== 'website-selection') {
        // Navigate to website-selection step first
        await navigateWizard('website-selection');
        // Update wizard session reference after navigation
        await api.wizard.getSessionState(wizardSessionId);
        // Note: wizardSession.revision will be updated by the navigateWizard call
      }
    } catch (navError) {
      // If navigation fails, log but continue - the action execution will handle the error
      console.warn('Failed to navigate to website-selection before confirming selection:', navError);
    }

    // Step 2: Confirm website selection via wizard session API
    // The action output will be automatically used to mark the step as completed
    // if completion criteria are met, so we don't need to call markStepCompleted manually
    try {
      const confirmOutput = await executeWizardAction(
        'website-selection',
        'confirmSelection',
        {
          queryId,
          selectedWebsiteIds: selectedWebsites,
        }
      ) as { selectedWebsiteIds: string[]; websiteCount: number; contextUpdates: { selectedWebsiteIds: string[] } } | undefined;

      // Only manually mark as completed if the action didn't already do it automatically
      // and we have a valid output
      if (confirmOutput && markWizardStepCompleted) {
        // The output from confirmSelection should match confirmWebsiteSelectionOutputSchema
        // which is already validated by the action, so we can safely use it
        try {
          await markWizardStepCompleted('website-selection', confirmOutput);
        } catch (markError) {
          // If marking fails, it might already be marked, so just log a warning
          logError(markError instanceof Error ? markError : new Error('Failed to mark website-selection step as completed (may already be completed)'), 'mark-website-selection-completed');
        }
      }
    } catch (confirmError) {
      // Check if this is a revision conflict that exhausted all retries
      const apiError = confirmError as {
        response?: {
          status?: number;
          data?: {
            error?: string;
            message?: string;
            expectedRevision?: number;
            actualRevision?: number;
          };
        };
        message?: string;
      };

      // Handle revision conflicts (409) - provide user-friendly error with retry option
      // Note: The executeWizardAction already has retry logic, so if we get here,
      // all retries have been exhausted. We provide a manual retry option.
      if (apiError?.response?.status === 409) {
        const errorData = apiError.response.data;
        const errorMessage = errorData?.message ||
          `Revisie conflict: verwachte revisie ${errorData?.expectedRevision}, maar gevonden ${errorData?.actualRevision}. De sessie is mogelijk door een andere tab of proces bijgewerkt.`;

        const error = new Error(errorMessage);
        logError(error, 'confirm-website-selection-revision-conflict');

        // Create retry error that suggests refreshing the page or waiting
        // We don't retry automatically here since all automatic retries have been exhausted
        const errorWithRetry = createErrorWithRetry(
          error,
          () => {
            // Reload page to get fresh session state
            window.location.reload();
          },
          'confirm-website-selection-revision-conflict'
        );

        toast.errorWithRetry(errorWithRetry);
        throw error; // Re-throw to prevent continuing with invalid state
      }

      // Handle other errors
      logError(confirmError, 'confirm-website-selection');
      throw confirmError; // Re-throw to prevent continuing with invalid state
    }

    // Step 3: Navigate to document-review step before starting scan
    // This is required because startScan action belongs to document-review step
    // Use the returned session from navigation to get the latest revision atomically
    let navigatedSession;
    try {
      navigatedSession = await navigateWizard('document-review');

      // Verify that we're on the document-review step
      if (navigatedSession.currentStepId !== 'document-review') {
        throw new Error(
          `Expected to be on document-review step, but current step is ${navigatedSession.currentStepId}. ` +
          'Please try again or refresh the page.'
        );
      }

      // Update Redux state to reflect step 3 in the UI
      // This is critical - the wizard session is updated but the UI uses Redux state.step
      dispatch(actions.setStep(3));
    } catch (navError) {
      logError(navError, 'navigate-to-document-review');
      throw new Error('Failed to navigate to document-review step. Cannot start scan.');
    }

    // Step 4: Start scan via wizard session API
    // Use the revision from the navigation response to avoid revision conflicts
    // This eliminates the race condition between navigation and getSessionState
    return await startScanViaWizard(
      wizardSessionId,
      queryId,
      navigatedSession.revision
    );
  }, [
    queryId,
    wizardSessionId,
    executeWizardAction,
    navigateWizard,
    selectedWebsites,
    markWizardStepCompleted,
    dispatch,
    actions,
    startScanViaWizard
  ]);

  /**
   * Helper function for legacy scraping workflow
   */
  const handleLegacyScrapeFlow = useCallback(async () => {
    if (!queryId) return '';

    // Fallback to direct workflow call (backward compatibility)
    return await startScan({
      queryId,
      websiteIds: selectedWebsites,
      onderwerp,
      overheidslaag: overheidslagen.find(l => l.id === overheidslaag)?.label,
      overheidsinstantie: selectedEntity,
    });
  }, [queryId, selectedWebsites, startScan, onderwerp, overheidslaag, selectedEntity]);

  /**
   * Initiates the scraping workflow for selected websites
   */
  const handleScrapeWebsites = useCallback(async () => {
    if (!queryId) return;

    // Note: Websites are optional - the workflow can run without selected websites
    // The workflow will skip the website scraping step if no websites are selected
    // This allows users to proceed with the 8-step beleidsscan workflow even when no websites are found

    // Show progress notification
    toast.loading('Workflow wordt gestart... De scan is begonnen. U kunt de voortgang hieronder volgen.');
    
    try {
      let runId: string;

      // Use wizard session API if available
      if (wizardSession && wizardSessionId) {
        runId = await handleWizardScrapeFlow();
      } else {
        runId = await handleLegacyScrapeFlow();
      }
      
      // Store runId for execution log and graph visualizer
      dispatch(beleidsscanActions.setWorkflowRunId(runId));
      dispatch(beleidsscanActions.setScrapingRunId(runId));
      
      // Open graph visualizer modal when scraping starts
      dispatch(beleidsscanActions.setShowGraphVisualizer(true));

      toast.success(
        'Workflow gestart',
        'De scan is gestart. Bekijk de voortgang in het execution log.'
      );
    } catch (error) {
      logError(error, 'start-workflow');
      const errorWithRetry = createErrorWithRetry(error, () => {
        handleScrapeWebsites();
      }, 'start-workflow');
      toast.errorWithRetry(errorWithRetry);
    }
  }, [
    queryId,
    wizardSession,
    wizardSessionId,
    executeWizardAction,
    handleWizardScrapeFlow,
    handleLegacyScrapeFlow,
    dispatch
  ]);

  return {
    handleGenerateWebsites,
    handleUseMockSuggestions,
    handleSelectAllWebsites,
    handleScrapeWebsites,
    filteredAndSortedWebsites,
  };
}

