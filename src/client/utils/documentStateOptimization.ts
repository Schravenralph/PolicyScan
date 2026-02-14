/**
 * Document State Optimization Utilities
 * 
 * Strips large fields from documents before storing in React state to prevent
 * React DevTools serialization errors (64MB limit) and improve performance.
 */

import type { CanonicalDocument } from '../services/api';

/**
 * Lightweight document representation for React state
 * Excludes large fields like fullText that can cause serialization issues
 */
export interface LightweightDocument extends Omit<CanonicalDocument, 'fullText'> {
  /**
   * Truncated preview of fullText (first 500 chars) for display purposes
   */
  fullTextPreview?: string;
  /**
   * Flag indicating fullText was truncated
   */
  hasFullText?: boolean;
}

/**
 * Maximum size for fullText in state (500 characters preview)
 */
const FULLTEXT_PREVIEW_LENGTH = 500;

/**
 * Strip large fields from a document to create a lightweight version for state
 * 
 * This prevents React DevTools from trying to serialize huge fullText fields
 * which can exceed the 64MB postMessage limit.
 * 
 * @param doc - The full CanonicalDocument or already LightweightDocument
 * @returns Lightweight document with fullText stripped
 */
export function createLightweightDocument(doc: CanonicalDocument | LightweightDocument): LightweightDocument {
  // If it's already lightweight (has no fullText but might have preview), return as is or ensure preview exists
  if (!('fullText' in doc) || typeof (doc as CanonicalDocument).fullText === 'undefined') {
    // Already lightweight
    return doc as LightweightDocument;
  }

  const { fullText, ...rest } = doc as CanonicalDocument;
  
  return {
    ...rest,
    fullTextPreview: fullText && fullText.length > 0 
      ? fullText.substring(0, FULLTEXT_PREVIEW_LENGTH) 
      : undefined,
    hasFullText: fullText ? fullText.length > FULLTEXT_PREVIEW_LENGTH : undefined,
  };
}

/**
 * Strip large fields from an array of documents
 * 
 * @param docs - Array of CanonicalDocuments or LightweightDocuments
 * @returns Array of lightweight documents
 */
export function createLightweightDocuments(docs: (CanonicalDocument | LightweightDocument)[] | undefined): LightweightDocument[] {
  if (!docs || !Array.isArray(docs)) {
    return [];
  }
  return docs.map(createLightweightDocument);
}

/**
 * Estimate the size of a document in bytes (rough approximation)
 */
export function estimateDocumentSize(doc: CanonicalDocument | LightweightDocument): number {
  let size = 0;
  
  // Estimate string sizes
  size += ((doc as CanonicalDocument)._id?.length || 0) * 2; // UTF-16
  size += ((doc as CanonicalDocument).title?.length || 0) * 2;

  if ('fullText' in doc && (doc as CanonicalDocument).fullText) {
    size += ((doc as CanonicalDocument).fullText.length || 0) * 2; // This is the big one
  } else if ('fullTextPreview' in doc && (doc as LightweightDocument).fullTextPreview) {
    size += ((doc as LightweightDocument).fullTextPreview?.length || 0) * 2;
  }

  size += ((doc as CanonicalDocument).canonicalUrl?.length || 0) * 2;
  size += ((doc as CanonicalDocument).sourceId?.length || 0) * 2;
  size += ((doc as CanonicalDocument).documentType?.length || 0) * 2;
  size += ((doc as CanonicalDocument).language?.length || 0) * 2;
  
  // Estimate metadata sizes (rough)
  size += JSON.stringify(doc.sourceMetadata || {}).length * 2;
  size += JSON.stringify(doc.enrichmentMetadata || {}).length * 2;
  size += JSON.stringify(doc.artifactRefs || []).length * 2;
  
  return size;
}

/**
 * Check if documents array is too large for state storage
 * 
 * @param docs - Array of documents
 * @param maxSizeMB - Maximum size in MB (default: 50MB to leave room for other state)
 * @returns Object with size info and recommendation
 */
export function checkDocumentArraySize(
  docs: (CanonicalDocument | LightweightDocument)[],
  maxSizeMB: number = 50
): {
  totalSizeMB: number;
  isTooLarge: boolean;
  recommendation: string | null;
} {
  const totalSizeBytes = docs.reduce((sum, doc) => sum + estimateDocumentSize(doc), 0);
  const totalSizeMB = totalSizeBytes / (1024 * 1024);
  const isTooLarge = totalSizeMB > maxSizeMB;
  
  let recommendation: string | null = null;
  if (isTooLarge) {
    recommendation = `Document array is ${totalSizeMB.toFixed(2)}MB, exceeding ${maxSizeMB}MB limit. Consider using lightweight documents or pagination.`;
  }
  
  return {
    totalSizeMB,
    isTooLarge,
    recommendation,
  };
}
