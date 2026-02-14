/**
 * Library Page Utilities
 * 
 * Helper functions for library page operations:
 * - Document validation
 * - Source information extraction
 */

import { logError } from './errorHandler';
import { t } from './i18n';
import type { CanonicalDocument } from '../services/api';

/**
 * Validate document structure and log issues
 * Returns validation result with errors array
 */
export function validateDocument(doc: CanonicalDocument): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for required fields
    const docId = doc._id || doc.id;
    if (!docId) {
        errors.push('Missing document ID');
    }
    
    // Check for title (should have at least one way to get a title)
    const hasTitle = 
        doc.title ||
        (doc as unknown as { titel?: string }).titel ||
        (doc.sourceMetadata as { legacyTitel?: string } | undefined)?.legacyTitel;
    
    if (!hasTitle) {
        errors.push('Missing document title');
    }
    
    // Check for source (should have at least source type)
    if (!doc.source) {
        errors.push('Missing document source');
    }
    
    // Log validation errors if any
    if (errors.length > 0) {
        const docIdStr = typeof docId === 'string' ? docId : String(docId || 'unknown');
        logError(
            new Error(`Document validation failed: ${errors.join(', ')}`),
            `library-document-validation: documentId=${docIdStr}, errors=${errors.join(',')}`
        );
    }
    
    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Helper function to extract source information from canonical documents
 * with proper fallback chain for both canonical and legacy formats
 */
export function getDocumentSourceInfo(doc: CanonicalDocument): {
    source: string;
    sourceUrl: string;
    jurisdiction: string;
} {
    // Extract sourceMetadata safely
    const sourceMetadata: Record<string, unknown> = (doc.sourceMetadata as Record<string, unknown>) || {};
    
    // Source title fallback chain:
    // 1. sourceMetadata.legacyWebsiteTitel (canonical format)
    // 2. sourceMetadata.website_titel (legacy format in sourceMetadata)
    // 3. doc.websiteTitle (legacy top-level)
    // 4. doc.website_titel (legacy top-level)
    // 5. doc.jurisdiction (fallback)
    // 6. doc.source (document source type)
    // 7. "Onbekende Bron" (default)
    const sourceValue = 
        (sourceMetadata as { legacyWebsiteTitel?: string }).legacyWebsiteTitel ||
        (sourceMetadata as { website_titel?: string }).website_titel ||
        (doc as unknown as { websiteTitle?: string }).websiteTitle ||
        (doc as unknown as { website_titel?: string }).website_titel ||
        doc.jurisdiction ||
        doc.source ||
        '';
    const source = sourceValue || t('searchPage.unknownSource');
    
    // Source URL fallback chain:
    // 1. sourceMetadata.legacyWebsiteUrl (canonical format)
    // 2. sourceMetadata.website_url (legacy format in sourceMetadata)
    // 3. doc.canonicalUrl (canonical URL)
    // 4. doc.url (legacy top-level)
    // 5. doc.sourceUrl (legacy top-level)
    // 6. '' (empty string default)
    const sourceUrlValue =
        (sourceMetadata as { legacyWebsiteUrl?: string }).legacyWebsiteUrl ||
        (sourceMetadata as { website_url?: string }).website_url ||
        doc.canonicalUrl ||
        doc.url ||
        (doc as unknown as { sourceUrl?: string }).sourceUrl ||
        '';
    const sourceUrl = typeof sourceUrlValue === 'string' ? sourceUrlValue : '';
    
    // Jurisdiction fallback chain:
    // 1. sourceMetadata.jurisdiction (if exists)
    // 2. doc.jurisdiction (legacy top-level)
    // 3. '' (empty string default)
    // Get jurisdiction value - handle both string and unknown types from doc.jurisdiction
    const jurisdictionFromMetadata = (sourceMetadata as { jurisdiction?: string }).jurisdiction;
    const jurisdictionFromDoc = doc.jurisdiction;
    // Ensure jurisdiction is always a string (never empty object or other types)
    // Check each source explicitly and only use string values, never objects
    let jurisdiction: string = '';
    if (typeof jurisdictionFromMetadata === 'string' && jurisdictionFromMetadata) {
        jurisdiction = jurisdictionFromMetadata;
    } else if (typeof jurisdictionFromDoc === 'string' && jurisdictionFromDoc) {
        jurisdiction = jurisdictionFromDoc;
    }
    // jurisdiction is now guaranteed to be a string (empty string if no valid source found)
    // Explicitly ensure it's a string type to satisfy TypeScript
    const finalJurisdiction: string = String(jurisdiction || '');
    
    // Explicitly construct return object with string-typed properties
    const result: {
        source: string;
        sourceUrl: string;
        jurisdiction: string;
    } = {
        source: String(source || ''),
        sourceUrl: String(sourceUrl || ''),
        jurisdiction: finalJurisdiction,
    };
    return result;
}
