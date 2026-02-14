/**
 * Legacy to Canonical Converter
 * 
 * Helper functions to convert legacy document formats to canonical format.
 * Used during migration from QueryPersistenceService to canonical services.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/23-prompt-manifest/P18.5-migration-guide.md
 * @see WI-414: Backend Write Operations Migration
 */

import type { DiscoveredDocument } from '../external/DSOOntsluitenService.js';
import type { ScrapedDocument } from '../infrastructure/types.js';
import type { BronDocumentCreateInput } from '../../types/index.js';
import type { CanonicalDocumentDraft, DocumentSource, DocumentFamily } from '../../contracts/types.js';
import { computeContentFingerprint } from '../../utils/fingerprints.js';
import { randomUUID } from 'crypto';

/**
 * Convert DiscoveredDocument to CanonicalDocumentDraft
 * 
 * **Important:** DiscoveredDocument typically doesn't have fullText. This converter
 * creates a draft with the available metadata, but fullText must be provided separately.
 * 
 * For documents without fullText:
 * - Option 1: Use an adapter to acquire and extract fullText first
 * - Option 2: Use empty fullText (not recommended, but allowed for metadata-only documents)
 * 
 * @param discovered - Discovered document (metadata only)
 * @param fullText - Full text content (required for canonical documents)
 * @param runId - Workflow run ID for provenance
 * @returns Canonical document draft
 */
export function discoveredDocumentToCanonicalDraft(
  discovered: DiscoveredDocument,
  fullText: string,
  runId: string
): CanonicalDocumentDraft {
  // Normalize fullText
  const normalizedFullText = fullText.trim();
  
  if (!normalizedFullText || normalizedFullText.length === 0) {
    throw new Error(`Document ${discovered.url} has empty fullText. Use an adapter to acquire and extract content first.`);
  }

  // Compute content fingerprint
  const contentFingerprint = computeContentFingerprint(normalizedFullText);

  // Map sourceType to DocumentSource
  const sourceMap: Record<DiscoveredDocument['sourceType'], DocumentSource> = {
    'DSO': 'DSO',
    'IPLO': 'Web',
    'KNOWN_SOURCE': 'Web',
    'OFFICIELEBEKENDMAKINGEN': 'Web',
    'RECHTSPRAAK': 'Rechtspraak',
    'COMMON_CRAWL': 'Web',
    'GOOGLE_SEARCH': 'Web',
  };
  const source: DocumentSource = sourceMap[discovered.sourceType] || 'Web';

  // Use sourceId if available, otherwise use URL, otherwise generate a UUID
  const sourceId = discovered.sourceId || discovered.url || randomUUID();

  // Map documentCategory to DocumentFamily
  const familyMap: Record<DiscoveredDocument['documentCategory'], DocumentFamily> = {
    'policy': 'Beleid',
    'official_publication': 'Juridisch',
    'jurisprudence': 'Juridisch',
    'guidance': 'Beleid',
    'unverified_external': 'Web',
  };
  const documentFamily: DocumentFamily = familyMap[discovered.documentCategory] || 'Web';

  // Parse publication date if available
  let publishedAt: Date | undefined;
  if (discovered.publicationDate) {
    try {
      publishedAt = new Date(discovered.publicationDate);
      if (isNaN(publishedAt.getTime())) {
        publishedAt = undefined;
      }
    } catch {
      // Invalid date, ignore
    }
  }

  // Build enrichment metadata
  const enrichmentMetadata: Record<string, unknown> = {};
  if (discovered.authorityScore !== undefined) {
    enrichmentMetadata.authorityScore = discovered.authorityScore;
  }
  if (discovered.matchSignals) {
    enrichmentMetadata.matchSignals = discovered.matchSignals;
  }
  if (discovered.matchExplanation) {
    enrichmentMetadata.matchExplanation = discovered.matchExplanation;
  }

  return {
    source,
    sourceId,
    canonicalUrl: discovered.url,
    title: discovered.title,
    publisherAuthority: discovered.issuingAuthority,
    documentFamily,
    documentType: discovered.documentType || 'Unknown',
    dates: {
      publishedAt,
    },
    fullText: normalizedFullText,
    contentFingerprint,
    language: 'nl', // Default to Dutch
    artifactRefs: [], // Empty for discovered documents (no artifact acquired yet)
    sourceMetadata: {
      workflowRunId: runId,
      url: discovered.url,
      summary: discovered.summary,
      sourceType: discovered.sourceType,
      documentCategory: discovered.documentCategory,
      provenance: discovered.provenance,
      discoveredAt: new Date().toISOString(),
      // Include municipality code and authority information from metadata if available
      ...(discovered.metadata?.aangeleverdDoorEen && typeof discovered.metadata.aangeleverdDoorEen === 'object' && discovered.metadata.aangeleverdDoorEen !== null ? {
        aangeleverdDoorEen: discovered.metadata.aangeleverdDoorEen,
      } : {}),
    },
    enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
    // All discovered documents start with 'pending_review' status
    reviewStatus: 'pending_review',
  };
}

