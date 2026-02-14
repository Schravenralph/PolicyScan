import type { CanonicalDocument } from '../../../contracts/types.js';

/**
 * Filters for metadata-based document filtering
 */
export interface MetadataFilters {
  documentType?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  themes?: string[];
  issuingAuthority?: string[];
  documentStatus?: string[];
}

/**
 * Service for filtering documents by metadata
 * 
 * Supports canonical CanonicalDocument format
 */
export class MetadataFilterService {
  /**
   * Filter canonical documents by metadata
   */
  filterCanonicalDocuments(
    documents: CanonicalDocument[],
    filters: MetadataFilters
  ): CanonicalDocument[] {
    return documents.filter(doc => this.matchesCanonicalFilters(doc, filters));
  }

  /**
   * Check if canonical document matches all filters
   */
  private matchesCanonicalFilters(doc: CanonicalDocument, filters: MetadataFilters): boolean {
    // Document type filter
    if (filters.documentType && filters.documentType.length > 0) {
      if (!filters.documentType.includes(doc.documentType)) {
        return false;
      }
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      const pubDate = doc.dates?.publishedAt;
      if (!pubDate) {
        return false; // Exclude documents without dates if date filter is specified
      }
      
      if (filters.dateFrom && pubDate < filters.dateFrom) {
        return false;
      }
      
      if (filters.dateTo && pubDate > filters.dateTo) {
        return false;
      }
    }

    // Theme filter (from enrichmentMetadata)
    if (filters.themes && filters.themes.length > 0) {
      const docThemes = (doc.enrichmentMetadata?.themes as string[]) || [];
      const hasMatchingTheme = filters.themes.some(theme => 
        docThemes.some(docTheme => 
          docTheme.toLowerCase().includes(theme.toLowerCase()) ||
          theme.toLowerCase().includes(docTheme.toLowerCase())
        )
      );
      if (!hasMatchingTheme) {
        return false;
      }
    }

    // Issuing authority filter (publisherAuthority in canonical)
    if (filters.issuingAuthority && filters.issuingAuthority.length > 0) {
      if (!doc.publisherAuthority) {
        return false;
      }
      const hasMatchingAuthority = filters.issuingAuthority.some(auth =>
        doc.publisherAuthority?.toLowerCase().includes(auth.toLowerCase()) ||
        auth.toLowerCase().includes(doc.publisherAuthority?.toLowerCase() || '')
      );
      if (!hasMatchingAuthority) {
        return false;
      }
    }

    // Document status filter (from enrichmentMetadata)
    if (filters.documentStatus && filters.documentStatus.length > 0) {
      const docStatus = doc.enrichmentMetadata?.documentStatus as string | undefined;
      if (!docStatus || !filters.documentStatus.includes(docStatus)) {
        return false;
      }
    }

    return true;
  }
}
