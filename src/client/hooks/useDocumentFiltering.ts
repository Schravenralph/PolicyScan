/**
 * Document Filtering Hook
 * 
 * ✅ **MIGRATED** - Now works directly with CanonicalDocument[].
 * All document state management uses CanonicalDocument format.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useState, useMemo, useEffect } from 'react';
import type { CanonicalDocument } from '../services/api';
import { type LightweightDocument, createLightweightDocuments } from '../utils/documentStateOptimization';
import {
  getCanonicalDocumentTitle,
  getCanonicalDocumentUrl,
  getCanonicalDocumentAcceptance,
  getCanonicalDocumentType,
  type DocumentLike,
} from '../utils/canonicalDocumentUtils';

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
 * Helper functions to access CanonicalDocument/LightweightDocument fields
 * Uses canonical document utilities for consistent field access
 */
function getDocumentTitle(doc: DocumentLike): string {
  return getCanonicalDocumentTitle(doc);
}

function getDocumentUrl(doc: DocumentLike): string {
  return getCanonicalDocumentUrl(doc) || '';
}

function getDocumentAccepted(doc: DocumentLike): boolean | null {
  return getCanonicalDocumentAcceptance(doc);
}

function getDocumentType(doc: DocumentLike): string {
  return getCanonicalDocumentType(doc);
}

function getDocumentPublishedDate(doc: DocumentLike): Date | null {
  const docTyped = doc as CanonicalDocument | LightweightDocument;
  const dates = docTyped.dates as { publishedAt?: Date | string } | undefined;
  const publishedAt = dates?.publishedAt;
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  return isNaN(date.getTime()) ? null : date;
}

function getDocumentWebsiteTitle(doc: DocumentLike): string {
  const sourceMetadata = (doc as { sourceMetadata?: Record<string, unknown> }).sourceMetadata;
  const title = sourceMetadata?.legacyWebsiteTitel;
  return (typeof title === 'string' ? title : '') || '';
}

function getDocumentWebsiteUrl(doc: DocumentLike): string {
  const sourceMetadata = (doc as { sourceMetadata?: Record<string, unknown> }).sourceMetadata;
  const url = sourceMetadata?.legacyWebsiteUrl;
  return (typeof url === 'string' ? url : '') || '';
}

function getDocumentSummary(doc: DocumentLike): string {
  let fullText = '';
  if ('fullText' in doc && (doc as CanonicalDocument).fullText) {
    fullText = (doc as CanonicalDocument).fullText;
  } else if ('fullTextPreview' in doc && (doc as LightweightDocument).fullTextPreview) {
    fullText = (doc as LightweightDocument).fullTextPreview || '';
  }

  // Use first paragraph of fullText (or preview) as summary
  if (fullText) {
    // Optimized to avoid splitting the entire text into an array
    const index = fullText.indexOf('\n\n');
    return index !== -1 ? fullText.substring(0, index) : fullText;
  }
  return '';
}

function getDocumentRelevance(doc: DocumentLike): string {
  // Extract legacy relevance from sourceMetadata if available
  const sourceMetadata = (doc as { sourceMetadata?: Record<string, unknown> }).sourceMetadata;
  const relevance = sourceMetadata?.legacyRelevance;
  const relevantie = sourceMetadata?.legacyRelevantie;
  if (typeof relevance === 'string') return relevance;
  if (typeof relevantie === 'string') return relevantie;
  return '';
}

function getDocumentLabel(doc: DocumentLike): string {
  const sourceMetadata = (doc as { sourceMetadata?: Record<string, unknown> }).sourceMetadata;
  const label = sourceMetadata?.legacyLabel;
  return (typeof label === 'string' ? label : '') || '';
}

/**
 * Custom hook for document filtering and sorting
 * Handles document filtering, sorting, and search with debouncing
 * Works with CanonicalDocument[] and LightweightDocument[] format
 */
