/**
 * Data transformation utilities
 * Pure functions for transforming data between different formats
 */

export interface BronWebsite {
  _id?: string;
  titel: string;
  url: string;
  samenvatting: string;
  'relevantie voor zoekopdracht'?: string;
  website_types?: string[];
  accepted: boolean | null;
}

// Legacy BronDocument interface removed - all code now uses CanonicalDocument
// See WI-421: Legacy Code Cleanup - BronDocument Interfaces
// 
// For backward compatibility in deprecated code paths, a minimal type is defined here.
// This type should only be used in deprecated code and will be removed in a future version.
/**
 * @deprecated This type is deprecated. Use CanonicalDocument instead.
 * This type is only provided for backward compatibility in deprecated code paths.
 * See WI-421: Legacy Code Cleanup - BronDocument Interfaces
 */
export type BronDocument = Record<string, unknown> & {
  _id?: string;
  titel: string;
  url: string;
  samenvatting: string;
  'relevantie voor zoekopdracht'?: string;
  type_document?: string;
  accepted?: boolean | null;
};

// Canonical document interface (matches server types)
export interface CanonicalDocument {
  _id: string;
  title: string;
  canonicalUrl?: string;
  fullText: string;
  documentType: string;
  dates: {
    publishedAt?: Date | string;
    validFrom?: Date | string;
    validTo?: Date | string;
  };
  sourceMetadata: Record<string, unknown>;
  enrichmentMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Bron {
  _id?: string;
  id: string;
  titel: string;
  url: string;
  samenvatting: string;
  relevantie: string;
  bron: string;
  status: 'pending' | 'approved' | 'rejected';
  type: 'website' | 'document';
  metadata?: {
    documentType: string | null;
    publicationDate: string | null;
    themes: string[];
    issuingAuthority: string | null;
    documentStatus: string | null;
    metadataConfidence?: number;
    hierarchyLevel?: 'municipality' | 'province' | 'national' | 'european';
    jurisdictionId?: string;
  };
}

/**
 * Transforms a BronWebsite to a Bron object
 * @param website - The BronWebsite to transform
 * @returns Bron object
 */
export function transformWebsiteToBron(website: BronWebsite): Bron {
  return {
    _id: website._id,
    id: website._id || String(Date.now()),
    titel: website.titel,
    url: website.url,
    samenvatting: website.samenvatting,
    relevantie: website['relevantie voor zoekopdracht'] || '',
    bron: website.website_types?.[0] || 'Website',
    status: website.accepted === null ? 'pending' : website.accepted ? 'approved' : 'rejected',
    type: 'website',
  };
}

/**
 * Transforms a CanonicalDocument to a Bron object
 * @param doc - The CanonicalDocument to transform
 * @returns Bron object
 */
export function transformCanonicalDocumentToBron(doc: CanonicalDocument): Bron {
  const sourceMetadata = doc.sourceMetadata || {};
  const enrichmentMetadata = doc.enrichmentMetadata || {};

  // Extract legacy fields from sourceMetadata
  const legacyUrl = sourceMetadata.legacyUrl as string | undefined;
  // legacyWebsiteUrl not used
  const legacyLabel = sourceMetadata.legacyLabel as string | undefined;
  // Check both legacyRelevance and legacyRelevantie for compatibility
  const legacyRelevance = (sourceMetadata.legacyRelevance || sourceMetadata.legacyRelevantie) as string | undefined;
  const legacyAccepted = (sourceMetadata.legacyAccepted ?? enrichmentMetadata.accepted) as boolean | null | undefined;
  const legacyThemes = (sourceMetadata.legacyThemes ?? enrichmentMetadata.themes) as string[] | undefined;
  const legacyIssuingAuthority = (sourceMetadata.legacyIssuingAuthority ?? enrichmentMetadata.issuingAuthority) as string | null | undefined;
  const legacyDocumentStatus = enrichmentMetadata.documentStatus as string | null | undefined;
  const legacyMetadataConfidence = enrichmentMetadata.metadataConfidence as number | undefined;

  // Extract summary from fullText (first paragraph or first 500 chars)
  const fullText = doc.fullText || '';
  const firstParagraph = fullText.split('\n\n')[0];
  const samenvatting = firstParagraph
    ? (firstParagraph.length > 500 ? firstParagraph.substring(0, 500) : firstParagraph)
    : (fullText.length > 500 ? fullText.substring(0, 500) : fullText);

  return {
    _id: doc._id,
    id: doc._id || String(Date.now()),
    titel: doc.title,
    url: legacyUrl || doc.canonicalUrl || '',
    samenvatting: samenvatting,
    relevantie: legacyRelevance || '',
    bron: legacyLabel || doc.documentType || 'Document',
    status: legacyAccepted === null ? 'pending' : legacyAccepted ? 'approved' : 'rejected',
    type: 'document',
    metadata: {
      documentType: doc.documentType || null,
      publicationDate: doc.dates?.publishedAt ? (typeof doc.dates.publishedAt === 'string' ? doc.dates.publishedAt : doc.dates.publishedAt.toISOString().split('T')[0]) : null,
      themes: legacyThemes || [],
      issuingAuthority: legacyIssuingAuthority || null,
      documentStatus: legacyDocumentStatus || null,
      metadataConfidence: legacyMetadataConfidence,
    },
  };
}

/**
 * Transforms a CanonicalDocument to a Bron object (legacy support for backward compatibility)
 * @param doc - The CanonicalDocument to transform
 * @returns Bron object
 * @deprecated Use transformCanonicalDocumentToBron instead (this is an alias for backward compatibility)
 */
export function transformDocumentToBron(doc: CanonicalDocument): Bron {
  return transformCanonicalDocumentToBron(doc);
}

/**
 * Transforms an array of BronWebsites to Bron objects
 * @param websites - Array of BronWebsites
 * @returns Array of Bron objects
 */
export function transformWebsitesToBronnen(websites: BronWebsite[]): Bron[] {
  return websites.map(transformWebsiteToBron);
}

/**
 * Transforms an array of CanonicalDocuments to Bron objects
 * @param documents - Array of CanonicalDocuments
 * @returns Array of Bron objects
 */
export function transformCanonicalDocumentsToBronnen(documents: CanonicalDocument[]): Bron[] {
  return documents.map(transformCanonicalDocumentToBron);
}

/**
 * Transforms an array of CanonicalDocuments to Bron objects (legacy support for backward compatibility)
 * @param documents - Array of CanonicalDocuments
 * @returns Array of Bron objects
 * @deprecated Use transformCanonicalDocumentsToBronnen instead (this is an alias for backward compatibility)
 */
export function transformDocumentsToBronnen(documents: CanonicalDocument[]): Bron[] {
  return transformCanonicalDocumentsToBronnen(documents);
}

/**
 * Transforms a created CanonicalDocument from API to a Bron object
 * @param createdDocument - The created CanonicalDocument from API
 * @returns Bron object
 */
export function transformCreatedDocumentToBron(createdDocument: CanonicalDocument): Bron {
  return transformCanonicalDocumentToBron(createdDocument);
}

