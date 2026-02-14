/**
 * useWizardNavigation Hook
 * 
 * Manages wizard navigation and step transitions.
 * Handles navigation errors and revision conflicts.
 */

import { useState, useCallback } from 'react';
import { api } from '../services/api';
import { logError, getOperationErrorMessage, createErrorWithRetry } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { withRevisionConflictRetry } from '../utils/revisionRetry';

export interface UseWizardNavigationReturn {
  isNavigating: boolean;
  error: Error | null;
  navigate: (sessionId: string, targetStepId: string, revision?: number) => Promise<void>;
  clearError: () => void;
}

/**
 * Custom hook for wizard navigation
 * 
 * Provides methods for navigating between wizard steps with proper error handling
 * and revision conflict management.
 */
export function useWizardNavigation(): UseWizardNavigationReturn {
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const navigate = useCallback(
    async (sessionId: string, targetStepId: string, revision?: number): Promise<void> => {
      setIsNavigating(true);
      setError(null);

      try {
        await withRevisionConflictRetry(
          (getCurrentRevision) => {
            const currentRevision = getCurrentRevision();
            return api.wizard.navigate(sessionId, {
              targetStepId,
              revision: currentRevision,
            });
          },
          async () => (await api.wizard.getSessionState(sessionId)).revision,
          () => revision,
          3
        );
      } catch (err) {
        const apiError = err as {
          response?: {
            status?: number;
            data?: {
              error?: string;
              message?: string;
              expectedRevision?: number;
              actualRevision?: number;
            };
          };
          message?: string;
        };

        // Handle revision conflicts (409) - If we're here, retries failed
        if (apiError?.response?.status === 409) {
          const errorData = apiError.response.data;
          const error = new Error(
            errorData?.message ||
              `Revision conflict: expected revision ${errorData?.expectedRevision}, but found ${errorData?.actualRevision}`
          );
          setError(error);
          logError(error, 'wizard-navigation-revision-conflict');
          getOperationErrorMessage('wizard-navigation', error); // Get error info for logging
          const errorWithRetry = createErrorWithRetry(
            error,
            () => {
              // Retry navigation by reloading the page as a last resort
              window.location.reload();
            },
            'wizard-navigation-revision-conflict'
          );
          toast.errorWithRetry(errorWithRetry);
          throw error;
        }

        // Handle other navigation errors (including prerequisite validation)
        interface NavigationErrorData {
          message?: string;
          details?: { suggestion?: string; [key: string]: unknown };
        }
        const navigationErrorData = apiError?.response?.data as NavigationErrorData | undefined;
        const errorMessage = navigationErrorData?.message || 
                            (navigationErrorData?.details && typeof navigationErrorData.details === 'object' && 'suggestion' in navigationErrorData.details 
                              ? navigationErrorData.details.suggestion 
                              : undefined) ||
                            apiError?.message ||
                            'Failed to navigate to step';
        
        const error =
          err instanceof Error
            ? err
            : new Error(errorMessage);
        setError(error);
        logError(error, 'wizard-navigation');
        getOperationErrorMessage('wizard-navigation', error); // Get error info for logging
        const errorWithRetry = createErrorWithRetry(
          error,
          () => {
            // Retry navigation
            navigate(sessionId, targetStepId, revision).catch(() => {
              // Ignore errors in retry
            });
          },
          'wizard-navigation'
        );
        toast.errorWithRetry(errorWithRetry);
        throw error;
      } finally {
        setIsNavigating(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isNavigating,
    error,
    navigate,
    clearError,
  };
}