export function useDocumentFiltering(
  documents: (CanonicalDocument | LightweightDocument)[],
  options: UseDocumentFilteringOptions = {}
): UseDocumentFilteringReturn {
  const {
    initialFilter = 'all',
    initialSortBy = 'relevance',
    initialSortDirection = 'desc',
    initialSearchQuery = '',
    initialTypeFilter = null,
    initialDateFilter = 'all',
    initialWebsiteFilter = null,
    initialPublicationTypeFilter = 'all',
    debounceMs = 300,
  } = options;

  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>(initialFilter);
  const [documentSortBy, setDocumentSortBy] = useState<DocumentSortBy>(initialSortBy);
  const [documentSortDirection, setDocumentSortDirection] = useState<DocumentSortDirection>(initialSortDirection);
  const [documentSearchQuery, setDocumentSearchQuery] = useState<string>(initialSearchQuery);
  const [debouncedDocumentSearchQuery, setDebouncedDocumentSearchQuery] = useState<string>(initialSearchQuery);
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string | null>(initialTypeFilter);
  const [documentDateFilter, setDocumentDateFilter] = useState<DocumentDateFilter>(initialDateFilter);
  const [documentWebsiteFilter, setDocumentWebsiteFilter] = useState<string | null>(initialWebsiteFilter);
  const [publicationTypeFilter, setPublicationTypeFilter] = useState<PublicationTypeFilter>(initialPublicationTypeFilter);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDocumentSearchQuery(documentSearchQuery);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [documentSearchQuery, debounceMs]);

  const availableDocumentTypes = useMemo(() => {
    const types = new Set<string>();
    if (documents && Array.isArray(documents)) {
      documents.forEach((doc) => {
        const docType = getDocumentType(doc);
        if (docType) types.add(docType);
      });
    }
    return Array.from(types).sort();
  }, [documents]);

  const availableDocumentWebsites = useMemo(() => {
    const websites = new Set<string>();
    if (documents && Array.isArray(documents)) {
      documents.forEach((doc) => {
        const websiteTitle = getDocumentWebsiteTitle(doc);
        const websiteUrl = getDocumentWebsiteUrl(doc);
        if (websiteTitle) {
          websites.add(websiteTitle);
        } else if (websiteUrl) {
          websites.add(websiteUrl);
        }
      });
    }
    return Array.from(websites).sort();
  }, [documents]);

  // Official publication types from SRU
  const OFFICIAL_PUBLICATION_TYPES: PublicationTypeFilter[] = ['Gemeenteblad', 'Staatscourant', 'Provinciaalblad', 'Waterschapsblad'];

  const availablePublicationTypes = useMemo(() => {
    const types = new Set<PublicationTypeFilter>(['all']);
    if (documents && Array.isArray(documents)) {
      documents.forEach((doc) => {
        const docType = getDocumentType(doc);
        if (docType && OFFICIAL_PUBLICATION_TYPES.includes(docType as PublicationTypeFilter)) {
          types.add(docType as PublicationTypeFilter);
        }
      });
    }
    return Array.from(types).sort((a, b) => {
      if (a === 'all') return -1;
      if (b === 'all') return 1;
      return a.localeCompare(b, 'nl');
    });
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    // Convert any CanonicalDocuments to LightweightDocuments to ensure large fullText fields are stripped
    let filtered = createLightweightDocuments(documents || []);

    // Apply acceptance filter
    if (documentFilter !== 'all') {
      filtered = filtered.filter((doc) => {
        const accepted = getDocumentAccepted(doc);
        if (documentFilter === 'approved') return accepted === true;
        if (documentFilter === 'rejected') return accepted === false;
        if (documentFilter === 'pending') return accepted === null;
        return true;
      });
    }

    // Apply search query filter
    if (debouncedDocumentSearchQuery) {
      const queryLower = debouncedDocumentSearchQuery.toLowerCase();
      filtered = filtered.filter((doc) => {
        // Optimized to short-circuit checks and avoid unnecessary processing
        // Check cheaper fields first before computing summary
        if (getDocumentTitle(doc).toLowerCase().includes(queryLower)) return true;
        if (getDocumentRelevance(doc).toLowerCase().includes(queryLower)) return true;
        if (getDocumentUrl(doc).toLowerCase().includes(queryLower)) return true;
        if (getDocumentWebsiteTitle(doc).toLowerCase().includes(queryLower)) return true;
        if (getDocumentWebsiteUrl(doc).toLowerCase().includes(queryLower)) return true;
        if (getDocumentLabel(doc).toLowerCase().includes(queryLower)) return true;

        // Summary is most expensive (substring), so check last
        if (getDocumentSummary(doc).toLowerCase().includes(queryLower)) return true;

        return false;
      });
    }

    // Apply type filter
    if (documentTypeFilter) {
      filtered = filtered.filter((doc) => getDocumentType(doc) === documentTypeFilter);
    }

    // Apply date filter
    if (documentDateFilter !== 'all') {
      // Compute 'now' date once for the filter operation
      const now = new Date();
      filtered = filtered.filter((doc) => {
        const docDate = getDocumentPublishedDate(doc);
        if (!docDate) return false;

        const diffTime = Math.abs(now.getTime() - docDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        switch (documentDateFilter) {
          case 'week':
            return diffDays <= 7;
          case 'month':
            return diffDays <= 30;
          case 'year':
            return diffDays <= 365;
          default:
            return true;
        }
      });
    }

    // Apply website filter
    if (documentWebsiteFilter) {
      filtered = filtered.filter((doc) => {
        const websiteUrl = getDocumentWebsiteUrl(doc);
        const websiteTitle = getDocumentWebsiteTitle(doc);
        return websiteUrl === documentWebsiteFilter || websiteTitle === documentWebsiteFilter;
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let compare = 0;
      switch (documentSortBy) {
        case 'relevance': {
          // Parse relevance score if it's a percentage string like "80%"
          const relevanceA = parseFloat(getDocumentRelevance(a) || '0');
          const relevanceB = parseFloat(getDocumentRelevance(b) || '0');
          compare = relevanceA - relevanceB;
          break;
        }
        case 'date': {
          const dateA = getDocumentPublishedDate(a);
          const dateB = getDocumentPublishedDate(b);
          const timeA = dateA ? dateA.getTime() : 0;
          const timeB = dateB ? dateB.getTime() : 0;
          compare = timeB - timeA; // Newest first by default
          break;
        }
        case 'title': {
          const titleA = getDocumentTitle(a);
          const titleB = getDocumentTitle(b);
          compare = titleA.localeCompare(titleB, 'nl');
          break;
        }
        case 'website': {
          const websiteA = getDocumentWebsiteTitle(a) || getDocumentWebsiteUrl(a) || '';
          const websiteB = getDocumentWebsiteTitle(b) || getDocumentWebsiteUrl(b) || '';
          compare = websiteA.localeCompare(websiteB, 'nl');
          break;
        }
      }
      return documentSortDirection === 'asc' ? compare : -compare;
    });

    return sorted;
  }, [
    documents,
    documentFilter,
    debouncedDocumentSearchQuery,
    documentTypeFilter,
    documentDateFilter,
    documentWebsiteFilter,
    documentSortBy,
    documentSortDirection,
  ]);

  return {
    filteredDocuments,
    documentFilter,
    setDocumentFilter,
    documentSortBy,
    setDocumentSortBy,
    documentSortDirection,
    setDocumentSortDirection,
    documentSearchQuery,
    setDocumentSearchQuery,
    debouncedDocumentSearchQuery,
    documentTypeFilter,
    setDocumentTypeFilter,
    documentDateFilter,
    setDocumentDateFilter,
    documentWebsiteFilter,
    setDocumentWebsiteFilter,
    availableDocumentTypes,
    availableDocumentWebsites,
    availablePublicationTypes,
    publicationTypeFilter,
    setPublicationTypeFilter,
  };
}
