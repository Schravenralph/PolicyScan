/**
 * Hook for managing wizard-related side effects
 * Extracted from Beleidsscan component to reduce component size
 */

import { useEffect, useState } from 'react';
import type { WizardResult } from '../services/api/WizardApiService';

interface UseWizardEffectsProps {
  wizardSession: { status: string } | null;
  wizardSessionId: string | null;
  getWizardResult: () => Promise<WizardResult | null>;
  clearDraft: () => void;
  queryId: string | null;
  selectedWebsites: string[];
  setSelectedWebsites: ((updater: (prev: string[]) => string[]) => void) | ((websites: string[]) => void) | any;
  suggestedWebsites: Array<{ _id?: string }>;
  SELECTED_WEBSITES_KEY_PREFIX: string;
  saveDraftSync: () => void;
  hasMeaningfulState: boolean | string;
  logError: (error: unknown, context: string) => void;
}

/**
 * Hook for managing wizard-related side effects
 * Handles wizard result loading, website selection persistence, and draft auto-save
 */
export function useWizardEffects({
  wizardSession,
  wizardSessionId: _wizardSessionId,
  getWizardResult,
  clearDraft,
  queryId,
  selectedWebsites,
  setSelectedWebsites,
  suggestedWebsites,
  SELECTED_WEBSITES_KEY_PREFIX,
  saveDraftSync,
  hasMeaningfulState,
  logError,
}: UseWizardEffectsProps) {
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null);

  /**
   * Load WizardResult when wizard session is completed
   */
  useEffect(() => {
    const loadResult = async () => {
      if (wizardSession && wizardSession.status === 'completed' && !wizardResult) {
        try {
          const result = await getWizardResult();
          if (result) {
            setWizardResult(result);
            // Clear draft after successful wizard completion
            clearDraft();
          }
        } catch (error) {
          logError(error instanceof Error ? error : new Error('Failed to load wizard result'), 'load-wizard-result');
        }
      }
    };

    loadResult();
  }, [wizardSession, wizardResult, getWizardResult, clearDraft]);

  /**
   * Website selection persistence
   */
  useEffect(() => {
    if (queryId) {
      try {
        localStorage.setItem(`${SELECTED_WEBSITES_KEY_PREFIX}${queryId}`, JSON.stringify(selectedWebsites));
      } catch (e) {
        logError(e, 'save-website-selections');
      }
    }
  }, [queryId, selectedWebsites, SELECTED_WEBSITES_KEY_PREFIX, logError]);

  /**
   * Restore website selections on mount
   */
  useEffect(() => {
    if (queryId && suggestedWebsites.length > 0) {
      try {
        const saved = localStorage.getItem(`${SELECTED_WEBSITES_KEY_PREFIX}${queryId}`);
        if (saved) {
          const savedSelections = JSON.parse(saved);
          // Only restore if websites still exist
          const validSelections = savedSelections.filter((id: string) => 
            suggestedWebsites.some(w => w._id === id)
          );
          if (validSelections.length > 0) {
            // Handle both direct setter and updater function patterns
            if (typeof setSelectedWebsites === 'function' && setSelectedWebsites.length === 1) {
              // Updater function pattern
              (setSelectedWebsites as (updater: (prev: string[]) => string[]) => void)(() => validSelections);
            } else {
              // Direct setter pattern
              (setSelectedWebsites as (websites: string[]) => void)(validSelections);
            }
          }
        }
      } catch (e) {
        logError(e, 'restore-website-selections');
      }
    }
  }, [queryId, suggestedWebsites, SELECTED_WEBSITES_KEY_PREFIX, setSelectedWebsites, logError]);

  /**
   * Ensure we always save the most recent state before navigation/refresh
   * Uses synchronous save from hook for reliability in beforeunload and visibilitychange handlers
   */
  useEffect(() => {
    // Synchronous save for beforeunload (browser close/navigation)
    const handleBeforeUnload = () => {
      if (hasMeaningfulState) {
        saveDraftSync();
      }
    };

    // Synchronous save for visibilitychange (tab switching, minimizing)
    const handleVisibilityChange = () => {
      if (hasMeaningfulState && document.hidden) {
        // Save when tab becomes hidden
        saveDraftSync();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasMeaningfulState, saveDraftSync]);

  return {
    wizardResult,
    setWizardResult,
  };
}

