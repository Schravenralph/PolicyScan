/**
 * Bron to Canonical Converter
 * 
 * Helper functions to convert BronDocument (legacy frontend format) to CanonicalDocumentDraft.
 * Used for migrating frontend create operations to use canonical document API.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import type { BronDocument } from './transformations';
import type { CanonicalDocumentDraft } from '../services/api';

/**
 * Normalize text for fingerprinting (matches server implementation)
 */
function normalizeTextForFingerprint(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, '\n') // Normalize Windows line endings
    .replace(/\r/g, '\n') // Normalize Mac line endings
    .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace
    .replace(/\n\s+/g, '\n') // Remove leading whitespace after newlines
    .replace(/\s+\n/g, '\n') // Remove trailing whitespace before newlines
    .replace(/\n{3,}/g, '\n\n'); // Collapse multiple newlines to double newline max
}

/**
 * Compute content fingerprint (SHA-256 hash) for canonical documents
 * 
 * Uses Web Crypto API for browser-compatible SHA-256 hashing.
 * Falls back to a simple hash if crypto API is unavailable.
 */
async function computeContentFingerprintClient(text: string): Promise<string> {
  const normalized = normalizeTextForFingerprint(text);
  
  // Use Web Crypto API if available (browser)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(normalized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      // Fall through to fallback
      console.warn('Failed to compute SHA-256 hash, using fallback', error);
    }
  }
  
  // Fallback: use a simple hash (not cryptographically secure, but deterministic)
  // This should only be used in test environments or when crypto API is unavailable
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to 64-character hex string
  return Math.abs(hash).toString(16).padStart(64, '0').substring(0, 64);
}

/**
 * Convert BronDocument to CanonicalDocumentDraft
 * 
 * Converts legacy frontend format to canonical format for API creation.
 * Handles all legacy fields and maps them to canonical structure.
 * 
 * @param bronDoc - Legacy document from frontend
 * @returns Canonical document draft for API
 */
