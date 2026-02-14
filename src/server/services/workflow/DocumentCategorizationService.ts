/**
 * Document Categorization Service
 * 
 * Categorizes CanonicalDocument objects by type for UI presentation.
 * Maps documentFamily and source to UI-compatible categories.
 * 
 * Category Mapping:
 * - documentFamily: 'Beleid' | 'Omgevingsinstrument' | 'Geo' → 'policy'
 * - documentFamily: 'Juridisch' + source: 'Rechtspraak' → 'jurisprudence'
 * - documentFamily: 'Juridisch' + source: 'Wetgeving' → 'official_publication'
 * - source: 'Rechtspraak' → 'jurisprudence' (overrides documentFamily)
 * - source: 'Web' + IPLO-like metadata → 'guidance'
 * - source: 'Web' → 'unverified_external'
 */

import type { CanonicalDocument, DocumentFamily, DocumentSource } from '../../contracts/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Documents grouped by category
 */
export interface DocumentsByCategory {
  /** Policy documents (DSO, municipality plans, etc.) */
  policy: CanonicalDocument[];
  /** Official publications (officielebekendmakingen) */
  official_publication: CanonicalDocument[];
  /** Legal decisions (rechtspraak) */
  jurisprudence: CanonicalDocument[];
  /** Guidance documents (IPLO) */
  guidance: CanonicalDocument[];
  /** External sources (Common Crawl) */
  unverified_external: CanonicalDocument[];
}

/**
 * Service for categorizing documents by type
 */
export class DocumentCategorizationService {
  /**
   * Maps documentFamily and source to UI category
   * 
   * Priority rules:
   * 1. source: 'Rechtspraak' → 'jurisprudence' (overrides documentFamily)
   * 2. Check for guidance documents (IPLO-like) - must check before policy families
   * 3. documentFamily: 'Juridisch' → 'official_publication' (unless Rechtspraak, which is already handled)
   * 4. documentFamily: 'Beleid' | 'Omgevingsinstrument' | 'Geo' → 'policy' (unless guidance)
   * 5. documentFamily: 'Web' → 'unverified_external' (unless guidance)
   * 6. source: 'Web' → 'unverified_external' (unless guidance)
   * 7. Unknown documentFamily → 'unverified_external' (with warning)
   * 
   * @param document The canonical document
   * @returns UI category name
   */
  private mapDocumentFamilyToCategory(document: CanonicalDocument): string {
    const { documentFamily, source } = document;

    // Priority 1: Rechtspraak source always maps to jurisprudence
    if (source === 'Rechtspraak') {
      return 'jurisprudence';
    }

    // Priority 2: Check for guidance documents (IPLO-like) - must check before policy families
    // This allows Beleid family with Web source and IPLO metadata to be guidance
    if (this.isGuidanceDocument(document)) {
      return 'guidance';
    }

    // Priority 3: Juridisch family maps to official_publication (unless Rechtspraak, which is already handled)
    if (documentFamily === 'Juridisch') {
      return 'official_publication';
    }

    // Priority 4: Policy-related families map to policy (unless guidance, which is already handled)
    if (documentFamily === 'Beleid' || documentFamily === 'Omgevingsinstrument' || documentFamily === 'Geo') {
      return 'policy';
    }

    // Priority 5: Web family maps to unverified_external (unless guidance, which is already handled)
    if (documentFamily === 'Web') {
      return 'unverified_external';
    }

    // Check for unknown documentFamily BEFORE checking Web source (so we can log a warning)
    const knownFamilies: CanonicalDocument['documentFamily'][] = ['Beleid', 'Juridisch', 'Omgevingsinstrument', 'Web', 'Geo'];
    if (!knownFamilies.includes(documentFamily)) {
      logger.warn(
        {
          documentFamily: documentFamily || 'undefined',
          source,
          documentId: document._id,
          title: document.title,
        },
        `Unknown documentFamily: ${documentFamily || 'undefined'}, categorizing as unverified_external`
      );
      return 'unverified_external';
    }

    // Priority 6: Web source maps to unverified_external (unless guidance, which is already handled)
    if (source === 'Web') {
      return 'unverified_external';
    }

    // Default: unverified_external for any other unknown combinations
    return 'unverified_external';
  }

  /**
   * Detects if a document is a guidance document (IPLO-like)
   * 
   * Checks for indicators in metadata that suggest this is a guidance document:
   * - IPLO-like source metadata
   * - Guidance-related keywords in title or metadata
   * 
   * @param document The canonical document
   * @returns true if document appears to be guidance
   */
  private isGuidanceDocument(document: CanonicalDocument): boolean {
    // Check sourceMetadata for IPLO indicators
    const sourceMetadata = document.sourceMetadata;
    if (sourceMetadata && typeof sourceMetadata === 'object') {
      // Check for sourceType field (may be 'IPLO' or 'iplo')
      const sourceType = sourceMetadata.sourceType;
      if (sourceType === 'IPLO' || sourceType === 'iplo' || sourceType === 'IPLO') {
        return true;
      }
      // Check for IPLO-specific fields
      if ('iplo' in sourceMetadata || 'IPLO' in sourceMetadata) {
        return true;
      }
    }

    // Check enrichmentMetadata for guidance indicators
    const enrichmentMetadata = document.enrichmentMetadata;
    if (enrichmentMetadata && typeof enrichmentMetadata === 'object') {
      if ('guidance' in enrichmentMetadata || 'handreiking' in enrichmentMetadata) {
        return true;
      }
      // Check for documentCategory preserved from DiscoveredDocument conversion
      const documentCategory = enrichmentMetadata.documentCategory;
      if (documentCategory === 'guidance') {
        return true;
      }
    }

    // Check title for guidance keywords
    const title = document.title?.toLowerCase() || '';
    const guidanceKeywords = ['handreiking', 'leidraad', 'richtlijn', 'guidance', 'guide'];
    if (guidanceKeywords.some(keyword => title.includes(keyword))) {
      return true;
    }

    // Check canonicalUrl or sourceId for IPLO patterns
    const url = document.canonicalUrl || document.sourceId || '';
    if (typeof url === 'string' && url.toLowerCase().includes('iplo')) {
      return true;
    }

    // Check publisherAuthority for IPLO-like patterns
    const publisher = document.publisherAuthority || '';
    if (typeof publisher === 'string' && publisher.toLowerCase().includes('informatiepunt')) {
      return true;
    }

    return false;
  }

