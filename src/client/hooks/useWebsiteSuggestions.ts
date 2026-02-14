import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';

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
  generateSuggestionsViaWizard: (
    sessionId: string,
    queryId: string,
    revision?: number,
    executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>
  ) => Promise<BronWebsite[]>;
  generateMockSuggestions: (queryId: string) => Promise<BronWebsite[]>;
  setSuggestedWebsites: (websites: BronWebsite[]) => void;
  clearError: () => void;
  restoreProgressForQuery: (queryId: string) => void;
  cancelGeneration: () => void;
}

/**
 * Interface representing a website suggestion returned by the wizard action.
 * Matches the structure returned by the backend GenerateWebsiteSuggestionsAction.
 */
interface WizardSuggestedWebsite {
  id: string;
  url: string;
  label?: string;
  confidence?: number;
  source?: string;
  samenvatting?: string;
  relevantie?: string;
  website_types?: string[];
}

/**
 * Interface representing the output of the generateSuggestions wizard action.
 */
interface WizardSuggestionsOutput {
  suggestedWebsites: WizardSuggestedWebsite[];
  generatedAt: string;
  contextUpdates?: {
    suggestedWebsites?: WizardSuggestedWebsite[];
    websiteSuggestionsGeneratedAt?: string;
  };
}

/**
 * Custom hook for website suggestion generation
 * Handles website suggestion generation with progress tracking and error handling
 */
