/**
 * useWizardSession Hook
 *
 * Manages wizard session state and provides methods for session operations.
 */
import type { WizardSession, WizardState, WizardResult } from '../services/api/WizardApiService';
export interface UseWizardSessionReturn {
    session: WizardSession | null;
    sessionId: string | null;
    isLoading: boolean;
    error: Error | null;
    createSession: (wizardDefinitionId: string, wizardDefinitionVersion?: number) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    navigate: (targetStepId: string) => Promise<WizardSession>;
    validateInput: (stepId: string, input: unknown) => Promise<boolean>;
    executeAction: (stepId: string, actionId: string, input: unknown) => Promise<unknown>;
    markStepCompleted: (stepId: string, output: unknown) => Promise<void>;
    getState: () => Promise<WizardState | null>;
    getResult: () => Promise<WizardResult | null>;
    clearError: () => void;
}
/**
 * Custom hook for wizard session management
 */
export declare function useWizardSession(): UseWizardSessionReturn;
