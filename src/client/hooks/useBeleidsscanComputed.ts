/**
 * Hook for managing computed/derived values in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 * 
 * ✅ **MIGRATED** - Now uses CanonicalDocument for document state.
 * Utility functions may need updates to work with canonical format.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useMemo } from 'react';
import { getUniqueDocumentWebsites, calculateDocumentCounts } from '../components/Beleidsscan/utils';
import type { BeleidsscanDraft } from './useDraftPersistence';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
import type { WebsiteType } from '../components/Beleidsscan/types';

interface UseBeleidsscanComputedProps {
  overheidslaag: WebsiteType | null;
  selectedEntity: string;
  onderwerp: string;
  queryId: string | null;
  selectedWebsites: string[];
  websiteSearchQuery: string;
  websiteSortBy: 'relevance' | 'name' | 'type';
  websiteFilterType: string | null;
  documents: (CanonicalDocument | LightweightDocument)[];
  documentFilter: string;
  documentSortBy: string;
  documentSortDirection: 'asc' | 'desc';
  documentSearchQuery: string;
  documentTypeFilter: string | null;
  documentDateFilter: string;
  documentWebsiteFilter: string | null;
  selectedDocuments: string[];
  currentStep: number;
  scrollPositions: Record<number, number>;
}

/**
 * Hook for managing computed/derived values in Beleidsscan component
 * Provides memoized computed values for draft state, document counts, and unique values
 */
export function useBeleidsscanComputed({
  overheidslaag,
  selectedEntity,
  onderwerp,
  queryId,
  selectedWebsites,
  websiteSearchQuery,
  websiteSortBy,
  websiteFilterType,
  documents,
  documentFilter,
  documentSortBy,
  documentSortDirection,
  documentSearchQuery,
  documentTypeFilter,
  documentDateFilter,
  documentWebsiteFilter,
  selectedDocuments,
  currentStep,
  scrollPositions,
}: UseBeleidsscanComputedProps) {
  // Draft state for persistence
  // Note: documents are stripped of large fields (fullText) before being stored
  // This prevents React DevTools from exceeding 64MB serialization limit
  const draftState = useMemo((): BeleidsscanDraft => {
    // Strip large fields from documents for draft state
    const lightweightDocuments = documents?.map((doc) => {
      // Documents should already have fullText stripped by useDocumentLoading or being LightweightDocument,
      // but double-check to be safe
      if (doc && typeof doc === 'object' && 'fullText' in doc) {
        // Safe cast as we check for 'fullText' property existence
        const { fullText, ...rest } = doc as CanonicalDocument;
        return rest as LightweightDocument;
      }
      return doc as LightweightDocument;
    });
    
    return {
      overheidslaag: (overheidslaag || null) as string | null,
      selectedEntity,
      onderwerp,
      queryId,
      selectedWebsites,
      websiteSearchQuery,
      websiteSortBy,
      websiteFilterType,
      documents: lightweightDocuments,
      documentFilter: documentFilter as 'all' | 'pending' | 'approved' | 'rejected' | undefined,
      documentSortBy: documentSortBy as 'relevance' | 'date' | 'title' | 'website' | undefined,
      documentSortDirection,
      documentSearchQuery,
      documentTypeFilter,
      documentDateFilter: documentDateFilter as 'all' | 'week' | 'month' | 'year' | undefined,
      documentWebsiteFilter,
      selectedDocuments,
      step: currentStep,
      scrollPositions,
    };
  }, [
    overheidslaag, selectedEntity, onderwerp, queryId,
    selectedWebsites, websiteSearchQuery, websiteSortBy, websiteFilterType,
    documents, documentFilter, documentSortBy, documentSortDirection, documentSearchQuery,
    documentTypeFilter, documentDateFilter, documentWebsiteFilter, selectedDocuments,
    currentStep, scrollPositions
  ]);

  // Unique document websites for filter
  const uniqueDocumentWebsites = useMemo(() => getUniqueDocumentWebsites(documents), [documents]);

  // Document counts
  const documentCounts = useMemo(() => calculateDocumentCounts(documents), [documents]);

  return {
    draftState,
    uniqueDocumentWebsites,
    documentCounts,
  };
}
