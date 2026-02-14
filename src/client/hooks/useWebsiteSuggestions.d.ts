export interface BronWebsite {
    _id?: string;
    titel: string;
    url: string;
    label: string;
    samenvatting: string;
    'relevantie voor zoekopdracht': string;
    accepted: boolean | null;
    subjects?: string[];
    themes?: string[];
    website_types?: string[];
    queryId?: string;
}
export interface WebsiteGenerationProgress {
    progress: number;
    status: string;
    estimatedSecondsRemaining?: number;
}
export interface UseWebsiteSuggestionsReturn {
    suggestedWebsites: BronWebsite[];
    isLoading: boolean;
    error: Error | null;
    progress: WebsiteGenerationProgress;
    apiKeysError: {
        message: string;
        canUseMock: boolean;
        missingKeys?: Record<string, boolean>;
    } | null;
    generateSuggestions: (queryId: string) => Promise<BronWebsite[]>;
    generateSuggestionsViaWizard: (sessionId: string, queryId: string, revision?: number, executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>) => Promise<BronWebsite[]>;
    generateMockSuggestions: (queryId: string) => Promise<BronWebsite[]>;
    setSuggestedWebsites: (websites: BronWebsite[]) => void;
    clearError: () => void;
    restoreProgressForQuery: (queryId: string) => void;
    cancelGeneration: () => void;
}
/**
 * Custom hook for website suggestion generation
 * Handles website suggestion generation with progress tracking and error handling
 */
export declare function useWebsiteSuggestions(): UseWebsiteSuggestionsReturn;
