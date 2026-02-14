/**
 * Helper functions for managing documents in workflow context
 * 
 * These helpers prevent the workflow context from exceeding MongoDB's 16MB BSON limit
 * by storing only minimal document metadata (IDs, URLs, titles) instead of full documents.
 */

import type { CanonicalDocument } from '../../../contracts/types.js';

/**
 * Minimal document metadata stored in workflow context
 * Contains only essential fields needed to identify and retrieve documents
 */
export interface DocumentContextMetadata {
    _id: string;
    canonicalUrl?: string;
    sourceId?: string;
    title: string;
    source: string;
    documentType?: string;
}

/**
 * Extract minimal metadata from a CanonicalDocument for storage in workflow context
 * 
 * @param doc - Full CanonicalDocument
 * @returns Minimal metadata (ID, URL, title, source)
 */
export function extractDocumentMetadata(doc: CanonicalDocument): DocumentContextMetadata {
    return {
        _id: doc._id?.toString() || '',
        canonicalUrl: doc.canonicalUrl,
        sourceId: doc.sourceId,
        title: doc.title,
        source: doc.source,
        documentType: doc.documentType,
    };
}

/**
 * Extract minimal metadata from an array of CanonicalDocuments
 * 
 * @param docs - Array of CanonicalDocuments
 * @returns Array of minimal metadata
 */
export function extractDocumentsMetadata(docs: CanonicalDocument[]): DocumentContextMetadata[] {
    return docs.map(extractDocumentMetadata);
}

/**
 * Store document metadata in workflow context instead of full documents
 * This prevents the context from exceeding MongoDB's 16MB BSON limit
 * 
 * @param context - Workflow context
 * @param sourceKey - Key in rawDocumentsBySource (e.g., 'dsoDiscovery', 'rechtspraak')
 * @param documents - Array of CanonicalDocuments to store
 */
export function storeDocumentsInContext(
    context: Record<string, unknown>,
    sourceKey: string,
    documents: CanonicalDocument[]
): void {
    if (!context.rawDocumentsBySource) {
        context.rawDocumentsBySource = {};
    }
    
    // Store only metadata, not full documents
    const metadata = extractDocumentsMetadata(documents);
    (context.rawDocumentsBySource as Record<string, unknown>)[sourceKey] = metadata;
}

/**
 * Store document metadata in context.canonicalDocuments array
 * 
 * @param context - Workflow context
 * @param documents - Array of CanonicalDocuments to store
 */
export function appendCanonicalDocumentsToContext(
    context: Record<string, unknown>,
    documents: CanonicalDocument[]
): void {
    if (!context.canonicalDocuments) {
        context.canonicalDocuments = [];
    }
    
    // Store only metadata, not full documents
    const metadata = extractDocumentsMetadata(documents);
    (context.canonicalDocuments as DocumentContextMetadata[]).push(...metadata);
}

/**
 * Fetch full documents from database using metadata
 * 
 * Handles both:
 * - DocumentContextMetadata[] (new format - fetch from DB)
 * - CanonicalDocument[] (backward compatibility - return as-is)
 * - Mixed arrays (some metadata, some full documents)
 * 
 * @param items - Array of document metadata or full documents
 * @returns Array of full CanonicalDocuments
 */
export async function fetchDocumentsFromMetadata(
    items: Array<DocumentContextMetadata | CanonicalDocument | { _id: string; [key: string]: unknown }>
): Promise<CanonicalDocument[]> {
    if (items.length === 0) {
        return [];
    }
    
    // Check if items are already full CanonicalDocuments (have fullText)
    const firstItem = items[0];
    const isFullDocument = typeof firstItem === 'object' &&
        firstItem !== null &&
        '_id' in firstItem &&
        'fullText' in firstItem &&
        'contentFingerprint' in firstItem;
    
    if (isFullDocument) {
        // Items are already full documents - return as-is (backward compatibility)
        return items.filter((item): item is CanonicalDocument =>
            typeof item === 'object' &&
            item !== null &&
            '_id' in item &&
            'fullText' in item &&
            'contentFingerprint' in item
        ) as CanonicalDocument[];
    }
    
    // Items are metadata - fetch full documents from database
    const { getCanonicalDocumentService } = await import('../../../services/canonical/CanonicalDocumentService.js');
    const documentService = getCanonicalDocumentService();
    
    // Fetch documents by ID
    const documentIds = items
        .map(item => {
            if (typeof item === 'object' && item !== null && '_id' in item) {
                const id = (item as { _id: unknown })._id;
                if (typeof id === 'string') {
                    return id;
                }
                if (id && typeof id === 'object') {
                    // Handle ObjectId or other objects with toString
                    const idObj = id as { toString?: () => string };
                    if (typeof idObj.toString === 'function') {
                        return idObj.toString();
                    }
                }
            }
            return null;
        })
        .filter((id): id is string => !!id);
    
    if (documentIds.length === 0) {
        return [];
    }
    
    // Fetch documents in batches to avoid overwhelming the database
    const batchSize = 100;
    const documents: CanonicalDocument[] = [];
    
    for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);
        const batchDocs = await Promise.all(
            batch.map(id => documentService.findById(id))
        );
        documents.push(...batchDocs.filter((doc): doc is CanonicalDocument => doc !== null));
    }
    
    return documents;
}
