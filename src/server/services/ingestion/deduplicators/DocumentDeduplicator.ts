/**
 * Document Deduplicator
 * 
 * Deduplicates NormalizedDocument objects from the ingestion layer.
 * This is part of the ingestion layer and works with NormalizedDocument (ingestion type).
 * 
 * For workflow-level deduplication of CanonicalDocument, see DocumentDeduplicationService
 * in the workflow layer.
 */

import type { NormalizedDocument } from '../types/NormalizedDocument.js';
import type { DeduplicationResult } from '../types/DeduplicationResult.js';
import { logger } from '../../../utils/logger.js';

/**
 * Options for deduplication
 */
export interface DeduplicationOptions {
  /** Whether to deduplicate by sourceUrl (default: true) */
  byUrl?: boolean;
  /** Whether to deduplicate by sourceId (default: true) */
  bySourceId?: boolean;
  /** Strategy for handling duplicates: 'keepFirst' | 'keepLast' (default: 'keepFirst') */
  duplicateStrategy?: 'keepFirst' | 'keepLast';
}

/**
 * Document deduplicator for ingestion layer
 * 
 * Deduplicates NormalizedDocument objects by sourceId and sourceUrl.
 */
export class DocumentDeduplicator {
  /**
   * Deduplicate normalized documents
   * 
   * Strategy:
   * 1. Deduplicate by sourceId (primary)
   * 2. Deduplicate by sourceUrl (secondary)
   * 3. Apply duplicate strategy (keepFirst or keepLast)
   * 
   * @param documents - Array of normalized documents to deduplicate
   * @param options - Deduplication options
   * @returns Deduplication result
   */
  deduplicate(
    documents: NormalizedDocument[],
    options: DeduplicationOptions = {}
  ): DeduplicationResult {
    if (documents.length === 0) {
      return {
        documents: [],
        duplicatesRemoved: 0,
      };
    }

    const {
      byUrl = true,
      bySourceId = true,
      duplicateStrategy = 'keepFirst',
    } = options;

    const seenSourceIds = new Map<string, number>(); // sourceId -> index in deduplicated array
    const seenUrls = new Map<string, number>(); // sourceUrl -> index in deduplicated array
    const deduplicated: NormalizedDocument[] = [];
    const duplicateInfo: Array<{
      originalId: string;
      duplicateId: string;
      reason: string;
    }> = [];

    for (const doc of documents) {
      let isDuplicate = false;
      let existingIndex = -1;
      let duplicateReason = '';
      let wasAdded = false;

      // Priority 1: Deduplicate by sourceId (primary)
      if (bySourceId && doc.sourceId) {
        existingIndex = seenSourceIds.get(doc.sourceId) ?? -1;
        if (existingIndex !== -1) {
          isDuplicate = true;
          duplicateReason = `sourceId:${doc.sourceId}`;
          const existingDoc = deduplicated[existingIndex];

          duplicateInfo.push({
            originalId: existingDoc.sourceId,
            duplicateId: doc.sourceId,
            reason: duplicateReason,
          });

          // Apply duplicate strategy
          if (duplicateStrategy === 'keepLast') {
            deduplicated[existingIndex] = doc;
            seenSourceIds.set(doc.sourceId, existingIndex);
            // Update URL tracking if document has URL
            if (byUrl && doc.sourceUrl) {
              seenUrls.set(doc.sourceUrl, existingIndex);
            }
          }
          // For 'keepFirst', we just skip this document (isDuplicate = true)
        }
        // Note: Don't add here yet - check by URL first if not duplicate
      }

      // Priority 2: If not a duplicate by sourceId, try by sourceUrl
      if (!isDuplicate && byUrl && doc.sourceUrl) {
        existingIndex = seenUrls.get(doc.sourceUrl) ?? -1;
        if (existingIndex !== -1) {
          isDuplicate = true;
          duplicateReason = `sourceUrl:${doc.sourceUrl}`;
          const existingDoc = deduplicated[existingIndex];

          duplicateInfo.push({
            originalId: existingDoc.sourceId,
            duplicateId: doc.sourceId,
            reason: duplicateReason,
          });

          // Apply duplicate strategy
          if (duplicateStrategy === 'keepLast') {
            deduplicated[existingIndex] = doc;
            seenUrls.set(doc.sourceUrl, existingIndex);
            // Update sourceId tracking if document has sourceId
            if (bySourceId && doc.sourceId) {
              seenSourceIds.set(doc.sourceId, existingIndex);
            }
          }
          // For 'keepFirst', we just skip this document (isDuplicate = true)
        }
      }

      // If not a duplicate, add to deduplicated array and track
      if (!isDuplicate) {
        const index = deduplicated.length;
        deduplicated.push(doc);
        wasAdded = true;
        
        // Track by sourceId if available
        if (bySourceId && doc.sourceId) {
          seenSourceIds.set(doc.sourceId, index);
        }
        
        // Track by URL if available
        if (byUrl && doc.sourceUrl) {
          seenUrls.set(doc.sourceUrl, index);
        }
      }
    }

    const duplicatesRemoved = documents.length - deduplicated.length;

    if (duplicatesRemoved > 0) {
      logger.debug(
        {
          originalCount: documents.length,
          deduplicatedCount: deduplicated.length,
          duplicatesRemoved,
          duplicateInfoCount: duplicateInfo.length,
        },
        'Document deduplication completed (ingestion layer)'
      );
    }

    return {
      documents: deduplicated,
      duplicatesRemoved,
      duplicateInfo: duplicateInfo.length > 0 ? duplicateInfo : undefined,
    };
  }
}