/**
 * Convert multiple DiscoveredDocuments to CanonicalDocumentDrafts
 * 
 * @param discovered - Array of discovered documents
 * @param fullTextMap - Map of URL to fullText (must provide fullText for each document)
 * @param runId - Workflow run ID
 * @returns Array of canonical document drafts
 */
export function discoveredDocumentsToCanonicalDrafts(
  discovered: DiscoveredDocument[],
  fullTextMap: Map<string, string>,
  runId: string
): CanonicalDocumentDraft[] {
  return discovered.map(doc => {
    const fullText = fullTextMap.get(doc.url);
    if (!fullText) {
      throw new Error(`Missing fullText for document ${doc.url}. Provide fullText in fullTextMap.`);
    }
    return discoveredDocumentToCanonicalDraft(doc, fullText, runId);
  });
}

/**
 * Convert ScrapedDocument to CanonicalDocumentDraft
 * 
 * Converts a scraped document (from web scraping) to canonical document format.
 * ScrapedDocument typically has fullText in the samenvatting field or needs to be extracted.
 * 
 * @param scraped - Scraped document from web scraping
 * @param fullText - Full text content (if not provided, uses samenvatting as fallback)
 * @param queryId - Optional query ID to associate with the document
 * @param workflowRunId - Optional workflow run ID for provenance
 * @returns Canonical document draft
 */
