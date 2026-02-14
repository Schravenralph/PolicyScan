/**
 * Utility functions for Beleidsscan component
 *
 * ✅ **MIGRATED** - Now works with CanonicalDocument.
 * Extracts data from canonical document structure (sourceMetadata, enrichmentMetadata).
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import { type DocumentLike } from '../../utils/canonicalDocumentUtils';
/**
 * Sort an array of strings using Dutch collation
 */
export declare const sortByDutch: (values: string[]) => string[];
/**
 * Format a draft timestamp for display
 */
export declare const formatDraftTimestamp: (timestamp?: string | null) => string | null;
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
export declare const getUniqueDocumentWebsites: (documents: DocumentLike[]) => WebsiteInfo[];
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
export declare const calculateDocumentCounts: (documents: DocumentLike[]) => DocumentCounts;
