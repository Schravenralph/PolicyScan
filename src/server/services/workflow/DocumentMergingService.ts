/**
 * Document Merging Service
 * 
 * Merges CanonicalDocument objects from all sources (core merged + official publications + jurisprudence + optional Common Crawl)
 * into a single list for scoring and categorization.
 * 
 * Uses DocumentDeduplicationService for consistent deduplication across the workflow.
 * Deduplication uses contentFingerprint as primary key, with fallback to canonicalUrl/sourceId.
 */

import type { CanonicalDocument } from '../../contracts/types.js';
import { DocumentDeduplicationService } from './DocumentDeduplicationService.js';
import { logger } from '../../utils/logger.js';

/**
 * Mock data structure for standalone execution
 */
export interface WorkflowMockData {
  /** Mock DSO discovery documents */
  dsoDiscovery?: CanonicalDocument[];
  /** Mock IPLO documents */
  iploDocuments?: CanonicalDocument[];
  /** Mock known source documents */
  knownSources?: CanonicalDocument[];
  /** Mock official publications */
  officieleBekendmakingen?: CanonicalDocument[];
  /** Mock jurisprudence documents */
  rechtspraak?: CanonicalDocument[];
  /** Mock Common Crawl documents */
  commonCrawl?: CanonicalDocument[];
  /** Mock core merged documents */
  documentsCoreMerged?: CanonicalDocument[];
  [key: string]: unknown;
}

/**
 * Workflow context structure for document merging
 */
export interface BeleidsscanWizardContext {
  /** Mock data for standalone execution */
  mockData?: WorkflowMockData;
  /** Core merged documents (from Step 4: DSO + IPLO + Known sources, already deduplicated) */
  documentsCoreMerged?: CanonicalDocument[];
  /** Raw documents organized by source */
  rawDocumentsBySource?: {
    officieleBekendmakingen?: CanonicalDocument[];
    rechtspraak?: CanonicalDocument[];
    commonCrawl?: CanonicalDocument[];
    [key: string]: unknown;
  };
  /** Legacy field names for backward compatibility */
  mergedDocuments?: CanonicalDocument[];
  allDocuments?: CanonicalDocument[];
  [key: string]: unknown;
}

/**
 * Service for merging documents from all sources
 */
export class DocumentMergingService {
  private deduplicationService: DocumentDeduplicationService;

  constructor(deduplicationService?: DocumentDeduplicationService) {
    this.deduplicationService = deduplicationService || new DocumentDeduplicationService();
  }

