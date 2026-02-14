/**
 * Hook for managing additional handlers in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */
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
export declare function useBeleidsscanHandlers({ wizardSession, wizardSessionId, navigateWizard, dispatch: _dispatch, setStep, restoreDraft, discardDraft, }: UseBeleidsscanHandlersProps): {
    handleStepNavigation: (targetStep: number) => Promise<void>;
    handleRestoreDraft: () => void;
    handleDiscardDraft: () => void;
};
export {};