export function useWebsiteSuggestions(): UseWebsiteSuggestionsReturn {
  const [suggestedWebsites, setSuggestedWebsites] = useState<BronWebsite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<WebsiteGenerationProgress>({
    progress: 0,
    status: '',
  });
  const [apiKeysError, setApiKeysError] = useState<{
    message: string;
    canUseMock: boolean;
    missingKeys?: Record<string, boolean>;
  } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentQueryIdRef = useRef<string | null>(null);
  const PROGRESS_STORAGE_KEY_PREFIX = 'website_generation_progress_';
  const hasRestoredProgressRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);

  // Initialize isMountedRef
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cleanup polling on unmount
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Restore progress from localStorage when queryId is available
  // This handles page refresh scenarios where queryId exists but progress state is lost
  const restoreProgressIfNeeded = useCallback((queryId: string) => {
    // Only restore once per queryId
    if (hasRestoredProgressRef.current.has(queryId)) {
      return;
    }

    try {
      const stored = localStorage.getItem(`${PROGRESS_STORAGE_KEY_PREFIX}${queryId}`);
      if (stored) {
        const storedProgress = JSON.parse(stored) as WebsiteGenerationProgress;
        // Only restore if progress is less than 100% (operation might still be running)
        if (storedProgress.progress < 100 && storedProgress.progress > 0) {
          if (isMountedRef.current) {
            setProgress(storedProgress);
            setIsLoading(true);
          }
          hasRestoredProgressRef.current.add(queryId);
        } else {
          // Clear stored progress if completed
          localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${queryId}`);
          hasRestoredProgressRef.current.add(queryId);
        }
      }
    } catch (e) {
      // Ignore errors restoring progress, but log for tracking
      logError(e instanceof Error ? e : new Error('Failed to restore progress from localStorage'), 'restore-suggestions-progress');
    }
  }, []);

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    if (currentQueryIdRef.current && (progress.progress > 0 || progress.status)) {
      try {
        localStorage.setItem(
          `${PROGRESS_STORAGE_KEY_PREFIX}${currentQueryIdRef.current}`,
          JSON.stringify(progress)
        );
      } catch (e) {
        // Ignore quota errors, but log for tracking
        logError(e instanceof Error ? e : new Error('Failed to save progress to localStorage'), 'save-suggestions-progress');
      }
    }
  }, [progress]);

  // Poll for website generation progress
  useEffect(() => {
    if (!currentQueryIdRef.current || !isLoading) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    let pollCount = 0;
    const maxPolls = 120; // Stop after 2 minutes (120 * 1.5s)

    const pollProgress = async () => {
      if (!currentQueryIdRef.current || !isMountedRef.current) return;

      try {
        const progressData = await api.getQueryProgress(currentQueryIdRef.current);
        if (!isMountedRef.current) return;

        if (!progressData) return;

        pollCount++;

        // Update progress state
        setProgress({
          progress: progressData.progress,
          status: progressData.currentStep || '',
          estimatedSecondsRemaining: progressData.estimatedSecondsRemaining,
        });

        // Check if completed or error
        if (progressData.status === 'completed') {
          setProgress({
            progress: 100,
            status: 'Suggesties gegenereerd',
            estimatedSecondsRemaining: 0,
          });

          // Clear persisted progress when completed
          if (currentQueryIdRef.current) {
            try {
              localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentQueryIdRef.current}`);
              hasRestoredProgressRef.current.delete(currentQueryIdRef.current);
            } catch (_e) {
              // Ignore errors
            }
          }

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        } else if (progressData.status === 'error') {
          setProgress({
            progress: 0,
            status: 'Fout opgetreden',
            estimatedSecondsRemaining: undefined,
          });

          // Clear persisted progress on error
          if (currentQueryIdRef.current) {
            try {
              localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentQueryIdRef.current}`);
              hasRestoredProgressRef.current.delete(currentQueryIdRef.current);
            } catch (_e) {
              // Ignore errors
            }
          }

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          return;
        }

        // Stop polling if max polls reached
        if (pollCount >= maxPolls) {
          // Update status to indicate timeout
          if (isMountedRef.current) {
            setProgress((prev) => ({
              ...prev,
              status: prev.status || 'Generatie duurt langer dan verwacht...',
            }));
          }

          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        // Check if this is a 404 "progress not found" error
        // This can happen when:
        // 1. Progress is not initialized yet (will be eventually)
        // 2. Progress was already cleaned up (stale draft, server restart)
        // 3. The progress ID is from an old/expired session
        // 4. After a revision conflict retry, the query/progress might have been recreated
        const isNotFoundError = err instanceof Error && (
          err.message.includes('not found') ||
          err.message.includes('404') ||
          err.message.includes('Progress with identifier')
        );

        if (isNotFoundError) {
          // Stop polling - progress no longer exists on server
          // This is expected after revision conflicts or when progress is cleaned up
          console.debug('[useWebsiteSuggestions] Progress not found, stopping polling (this may be expected after revision conflicts):', err.message);

          // Clear persisted progress since it's stale
          if (currentQueryIdRef.current) {
            try {
              localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentQueryIdRef.current}`);
              hasRestoredProgressRef.current.delete(currentQueryIdRef.current);
            } catch (_e) {
              // Ignore errors
            }
          }

          // Stop polling and reset loading state
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (isMountedRef.current) {
            setIsLoading(false);
            setProgress({
              progress: 0,
              status: '',
              estimatedSecondsRemaining: undefined,
            });
          }
          return;
        }

        // For other errors, log and potentially show network error status
        logError(err, 'poll-website-generation-progress');

        // For network errors, update status to indicate connection issue
        const isNetworkError = err instanceof Error && (
          err.message.includes('Network Error') ||
          err.message.includes('timeout') ||
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('Failed to fetch')
        );

        if (isNetworkError && pollCount > 3) {
          // Only show network error after a few failed attempts
          if (isMountedRef.current) {
            setProgress((prev) => ({
              ...prev,
              status: 'Verbindingsprobleem - controleer uw internetverbinding',
            }));
          }
        }
      }
    };

    // Start polling after a short delay to allow backend to initialize progress
    const initialDelay = setTimeout(() => {
      pollProgress();
      // Ensure we don't start polling if unmounted or stopped during delay
      if (isMountedRef.current && isLoading && currentQueryIdRef.current) {
        pollIntervalRef.current = setInterval(pollProgress, 1500); // Poll every 1.5 seconds
      }
    }, 500);

    return () => {
      clearTimeout(initialDelay);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isLoading]);

  const generateSuggestionsViaWizard = useCallback(
    async (
      sessionId: string,
      queryId: string,
      revision?: number,
      executor?: (stepId: string, actionId: string, input: unknown) => Promise<unknown>
    ): Promise<BronWebsite[]> => {
      setIsLoading(true);
      setError(null);
      setApiKeysError(null);
      currentQueryIdRef.current = queryId;

      // Try to restore progress from localStorage first (in case of page refresh)
      restoreProgressIfNeeded(queryId);

      // Only reset progress if we didn't restore it
      if (!hasRestoredProgressRef.current.has(queryId)) {
        setProgress({
          progress: 0,
          status: '',
          estimatedSecondsRemaining: undefined,
        });
      }

      // Retry logic for revision conflicts
      let currentRevision = revision;
      const maxRetries = 3;
      let lastError: unknown;

      // Log start of operation for debugging
      console.log('[useWebsiteSuggestions] Starting generateSuggestionsViaWizard', {
        sessionId,
        queryId,
        revision: currentRevision,
        maxRetries,
      });

      // Retry loop for handling revision conflicts
      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          // Check if mounted at start of each attempt
          if (!isMountedRef.current) return [];

          try {
            let output: WizardSuggestionsOutput | undefined;

            if (executor) {
              // Use provided executor (which handles retry logic)
              const result = await executor('website-selection', 'generateSuggestions', { queryId });
              if (!isMountedRef.current) return [];
              // The executor returns response.output, which is the action output
              // Action output is { suggestedWebsites, generatedAt, contextUpdates }
              output = result as WizardSuggestionsOutput;
            } else {
              // Before executing action, ensure we're on the correct step
              // This handles the case where user navigated back and forward
              try {
                const sessionState = await api.wizard.getSessionState(sessionId);
                if (sessionState.currentStepId !== 'website-selection') {
                  // Navigate to website-selection step first
                  await api.wizard.navigate(sessionId, { targetStepId: 'website-selection' });
                  // Get updated revision after navigation
                  const updatedState = await api.wizard.getSessionState(sessionId);
                  currentRevision = updatedState.revision;
                }
              } catch (navError) {
                // If navigation fails, log but continue - the action execution will handle the error
                console.warn('Failed to navigate to website-selection before executing action:', navError);
              }
              
              // Fallback to direct API call
              const response = await api.wizard.executeAction(
                sessionId,
                'website-selection',
                'generateSuggestions',
                {
                  input: { queryId },
                  revision: currentRevision,
                }
              );
              if (!isMountedRef.current) return [];
              output = response.output as WizardSuggestionsOutput;
            }

            if (!output || !Array.isArray(output.suggestedWebsites)) {
              throw new Error('Invalid response from wizard generateSuggestions action');
            }

            // Convert suggested websites to BronWebsite format
            const validWebsites: BronWebsite[] = output.suggestedWebsites.map((site) => {
              return {
                _id: site.id,
                titel: site.label || site.url,
                url: site.url,
                label: site.label || site.url,
                samenvatting: site.samenvatting || '', // Preserve summary from ChatGPT
                'relevantie voor zoekopdracht': site.relevantie || '', // Preserve relevance from ChatGPT
                accepted: null,
                queryId,
                website_types: site.website_types || [], // Preserve website types from ChatGPT
              };
            });

            if (isMountedRef.current) {
              setSuggestedWebsites(validWebsites);
            }

            // Log metadata about suggestions (for debugging)
            // Note: Wizard response does not include metadata like onlyMunicipalityWebsite
            console.log('[useWebsiteSuggestions] Successfully generated suggestions', {
              queryId,
              count: validWebsites.length,
              attempt: attempt + 1,
            });
            
            return validWebsites;
          } catch (err) {
            if (!isMountedRef.current) return [];

            lastError = err;

            const apiError = err as {
              response?: {
                status?: number;
                data?: {
                  error?: string;
                  message?: string;
                  expectedRevision?: number;
                  actualRevision?: number;
                  code?: string;
                  canUseMock?: boolean;
                  missingKeys?: Record<string, boolean>;
                };
              };
              message?: string;
            };

            // Handle revision conflicts (409) - retry with updated revision
            const isRetryableRevisionConflict = apiError?.response?.status === 409 && attempt < maxRetries;
            
            if (isRetryableRevisionConflict && apiError.response) {
              const errorData = apiError.response.data as Record<string, unknown> | undefined;
              // actualRevision can be at top level or in context object
              // Backend puts it directly in the context object passed to ConflictError
              const context = errorData?.context as Record<string, unknown> | undefined;
              // Try multiple paths: errorData.actualRevision (top level) or context.actualRevision
              // Backend ConflictError puts actualRevision directly in the context object passed to the error
              const actualRevision = (
                (errorData?.actualRevision as number | undefined) ??
                (context?.actualRevision as number | undefined)
              );
              const expectedRevision = (
                (context?.expectedRevision as number | undefined) ??
                (errorData?.expectedRevision as number | undefined)
              );

              // Use debug level for handled revision conflicts to reduce console noise
              console.debug('[useWebsiteSuggestions] Revision conflict detected, will retry', {
                sessionId,
                queryId,
                expectedRevision,
                actualRevision,
                attempt: attempt + 1,
                maxRetries,
              });

              if (actualRevision !== undefined && actualRevision !== null) {
                // Use the actual revision from the error response
                currentRevision = actualRevision;
                // Exponential backoff: 100ms, 200ms, 400ms, 800ms (capped at 1000ms)
                const backoffMs = Math.min(100 * Math.pow(2, attempt), 1000);
                console.debug(`[useWebsiteSuggestions] Waiting ${backoffMs}ms before retry with revision ${actualRevision}...`);
                
                // Wait a bit before retrying to avoid immediate conflicts
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue; // Retry with updated revision (skip error logging for handled conflicts)
              } else {
                // This is a debugging case - revision conflict detected but actualRevision is missing
                // Log to centralized error handler for tracking
                const debugError = new Error('Revision conflict but actualRevision is missing from error response');
                logError(debugError, 'generate-suggestions-wizard-missing-actual-revision');
              }
            }

            // Only log errors that won't be retried (to reduce console noise for handled conflicts)
            // Log to centralized error handler for better tracking
            logError(err, `generate-suggestions-wizard-attempt-${attempt + 1}`);

            // Not a revision conflict, or retries exhausted - handle error normally
            // Handle revision conflicts (409) - final attempt failed
            if (apiError?.response?.status === 409) {
              const errorData = apiError.response.data as Record<string, unknown> | undefined;
              const context = errorData?.context as Record<string, unknown> | undefined;
              // Try multiple paths: context.actualRevision, errorData.actualRevision
              const actualRevision = (
                (context?.actualRevision as number | undefined) ??
                (errorData?.actualRevision as number | undefined)
              );
              const expectedRevision = (
                (context?.expectedRevision as number | undefined) ??
                (errorData?.expectedRevision as number | undefined)
              );
              const errorMessage = typeof errorData?.message === 'string'
                ? errorData.message
                : `Revision conflict: expected revision ${expectedRevision}, but found ${actualRevision}`;
              const error = new Error(errorMessage);
              if (isMountedRef.current) {
                setError(error);
              }
              logError(error, 'generate-suggestions-wizard-revision-conflict');
              throw error;
            }

            // Check if this is an API keys missing error
            if (apiError?.response?.status === 503 && apiError.response.data?.code === 'API_KEYS_MISSING') {
              const errorData = apiError.response.data;
              // Log API keys missing error for tracking (this is expected in some configurations)
              const apiKeysError = new Error(`API keys missing: ${errorData.message || 'API keys are not configured'}`);
              logError(apiKeysError, 'generate-suggestions-wizard-api-keys-missing');
              if (isMountedRef.current) {
                setApiKeysError({
                  message: errorData.message || 'API keys are not configured',
                  canUseMock: errorData.canUseMock || false,
                  missingKeys: errorData.missingKeys,
                });
              }
            } else {
              const error =
                err instanceof Error
                  ? err
                  : new Error(
                    apiError?.response?.data?.message ||
                    apiError?.message ||
                    'Failed to generate website suggestions via wizard'
                  );
              if (isMountedRef.current) {
                setError(error);
              }
              logError(error, `generate-suggestions-wizard-non-revision-error-attempt-${attempt + 1}`);
            }

            // If this is the last attempt, throw the error
            if (attempt >= maxRetries) {
              throw err;
            }
          }
        }

        // This should never be reached because:
        // - If successful, we return inside the loop
        // - If all retries fail, we throw in the catch block above
        // But if we somehow reach here, throw the last error
        if (lastError instanceof Error) {
          if (isMountedRef.current) {
            setError(lastError);
          }
          logError(lastError, 'generate-suggestions-wizard-unexpected-completion');
          throw lastError;
        } else {
          const error = new Error('Failed to generate website suggestions: unknown error');
          if (isMountedRef.current) {
            setError(error);
          }
          logError(error, 'generate-suggestions-wizard-unknown-error');
          throw error;
        }
      } catch (err) {
        // Catch any errors that escape the retry loop
        // This handles cases where errors are thrown but not properly caught
        const finalError = err instanceof Error ? err : new Error('Failed to generate website suggestions: unknown error');

        // Only log if we haven't already logged this error (errors from the loop are already logged)
        if (err !== lastError) {
          logError(finalError, 'generate-suggestions-wizard-escaped-error');
        }

        // Ensure error state is set (it may already be set in the inner catch block)
        if (isMountedRef.current) {
          setError(finalError);
        }

        throw finalError;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          // Only reset progress if operation completed successfully
          // Don't reset if there was an error or if we're still polling
          if (!pollIntervalRef.current) {
            setProgress({
              progress: 0,
              status: '',
              estimatedSecondsRemaining: undefined,
            });
            // Clear persisted progress
            if (currentQueryIdRef.current) {
              try {
                localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentQueryIdRef.current}`);
                hasRestoredProgressRef.current.delete(currentQueryIdRef.current);
              } catch (_e) {
                // Ignore errors
              }
            }
            currentQueryIdRef.current = null;
          }
        }
      }
    },
    [restoreProgressIfNeeded]
  );

  const generateSuggestions = useCallback(async (queryId: string): Promise<BronWebsite[]> => {
    setIsLoading(true);
    setError(null);
    setApiKeysError(null);
    currentQueryIdRef.current = queryId;

    // Reset progress state
    setProgress({
      progress: 0,
      status: '',
      estimatedSecondsRemaining: undefined,
    });

    try {
      const result = await api.generateWebsiteSuggestions(queryId);
      if (!isMountedRef.current) return [];

      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid API response: expected an object');
      }
      if (!Array.isArray(result.websites)) {
        throw new Error('Invalid API response: websites must be an array');
      }
      // Ensure all websites have required fields and generate _id if missing
      const validWebsites = result.websites
        .filter((website): website is BronWebsite => {
          return (
            website &&
            typeof website === 'object' &&
            typeof website.titel === 'string' &&
            typeof website.url === 'string' &&
            typeof website.samenvatting === 'string'
          );
        })
        .map((website, index) => {
          // Generate _id from URL hash if missing (matches backend logic)
          if (!website._id && website.url) {
            // Simple hash function to generate consistent ID from URL
            let hash = 0;
            for (let i = 0; i < website.url.length; i++) {
              const char = website.url.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash; // Convert to 32-bit integer
            }
            // Use queryId and index as fallback if hash fails
            website._id = Math.abs(hash).toString(36).substring(0, 24) || `${queryId}-${index}`;
          }
          return website;
        });
      setSuggestedWebsites(validWebsites);
      
      // Log metadata about suggestions (for debugging)
      const onlyMunicipalityWebsite = result.metadata?.onlyMunicipalityWebsite || false;
      const aiSuggestionsCount = result.metadata?.aiSuggestionsCount ?? validWebsites.length;
      
      console.log('[useWebsiteSuggestions] Successfully generated suggestions', {
        queryId,
        count: validWebsites.length,
        aiSuggestionsCount,
        onlyMunicipalityWebsite,
      });
      
      // Note: Even if only municipality website exists, we should still scrape it
      // The system will use the correct municipality-specific scraper
      // (e.g., DenBoschScraper, HorstAanDeMaasScraper) as configured in the database
      if (onlyMunicipalityWebsite) {
        console.log('[useWebsiteSuggestions] ℹ️  Only municipality website found - will use municipality-specific scraper when scraping');
      }
      
      return validWebsites;
    } catch (err) {
      if (!isMountedRef.current) throw err;

      const apiError = err as {
        response?: {
          status?: number;
          data?: {
            code?: string;
            message?: string;
            error?: string;
            canUseMock?: boolean;
            missingKeys?: Record<string, boolean>;
          };
        };
        message?: string;
        statusCode?: number;
      };

      // Check if this is an API keys missing error or internal server error (Google Search API not configured)
      const status = apiError?.response?.status || apiError?.statusCode;
      // Check multiple possible locations for error message
      const errorMessage = (
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        apiError?.message ||
        (typeof apiError?.response?.data === 'string' ? apiError.response.data : '') ||
        ''
      ).toLowerCase();
      const isApiError = status === 503 && apiError.response?.data?.code === 'API_KEYS_MISSING';

      // Log error for tracking (this is the non-wizard path, backward compatibility)
      const error = err instanceof Error ? err : new Error(`API failed: ${errorMessage}`);
      logError(error, `generate-suggestions-direct-api-status-${status}`);

      // Check if this is an API keys missing error
      if (isApiError && apiError.response?.data) {
        const errorData = apiError.response.data;
        setApiKeysError({
          message: errorData.message || 'API keys are not configured',
          canUseMock: errorData.canUseMock || false,
          missingKeys: errorData.missingKeys,
        });
      } else {
        const error =
          err instanceof Error
            ? err
            : new Error(
              apiError?.response?.data?.message ||
              apiError?.message ||
              'Failed to generate website suggestions'
            );
        setError(error);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        // Reset progress state
        setProgress({
          progress: 0,
          status: '',
          estimatedSecondsRemaining: undefined,
        });
      }
      currentQueryIdRef.current = null;
    }
  }, []);

  const generateMockSuggestions = useCallback(async (queryId: string): Promise<BronWebsite[]> => {
    setIsLoading(true);
    setError(null);
    setApiKeysError(null);

    try {
      const result = await api.generateMockWebsiteSuggestions(queryId);
      if (!isMountedRef.current) return [];

      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid API response: expected an object');
      }
      if (!Array.isArray(result.websites)) {
        throw new Error('Invalid API response: websites must be an array');
      }
      // Ensure all websites have required fields and generate _id if missing
      const validWebsites = result.websites
        .filter((website): website is BronWebsite => {
          return (
            website &&
            typeof website === 'object' &&
            typeof website.titel === 'string' &&
            typeof website.url === 'string' &&
            typeof website.samenvatting === 'string'
          );
        })
        .map((website, index) => {
          // Generate _id from URL hash if missing (matches backend logic)
          if (!website._id && website.url) {
            // Simple hash function to generate consistent ID from URL
            let hash = 0;
            for (let i = 0; i < website.url.length; i++) {
              const char = website.url.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash; // Convert to 32-bit integer
            }
            // Use queryId and index as fallback if hash fails
            website._id = Math.abs(hash).toString(36).substring(0, 24) || `${queryId}-${index}`;
          }
          return website;
        });
      setSuggestedWebsites(validWebsites);
      return validWebsites;
    } catch (err) {
      if (!isMountedRef.current) throw err;
      const apiError = err as { response?: { data?: { message?: string } }; message?: string };
      const error =
        err instanceof Error
          ? err
          : new Error(
            apiError?.response?.data?.message ||
            apiError?.message ||
            'Failed to generate mock website suggestions'
          );
      setError(error);
      throw error;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setApiKeysError(null);
  }, []);

  // Expose method to restore progress for a queryId (e.g., when restored from draft)
  const restoreProgressForQuery = useCallback((queryId: string) => {
    restoreProgressIfNeeded(queryId);
  }, [restoreProgressIfNeeded]);

  // Cancel generation - stops polling and clears loading state
  const cancelGeneration = useCallback(() => {
    // Stop polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Clear loading state
    if (isMountedRef.current) {
      setIsLoading(false);

      // Clear progress state
      setProgress({
        progress: 0,
        status: '',
        estimatedSecondsRemaining: undefined,
      });
    }

    // Clear persisted progress
    if (currentQueryIdRef.current) {
      try {
        localStorage.removeItem(`${PROGRESS_STORAGE_KEY_PREFIX}${currentQueryIdRef.current}`);
        hasRestoredProgressRef.current.delete(currentQueryIdRef.current);
      } catch (_e) {
        // Ignore errors
      }
      currentQueryIdRef.current = null;
    }
  }, []);

  return {
    suggestedWebsites,
    isLoading,
    error,
    progress,
    apiKeysError,
    generateSuggestions,
    generateSuggestionsViaWizard,
    generateMockSuggestions,
    setSuggestedWebsites,
    clearError,
    restoreProgressForQuery,
    cancelGeneration,
  };
}
