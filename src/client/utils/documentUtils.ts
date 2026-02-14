/**
 * Document Utility Functions
 * 
 * ✅ **MIGRATED** - Now supports both CanonicalDocument and BronDocument.
 * 
 * Centralized utilities for working with document objects.
 * These utilities ensure consistent handling of document data across the application.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import type { CanonicalDocument } from '../services/api';
import type { BronDocument } from './transformations';
import { transformCanonicalDocumentToBron } from './transformations';

/**
 * Ensures a document has the required 'relevantie voor zoekopdracht' property.
 * This normalizes documents that may have missing or undefined relevance fields.
 * 
 * ✅ **MIGRATED** - Now supports both CanonicalDocument and BronDocument.
 * For canonical documents, transforms to Bron format first, then normalizes.
 * 
 * @param doc - The document to normalize (BronDocument or CanonicalDocument)
 * @returns A normalized BronDocument with guaranteed 'relevantie voor zoekopdracht' property
 * 
 * @example
 * ```typescript
 * const doc = await api.getBronDocument(id);
 * const normalizedDoc = normalizeBronDocument(doc);
 * // normalizedDoc['relevantie voor zoekopdracht'] is guaranteed to be a string
 * ```
 */
export const normalizeBronDocument = (doc: BronDocument | CanonicalDocument): BronDocument => {
  // If it's a canonical document, transform to Bron first
  const bronDoc: BronDocument = 'title' in doc
    ? (transformCanonicalDocumentToBron(doc as CanonicalDocument) as unknown as BronDocument)
    : doc as BronDocument;

  // Normalize the Bron document
  return {
    ...bronDoc,
    'relevantie voor zoekopdracht': bronDoc['relevantie voor zoekopdracht'] || '',
  };
};

/**
 * Normalizes an array of documents.
 * Convenience function for normalizing multiple documents at once.
 * 
 * ✅ **MIGRATED** - Now supports both CanonicalDocument and BronDocument.
 * 
 * @param docs - Array of documents to normalize (BronDocument or CanonicalDocument)
 * @returns Array of normalized BronDocuments
 */
export const normalizeBronDocuments = (docs: (BronDocument | CanonicalDocument)[]): BronDocument[] =>
  docs.map(normalizeBronDocument);

/**
 * Checks if a document has been reviewed (approved or rejected)
 * 
 * @param doc - The CanonicalDocument to check
 * @returns true if the document has been approved or rejected
 */
export const isDocumentReviewed = (doc: CanonicalDocument): boolean => {
  const status = doc.reviewStatus;
  return status === 'approved' || status === 'rejected';
};

/**
 * Gets the review status label for a document
 * 
 * @param doc - The CanonicalDocument to get status for
 * @returns 'approved' | 'rejected' | 'pending'
 */
export const getDocumentStatus = (doc: CanonicalDocument): 'approved' | 'rejected' | 'pending' => {
  const status = doc.reviewStatus;
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
};

/**
 * Formats a document's publication date for display
 * 
 * @param doc - The CanonicalDocument containing the date
 * @param locale - Locale for formatting (default: 'nl-NL')
 * @returns Formatted date string or null if no date
 */
export const formatDocumentDate = (
  doc: CanonicalDocument,
  locale: string = 'nl-NL'
): string | null => {
  const publishedAt = doc.dates?.publishedAt;
  if (!publishedAt) return null;

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

