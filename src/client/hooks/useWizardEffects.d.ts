/**
 * Hook for managing wizard-related side effects
 * Extracted from Beleidsscan component to reduce component size
 */
import type { WizardResult } from '../services/api/WizardApiService';
interface UseWizardEffectsProps {
    wizardSession: {
        status: string;
    } | null;
    wizardSessionId: string | null;
    getWizardResult: () => Promise<WizardResult | null>;
    clearDraft: () => void;
    queryId: string | null;
    selectedWebsites: string[];
    setSelectedWebsites: ((updater: (prev: string[]) => string[]) => void) | ((websites: string[]) => void) | any;
    suggestedWebsites: Array<{
        _id?: string;
    }>;
    SELECTED_WEBSITES_KEY_PREFIX: string;
    saveDraftSync: () => void;
    hasMeaningfulState: boolean | string;
    logError: (error: unknown, context: string) => void;
}
/**
 * Hook for managing wizard-related side effects
 * Handles wizard result loading, website selection persistence, and draft auto-save
 */
export declare function useWizardEffects({ wizardSession, wizardSessionId: _wizardSessionId, getWizardResult, clearDraft, queryId, selectedWebsites, setSelectedWebsites, suggestedWebsites, SELECTED_WEBSITES_KEY_PREFIX, saveDraftSync, hasMeaningfulState, logError, }: UseWizardEffectsProps): {
    wizardResult: WizardResult | null;
    setWizardResult: import("react").Dispatch<import("react").SetStateAction<WizardResult | null>>;
};
export {};
