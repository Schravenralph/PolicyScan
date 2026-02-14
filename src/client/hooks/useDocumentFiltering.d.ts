/**
 * Document Filtering Hook
 *
 * ✅ **MIGRATED** - Now works directly with CanonicalDocument[].
 * All document state management uses CanonicalDocument format.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import type { CanonicalDocument } from '../services/api';
import { type LightweightDocument } from '../utils/documentStateOptimization';
export type DocumentFilter = 'all' | 'pending' | 'approved' | 'rejected';
export type DocumentSortBy = 'relevance' | 'date' | 'title' | 'website';
export type DocumentSortDirection = 'asc' | 'desc';
export type DocumentDateFilter = 'all' | 'week' | 'month' | 'year';
export type PublicationTypeFilter = 'all' | 'Gemeenteblad' | 'Staatscourant' | 'Provinciaalblad' | 'Waterschapsblad';
export interface UseDocumentFilteringOptions {
    initialFilter?: DocumentFilter;
    initialSortBy?: DocumentSortBy;
    initialSortDirection?: DocumentSortDirection;
    initialSearchQuery?: string;
    initialTypeFilter?: string | null;
    initialDateFilter?: DocumentDateFilter;
    initialWebsiteFilter?: string | null;
    initialPublicationTypeFilter?: PublicationTypeFilter;
    debounceMs?: number;
}
export interface UseDocumentFilteringReturn {
    filteredDocuments: LightweightDocument[];
    documentFilter: DocumentFilter;
    setDocumentFilter: (filter: DocumentFilter) => void;
    documentSortBy: DocumentSortBy;
    setDocumentSortBy: (sortBy: DocumentSortBy) => void;
    documentSortDirection: DocumentSortDirection;
    setDocumentSortDirection: (direction: DocumentSortDirection) => void;
    documentSearchQuery: string;
    setDocumentSearchQuery: (query: string) => void;
    debouncedDocumentSearchQuery: string;
    documentTypeFilter: string | null;
    setDocumentTypeFilter: (type: string | null) => void;
    documentDateFilter: DocumentDateFilter;
    setDocumentDateFilter: (filter: DocumentDateFilter) => void;
    documentWebsiteFilter: string | null;
    setDocumentWebsiteFilter: (website: string | null) => void;
    publicationTypeFilter: PublicationTypeFilter;
    setPublicationTypeFilter: (filter: PublicationTypeFilter) => void;
    availableDocumentTypes: string[];
    availableDocumentWebsites: string[];
    availablePublicationTypes: PublicationTypeFilter[];
}
/**
 * Custom hook for document filtering and sorting
 * Handles document filtering, sorting, and search with debouncing
 * Works with CanonicalDocument[] and LightweightDocument[] format
 */
export declare function useDocumentFiltering(documents: (CanonicalDocument | LightweightDocument)[], options?: UseDocumentFilteringOptions): UseDocumentFilteringReturn;
