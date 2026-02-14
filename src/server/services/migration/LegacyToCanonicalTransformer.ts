/**
 * LegacyToCanonicalTransformer
 * 
 * Transforms legacy BronDocumentDocument to CanonicalDocumentDraft for backfill.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/13-migrations-and-backfills.md
 */

import type { BronDocumentDocument } from '../../types/index.js';
import type { CanonicalDocumentDraft, DocumentSource, DocumentFamily } from '../../contracts/types.js';
import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';

/**
 * Normalize text for fingerprinting
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n');
}

/**
 * Compute content fingerprint (SHA-256 of normalized fullText)
 */
function computeContentFingerprint(fullText: string): string {
  const normalized = normalizeText(fullText);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Infer document source from legacy document
 */
function inferSource(legacyDoc: BronDocumentDocument): DocumentSource {
  // Check explicit source field
  if (legacyDoc.source) {
    const sourceMap: Record<string, DocumentSource> = {
      'dso': 'DSO',
      'rechtspraak': 'Rechtspraak',
      'wetgeving': 'Wetgeving',
      'gemeente': 'Gemeente',
      'p dok': 'PDOK',
      'web': 'Web',
    };
    const normalized = legacyDoc.source.toLowerCase();
    if (sourceMap[normalized]) {
      return sourceMap[normalized];
    }
  }

  // Infer from URL patterns
  const url = legacyDoc.url || legacyDoc.website_url || '';
  if (url.includes('officielebekendmakingen.nl')) {
    return 'Wetgeving';
  }
  if (url.includes('rechtspraak.nl')) {
    return 'Rechtspraak';
  }
  if (url.includes('ruimtelijkeplannen.nl') || url.includes('omgevingsloket.nl')) {
    return 'DSO';
  }
  if (url.includes('pdok.nl')) {
    return 'PDOK';
  }

  // Default to Web for unknown sources
  return 'Web';
}

/**
 * Infer document family from legacy document
 * 
 * Uses document type registry for type detection and mapping.
 */
function inferDocumentFamily(legacyDoc: BronDocumentDocument, source: DocumentSource): DocumentFamily {
  // Use document type registry to map legacy type
  if (legacyDoc.type_document) {
    const { mapLegacyDocumentType } = require('../../types/document-type-registry.js');
    const mapped = mapLegacyDocumentType(legacyDoc.type_document);
    if (mapped.documentFamily) {
      return mapped.documentFamily;
    }
  }

  // Fallback: Infer from source if type mapping failed
  if (source === 'DSO') {
    return 'Omgevingsinstrument';
  }
  if (source === 'Rechtspraak' || source === 'Wetgeving') {
    return 'Juridisch';
  }
  if (source === 'Gemeente') {
    return 'Beleid';
  }
  if (source === 'PDOK') {
    return 'Geo';
  }

  return 'Other';
}

/**
 * Generate sourceId from legacy document
 */
function generateSourceId(legacyDoc: BronDocumentDocument, source: DocumentSource): string {
  // Prefer URL as sourceId (most stable)
  if (legacyDoc.url) {
    return legacyDoc.url;
  }

  // Fallback to _id if available
  if (legacyDoc._id) {
    return legacyDoc._id.toString();
  }

  // Last resort: generate from title + URL
  const title = legacyDoc.titel || 'unknown';
  const url = legacyDoc.website_url || '';
  return `${source}:${title}:${url}`.substring(0, 200); // Limit length
}

/**
 * Extract fullText from legacy document
 * 
 * Legacy documents may not have fullText, so we construct it from available fields.
 */
function extractFullText(legacyDoc: BronDocumentDocument): string {
  const parts: string[] = [];

  // Title
  if (legacyDoc.titel) {
    parts.push(legacyDoc.titel);
  }

  // Summary
  if (legacyDoc.samenvatting) {
    parts.push(legacyDoc.samenvatting);
  }

  // Relevance
  if (legacyDoc['relevantie voor zoekopdracht']) {
    parts.push(legacyDoc['relevantie voor zoekopdracht']);
  }

  // If we have no content, use a placeholder
  if (parts.length === 0) {
    logger.warn({ url: legacyDoc.url }, 'Legacy document has no extractable text content');
    return `[No content available for ${legacyDoc.url || 'unknown document'}]`;
  }

  return parts.join('\n\n');
}

/**
 * Parse publication date from legacy document
 */
function parsePublicationDate(legacyDoc: BronDocumentDocument): Date | undefined {
  if (!legacyDoc.publicatiedatum) {
    return undefined;
  }

  try {
    const date = new Date(legacyDoc.publicatiedatum);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date;
  } catch {
    return undefined;
  }
}

/**
 * Transform legacy BronDocumentDocument to CanonicalDocumentDraft
 * 
 * @param legacyDoc - Legacy document to transform
 * @returns Canonical document draft
 */
export function transformLegacyToCanonical(legacyDoc: BronDocumentDocument): CanonicalDocumentDraft {
  const source = inferSource(legacyDoc);
  const sourceId = generateSourceId(legacyDoc, source);
  const fullText = extractFullText(legacyDoc);
  const contentFingerprint = computeContentFingerprint(fullText);
  const documentFamily = inferDocumentFamily(legacyDoc, source);

  // Use document type registry to normalize document type
  const { mapLegacyDocumentType } = require('../../types/document-type-registry.js');
  const typeMapping = legacyDoc.type_document
    ? mapLegacyDocumentType(legacyDoc.type_document)
    : { documentFamily, documentType: 'unknown' };

  return {
    source,
    sourceId,
    canonicalUrl: legacyDoc.url || legacyDoc.website_url,
    title: legacyDoc.titel || 'Untitled',
    publisherAuthority: legacyDoc.issuingAuthority || undefined,
    documentFamily: typeMapping.documentFamily,
    documentType: typeMapping.documentType,
    dates: {
      publishedAt: parsePublicationDate(legacyDoc),
    },
    fullText,
    contentFingerprint,
    language: 'nl', // Default to Dutch
    artifactRefs: [], // No artifacts available for legacy documents
    sourceMetadata: {
      legacyId: legacyDoc._id?.toString(),
      legacyUrl: legacyDoc.url,
      legacyWebsiteUrl: legacyDoc.website_url,
      legacyLabel: legacyDoc.label,
      legacySource: legacyDoc.source,
      legacyWorkflowRunId: legacyDoc.workflowRunId?.toString(),
      legacyWorkflowId: legacyDoc.workflowId,
      legacyStepId: legacyDoc.stepId,
      legacyDiscoveredAt: legacyDoc.discoveredAt,
      legacySubjects: legacyDoc.subjects,
      legacyThemes: legacyDoc.themes,
      legacyAccepted: legacyDoc.accepted,
      legacyQueryId: legacyDoc.queryId?.toString(),
    },
    enrichmentMetadata: {
      backfilled: true,
      backfilledAt: new Date(),
      legacyContentHash: legacyDoc.contentHash,
      legacyLastContentChange: legacyDoc.lastContentChange,
      legacyMetadataConfidence: legacyDoc.metadataConfidence,
      legacyDocumentStatus: legacyDoc.documentStatus,
    },
    // All migrated legacy documents start with 'pending_review' status
    reviewStatus: 'pending_review',
  };
}