  /**
   * Merges documents from all sources into a single list
   * 
   * Sources merged (in order):
   * 1. Core merged documents (DSO + IPLO + Known sources, already deduplicated)
   * 2. Official publications (officielebekendmakingen.nl)
   * 3. Jurisprudence (rechtspraak.nl)
   * 4. Common Crawl documents (optional, if available)
   * 
   * Supports mock data for standalone execution (priority: mockData > context)
   * 
   * @param context The workflow context containing documents from all sources
   * @returns Promise resolving to merged document list
   */
  async mergeAllSources(context: BeleidsscanWizardContext | Record<string, unknown>): Promise<CanonicalDocument[]> {
    const merged: CanonicalDocument[] = [];
    
    try {
      // Check for mock data first (for standalone execution)
      const mockData = (context as BeleidsscanWizardContext).mockData;
      
      // 1. Core merged documents (from Step 4: DSO + IPLO + Known sources, already deduplicated)
      // Priority: mockData.documentsCoreMerged > context.documentsCoreMerged > context.mergedDocuments > context.allDocuments
      let coreMerged: CanonicalDocument[] = [];
      if (mockData?.documentsCoreMerged && mockData.documentsCoreMerged.length > 0) {
        coreMerged = mockData.documentsCoreMerged;
        logger.debug(`Using mock core merged documents: ${coreMerged.length}`);
      } else {
        const extracted = this.extractDocuments(
          context,
          ['documentsCoreMerged', 'mergedDocuments', 'allDocuments']
        );
        // Check if extracted items are metadata (no fullText) or full documents
        if (extracted.length > 0 && !('fullText' in extracted[0])) {
          // Items are metadata - fetch full documents from database
          const { fetchDocumentsFromMetadata } = await import('../../routes/workflows/actions/documentContextHelpers.js');
          coreMerged = await fetchDocumentsFromMetadata(extracted as Array<{ _id: string }>);
        } else {
          coreMerged = extracted;
        }
      }
      
      if (coreMerged.length > 0) {
        logger.debug(`Merging ${coreMerged.length} core merged documents`);
        merged.push(...coreMerged);
      }
      
      // 2. Official publications (from Step 5: officielebekendmakingen.nl)
      // Priority: mockData > context.rawDocumentsBySource
      let officieleBekendmakingen: CanonicalDocument[] = [];
      if (mockData?.officieleBekendmakingen && mockData.officieleBekendmakingen.length > 0) {
        officieleBekendmakingen = mockData.officieleBekendmakingen;
        logger.debug(`Using mock official publications: ${officieleBekendmakingen.length}`);
      } else {
        officieleBekendmakingen = await this.extractDocumentsFromSource(
          context,
          'officieleBekendmakingen'
        );
      }
      
      if (officieleBekendmakingen.length > 0) {
        logger.debug(`Merging ${officieleBekendmakingen.length} official publications`);
        merged.push(...officieleBekendmakingen);
      }
      
      // 3. Jurisprudence (from Step 6: rechtspraak.nl)
      // Priority: mockData > context.rawDocumentsBySource
      let rechtspraak: CanonicalDocument[] = [];
      if (mockData?.rechtspraak && mockData.rechtspraak.length > 0) {
        rechtspraak = mockData.rechtspraak;
        logger.debug(`Using mock jurisprudence documents: ${rechtspraak.length}`);
      } else {
        rechtspraak = await this.extractDocumentsFromSource(
          context,
          'rechtspraak'
        );
      }
      
      if (rechtspraak.length > 0) {
        logger.debug(`Merging ${rechtspraak.length} jurisprudence documents`);
        merged.push(...rechtspraak);
      }
      
      // 4. Common Crawl documents (optional, from Step 8)
      // Priority: mockData > context.rawDocumentsBySource
      let commonCrawl: CanonicalDocument[] = [];
      if (mockData?.commonCrawl && mockData.commonCrawl.length > 0) {
        commonCrawl = mockData.commonCrawl;
        logger.debug(`Using mock Common Crawl documents: ${commonCrawl.length}`);
      } else {
        commonCrawl = await this.extractDocumentsFromSource(
          context,
          'commonCrawl'
        );
      }
      
      if (commonCrawl.length > 0) {
        logger.debug(`Merging ${commonCrawl.length} Common Crawl documents`);
        merged.push(...commonCrawl);
      }
      
      logger.info(
        `Merged ${merged.length} documents from all sources (before deduplication): ` +
        `${coreMerged.length} core, ${officieleBekendmakingen.length} official publications, ` +
        `${rechtspraak.length} jurisprudence, ${commonCrawl.length} Common Crawl`
      );
      
      // Deduplicate documents using DocumentDeduplicationService
      // Strategy: Use merge strategy to combine metadata from duplicates
      // This ensures consistent deduplication across the entire workflow
      // Note: DocumentDeduplicationService will be refactored in WI-REFACTOR-006 to use CanonicalDocument[]
      // For now, it may still expect DiscoveredDocument[], but we're updating this service first
      const deduplicationResult = this.deduplicationService.deduplicate(merged, {
        byUrl: true, // Uses normalized canonicalUrl
        byStableId: true, // Uses contentFingerprint (primary) or normalized URL
        duplicateStrategy: 'merge', // Merge duplicates to preserve all metadata
      });
      
      logger.info(
        `After deduplication: ${deduplicationResult.documents.length} unique documents (removed ${deduplicationResult.duplicatesRemoved} duplicates)`
      );
      
      if (deduplicationResult.duplicatesRemoved > 0) {
        logger.debug(
          { duplicateGroupsCount: deduplicationResult.duplicateGroups?.size || 0 },
          'Duplicate groups found during merging'
        );
      }
      
      return deduplicationResult.documents;
    } catch (error) {
      logger.error(
        { error, contextKeys: Object.keys(context) },
        'Error merging documents from all sources'
      );
      // Return whatever we've merged so far (graceful degradation)
      return merged;
    }
  }
  
