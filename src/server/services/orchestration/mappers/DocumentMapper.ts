/**
 * Document Mapper
 *
 * Centralized mapping service for converting documents between different representations.
 * This eliminates ad-hoc conversions scattered across pipelines and ensures
 * all field mappings are tested and consistent.
 *
 * All document format conversions should go through this mapper.
 */

import type { CanonicalDocument } from '../../../contracts/types.js';
import type { DocumentSource, DocumentFamily, DocumentReviewStatus } from '../../../contracts/types.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import type { ParsedDocument } from '../../parsing/types/ParsedDocument.js';
import { createHash } from 'crypto';

/**
 * Document Mapper Service
 *
 * Provides static methods for converting documents between different formats.
 * All conversions are tested and maintain field integrity.
 */
export class DocumentMapper {
  /**
   * Convert NormalizedDocument (from ingestion) to CanonicalDocument (for parsing/persistence)
   *
   * This is the primary conversion point for moving documents from ingestion to parsing layer.
   *
   * @param doc - Normalized document from ingestion layer
   * @returns Canonical document ready for parsing or persistence
   */
  static normalizedToCanonical(doc: NormalizedDocument): CanonicalDocument {
    const content = doc.content || '';
    const contentFingerprint = createHash('sha256')
      .update(content)
      .digest('hex');

    const now = new Date();

    return {
      _id: '', // Will be set when persisted
      source: doc.source,
      sourceId: doc.sourceId,
      canonicalUrl: doc.sourceUrl || undefined,
      title: doc.title,
      publisherAuthority: undefined,
      documentFamily: (doc.metadata?.documentFamily as DocumentFamily) || 'Beleid' as DocumentFamily,
      documentType: (doc.metadata?.documentType as string) || 'unknown',
      dates: {
        publishedAt: (doc.metadata?.publishedDate as Date) || now,
        validFrom: (doc.metadata?.effectiveDate as Date) || now,
        validTo: (doc.metadata?.modifiedDate as Date) || undefined,
      },
      fullText: content,
      contentFingerprint,
      language: (doc.metadata?.language as string) || 'nl',
      artifactRefs: [],
      sourceMetadata: {
        ...doc.metadata,
        mimeType: doc.mimeType,
        rawData: doc.rawData,
      },
      enrichmentMetadata: undefined,
      reviewStatus: 'pending_review' as DocumentReviewStatus,
      reviewMetadata: undefined,
      createdAt: now,
      updatedAt: now,
      schemaVersion: '1.0',
    };
  }

  /**
   * Convert CanonicalDocument to NormalizedDocument (for re-ingestion scenarios)
   *
   * @param doc - Canonical document
   * @returns Normalized document
   */
  static canonicalToNormalized(doc: CanonicalDocument): NormalizedDocument {
    return {
      sourceId: doc.sourceId,
      sourceUrl: doc.canonicalUrl || doc.sourceId,
      source: doc.source,
      title: doc.title,
      content: doc.fullText,
      mimeType: (doc.sourceMetadata?.mimeType as string) || 'text/plain',
      rawData: doc.sourceMetadata?.rawData,
      metadata: {
        ...doc.sourceMetadata,
        documentFamily: doc.documentFamily,
        documentType: doc.documentType,
        publishedDate: doc.dates.publishedAt,
        effectiveDate: doc.dates.validFrom,
        modifiedDate: doc.dates.validTo,
        language: doc.language,
      },
    };
  }

  /**
   * Extract parsing-specific fields from CanonicalDocument
   *
   * Helper method to access parsing fields (mimeType, rawData, normalizedUrl)
   * that parsers need. These fields are stored in sourceMetadata but parsers
   * expect them as direct properties for convenience.
   *
   * @param doc - Canonical document
   * @returns Object with parsing-specific fields
   */
  static extractParsingFields(doc: CanonicalDocument): {
    mimeType: string;
    rawData: unknown;
    normalizedUrl: string;
  } {
    return {
      mimeType: (doc.sourceMetadata?.mimeType as string) || 'text/plain',
      rawData: doc.sourceMetadata?.rawData,
      normalizedUrl: doc.canonicalUrl || doc.sourceId,
    };
  }

  /**
   * Convert ParsedDocument to CanonicalDocument (for persistence)
   *
   * @param doc - Parsed document
   * @returns Canonical document
   */
  static parsedToCanonical(doc: ParsedDocument): CanonicalDocument {
    const contentFingerprint = createHash('sha256')
      .update(doc.content || '')
      .digest('hex');

    // Extract source from metadata if available, otherwise default to 'Web'
    const source = (doc.metadata?.source as DocumentSource) || 'Web';

    return {
      _id: '', // Will be set when persisted
      source,
      sourceId: doc.sourceId,
      canonicalUrl: doc.sourceUrl || undefined,
      title: doc.title,
      publisherAuthority: undefined,
      documentFamily: 'Beleid' as DocumentFamily, // Default, should be in metadata
      documentType: doc.documentType || 'unknown',
      dates: {
        publishedAt: doc.parsedAt,
      },
      fullText: doc.content,
      contentFingerprint,
      language: 'nl', // Default, should be in metadata
      artifactRefs: [],
      sourceMetadata: {
        ...doc.metadata,
        rules: doc.rules,
        entities: doc.entities,
        citations: doc.citations,
      },
      enrichmentMetadata: undefined,
      reviewStatus: 'pending_review' as DocumentReviewStatus,
      reviewMetadata: undefined,
      createdAt: doc.parsedAt,
      updatedAt: doc.parsedAt,
      schemaVersion: '1.0',
    };
  }
}
