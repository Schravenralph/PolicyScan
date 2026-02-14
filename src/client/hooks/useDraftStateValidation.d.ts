/**
 * Hook for validating if draft state has meaningful content
 * Extracted from Beleidsscan component to reduce component size
 */
import type { BeleidsscanDraft } from './useDraftPersistence.js';
interface UseDraftStateValidationProps {
    draftState: BeleidsscanDraft;
}
/**
 * Hook for validating if draft state has meaningful content
 * Determines if the draft contains enough information to be worth saving
 */
export declare function useDraftStateValidation({ draftState, }: UseDraftStateValidationProps): {
    hasMeaningfulState: boolean;
};
export {};
