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
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
interface UseBeleidsscanDataProps {
    queryId: string | undefined;
    currentStep: number;
    selectedWebsites: string[];
    documents: CanonicalDocument[];
    setIsLoadingDocuments: (loading: boolean) => void;
    setDocuments: React.Dispatch<React.SetStateAction<LightweightDocument[]>>;
    setDocumentsError: (error: Error | null) => void;
}
export declare function useBeleidsscanData({ queryId, currentStep, selectedWebsites, documents, setIsLoadingDocuments, setDocuments, setDocumentsError, }: UseBeleidsscanDataProps): {
    createQueryHook: (data: import("../services/api").QueryData) => Promise<string>;
    suggestedWebsites: import("./useWebsiteSuggestions").BronWebsite[];
    isLoadingWebsites: boolean;
    websiteGenerationProgress: number;
    websiteGenerationStatus: string;
    websiteGenerationEstimatedTime: number | undefined;
    websiteSuggestionsError: Error | null;
    apiKeysError: {
        message: string;
        canUseMock: boolean;
        missingKeys?: Record<string, boolean>;
    } | null;
    generateWebsiteSuggestionsHook: (queryId: string) => Promise<import("./useWebsiteSuggestions").BronWebsite[]>;
    generateSuggestionsViaWizardHook: (sessionId: string, queryId: string, revision?: number, executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>) => Promise<import("./useWebsiteSuggestions").BronWebsite[]>;
    generateMockWebsiteSuggestionsHook: (queryId: string) => Promise<import("./useWebsiteSuggestions").BronWebsite[]>;
    clearWebsiteSuggestionsError: () => void;
    restoreWebsiteGenerationProgress: (queryId: string) => void;
    cancelWebsiteGeneration: () => void;
    isScrapingWebsites: boolean;
    scanProgress: import("./useScan").ScanProgress;
    scrapingProgress: number;
    scrapingStatus: string;
    scrapingDocumentsFound: number;
    scrapingEstimatedTime: number | null;
    startScan: (params: {
        queryId: string;
        websiteIds: string[];
        onderwerp: string;
        overheidslaag?: string;
        overheidsinstantie?: string;
    }) => Promise<string>;
    startScanViaWizard: (sessionId: string, queryId: string, revision?: number, executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>) => Promise<string>;
    gemeenten: string[];
    waterschappen: string[];
    provincies: string[];
    isLoadingJurisdictions: boolean;
    availableWorkflowOutputs: import("./useWorkflow").WorkflowOutputSummary[];
    selectedWorkflowOutput: string | null;
    workflowOutput: import("../services/api").WorkflowOutput | null;
    isLoadingWorkflowOutputs: boolean;
    isImportingWorkflow: boolean;
    loadWorkflowOutputsHook: () => Promise<void>;
    loadWorkflowOutputHook: (outputName: string) => Promise<void>;
    importWorkflowOutputHook: (outputName: string, queryId: string) => Promise<{
        documents: import("../utils/transformations").BronDocument[];
        websites: import("../services/api").BronWebsite[];
        documentsCreated: number;
        websitesCreated: number;
    }>;
    setSelectedWorkflowOutput: (name: string | null) => void;
    setWorkflowOutputState: (output: import("../services/api").WorkflowOutput | null) => void;
    filteredDocuments: LightweightDocument[];
    documentFilter: import("./useDocumentFiltering").DocumentFilter;
    setDocumentFilter: (filter: import("./useDocumentFiltering").DocumentFilter) => void;
    documentSortBy: import("./useDocumentFiltering").DocumentSortBy;
    setDocumentSortBy: (sortBy: import("./useDocumentFiltering").DocumentSortBy) => void;
    documentSortDirection: import("./useDocumentFiltering").DocumentSortDirection;
    setDocumentSortDirection: (direction: import("./useDocumentFiltering").DocumentSortDirection) => void;
    documentSearchQuery: string;
    setDocumentSearchQuery: (query: string) => void;
    debouncedDocumentSearchQuery: string;
    documentTypeFilter: string | null;
    setDocumentTypeFilter: (type: string | null) => void;
    documentDateFilter: import("./useDocumentFiltering").DocumentDateFilter;
    setDocumentDateFilter: (filter: import("./useDocumentFiltering").DocumentDateFilter) => void;
    documentWebsiteFilter: string | null;
    setDocumentWebsiteFilter: (website: string | null) => void;
    availableDocumentTypes: string[];
    filterPresets: import("./useFilterPresets").FilterPreset[];
    saveFilterPreset: (preset: Omit<import("./useFilterPresets").FilterPreset, "id">) => import("./useFilterPresets").FilterPreset;
    deleteFilterPreset: (presetId: string) => void;
    wizardSession: import("../services/api/WizardApiService").WizardSession | null;
    wizardSessionId: string | null;
    createWizardSession: (wizardDefinitionId: string, wizardDefinitionVersion?: number) => Promise<string>;
    navigateWizard: (targetStepId: string) => Promise<import("../services/api/WizardApiService").WizardSession>;
    validateWizardInput: (stepId: string, input: unknown) => Promise<boolean>;
    executeWizardAction: (stepId: string, actionId: string, input: unknown) => Promise<unknown>;
    markWizardStepCompleted: (stepId: string, output: unknown) => Promise<void>;
    getWizardResult: () => Promise<import("../services/api/WizardApiService").WizardResult | null>;
    documentsLoadAttemptedRef: import("react").RefObject<Map<string, number>>;
    activeConfiguration: import("../services/api").WorkflowConfiguration | null;
    availableWorkflows: import("../services/api").AvailableBeleidsscanWorkflow[];
    isLoadingWorkflowConfig: boolean;
    workflowConfigError: Error | null;
};
export {};
