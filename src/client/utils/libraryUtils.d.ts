/**
 * Library Page Utilities
 *
 * Helper functions for library page operations:
 * - Document validation
 * - Source information extraction
 */
import type { CanonicalDocument } from '../services/api';
/**
 * Validate document structure and log issues
 * Returns validation result with errors array
 */
export declare function validateDocument(doc: CanonicalDocument): {
    valid: boolean;
    errors: string[];
};
/**
 * Helper function to extract source information from canonical documents
 * with proper fallback chain for both canonical and legacy formats
 */
export declare function getDocumentSourceInfo(doc: CanonicalDocument): {
    source: string;
    sourceUrl: string;
    jurisdiction: string;
};
