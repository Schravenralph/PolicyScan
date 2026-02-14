import { useMemo } from 'react';

/**
 * Hook to derive computed values from hook results
 * Extracts derived variables to reduce component size
 */
export function useBeleidsscanDerivedValues({
  scanProgress,
  websiteGenerationProgressData,
  websiteSelection,
  documentReview,
}: {
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
}) {
  // Scraping progress variables (derived from hook)
  const scrapingProgress = useMemo(() => scanProgress.progress, [scanProgress.progress]);
  const scrapingStatus = useMemo(() => scanProgress.status, [scanProgress.status]);
  const scrapingDocumentsFound = useMemo(() => scanProgress.documentsFound, [scanProgress.documentsFound]);
  const scrapingEstimatedTime = useMemo(() => scanProgress.estimatedTime, [scanProgress.estimatedTime]);

  // Website generation progress tracking (now managed by useWebsiteSuggestions hook)
  const websiteGenerationProgress = useMemo(
    () => websiteGenerationProgressData.progress,
    [websiteGenerationProgressData.progress]
  );
  const websiteGenerationStatus = useMemo(
    () => websiteGenerationProgressData.status,
    [websiteGenerationProgressData.status]
  );
  const websiteGenerationEstimatedTime = useMemo(
    () => websiteGenerationProgressData.estimatedSecondsRemaining,
    [websiteGenerationProgressData.estimatedSecondsRemaining]
  );

  // Use context values for website selection and document review
  const selectedWebsites = useMemo(() => websiteSelection.selectedWebsites, [websiteSelection.selectedWebsites]);
  const websiteSearchQuery = useMemo(
    () => websiteSelection.websiteSearchQuery,
    [websiteSelection.websiteSearchQuery]
  );
  const websiteSortBy = useMemo(() => websiteSelection.websiteSortBy, [websiteSelection.websiteSortBy]);
  const websiteFilterType = useMemo(
    () => websiteSelection.websiteFilterType,
    [websiteSelection.websiteFilterType]
  );

  const documents = useMemo(() => documentReview.documents, [documentReview.documents]);
  const selectedDocuments = useMemo(() => documentReview.selectedDocuments, [documentReview.selectedDocuments]);
  const isLoadingDocuments = useMemo(
    () => documentReview.isLoadingDocuments,
    [documentReview.isLoadingDocuments]
  );

  return {
    // Scraping progress
    scrapingProgress,
    scrapingStatus,
    scrapingDocumentsFound,
    scrapingEstimatedTime,
    // Website generation progress
    websiteGenerationProgress,
    websiteGenerationStatus,
    websiteGenerationEstimatedTime,
    // Website selection
    selectedWebsites,
    websiteSearchQuery,
    websiteSortBy,
    websiteFilterType,
    // Document review
    documents,
    selectedDocuments,
    isLoadingDocuments,
  };
}

