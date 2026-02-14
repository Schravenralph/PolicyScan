/**
 * Utility functions for Beleidsscan component
 * 
 * ✅ **MIGRATED** - Now works with CanonicalDocument.
 * Extracts data from canonical document structure (sourceMetadata, enrichmentMetadata).
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { dutchCollator } from './constants';
import type { CanonicalDocument } from '../../services/api';
import { getCanonicalDocumentAcceptance, type DocumentLike } from '../../utils/canonicalDocumentUtils';

/**
 * Sort an array of strings using Dutch collation
 */
export const sortByDutch = (values: string[]): string[] =>
  [...values].sort((a, b) => dutchCollator.compare(a, b));

/**
 * Format a draft timestamp for display
 */
export const formatDraftTimestamp = (timestamp?: string | null): string | null => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('nl-NL');
};

/**
 * Website info extracted from documents
 */
export interface WebsiteInfo {
  url: string;
  title: string;
}

/**
 * Get unique websites from canonical documents
 * 
 * ✅ **MIGRATED** - Now works with CanonicalDocument.
 * Extracts website info from sourceMetadata (legacyWebsiteUrl, legacyWebsiteTitel).
 */
export const getUniqueDocumentWebsites = (documents: DocumentLike[]): WebsiteInfo[] => {
  const websites: WebsiteInfo[] = documents.map(doc => {
    // Both CanonicalDocument and LightweightDocument have sourceMetadata (optional) and other fields
    // We need to cast to access them safely if DocumentLike doesn't expose them directly in the union commonality
    // But DocumentLike is CanonicalDocument | LightweightDocument, and LightweightDocument extends Omit<CanonicalDocument, 'fullText'>
    // so common fields should be accessible.

    // However, to be safe and avoid TS errors if types diverge slightly:
    const d = doc as CanonicalDocument;

    const sourceMetadata = d.sourceMetadata || {};
    const legacyWebsiteUrl = sourceMetadata.legacyWebsiteUrl as string | undefined;
    const legacyWebsiteTitel = sourceMetadata.legacyWebsiteTitel as string | undefined;
    
    // Use canonical URL or legacy website URL
    const url = legacyWebsiteUrl || d.canonicalUrl || d.sourceId;
    const title = legacyWebsiteTitel || d.publisherAuthority || url;
    
    return { url, title };
  });
  
  // Use object to deduplicate by URL
  const uniqueMap: Record<string, WebsiteInfo> = {};
  websites.forEach(w => {
    if (!uniqueMap[w.url]) {
      uniqueMap[w.url] = w;
    }
  });
  
  const unique: WebsiteInfo[] = Object.values(uniqueMap);
  return unique.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'nl'));
};

/**
 * Document counts by status
 */
export interface DocumentCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

/**
 * Calculate document counts by status
 * 
 * ✅ **MIGRATED** - Now works with CanonicalDocument.
 * Uses getCanonicalDocumentAcceptance() to get acceptance status.
 */
export const calculateDocumentCounts = (documents: DocumentLike[]): DocumentCounts => {
  return {
    total: documents.length,
    pending: documents.filter(doc => getCanonicalDocumentAcceptance(doc) === null).length,
    accepted: documents.filter(doc => getCanonicalDocumentAcceptance(doc) === true).length,
    rejected: documents.filter(doc => getCanonicalDocumentAcceptance(doc) === false).length
  };
};
