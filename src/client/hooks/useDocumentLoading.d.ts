/**
 * Hook for managing document loading with race condition protection
 * Extracted from Beleidsscan component to reduce component size
 */
import { type LightweightDocument } from '../utils/documentStateOptimization';
interface UseDocumentLoadingProps {
    queryId: string | null;
    currentStep: number;
    isScrapingWebsites: boolean;
    scanProgress: {
        progress: number;
        status: string;
    };
    wizardSessionId: string | null;
    selectedWebsites: string[];
    markWizardStepCompleted?: (stepId: string, data: unknown) => Promise<void>;
    setIsLoadingDocuments: (loading: boolean) => void;
    setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => void;
    setDocumentsError: (error: string | null) => void;
}
/**
 * Hook for managing document loading with race condition protection
 * Handles loading documents when Step 3 is accessed and when scraping completes
 */
export declare function useDocumentLoading({ queryId, currentStep, isScrapingWebsites, scanProgress, wizardSessionId, selectedWebsites, markWizardStepCompleted, setIsLoadingDocuments, setDocuments, setDocumentsError, }: UseDocumentLoadingProps): {
    isLoadingDocumentsRef: import("react").RefObject<boolean>;
    documentsLoadAttemptedRef: import("react").RefObject<Map<string, number>>;
    documentsLoadedForQueryIdRef: import("react").RefObject<string | null>;
};
export {};
