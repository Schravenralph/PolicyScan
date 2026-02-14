/**
 * Hook for managing additional handlers in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */

import { useCallback } from 'react';
import { toast } from '../utils/toast';
import { logError } from '../utils/errorHandler';
import { getWizardStepId } from '../components/Beleidsscan/navigation';
import type { WizardSession } from '../services/api/WizardApiService';
import type { BeleidsscanAction } from '../reducers/beleidsscanReducer';
import type { Dispatch } from 'react';

interface UseBeleidsscanHandlersProps {
  wizardSession: WizardSession | null;
  wizardSessionId: string | null;
  navigateWizard: (stepId: string) => Promise<import('../services/api/WizardApiService').WizardSession>;
  dispatch: Dispatch<BeleidsscanAction>;
  setStep: (step: number) => void;
  restoreDraft: () => void;
  discardDraft: () => void;
}

/**
 * Hook for managing additional handlers in Beleidsscan component
 * Handles step navigation, draft restore, and draft discard
 */
export function useBeleidsscanHandlers({
  wizardSession,
  wizardSessionId,
  navigateWizard,
  dispatch: _dispatch,
  setStep,
  restoreDraft,
  discardDraft,
}: UseBeleidsscanHandlersProps) {
  /**
   * Navigation handler that uses wizard session API when available
   */
  const handleStepNavigation = useCallback(async (targetStep: number) => {
    if (wizardSession && wizardSessionId) {
      const targetStepId = getWizardStepId(targetStep);
      
      if (targetStepId) {
        try {
          await navigateWizard(targetStepId);
          setStep(targetStep);
        } catch (error) {
          logError(error as Error, 'wizard-navigation');
          
          // Extract detailed error message from API response
          const apiError = error as {
            response?: {
              data?: {
                message?: string;
                details?: {
                  suggestion?: string;
                  missingPrerequisiteNames?: string[];
                };
              };
            };
            message?: string;
          };
          
          // Use detailed error message if available, otherwise use generic message
          const errorMessage = apiError?.response?.data?.message || 
                              apiError?.response?.data?.details?.suggestion ||
                              apiError?.message ||
                              'Kon niet naar deze stap navigeren. Controleer of alle vereisten zijn voltooid.';
          
          // Show warning but allow fallback navigation for better UX
          // This ensures navigation works even when wizard session validation fails
          // Error already logged above, toast provides user feedback
          toast.warning('Navigatiefout', `${errorMessage} Directe navigatie wordt gebruikt.`);
          
          // Fallback to direct step navigation for better UX and backward compatibility
          // This allows navigation even when wizard session prerequisites aren't met
          setStep(targetStep);
        }
      } else {
        // No step ID mapping, use direct navigation
        setStep(targetStep);
      }
    } else {
      // No wizard session, use direct navigation
      setStep(targetStep);
    }
  }, [wizardSession, wizardSessionId, navigateWizard, setStep]);

  /**
   * Draft restore handler
   */
  const handleRestoreDraft = useCallback(() => {
    restoreDraft();
    toast.success('Concept hersteld', 'Uw vorige voortgang is hersteld. U kunt doorgaan waar u was gebleven.');
  }, [restoreDraft]);

  /**
   * Draft discard handler
   */
  const handleDiscardDraft = useCallback(() => {
    discardDraft();
    toast.info('Concept verwijderd', 'Het opgeslagen concept is verwijderd.');
  }, [discardDraft]);

  return {
    handleStepNavigation,
    handleRestoreDraft,
    handleDiscardDraft,
  };
}



