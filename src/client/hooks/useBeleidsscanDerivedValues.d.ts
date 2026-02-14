/**
 * Hook to derive computed values from hook results
 * Extracts derived variables to reduce component size
 */
export declare function useBeleidsscanDerivedValues({ scanProgress, websiteGenerationProgressData, websiteSelection, documentReview, }: {
    scanProgress: {
        progress: number;
        status: string;
        documentsFound: number;
        estimatedTime: number | null;
    };
    websiteGenerationProgressData: {
        progress: number;
        status: string;
        estimatedSecondsRemaining: number | null;
    };
    websiteSelection: {
        selectedWebsites: string[];
        websiteSearchQuery: string;
        websiteSortBy: string;
        websiteFilterType: string;
    };
    documentReview: {
        documents: unknown[];
        selectedDocuments: string[];
        isLoadingDocuments: boolean;
    };
}): {
    scrapingProgress: number;
    scrapingStatus: string;
    scrapingDocumentsFound: number;
    scrapingEstimatedTime: number | null;
    websiteGenerationProgress: number;
    websiteGenerationStatus: string;
    websiteGenerationEstimatedTime: number | null;
    selectedWebsites: string[];
    websiteSearchQuery: string;
    websiteSortBy: string;
    websiteFilterType: string;
    documents: unknown[];
    selectedDocuments: string[];
    isLoadingDocuments: boolean;
};
