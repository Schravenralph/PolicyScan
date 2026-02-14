import React from 'react';
import type { BronWebsite } from '../../services/api';
interface Step2WebsiteSelectionProps {
    suggestedWebsites: BronWebsite[];
    isScrapingWebsites: boolean;
    scrapingProgress: number;
    scrapingStatus: string;
    scrapingDocumentsFound: number;
    scrapingEstimatedTime?: number;
    handleSelectAllWebsites: () => void;
    handleScrapeWebsites: () => void;
    websiteSuggestionsError?: string | null;
    clearWebsiteSuggestionsError?: () => void;
    handleStepNavigation?: (step: number) => void;
    saveDraftToStorage?: () => void;
}
export declare const Step2WebsiteSelection: React.FC<Step2WebsiteSelectionProps>;
export {};
