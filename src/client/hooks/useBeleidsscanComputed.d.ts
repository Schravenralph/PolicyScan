/**
 * Hook for managing computed/derived values in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 *
 * ✅ **MIGRATED** - Now uses CanonicalDocument for document state.
 * Utility functions may need updates to work with canonical format.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
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
export declare function useBeleidsscanComputed({ overheidslaag, selectedEntity, onderwerp, queryId, selectedWebsites, websiteSearchQuery, websiteSortBy, websiteFilterType, documents, documentFilter, documentSortBy, documentSortDirection, documentSearchQuery, documentTypeFilter, documentDateFilter, documentWebsiteFilter, selectedDocuments, currentStep, scrollPositions, }: UseBeleidsscanComputedProps): {
    draftState: BeleidsscanDraft;
    uniqueDocumentWebsites: import("../components/Beleidsscan/utils").WebsiteInfo[];
    documentCounts: import("../components/Beleidsscan/utils").DocumentCounts;
};
export {};