export function scrapedDocumentToCanonicalDraft(
  scraped: ScrapedDocument,
  fullText?: string,
  queryId?: string,
  workflowRunId?: string
): CanonicalDocumentDraft {
  // Use provided fullText or fall back to samenvatting or titel
  // Note: samenvatting is typically a summary, not full text, but we use it as fallback
  const normalizedFullText = (fullText || scraped.samenvatting || scraped.titel || '').trim();
  
  if (!normalizedFullText || normalizedFullText.length === 0) {
    throw new Error(`Document ${scraped.url} has empty fullText. Provide fullText or ensure samenvatting or titel is populated.`);
  }

  // Compute content fingerprint
  const contentFingerprint = computeContentFingerprint(normalizedFullText);

  // Map sourceType to DocumentSource
  const sourceMap: Record<string, DocumentSource> = {
    'iplo': 'Web',
    'rijksoverheid': 'Web',
    'gemeente': 'Gemeente',
    'provincie': 'Web',
    'other': 'Web',
  };
  const source: DocumentSource = (scraped.sourceType && sourceMap[scraped.sourceType]) || 'Web';

  // Use URL as sourceId (scraped documents don't have separate sourceId)
  const sourceId = scraped.url;

  // Map document type to DocumentFamily
  const familyMap: Record<ScrapedDocument['type_document'], DocumentFamily> = {
    'PDF': 'Other',
    'Omgevingsvisie': 'Omgevingsinstrument',
    'Omgevingsplan': 'Omgevingsinstrument',
    'Bestemmingsplan': 'Omgevingsinstrument',
    'Structuurvisie': 'Omgevingsinstrument',
    'Beleidsregel': 'Juridisch',
    'Beleidsnota': 'Beleid',
    'Verordening': 'Juridisch',
    'Visiedocument': 'Beleid',
    'Rapport': 'Beleid',
    'Besluit': 'Juridisch',
    'Beleidsdocument': 'Beleid',
    'Webpagina': 'Web',
  };
  const documentFamily: DocumentFamily = familyMap[scraped.type_document] || 'Web';

  // Parse publication date if available
  let publishedAt: Date | undefined;
  if (scraped.publicatiedatum) {
    try {
      publishedAt = new Date(scraped.publicatiedatum);
      if (isNaN(publishedAt.getTime())) {
        publishedAt = undefined;
      }
    } catch {
      // Invalid date, ignore
    }
  }

  // Build source metadata
  const sourceMetadata: Record<string, unknown> = {
    legacyUrl: scraped.url,
    legacyWebsiteUrl: scraped.website_url,
    legacyWebsiteTitel: scraped.website_titel,
    legacyLabel: scraped.label || 'scraped',
    legacySourceType: scraped.sourceType,
    legacyAuthorityLevel: scraped.authorityLevel,
    legacyMunicipalityName: scraped.municipalityName,
    legacyProvinceName: scraped.provinceName,
    scrapedAt: new Date().toISOString(),
  };

  // Build enrichment metadata
  const enrichmentMetadata: Record<string, unknown> = {};
  if (queryId) {
    enrichmentMetadata.queryId = queryId;
  }
  if (workflowRunId) {
    enrichmentMetadata.workflowRunId = workflowRunId;
  }
  if (scraped.relevanceScore !== undefined) {
    enrichmentMetadata.relevanceScore = scraped.relevanceScore;
  }
  if (scraped.subjects && scraped.subjects.length > 0) {
    enrichmentMetadata.subjects = scraped.subjects;
  }
  if (scraped.themes && scraped.themes.length > 0) {
    enrichmentMetadata.themes = scraped.themes;
  }
  if (scraped.accepted !== undefined && scraped.accepted !== null) {
    enrichmentMetadata.accepted = scraped.accepted;
  }
  if (scraped['relevantie voor zoekopdracht']) {
    enrichmentMetadata.relevanceExplanation = scraped['relevantie voor zoekopdracht'];
  }

  return {
    source,
    sourceId,
    canonicalUrl: scraped.url,
    title: scraped.titel,
    publisherAuthority: scraped.website_titel || undefined,
    documentFamily,
    documentType: scraped.type_document,
    dates: {
      publishedAt,
    },
    fullText: normalizedFullText,
    contentFingerprint,
    language: 'nl', // Default to Dutch
    artifactRefs: [], // Empty for scraped documents (no artifact file acquired)
    sourceMetadata,
    enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
    // All scraped documents start with 'pending_review' status
    reviewStatus: 'pending_review',
  };
}

/**
 * Convert BronDocumentCreateInput to CanonicalDocumentDraft
 * 
 * Converts a legacy document create input (from ScraperOrchestrator or other legacy sources)
 * to canonical document format. Uses samenvatting as fullText fallback.
 * 
 * @param legacyInput - Legacy document create input
 * @param queryId - Optional query ID to associate with the document
 * @param workflowRunId - Optional workflow run ID for provenance
 * @returns Canonical document draft
 */
