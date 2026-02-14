/**
 * Hook for managing draft restoration logic
 * Extracted from Beleidsscan component to reduce component size
 * 
 * ✅ **MIGRATED** - Now handles both CanonicalDocument and BronDocument when restoring drafts.
 * Drafts may contain either format, so we handle both for backward compatibility.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useCallback } from 'react';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
import type { BeleidsscanDraft } from './useDraftPersistence';
import type { WebsiteType } from '../components/Beleidsscan/types';
import type { DocumentFilter, DocumentSortBy, DocumentDateFilter } from './useDocumentFiltering';

interface UseDraftRestorationProps {
  setOverheidslaag: (value: WebsiteType | null) => void;
  setSelectedEntity: (value: string) => void;
  setOnderwerp: (value: string) => void;
  setTopicSearchQuery: (value: string) => void;
  setQueryId: (value: string | null) => void;
  restoreWebsiteGenerationProgress: (queryId: string) => void;
  setSelectedWebsites: (value: string[]) => void;
  setWebsiteSearchQuery: (value: string) => void;
  setWebsiteSortBy: (value: 'relevance' | 'name' | 'type') => void;
  setWebsiteFilterType: (value: string | null) => void;
  setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => void;
  setDocumentFilter: (filter: DocumentFilter) => void;
  setDocumentSortBy: (sortBy: DocumentSortBy) => void;
  setDocumentSortDirection: (value: 'asc' | 'desc') => void;
  setDocumentSearchQuery: (value: string) => void;
  setDocumentTypeFilter: (value: string | null) => void;
  setDocumentDateFilter: (filter: DocumentDateFilter) => void;
  setDocumentWebsiteFilter: (value: string | null) => void;
  setSelectedDocuments: ((docs: string[]) => void) | ((updater: (prev: string[]) => string[]) => void);
  setScrollPositions: ((positions: Record<number, number>) => void) | ((updater: (prev: Record<number, number>) => Record<number, number>) => void);
  dispatch: ((action: { type: string; payload?: number }) => void) | ((action: unknown) => void) | ((action: any) => void);
  setStep: (step: number) => void;
}

/**
 * Hook for managing draft restoration logic
 * Provides handler to restore draft state to component
 */
export function useDraftRestoration({
  setOverheidslaag,
  setSelectedEntity,
  setOnderwerp,
  setTopicSearchQuery,
  setQueryId,
  restoreWebsiteGenerationProgress,
  setSelectedWebsites,
  setWebsiteSearchQuery,
  setWebsiteSortBy,
  setWebsiteFilterType,
  setDocuments,
  setDocumentFilter,
  setDocumentSortBy,
  setDocumentSortDirection,
  setDocumentSearchQuery,
  setDocumentTypeFilter,
  setDocumentDateFilter,
  setDocumentWebsiteFilter,
  setSelectedDocuments,
  setScrollPositions,
  dispatch: _dispatch,
  setStep,
}: UseDraftRestorationProps) {
  const handleDraftRestore = useCallback((draft: BeleidsscanDraft) => {
    // Restore draft state
    setOverheidslaag((draft.overheidslaag as WebsiteType | null | undefined) ?? null);
    setSelectedEntity(draft.selectedEntity ?? '');
    if (draft.onderwerp) {
      setOnderwerp(draft.onderwerp);
      setTopicSearchQuery(draft.onderwerp);
    } else {
      setOnderwerp('');
      setTopicSearchQuery('');
    }
    setQueryId(draft.queryId ?? null);
    // Restore website generation progress if queryId exists
    if (draft.queryId) {
      restoreWebsiteGenerationProgress(draft.queryId);
    }
    setSelectedWebsites(draft.selectedWebsites || []);
    setWebsiteSearchQuery(draft.websiteSearchQuery || '');
    setWebsiteSortBy(draft.websiteSortBy || 'relevance');
    setWebsiteFilterType(draft.websiteFilterType ?? null);
    // Restore documents - drafts may store CanonicalDocument or LightweightDocument format
    setDocuments(() => {
      const docs = draft.documents || [];
      return docs.map((doc: unknown) => {
        // Ensure it's a valid document (has sourceId)
        if (doc && typeof doc === 'object' && 'sourceId' in doc) {
          return doc as LightweightDocument;
        }
        // Legacy drafts may have incomplete documents - skip invalid ones
        return null;
      }).filter((doc): doc is LightweightDocument => doc !== null);
    });
    setDocumentFilter(draft.documentFilter || 'all');
    setDocumentSortBy(draft.documentSortBy || 'relevance');
    setDocumentSortDirection(draft.documentSortDirection || 'desc');
    setDocumentSearchQuery(draft.documentSearchQuery || '');
    setDocumentTypeFilter(draft.documentTypeFilter ?? null);
    setDocumentDateFilter(draft.documentDateFilter || 'all');
    setDocumentWebsiteFilter(draft.documentWebsiteFilter ?? null);
    // Handle both direct setter and updater function patterns
    if (typeof setSelectedDocuments === 'function') {
      const updater = setSelectedDocuments as (updater: (prev: string[]) => string[]) => void;
      updater(() => draft.selectedDocuments || []);
    } else {
      (setSelectedDocuments as (docs: string[]) => void)(draft.selectedDocuments || []);
    }
    if (draft.scrollPositions) {
      if (typeof setScrollPositions === 'function') {
        const updater = setScrollPositions as (updater: (prev: Record<number, number>) => Record<number, number>) => void;
        updater((prev: Record<number, number>) => ({
          ...prev,
          ...draft.scrollPositions
        }));
      } else {
        (setScrollPositions as (positions: Record<number, number>) => void)(draft.scrollPositions);
      }
    }
    const targetStep = draft.step || 1;
    setStep(targetStep);
    const draftScroll = draft.scrollPositions?.[targetStep];
    requestAnimationFrame(() => {
      if (typeof draftScroll === 'number') {
        window.scrollTo({ top: draftScroll, behavior: 'auto' });
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    });
  }, [
    setOverheidslaag,
    setSelectedEntity,
    setOnderwerp,
    setTopicSearchQuery,
    setQueryId,
    restoreWebsiteGenerationProgress,
    setSelectedWebsites,
    setWebsiteSearchQuery,
    setWebsiteSortBy,
    setWebsiteFilterType,
    setDocuments,
    setDocumentFilter,
    setDocumentSortBy,
    setDocumentSortDirection,
    setDocumentSearchQuery,
    setDocumentTypeFilter,
    setDocumentDateFilter,
    setDocumentWebsiteFilter,
    setSelectedDocuments,
    setScrollPositions,
    setStep,
  ]);

  return {
    handleDraftRestore,
  };
}

