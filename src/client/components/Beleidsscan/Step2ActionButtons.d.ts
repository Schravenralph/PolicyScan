/**
 * Step2 Action Buttons Component
 *
 * Navigation buttons, scrape button, save draft, progress indicator,
 * and completion button for Step2WebsiteSelection.
 */
interface Step2ActionButtonsProps {
    onBack: () => void;
    onNavigateToStep3: () => Promise<void>;
    handleStepNavigation?: (step: number) => Promise<void>;
    isScrapingWebsites: boolean;
    scrapingProgress: number;
    scrapingStatus: string;
    scrapingDocumentsFound: number;
    scrapingEstimatedTime?: number;
    documents: unknown[];
    selectedWebsites: string[];
    canProceedStep4: boolean;
    onScrapeWebsites: () => Promise<void>;
    saveDraftToStorage: () => void;
    showScrapingInfo: boolean;
    onShowScrapingInfoChange: (show: boolean) => void;
    workflowRunId: string | null;
}
declare function Step2ActionButtonsComponent({ onBack, onNavigateToStep3, handleStepNavigation, isScrapingWebsites, scrapingProgress, scrapingStatus, scrapingDocumentsFound, scrapingEstimatedTime, documents, selectedWebsites, canProceedStep4, onScrapeWebsites, saveDraftToStorage, showScrapingInfo, onShowScrapingInfoChange, workflowRunId: _workflowRunId, }: Step2ActionButtonsProps): import("react/jsx-runtime").JSX.Element;
export declare const Step2ActionButtons: import("react").MemoExoticComponent<typeof Step2ActionButtonsComponent>;
export {};