export function bronDocumentCreateInputToCanonicalDraft(
  legacyInput: BronDocumentCreateInput,
  queryId?: string,
  workflowRunId?: string
): CanonicalDocumentDraft {
  // Use samenvatting as fullText (legacy documents typically only have summary)
  const normalizedFullText = (legacyInput.samenvatting || legacyInput.titel || '').trim();
  
  if (!normalizedFullText || normalizedFullText.length === 0) {
    throw new Error(`Document ${legacyInput.url} has empty fullText. Provide samenvatting or titel.`);
  }

  // Compute content fingerprint
  const contentFingerprint = computeContentFingerprint(normalizedFullText);

  // Map source to DocumentSource
  const sourceMap: Record<string, DocumentSource> = {
    'dso': 'DSO',
    'iplo': 'Web',
    'officielebekendmakingen': 'Web',
    'rechtspraak': 'Rechtspraak',
    'google': 'Web',
    'common-crawl': 'Web',
  };
  const source: DocumentSource = legacyInput.source 
    ? (sourceMap[legacyInput.source.toLowerCase()] || 'Web')
    : 'Web';

  // Use URL as sourceId (stable identifier)
  const sourceId = legacyInput.url;

  // Map document type to DocumentFamily
  const familyMap: Record<string, DocumentFamily> = {
    'Omgevingsvisie': 'Omgevingsinstrument',
    'Omgevingsplan': 'Omgevingsinstrument',
    'Bestemmingsplan': 'Omgevingsinstrument',
    'Structuurvisie': 'Omgevingsinstrument',
    'Beleidsregel': 'Juridisch',
    'Beleidsnota': 'Beleid',
    'Verordening': 'Juridisch',
    'Visiedocument': 'Beleid',
    'Rapport': 'Beleid',
    'Besluit': 'Juridisch',
    'Beleidsdocument': 'Beleid',
    'Webpagina': 'Web',
    'PDF': 'Other',
  };
  const documentFamily: DocumentFamily = familyMap[legacyInput.type_document] || 'Web';

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

  // Build source metadata
  const sourceMetadata: Record<string, unknown> = {
    legacyUrl: legacyInput.url,
    legacyWebsiteUrl: legacyInput.website_url,
    legacyWebsiteTitel: legacyInput.website_titel,
    legacyLabel: legacyInput.label,
    legacySource: legacyInput.source,
    legacyWorkflowRunId: legacyInput.workflowRunId,
    legacyWorkflowId: legacyInput.workflowId,
    legacyStepId: legacyInput.stepId,
    legacyDiscoveredAt: legacyInput.discoveredAt,
    legacyContentHash: legacyInput.contentHash,
    legacyLastContentChange: legacyInput.lastContentChange,
    processedAt: new Date().toISOString(),
  };

  // Build enrichment metadata
  const enrichmentMetadata: Record<string, unknown> = {};
  if (queryId) {
    enrichmentMetadata.queryId = queryId;
  }
  if (workflowRunId) {
    enrichmentMetadata.workflowRunId = workflowRunId;
  }
  if (legacyInput.accepted !== undefined && legacyInput.accepted !== null) {
    enrichmentMetadata.accepted = legacyInput.accepted;
  }
  if (legacyInput.subjects && legacyInput.subjects.length > 0) {
    enrichmentMetadata.subjects = legacyInput.subjects;
  }
  if (legacyInput.themes && legacyInput.themes.length > 0) {
    enrichmentMetadata.themes = legacyInput.themes;
  }
  if (legacyInput['relevantie voor zoekopdracht']) {
    enrichmentMetadata.relevanceExplanation = legacyInput['relevantie voor zoekopdracht'];
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
    documentType: legacyInput.type_document,
    dates: {
      publishedAt,
    },
    fullText: normalizedFullText,
    contentFingerprint,
    language: 'nl', // Default to Dutch
    artifactRefs: [], // Empty for legacy documents (no artifact file acquired)
    sourceMetadata,
    enrichmentMetadata: Object.keys(enrichmentMetadata).length > 0 ? enrichmentMetadata : undefined,
    // All legacy documents start with 'pending_review' status
    reviewStatus: 'pending_review',
  };
}

