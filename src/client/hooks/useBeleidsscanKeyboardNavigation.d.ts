/**
 * Hook for managing keyboard navigation in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */
interface UseBeleidsscanKeyboardNavigationProps {
    currentStep: number;
    showGraphVisualizer: boolean;
    showWorkflowImport: boolean;
    canProceedStep1: boolean;
    canProceedStep4: boolean;
    isLoadingWebsites: boolean;
    isScrapingWebsites: boolean;
    documentsCount: number;
    queryId: string | null;
    onGenerateWebsites: () => void;
    onScrapeWebsites: () => void;
    onFinalizeDraft: () => void;
    onPreviousStep: () => void;
    onNextStep: () => void;
    onCloseGraphVisualizer: () => void;
    onCloseWorkflowImport: () => void;
}
/**
 * Hook for managing keyboard navigation in Beleidsscan component
 * Handles Escape key, arrow keys, and Enter key navigation
 */
export declare function useBeleidsscanKeyboardNavigation({ currentStep, showGraphVisualizer, showWorkflowImport, canProceedStep1, canProceedStep4, isLoadingWebsites, isScrapingWebsites, documentsCount, queryId, onGenerateWebsites, onScrapeWebsites, onFinalizeDraft, onPreviousStep, onNextStep, onCloseGraphVisualizer, onCloseWorkflowImport, }: UseBeleidsscanKeyboardNavigationProps): void;
export {};
