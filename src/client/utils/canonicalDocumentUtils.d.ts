/**
 * Canonical Document Utility Functions
 *
 * Centralized utilities for working with CanonicalDocument objects.
 * These utilities provide consistent handling of canonical document data.
 *
 * @see documentUtils.ts - Legacy utilities for BronDocument
 * @see WI-412: Frontend API Service Migration
 */
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
/**
 * Union type for CanonicalDocument and LightweightDocument
 * Allows utilities to work with both full and lightweight documents
 */
export type DocumentLike = CanonicalDocument | LightweightDocument;
/**
 * Gets the display title for a canonical document
 * Falls back to sourceId if title is not available
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Display title
 */
export declare const getCanonicalDocumentTitle: (doc: DocumentLike) => string;
/**
 * Gets the display URL for a canonical document
 * Prefers canonicalUrl, falls back to first artifact URL, then sourceId
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Display URL or null
 */
export declare const getCanonicalDocumentUrl: (doc: DocumentLike) => string | null;
/**
 * Checks if a canonical document has been reviewed (approved or rejected)
 * Uses enrichmentMetadata.accepted field if available
 *
 * @param doc - The CanonicalDocument or LightweightDocument to check
 * @returns true if the document has been approved or rejected
 */
export declare const isCanonicalDocumentReviewed: (doc: DocumentLike) => boolean;
/**
 * Gets the review status for a canonical document
 * Uses reviewStatus field if available, falls back to enrichmentMetadata.accepted for backward compatibility
 *
 * @param doc - The CanonicalDocument or LightweightDocument to get status for
 * @returns 'approved' | 'rejected' | 'needs_revision' | 'pending'
 */
export declare const getCanonicalDocumentStatus: (doc: DocumentLike) => "approved" | "rejected" | "needs_revision" | "pending";
/**
 * Gets the acceptance status (for filtering)
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns boolean | null (true = approved, false = rejected, null = pending)
 */
export declare const getCanonicalDocumentAcceptance: (doc: DocumentLike) => boolean | null;
/**
 * Formats a canonical document's publication date for display
 *
 * @param doc - The CanonicalDocument or LightweightDocument containing the date
 * @param locale - Locale for formatting (default: 'nl-NL')
 * @returns Formatted date string or null if no date
 */
export declare const formatCanonicalDocumentDate: (doc: DocumentLike, locale?: string) => string | null;
/**
 * Gets the document type for display
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Document type string
 */
export declare const getCanonicalDocumentType: (doc: DocumentLike) => string;
/**
 * Gets the source name for display
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Source name
 */
export declare const getCanonicalDocumentSource: (doc: DocumentLike) => string;
/**
 * Checks if document has full text content (or preview)
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns true if document has full text or preview
 */
export declare const hasCanonicalDocumentFullText: (doc: DocumentLike) => boolean;
/**
 * Gets a preview of the document text
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @param maxLength - Maximum length of preview (default: 200)
 * @returns Preview text
 */
export declare const getCanonicalDocumentPreview: (doc: DocumentLike, maxLength?: number) => string;
/**
 * Gets the document ID from a CanonicalDocument or LightweightDocument
 * Prefers _id if available (persisted document), falls back to sourceId
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Document ID or undefined
 */
export declare const getCanonicalDocumentId: (doc: DocumentLike) => string | undefined;
/**
 * Gets a cleaned summary for a canonical document
 * Prefers doc.summary or doc.samenvatting if available
 * Falls back to filtered fullText (or preview) with technical content removed
 *
 * @param doc - The CanonicalDocument or LightweightDocument
 * @param maxLength - Maximum length of summary (default: 200)
 * @returns Cleaned summary text
 */
export declare const getCanonicalDocumentSummary: (doc: DocumentLike, maxLength?: number) => string;
