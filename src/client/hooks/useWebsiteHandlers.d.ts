/**
 * Custom hook for website-related handlers in Beleidsscan component
 * Handles website generation, mock suggestions, selection, and scraping operations
 */
import type { BronWebsite } from '../services/api';
import type { WebsiteType } from '../components/Beleidsscan/types';
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
    wizardSession: {
        revision?: number;
    } | null;
    wizardSessionId: string | null;
    apiKeysError: {
        message: string;
        missingKeys?: {
            openai?: boolean;
            google?: boolean;
        };
        canUseMock?: boolean;
    } | null;
    state: {
        step: number;
    };
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
export declare function useWebsiteHandlers({ queryId, overheidslaag, selectedEntity, onderwerp, selectedWebsites, suggestedWebsites, websiteSearchQuery, websiteFilterType, websiteSortBy, wizardSession, wizardSessionId, apiKeysError, state, setQueryId, setSelectedWebsites, saveDraftToStorage, saveRecentSearch, createQueryHook, generateWebsiteSuggestionsHook, generateSuggestionsViaWizardHook, generateMockWebsiteSuggestionsHook, clearWebsiteSuggestionsError, validateWizardInput, executeWizardAction, markWizardStepCompleted, navigateWizard, startScan, startScanViaWizard, dispatch, actions, validateForm, shouldTransitionToStep2Ref, draftSaveTimerRef, }: UseWebsiteHandlersProps): UseWebsiteHandlersReturn;