export async function convertBronToCanonicalDraft(bronDoc: BronDocument): Promise<CanonicalDocumentDraft> {
  // Extract fullText - use samenvatting as fallback
  const fullText = bronDoc.samenvatting || bronDoc.titel || 'No content available';

  // Compute content fingerprint
  // Note: This is async, but we'll handle it in the calling code
  // For now, we'll use a synchronous fallback that the server can validate
  // The server will recompute the fingerprint if needed
  const contentFingerprint = await computeContentFingerprintClient(fullText);

  // Determine source (default to Web for frontend-created documents)
  let source: CanonicalDocumentDraft['source'] = 'Web';
  
  // Try to infer from URL or other fields
  if (bronDoc.url) {
    const url = bronDoc.url.toLowerCase();
    if (url.includes('overheid.nl') || url.includes('wetten.overheid.nl')) {
      source = 'Wetgeving';
    } else if (url.includes('rechtspraak.nl') || url.includes('uitspraken.rechtspraak.nl')) {
      source = 'Rechtspraak';
    } else if (url.includes('gemeente') || url.includes('.nl/gemeente')) {
      source = 'Gemeente';
    }
  }

  // Use URL as sourceId (stable identifier)
  const sourceId = bronDoc.url || `frontend-created-${Date.now()}`;

  // Determine document family
  let documentFamily: CanonicalDocumentDraft['documentFamily'] = 'Web';
  if (bronDoc.type_document) {
    const type = bronDoc.type_document.toLowerCase();
    if (type.includes('beleid') || type.includes('nota') || type.includes('visie')) {
      documentFamily = 'Beleid';
    } else if (type.includes('regeling') || type.includes('verordening') || type.includes('besluit')) {
      documentFamily = 'Juridisch';
    } else if (type.includes('omgevings') || type.includes('bestemmings') || type.includes('structuur')) {
      documentFamily = 'Omgevingsinstrument';
    }
  }

  // Determine document type
  const documentType = bronDoc.type_document || 'Unknown';

  // Parse publication date if available
  let publishedAt: Date | string | undefined;
  if (bronDoc.publicatiedatum) {
    try {
      const dateValue = typeof bronDoc.publicatiedatum === 'string' || typeof bronDoc.publicatiedatum === 'number' 
        ? bronDoc.publicatiedatum 
        : String(bronDoc.publicatiedatum);
      publishedAt = new Date(dateValue);
      if (isNaN(publishedAt.getTime())) {
        publishedAt = undefined;
      }
    } catch {
      // Invalid date, ignore
      publishedAt = undefined;
    }
  }

  // Build source metadata (preserve all legacy fields)
  const sourceMetadata: Record<string, unknown> = {
    legacyUrl: bronDoc.url,
    legacyWebsiteUrl: bronDoc.website_url,
    legacyWebsiteTitel: bronDoc.website_titel,
    legacyLabel: bronDoc.label,
    legacySamenvatting: bronDoc.samenvatting,
    legacyTypeDocument: bronDoc.type_document,
    legacyPublicatiedatum: bronDoc.publicatiedatum,
    legacyRelevantie: bronDoc['relevantie voor zoekopdracht'],
    legacySubjects: bronDoc.subjects,
    legacyThemes: bronDoc.themes,
    legacyAccepted: bronDoc.accepted,
    legacyQueryId: bronDoc.queryId,
    legacyWorkflowRunId: bronDoc.workflowRunId,
    legacyWorkflowId: bronDoc.workflowId,
    legacyStepId: bronDoc.stepId,
    legacySource: bronDoc.source,
    legacyDiscoveredAt: bronDoc.discoveredAt,
    legacyIssuingAuthority: bronDoc.issuingAuthority,
    legacyDocumentStatus: bronDoc.documentStatus,
    legacyMetadataConfidence: bronDoc.metadataConfidence,
    legacyContentHash: bronDoc.contentHash,
    legacyLastContentChange: bronDoc.lastContentChange,
    frontendCreated: true,
    frontendCreatedAt: new Date().toISOString(),
  };

  // Build enrichment metadata
  const enrichmentMetadata: Record<string, unknown> = {};
  if (bronDoc.queryId) {
    enrichmentMetadata.queryId = bronDoc.queryId;
  }
  if (bronDoc.workflowRunId) {
    enrichmentMetadata.workflowRunId = bronDoc.workflowRunId;
  }
  if (bronDoc.workflowId) {
    enrichmentMetadata.workflowId = bronDoc.workflowId;
  }
  if (bronDoc.stepId) {
    enrichmentMetadata.stepId = bronDoc.stepId;
  }
  if (bronDoc.subjects && Array.isArray(bronDoc.subjects) && bronDoc.subjects.length > 0) {
    enrichmentMetadata.subjects = bronDoc.subjects;
  }
  if (bronDoc.themes && Array.isArray(bronDoc.themes) && bronDoc.themes.length > 0) {
    enrichmentMetadata.themes = bronDoc.themes;
  }
  if (bronDoc.accepted !== undefined && bronDoc.accepted !== null) {
    enrichmentMetadata.accepted = bronDoc.accepted;
  }
  if (bronDoc.issuingAuthority) {
    enrichmentMetadata.issuingAuthority = bronDoc.issuingAuthority;
  }
  if (bronDoc.documentStatus) {
    enrichmentMetadata.documentStatus = bronDoc.documentStatus;
  }
  if (bronDoc.metadataConfidence !== undefined) {
    enrichmentMetadata.metadataConfidence = bronDoc.metadataConfidence;
  }

  return {
    source,
    sourceId,
    canonicalUrl: bronDoc.url,
    title: bronDoc.titel,
    publisherAuthority: (bronDoc.website_titel || bronDoc.issuingAuthority) as string | undefined,
    documentFamily,
    documentType,
    dates: {
      publishedAt,
    },
    fullText,
    contentFingerprint,
    language: 'nl', // Default to Dutch
    artifactRefs: [], // Empty for frontend-created documents
    sourceMetadata,
    enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
  };
}

