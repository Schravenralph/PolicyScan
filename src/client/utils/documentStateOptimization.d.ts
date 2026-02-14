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
 * Strip large fields from a document to create a lightweight version for state
 *
 * This prevents React DevTools from trying to serialize huge fullText fields
 * which can exceed the 64MB postMessage limit.
 *
 * @param doc - The full CanonicalDocument or already LightweightDocument
 * @returns Lightweight document with fullText stripped
 */
export declare function createLightweightDocument(doc: CanonicalDocument | LightweightDocument): LightweightDocument;
/**
 * Strip large fields from an array of documents
 *
 * @param docs - Array of CanonicalDocuments or LightweightDocuments
 * @returns Array of lightweight documents
 */
export declare function createLightweightDocuments(docs: (CanonicalDocument | LightweightDocument)[] | undefined): LightweightDocument[];
/**
 * Estimate the size of a document in bytes (rough approximation)
 */
export declare function estimateDocumentSize(doc: CanonicalDocument | LightweightDocument): number;
/**
 * Check if documents array is too large for state storage
 *
 * @param docs - Array of documents
 * @param maxSizeMB - Maximum size in MB (default: 50MB to leave room for other state)
 * @returns Object with size info and recommendation
 */
export declare function checkDocumentArraySize(docs: (CanonicalDocument | LightweightDocument)[], maxSizeMB?: number): {
    totalSizeMB: number;
    isTooLarge: boolean;
    recommendation: string | null;
};
