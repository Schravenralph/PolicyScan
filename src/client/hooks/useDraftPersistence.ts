import { useState, useEffect, useCallback, useRef } from 'react';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { hasMeaningfulDraftState } from '../utils/businessRules';
import { validateDraftDataWithLogging } from '../utils/draftValidation.js';

const DRAFT_STORAGE_KEY = 'beleidsscan_draft';
const SELECTED_WEBSITES_KEY_PREFIX = 'beleidsscan_selected_websites_';
const DRAFT_EXPIRATION_DAYS = 7;

const isQuotaExceededError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (error as DOMException).code === 22 ||
    (error as DOMException).code === 1014);

export interface BeleidsscanDraft {
  overheidslaag?: string | null;
  selectedEntity?: string;
  onderwerp?: string;
  queryId?: string | null;
  selectedWebsites?: string[];
  websiteSearchQuery?: string;
  websiteSortBy?: 'relevance' | 'name' | 'type';
  websiteFilterType?: string | null;
  documents?: unknown[];
  documentFilter?: 'all' | 'pending' | 'approved' | 'rejected';
  documentSortBy?: 'relevance' | 'date' | 'title' | 'website';
  documentSortDirection?: 'asc' | 'desc';
  documentSearchQuery?: string;
  documentTypeFilter?: string | null;
  documentDateFilter?: 'all' | 'week' | 'month' | 'year';
  documentWebsiteFilter?: string | null;
  selectedDocuments?: string[];
  step?: number;
  scrollPositions?: Record<number, number>;
  timestamp?: string;
}

export interface DraftSummary {
  step: number;
  selectedWebsites: number;
  documents: number;
}

export interface UseDraftPersistenceOptions {
  autoSaveDelay?: number;
  onDraftLoaded?: (draft: BeleidsscanDraft) => void;
  showManualSaveToast?: boolean; // Show toast notification on manual save
}

export interface UseDraftPersistenceReturn {
  draftExists: boolean;
  lastDraftSavedAt: string | null;
  lastDraftSummary: DraftSummary | null;
  pendingDraft: BeleidsscanDraft | null;
  showDraftRestorePrompt: boolean;
  hasDraft: boolean;
  saveDraft: () => void;
  saveDraftSync: () => void; // Synchronous save for beforeunload/visibilitychange
  loadDraft: () => BeleidsscanDraft | null;
  discardDraft: () => void;
  clearDraft: () => void; // Clear draft after successful completion
  restoreDraft: () => void;
  setShowDraftRestorePrompt: (show: boolean) => void;
  setPendingDraft: (draft: BeleidsscanDraft | null) => void;
}

/**
 * Custom hook for managing draft persistence in Beleidsscan component
 * Handles saving, loading, and restoring drafts from localStorage
 */
