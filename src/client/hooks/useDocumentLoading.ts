/**
 * Hook for managing document loading with race condition protection
 * Extracted from Beleidsscan component to reduce component size
 */

import { useEffect, useRef } from 'react';
import { wizardService } from '../services/wizard/WizardService';
import { logError, createErrorWithRetry, getOperationErrorMessage } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import type { CanonicalDocument } from '../services/api';
import { createLightweightDocuments, type LightweightDocument } from '../utils/documentStateOptimization';

interface UseDocumentLoadingProps {
  queryId: string | null;
  currentStep: number;
  isScrapingWebsites: boolean;
  scanProgress: { progress: number; status: string };
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
export function useDocumentLoading({
  queryId,
  currentStep,
  isScrapingWebsites,
  scanProgress,
  wizardSessionId,
  selectedWebsites,
  markWizardStepCompleted,
  setIsLoadingDocuments,
  setDocuments,
  setDocumentsError,
}: UseDocumentLoadingProps) {
  // Refs for race condition protection
  const isLoadingDocumentsRef = useRef(false);
  const documentsLoadAttemptedRef = useRef<Map<string, number>>(new Map());
  const documentsLoadedForQueryIdRef = useRef<string | null>(null);

  /**
   * Load documents when Step 3 is accessed
   */
  useEffect(() => {
    // Only load if we're on Step 3, have a queryId, and documents aren't already loading
    if (currentStep !== 3 || !queryId || isLoadingDocumentsRef.current) {
      return;
    }

    // Clear ref when queryId changes to allow reloading for new queries
    // Set ref to new queryId immediately to prevent stale responses from old queries
    const trackedQueryIds = Array.from(documentsLoadAttemptedRef.current.keys());
    const hasDifferentQueryId = trackedQueryIds.length > 0 && !trackedQueryIds.includes(queryId);
    if (hasDifferentQueryId) {
      documentsLoadAttemptedRef.current.clear();
      // Set to new queryId immediately to prevent stale responses from old queries
      documentsLoadedForQueryIdRef.current = queryId;
    }

    // Prevent duplicate queries for the same queryId within a short time window (5 seconds)
    const lastAttempt = documentsLoadAttemptedRef.current.get(queryId);
    const now = Date.now();
    if (lastAttempt && (now - lastAttempt) < 5000) {
      if (documentsLoadedForQueryIdRef.current === queryId) {
        return;
      }
    }

    // Mark this queryId as being loaded with current timestamp
    documentsLoadAttemptedRef.current.set(queryId, now);
    setIsLoadingDocuments(true);
    setDocumentsError(null);

    // Capture queryId in closure to check against ref when response arrives
    const currentQueryId = queryId;
    wizardService.getDocuments(queryId)
      .then(docs => {
        // Type safety: Ensure docs is an array
        if (Array.isArray(docs)) {
          // Use functional update to prevent race conditions
          // Only update if:
          // 1. Ref is null (first load ever), OR
          // 2. Ref matches currentQueryId (we're still expecting this queryId)
          // This prevents stale responses from previous queryIds when queryId changes
          const shouldUpdate = documentsLoadedForQueryIdRef.current === null || 
                               documentsLoadedForQueryIdRef.current === currentQueryId;
          if (shouldUpdate) {
            // Strip large fields (fullText) from documents before storing in state
            // This prevents React DevTools from exceeding 64MB serialization limit
            const lightweightDocs = createLightweightDocuments(docs);
            setDocuments(_prev => lightweightDocs);
            setDocumentsError(null);
            documentsLoadedForQueryIdRef.current = currentQueryId;
          }
        } else {
          logError(new Error('API returned non-array documents'), 'load-documents-step3');
          setDocuments((prev: LightweightDocument[]) => prev.length === 0 ? [] : prev);
          setDocumentsError('Ongeldig documentformaat ontvangen');
          documentsLoadedForQueryIdRef.current = null;
        }
      })
      .catch(error => {
        logError(error, 'load-documents-step3');
        const errorInfo = getOperationErrorMessage('load-documents', error);
        setDocumentsError(errorInfo.message);
        const errorWithRetry = createErrorWithRetry(
          error,
          () => {
            // Retry by clearing the ref and triggering reload
            documentsLoadAttemptedRef.current.delete(currentQueryId);
            documentsLoadedForQueryIdRef.current = null;
            setIsLoadingDocuments(true);
            wizardService.getDocuments(currentQueryId)
              .then(docs => {
                if (Array.isArray(docs)) {
                  // Strip large fields (fullText) from documents before storing in state
                  const lightweightDocs = createLightweightDocuments(docs);
                  setDocuments((_prev: LightweightDocument[]) => lightweightDocs);
                  setDocumentsError(null);
                  documentsLoadedForQueryIdRef.current = currentQueryId;
                }
              })
              .catch(err => {
                logError(err, 'load-documents-retry');
                const retryErrorInfo = getOperationErrorMessage('load-documents', err);
                setDocumentsError(retryErrorInfo.message);
              })
              .finally(() => setIsLoadingDocuments(false));
          },
          'load-documents-step3'
        );
        toast.errorWithRetry(errorWithRetry);
        documentsLoadAttemptedRef.current.delete(queryId);
        documentsLoadedForQueryIdRef.current = null;
      })
      .finally(() => {
        setIsLoadingDocuments(false);
      });
  }, [currentStep, queryId, setIsLoadingDocuments, setDocuments, setDocumentsError]);

  /**
   * Load documents when scraping completes
   */
  useEffect(() => {
    if (!isScrapingWebsites && scanProgress.progress === 100 && scanProgress.status === 'Scraping voltooid' && queryId && !isLoadingDocumentsRef.current) {
      setIsLoadingDocuments(true);
      setDocumentsError(null);
      (async () => {
        try {
          const currentQueryId = queryId;
          const docs = await wizardService.getDocuments(queryId);
          if (Array.isArray(docs)) {
            if (documentsLoadedForQueryIdRef.current !== currentQueryId) {
              // Strip large fields (fullText) from documents before storing in state
              // This prevents React DevTools from exceeding 64MB serialization limit
              const lightweightDocs = createLightweightDocuments(docs);
              setDocuments(_prev => lightweightDocs);
              documentsLoadAttemptedRef.current.set(currentQueryId, Date.now());
              documentsLoadedForQueryIdRef.current = currentQueryId;
              toast.success('Scraping voltooid', `${docs.length} documenten gevonden.`);
              
              // Mark step 2 as completed in wizard session when scraping completes successfully
              // Note: This ensures the step is marked even if it wasn't marked during confirmSelection
              // The output must match confirmWebsiteSelectionOutputSchema
              if (wizardSessionId && docs.length > 0 && markWizardStepCompleted && selectedWebsites.length > 0) {
                try {
                  // Ensure selectedWebsites is an array of strings (website IDs)
                  const selectedWebsiteIds = Array.isArray(selectedWebsites) 
                    ? selectedWebsites.map(w => typeof w === 'string' ? w : (w as { _id?: string })._id || '').filter(Boolean)
                    : [];
                  
                  if (selectedWebsiteIds.length > 0) {
                    const output = {
                      selectedWebsiteIds,
                      websiteCount: selectedWebsiteIds.length,
                      contextUpdates: {
                        selectedWebsiteIds,
                      },
                    };
                    await markWizardStepCompleted('website-selection', output);
                  }
                } catch (error) {
                  logError(error as Error, 'mark-step2-completed');
                }
              }
            }
          } else {
            logError(new Error('API returned non-array documents'), 'load-documents-scan-complete');
            setDocuments((prev: LightweightDocument[]) => prev.length === 0 ? [] : prev);
            setDocumentsError('Ongeldig documentformaat ontvangen');
            toast.error('Fout bij laden documenten', 'Ongeldig documentformaat ontvangen');
            documentsLoadedForQueryIdRef.current = null;
          }
        } catch (error) {
          logError(error, 'load-documents-scan-complete');
          const apiError = error as { response?: { data?: { message?: string } }; message?: string };
          const errorMessage = apiError?.response?.data?.message || apiError?.message || 'Fout bij laden documenten';
          setDocumentsError(errorMessage);
          toast.error('Fout bij laden documenten', errorMessage);
        } finally {
          setIsLoadingDocuments(false);
        }
      })();
    }
  }, [isScrapingWebsites, scanProgress.progress, scanProgress.status, queryId, wizardSessionId, selectedWebsites, markWizardStepCompleted, setIsLoadingDocuments, setDocuments, setDocumentsError]);

  // Expose refs for external use if needed
  return {
    isLoadingDocumentsRef,
    documentsLoadAttemptedRef,
    documentsLoadedForQueryIdRef,
  };
}

