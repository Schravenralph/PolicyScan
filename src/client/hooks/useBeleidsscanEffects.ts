/**
 * Hook for managing additional side effects in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */

import { useEffect } from 'react';
import { api } from '../services/api.js';
import { reconcileDraftState, type ServerSessionState } from '../services/draftReconciliation.js';
import { logError } from '../utils/errorHandler.js';
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
  // Draft reconciliation props
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
export function useBeleidsscanEffects({
  currentStep,
  suggestedWebsitesLength,
  isLoadingWebsites,
  onTransitionToStep2,
  shouldTransitionToStep2Ref,
  onderwerp,
  overheidslaag,
  selectedEntity,
  validationErrors: _validationErrors,
  setValidationErrors,
  validateOnderwerp,
  setWebsiteSearchQuery,
  setWebsiteFilterType,
  setWebsiteSortBy,
  setSelectedDocuments,
  setDocumentFilter,
  hasDraft,
  wizardSessionId,
  pendingDraft,
  setServerSessionState,
  setReconciliationResult,
  setShowReconciliationDialog,
  setShowDraftRestorePrompt,
}: UseBeleidsscanEffectsProps) {
  /**
   * Transition to step 2 when websites are generated
   */
  useEffect(() => {
    if (shouldTransitionToStep2Ref.current && currentStep === 1 && suggestedWebsitesLength > 0 && !isLoadingWebsites) {
      shouldTransitionToStep2Ref.current = false;
      onTransitionToStep2();
    }
  }, [currentStep, suggestedWebsitesLength, isLoadingWebsites, shouldTransitionToStep2Ref, onTransitionToStep2]);

  /**
   * Real-time validation effect for onderwerp
   * Uses functional updates to avoid infinite loops
   */
  useEffect(() => {
    if (onderwerp) {
      const error = validateOnderwerp(onderwerp);
      if (error) {
        setValidationErrors((prev: ValidationErrors) => ({ ...prev, onderwerp: error }));
      } else {
        setValidationErrors((prev: ValidationErrors) => {
          const { onderwerp: _, ...rest } = prev;
          return rest;
        });
      }
    } else {
      setValidationErrors(prev => {
        const { onderwerp: _, ...rest } = prev;
        return rest;
      });
    }
  }, [onderwerp, validateOnderwerp, setValidationErrors]);

  /**
   * Clear overheidslaag validation error when user selects one
   * Uses functional updates to avoid infinite loops
   */
  useEffect(() => {
    if (overheidslaag) {
      setValidationErrors(prev => {
        if (prev.overheidslaag) {
          const { overheidslaag: _, ...rest } = prev;
          return rest;
        }
        return prev;
      });
    }
  }, [overheidslaag, setValidationErrors]);

  /**
   * Clear entity validation error when user selects one
   * Uses functional updates to avoid infinite loops
   */
  useEffect(() => {
    if (selectedEntity.trim()) {
      setValidationErrors(prev => {
        if (prev.selectedEntity) {
          const { selectedEntity: _, ...rest } = prev;
          return rest;
        }
        return prev;
      });
    }
  }, [selectedEntity, setValidationErrors]);

  /**
   * Reset filters when step changes
   */
  useEffect(() => {
    if (currentStep !== 2) {
      setWebsiteSearchQuery('');
      setWebsiteFilterType(null);
      setWebsiteSortBy('relevance');
    }
    if (currentStep !== 3) {
      // Handle both direct setter and updater function patterns
      if (setSelectedDocuments.length === 1) {
        // Updater function pattern
        (setSelectedDocuments as (updater: (prev: string[]) => string[]) => void)(() => []);
      } else {
        // Direct setter pattern
        (setSelectedDocuments as (docs: string[]) => void)([]);
      }
      setDocumentFilter('all');
    }
  }, [currentStep, setDocumentFilter, setWebsiteSearchQuery, setWebsiteFilterType, setWebsiteSortBy, setSelectedDocuments]);

  /**
   * Check for draft reconciliation on mount (when both draft and session exist)
   */
  useEffect(() => {
    const checkReconciliation = async () => {
      // Check if reconciliation should be skipped
      const SKIP_RECONCILIATION_FLAG = 'beleidsscan.skipReconciliation';
      try {
        const skipFlag = localStorage.getItem(SKIP_RECONCILIATION_FLAG);
        if (skipFlag === 'true') {
          // Clear the flag and skip reconciliation
          localStorage.removeItem(SKIP_RECONCILIATION_FLAG);
          return;
        }
      } catch (e) {
        // Ignore localStorage errors, continue with check
      }
      
      // Only check if we have both a draft and a wizard session
      if (!hasDraft || !wizardSessionId || !pendingDraft) {
        return;
      }

      try {
        // Get server session state
        const state = await api.wizard.getSessionState(wizardSessionId);
        
        const serverState: ServerSessionState = {
          sessionId: state.sessionId,
          currentStepId: state.currentStepId,
          context: state.context,
          updatedAt: state.updatedAt,
          queryId: state.linkedQueryId || null,
        };

        setServerSessionState(serverState);

        // Reconcile draft with server state
        const result = reconcileDraftState(pendingDraft, serverState);
        setReconciliationResult(result);

        // Show dialog if there's a divergence
        // If there's a divergence, suppress the restore prompt (reconciliation takes priority)
        if (result.hasDivergence) {
          setShowReconciliationDialog(true);
          // Suppress restore prompt if reconciliation is needed
          if (setShowDraftRestorePrompt) {
            setShowDraftRestorePrompt(false);
          }
        }
      } catch (error) {
        // Silently fail - reconciliation is optional
        logError(error, 'draft-reconciliation-check');
      }
    };

    // Only check once on mount, after a short delay to allow session to load
    const timer = setTimeout(() => {
      checkReconciliation();
    }, 1000);

    return () => clearTimeout(timer);
  }, [hasDraft, wizardSessionId, pendingDraft, setServerSessionState, setReconciliationResult, setShowReconciliationDialog, setShowDraftRestorePrompt]);
}