export function useDraftPersistence(
  draftState: BeleidsscanDraft,
  options: UseDraftPersistenceOptions = {}
): UseDraftPersistenceReturn {
  const { autoSaveDelay = 1000, onDraftLoaded, showManualSaveToast = false } = options;
  const storageQuotaErrorShown = useRef(false);
  // Reserved for future use
  // @ts-expect-error - Reserved for future use, intentionally unused
  const _isManualSave = useRef(false);
  
  const [draftExists, setDraftExists] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [lastDraftSummary, setLastDraftSummary] = useState<DraftSummary | null>(null);
  const [pendingDraft, setPendingDraft] = useState<BeleidsscanDraft | null>(null);
  const [showDraftRestorePrompt, setShowDraftRestorePrompt] = useState(false);

  // Save draft to localStorage
  const saveDraft = useCallback((manual = false) => {
    try {
      const timestamp = new Date().toISOString();
      // Strip large fields from documents before saving to prevent localStorage quota issues
      // and React DevTools serialization errors (64MB limit)
      const lightweightDraft: BeleidsscanDraft = {
        ...draftState,
        // Only store document IDs and metadata, not full content
        documents: draftState.documents?.map((doc: unknown) => {
          if (doc && typeof doc === 'object' && '_id' in doc) {
            // Keep only essential fields for draft restoration
            const { _id, title, url, source, documentType, reviewStatus } = doc as {
              _id?: string;
              title?: string;
              url?: string;
              source?: string;
              documentType?: string;
              reviewStatus?: string;
              [key: string]: unknown;
            };
            return { _id, title, url, source, documentType, reviewStatus };
          }
          return doc;
        }),
        timestamp,
      };
      
      // Validate draft data before saving (logs warnings in dev mode)
      validateDraftDataWithLogging(lightweightDraft, 'save-draft');
      
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(lightweightDraft));
      storageQuotaErrorShown.current = false;
      setDraftExists(true);
      setLastDraftSavedAt(timestamp);
      setLastDraftSummary({
        step: draftState.step || 1,
        selectedWebsites: draftState.selectedWebsites?.length || 0,
        documents: draftState.documents?.length || 0,
      });
      
      // Show toast notification for manual saves
      if (manual && showManualSaveToast) {
        toast.success('Concept opgeslagen', `Laatst opgeslagen: ${new Date(timestamp).toLocaleString('nl-NL')}`);
      }
    } catch (e) {
      logError(e, 'save-draft');
      if (isQuotaExceededError(e) && !storageQuotaErrorShown.current) {
        storageQuotaErrorShown.current = true;
        toast.error(
          'Opslaan niet gelukt',
          'Uw browseropslag is vol. Verwijder oude concepten of maak ruimte vrij en probeer opnieuw.'
        );
      } else {
        logError(e instanceof Error ? e : new Error('Failed to save draft'), 'save-draft');
        if (manual) {
          toast.error('Opslaan mislukt', 'Het concept kon niet worden opgeslagen. Probeer het opnieuw.');
        }
      }
    }
  }, [draftState, showManualSaveToast]);

  // Load draft from localStorage
  const loadDraft = useCallback((): BeleidsscanDraft | null => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!saved) return null;
      const draft = JSON.parse(saved) as BeleidsscanDraft;
      if (!draft?.timestamp) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        return null;
      }
      
      // Validate draft data on load (logs warnings in dev mode)
      validateDraftDataWithLogging(draft, 'load-draft');
      
      // Only load if draft is less than 7 days old
      const draftDate = new Date(draft.timestamp);
      const daysDiff = (Date.now() - draftDate.getTime()) / (1000 * 60 * 60 * 24);
      if (Number.isNaN(draftDate.getTime()) || daysDiff > DRAFT_EXPIRATION_DAYS) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        if (draft?.queryId) {
          localStorage.removeItem(`${SELECTED_WEBSITES_KEY_PREFIX}${draft.queryId}`);
        }
        setDraftExists(false);
        setLastDraftSavedAt(null);
        setLastDraftSummary(null);
        return null;
      }
      setLastDraftSavedAt(draft.timestamp);
      setLastDraftSummary({
        step: draft.step || 1,
        selectedWebsites: draft.selectedWebsites?.length || 0,
        documents: draft.documents?.length || 0,
      });
      return draft;
    } catch (e) {
      logError(e, 'load-draft');
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
      setDraftExists(false);
      setLastDraftSavedAt(null);
      setLastDraftSummary(null);
      return null;
    }
  }, []);

  // Discard draft
  const discardDraft = useCallback(() => {
    try {
      const draft = pendingDraft || loadDraft();
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      if (draft?.queryId) {
        localStorage.removeItem(`${SELECTED_WEBSITES_KEY_PREFIX}${draft.queryId}`);
      }
      setShowDraftRestorePrompt(false);
      setPendingDraft(null);
      setDraftExists(false);
      setLastDraftSavedAt(null);
      setLastDraftSummary(null);
    } catch (e) {
      logError(e instanceof Error ? e : new Error('Failed to remove draft'), 'discard-draft');
    }
  }, [loadDraft, pendingDraft]);

  // Clear draft after successful completion
  const clearDraft = useCallback(() => {
    try {
      const draft = pendingDraft || loadDraft();
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      if (draft?.queryId) {
        localStorage.removeItem(`${SELECTED_WEBSITES_KEY_PREFIX}${draft.queryId}`);
      }
      setShowDraftRestorePrompt(false);
      setPendingDraft(null);
      setDraftExists(false);
      setLastDraftSavedAt(null);
      setLastDraftSummary(null);
      console.debug('Draft cleared after successful completion:', DRAFT_STORAGE_KEY);
    } catch (e) {
      logError(e instanceof Error ? e : new Error('Failed to clear draft'), 'clear-draft');
    }
  }, [loadDraft, pendingDraft]);

  // Restore draft
  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    if (onDraftLoaded) {
      onDraftLoaded(pendingDraft);
    }
    setShowDraftRestorePrompt(false);
    setPendingDraft(null);
  }, [pendingDraft, onDraftLoaded]);

  // Auto-save draft when state changes
  useEffect(() => {
    // Only auto-save if there's meaningful state to save (using business rule utility)
    if (hasMeaningfulDraftState(draftState)) {
      const timer = setTimeout(() => {
        saveDraft(false); // Auto-save, not manual
      }, autoSaveDelay);
      return () => clearTimeout(timer);
    }
  }, [draftState, autoSaveDelay, saveDraft]);

  // Manual save function (exposed in return)
  const manualSaveDraft = useCallback(() => {
    saveDraft(true); // Manual save
  }, [saveDraft]);

  // Synchronous save function for beforeunload/visibilitychange handlers
  // This directly writes to localStorage without state updates to ensure reliability
  const saveDraftSync = useCallback(() => {
    try {
      const timestamp = new Date().toISOString();
      const draft: BeleidsscanDraft = {
        ...draftState,
        timestamp,
      };
      // Direct synchronous write - no state updates, no toast notifications
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      // Silently fail in beforeunload/visibilitychange - can't show UI
      // Log to centralized error handler for tracking
      logError(e instanceof Error ? e : new Error('Failed to save draft synchronously'), 'save-draft-sync');
    }
  }, [draftState]);

  // Check for draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setPendingDraft(draft);
      setDraftExists(true);
      setShowDraftRestorePrompt(true);
    }
  }, [loadDraft]);

  return {
    draftExists,
    lastDraftSavedAt,
    lastDraftSummary,
    pendingDraft,
    showDraftRestorePrompt,
    hasDraft: draftExists,
    saveDraft: manualSaveDraft, // Expose manual save function
    saveDraftSync, // Expose synchronous save function
    loadDraft,
    discardDraft,
    clearDraft, // Expose clear draft function for successful completion
    restoreDraft,
    setShowDraftRestorePrompt,
    setPendingDraft,
  };
}