  /**
   * Extracts documents from context using multiple possible field names
   * 
   * @param context The workflow context
   * @param fieldNames Possible field names to check
   * @returns Array of documents found
   */
  private extractDocuments(
    context: Record<string, unknown>,
    fieldNames: string[]
  ): CanonicalDocument[] {
    for (const fieldName of fieldNames) {
      const value = context[fieldName];
      if (Array.isArray(value) && value.length > 0) {
        // Validate that items are CanonicalDocument-like
        const documents = value.filter(
          (item): item is CanonicalDocument =>
            typeof item === 'object' &&
            item !== null &&
            '_id' in item &&
            'source' in item &&
            'sourceId' in item &&
            'title' in item &&
            'documentFamily' in item &&
            'fullText' in item &&
            'contentFingerprint' in item &&
            'language' in item &&
            'artifactRefs' in item &&
            'sourceMetadata' in item &&
            'dates' in item &&
            'createdAt' in item &&
            'updatedAt' in item &&
            'schemaVersion' in item
        );
        if (documents.length > 0) {
          return documents;
        }
      }
    }
    return [];
  }
  
  /**
   * Extracts documents from rawDocumentsBySource
   * 
   * Now handles both full CanonicalDocument objects (for backward compatibility)
   * and DocumentContextMetadata objects (new format to prevent 16MB BSON limit).
   * If metadata is found, fetches full documents from the database.
   * 
   * @param context The workflow context
   * @param sourceName The source name (e.g., 'officieleBekendmakingen', 'rechtspraak')
   * @returns Array of documents from the specified source
   */
  private async extractDocumentsFromSource(
    context: Record<string, unknown>,
    sourceName: string
  ): Promise<CanonicalDocument[]> {
    const rawDocumentsBySource = context.rawDocumentsBySource as
      | Record<string, unknown>
      | undefined;
    
    if (!rawDocumentsBySource) {
      return [];
    }
    
    const sourceDocuments = rawDocumentsBySource[sourceName];
    
    if (!Array.isArray(sourceDocuments) || sourceDocuments.length === 0) {
      return [];
    }
    
    // Check if items are full CanonicalDocuments or metadata
    const firstItem = sourceDocuments[0];
    const isMetadata = typeof firstItem === 'object' &&
      firstItem !== null &&
      '_id' in firstItem &&
      !('fullText' in firstItem) &&
      !('contentFingerprint' in firstItem);
    
    if (isMetadata) {
      // Items are metadata - fetch full documents from database
      const { fetchDocumentsFromMetadata } = await import('../../routes/workflows/actions/documentContextHelpers.js');
      return await fetchDocumentsFromMetadata(sourceDocuments as Array<{ _id: string }>);
    }
    
    // Items are full CanonicalDocuments - validate and return
    const documents = sourceDocuments.filter(
      (item): item is CanonicalDocument =>
        typeof item === 'object' &&
        item !== null &&
        '_id' in item &&
        'source' in item &&
        'sourceId' in item &&
        'title' in item &&
        'documentFamily' in item &&
        'fullText' in item &&
        'contentFingerprint' in item &&
        'language' in item &&
        'artifactRefs' in item &&
        'sourceMetadata' in item &&
        'dates' in item &&
        'createdAt' in item &&
        'updatedAt' in item &&
        'schemaVersion' in item
    );
    
    return documents;
  }
}