  /**
   * Categorizes documents by mapping documentFamily and source to UI categories
   * 
   * @param documents Documents to categorize
   * @returns Documents grouped by category
   */
  categorizeDocuments(documents: CanonicalDocument[]): DocumentsByCategory {
    // Initialize all categories as empty arrays
    const categorized: DocumentsByCategory = {
      policy: [],
      official_publication: [],
      jurisprudence: [],
      guidance: [],
      unverified_external: [],
    };

    // Group documents by category
    for (const doc of documents) {
      const category = this.mapDocumentFamilyToCategory(doc);

      // Add to appropriate category array
      switch (category) {
        case 'policy':
          categorized.policy.push(doc);
          break;
        case 'official_publication':
          categorized.official_publication.push(doc);
          break;
        case 'jurisprudence':
          categorized.jurisprudence.push(doc);
          break;
        case 'guidance':
          categorized.guidance.push(doc);
          break;
        case 'unverified_external':
          categorized.unverified_external.push(doc);
          break;
        default: {
          // Should never happen, but handle gracefully
          logger.warn(
            { category, documentId: doc._id, title: doc.title },
            `Unexpected category: ${category}, categorizing as unverified_external`
          );
          categorized.unverified_external.push(doc);
          break;
        }
      }
    }

    // Log categorization summary with breakdown
    const totalDocs = documents.length;
    const categoryCounts = {
      policy: categorized.policy.length,
      official_publication: categorized.official_publication.length,
      jurisprudence: categorized.jurisprudence.length,
      guidance: categorized.guidance.length,
      unverified_external: categorized.unverified_external.length,
    };

    const familyBreakdown = this.getFamilyBreakdown(documents);
    const sourceBreakdown = this.getSourceBreakdown(documents);

    logger.info(
      {
        totalDocuments: totalDocs,
        categoryCounts,
        familyBreakdown,
        sourceBreakdown,
      },
      `Categorized ${totalDocs} documents into ${Object.keys(categoryCounts).filter(k => categoryCounts[k as keyof typeof categoryCounts] > 0).length} categories`
    );

    return categorized;
  }

  /**
   * Gets breakdown of documents by documentFamily
   * 
   * @param documents Documents to analyze
   * @returns Count of documents per documentFamily
   */
  private getFamilyBreakdown(documents: CanonicalDocument[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const doc of documents) {
      const family = doc.documentFamily || 'unknown';
      breakdown[family] = (breakdown[family] || 0) + 1;
    }
    return breakdown;
  }

  /**
   * Gets breakdown of documents by source
   * 
   * @param documents Documents to analyze
   * @returns Count of documents per source
   */
  private getSourceBreakdown(documents: CanonicalDocument[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const doc of documents) {
      const source = doc.source || 'unknown';
      breakdown[source] = (breakdown[source] || 0) + 1;
    }
    return breakdown;
  }

  /**
   * Gets the count of documents in each category
   * 
   * @param categorized Documents grouped by category
   * @returns Count of documents per category
   */
  getCategoryCounts(categorized: DocumentsByCategory): Record<string, number> {
    return {
      policy: categorized.policy.length,
      official_publication: categorized.official_publication.length,
      jurisprudence: categorized.jurisprudence.length,
      guidance: categorized.guidance.length,
      unverified_external: categorized.unverified_external.length,
    };
  }

  /**
   * Gets all categories that have at least one document
   * 
   * @param categorized Documents grouped by category
   * @returns Array of category names that have documents
   */
  getNonEmptyCategories(categorized: DocumentsByCategory): string[] {
    const nonEmpty: string[] = [];

    if (categorized.policy.length > 0) {
      nonEmpty.push('policy');
    }
    if (categorized.official_publication.length > 0) {
      nonEmpty.push('official_publication');
    }
    if (categorized.jurisprudence.length > 0) {
      nonEmpty.push('jurisprudence');
    }
    if (categorized.guidance.length > 0) {
      nonEmpty.push('guidance');
    }
    if (categorized.unverified_external.length > 0) {
      nonEmpty.push('unverified_external');
    }

    return nonEmpty;
  }

  /**
   * Gets the total count of documents across all categories
   * 
   * @param categorized Documents grouped by category
   * @returns Total document count
   */
  getTotalCount(categorized: DocumentsByCategory): number {
    return (
      categorized.policy.length +
      categorized.official_publication.length +
      categorized.jurisprudence.length +
      categorized.guidance.length +
      categorized.unverified_external.length
    );
  }
}

