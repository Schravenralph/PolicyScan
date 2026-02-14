/**
 * Hook for managing additional side effects in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */
import { reconcileDraftState, type ServerSessionState } from '../services/draftReconciliation.js';
import type { BeleidsscanDraft } from './useDraftPersistence.js';
import type { DocumentFilter } from './useDocumentFiltering.js';
import type { ValidationErrors } from '../context/BeleidsscanContext.js';
interface UseBeleidsscanEffectsProps {
    currentStep: number;
    suggestedWebsitesLength: number;
    isLoadingWebsites: boolean;
    onTransitionToStep2: () => void;
    shouldTransitionToStep2Ref: React.MutableRefObject<boolean>;
    onderwerp: string;
    overheidslaag: string | null;
    selectedEntity: string;
    validationErrors: ValidationErrors;
    setValidationErrors: (errors: ValidationErrors | ((prev: ValidationErrors) => ValidationErrors)) => void;
    validateOnderwerp: (value: string) => string | null | undefined;
    setWebsiteSearchQuery: (query: string) => void;
    setWebsiteFilterType: (type: string | null) => void;
    setWebsiteSortBy: (sortBy: 'relevance' | 'name' | 'type') => void;
    setSelectedDocuments: ((updater: (prev: string[]) => string[]) => void) | ((docs: string[]) => void);
    setDocumentFilter: (filter: DocumentFilter) => void;
    hasDraft: boolean;
    wizardSessionId: string | null;
    pendingDraft: BeleidsscanDraft | null;
    setServerSessionState: (state: ServerSessionState | null) => void;
    setReconciliationResult: (result: ReturnType<typeof reconcileDraftState> | null) => void;
    setShowReconciliationDialog: (show: boolean) => void;
    setShowDraftRestorePrompt?: (show: boolean) => void;
}
/**
 * Hook for managing additional side effects in Beleidsscan component
 * Handles step transitions, validation, and filter resets
 */
export declare function useBeleidsscanEffects({ currentStep, suggestedWebsitesLength, isLoadingWebsites, onTransitionToStep2, shouldTransitionToStep2Ref, onderwerp, overheidslaag, selectedEntity, validationErrors: _validationErrors, setValidationErrors, validateOnderwerp, setWebsiteSearchQuery, setWebsiteFilterType, setWebsiteSortBy, setSelectedDocuments, setDocumentFilter, hasDraft, wizardSessionId, pendingDraft, setServerSessionState, setReconciliationResult, setShowReconciliationDialog, setShowDraftRestorePrompt, }: UseBeleidsscanEffectsProps): void;
export {};
