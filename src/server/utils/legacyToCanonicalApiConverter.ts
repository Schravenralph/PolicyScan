/**
 * Legacy to Canonical API Converter
 * 
 * Helper functions to convert BronDocumentCreateInput (legacy API format) to CanonicalDocumentDraft.
 * Used for migrating legacy API routes to use CanonicalDocumentService.
 * 
 * @see WI-414: Backend Write Operations Migration
 */

import type { BronDocumentCreateInput } from '../types/index.js';
import type { CanonicalDocumentDraft, DocumentSource, DocumentFamily } from '../contracts/types.js';
import { computeContentFingerprint } from './fingerprints.js';

/**
 * Convert BronDocumentCreateInput to CanonicalDocumentDraft
 * 
 * Converts legacy API format to canonical format for persistence.
 * Handles both legacy fields and canonical fields if provided.
 * 
 * @param legacyInput - Legacy document input from API
 * @returns Canonical document draft
 */
export function convertLegacyApiInputToCanonicalDraft(
  legacyInput: BronDocumentCreateInput
): CanonicalDocumentDraft {
  // Extract fullText - use samenvatting as fallback
  const fullText = legacyInput.samenvatting || legacyInput.titel || 'No content available';

  // Compute content fingerprint
  const contentFingerprint = computeContentFingerprint(fullText);

  // Determine source (default to Web for API-created documents)
  let source: DocumentSource = 'Web';
  
  // Try to infer from URL or label
  if (legacyInput.url) {
    const url = legacyInput.url.toLowerCase();
    if (url.includes('overheid.nl') || url.includes('wetten.overheid.nl')) {
      source = 'Wetgeving';
    } else if (url.includes('rechtspraak.nl') || url.includes('uitspraken.rechtspraak.nl')) {
      source = 'Rechtspraak';
    } else if (url.includes('gemeente') || url.includes('.nl/gemeente')) {
      source = 'Gemeente';
    }
  }

  // Use URL as sourceId (stable identifier)
  const sourceId = legacyInput.url || `api-created-${Date.now()}`;

  // Determine document family
  // If canonical fields provided, use them; otherwise infer from legacy type_document
  let documentFamily: DocumentFamily = 'Web';
  const inputWithFamily = legacyInput as BronDocumentCreateInput & { documentFamily?: DocumentFamily };
  if (inputWithFamily.documentFamily) {
    documentFamily = inputWithFamily.documentFamily;
  } else if (legacyInput.type_document) {
    const type = legacyInput.type_document.toLowerCase();
    if (type.includes('beleid') || type.includes('nota') || type.includes('visie')) {
      documentFamily = 'Beleid';
    } else if (type.includes('regeling') || type.includes('verordening') || type.includes('besluit')) {
      documentFamily = 'Juridisch';
    } else if (type.includes('omgevings') || type.includes('bestemmings') || type.includes('structuur')) {
      documentFamily = 'Omgevingsinstrument';
    }
  }

  // Determine document type
  const inputWithType = legacyInput as BronDocumentCreateInput & { documentType?: string };
  const documentType = inputWithType.documentType || legacyInput.type_document || 'Unknown';

  // Parse publication date if available
  let publishedAt: Date | undefined;
  if (legacyInput.publicatiedatum) {
    try {
      publishedAt = new Date(legacyInput.publicatiedatum);
      if (isNaN(publishedAt.getTime())) {
        publishedAt = undefined;
      }
    } catch {
      // Invalid date, ignore
    }
  }

  // Build source metadata (preserve all legacy fields)
  const sourceMetadata: Record<string, unknown> = {
    legacyUrl: legacyInput.url,
    legacyWebsiteUrl: legacyInput.website_url,
    legacyWebsiteTitel: legacyInput.website_titel,
    legacyLabel: legacyInput.label,
    legacySamenvatting: legacyInput.samenvatting,
    legacyTypeDocument: legacyInput.type_document,
    legacyPublicatiedatum: legacyInput.publicatiedatum,
    legacyRelevantie: legacyInput['relevantie voor zoekopdracht'],
    legacySubjects: legacyInput.subjects,
    legacyThemes: legacyInput.themes,
    legacyAccepted: legacyInput.accepted,
    legacyQueryId: legacyInput.queryId,
    legacyIssuingAuthority: legacyInput.issuingAuthority,
    legacyDocumentStatus: legacyInput.documentStatus,
    legacyMetadataConfidence: legacyInput.metadataConfidence,
    legacyContentHash: legacyInput.contentHash,
    legacyLastContentChange: legacyInput.lastContentChange,
    apiCreated: true,
    apiCreatedAt: new Date().toISOString(),
  };

  // Build enrichment metadata
  const enrichmentMetadata: Record<string, unknown> = {};
  if (legacyInput.queryId) {
    enrichmentMetadata.queryId = legacyInput.queryId;
  }
  if (legacyInput.subjects && legacyInput.subjects.length > 0) {
    enrichmentMetadata.subjects = legacyInput.subjects;
  }
  if (legacyInput.themes && legacyInput.themes.length > 0) {
    enrichmentMetadata.themes = legacyInput.themes;
  }
  if (legacyInput.accepted !== undefined && legacyInput.accepted !== null) {
    enrichmentMetadata.accepted = legacyInput.accepted;
  }
  if (legacyInput.issuingAuthority) {
    enrichmentMetadata.issuingAuthority = legacyInput.issuingAuthority;
  }
  if (legacyInput.documentStatus) {
    enrichmentMetadata.documentStatus = legacyInput.documentStatus;
  }
  if (legacyInput.metadataConfidence !== undefined) {
    enrichmentMetadata.metadataConfidence = legacyInput.metadataConfidence;
  }

  return {
    source,
    sourceId,
    canonicalUrl: legacyInput.url,
    title: legacyInput.titel,
    publisherAuthority: legacyInput.website_titel || legacyInput.issuingAuthority || undefined,
    documentFamily,
    documentType,
    dates: {
      publishedAt,
    },
    fullText,
    contentFingerprint,
    language: 'nl', // Default to Dutch
    artifactRefs: [], // Empty for API-created documents
    sourceMetadata,
    enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
    // All API-created documents start with 'pending_review' status
    reviewStatus: 'pending_review',
  };
}

