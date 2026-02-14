import { ObjectId } from 'mongodb';
import { logger } from '../../../utils/logger.js';
import { ScrapedDocument, ScrapedSource } from '../../infrastructure/types.js';
import { BronWebsiteCreateInput } from '../../../types/index.js';
import { CanonicalDocumentDraft } from '../../../contracts/types.js';
import { scrapedDocumentToCanonicalDraft } from '../../workflow/legacyToCanonicalConverter.js';
import { MetadataExtractionService } from '../../ingestion/metadata/MetadataExtractionService.js';
import { GraphManager } from '../GraphManager.js';

export class DocumentProcessor {
  constructor(
    private metadataExtractionService: MetadataExtractionService,
    private graphManager: GraphManager
  ) {}

  /**
   * Convert scraped documents to CanonicalDocumentDraft
   *
   * Direct conversion from ScrapedDocument to CanonicalDocumentDraft, eliminating
   * the intermediate BronDocumentCreateInput conversion step.
   *
   * @param documents - Scraped documents to convert
   * @param queryId - Query ID to associate with documents
   * @param workflowRunId - Workflow run ID for provenance
   * @returns Array of canonical document drafts
   */
  async convertToCanonicalDraft(
    documents: ScrapedDocument[],
    queryId: ObjectId,
    workflowRunId: string
  ): Promise<CanonicalDocumentDraft[]> {
    // Filter and validate documents before conversion
    const validDocuments = documents.filter(doc => {
      return doc.titel && doc.url && doc.website_url;
    });

    // Convert documents with error handling and metadata extraction
    const convertedDocs = await Promise.all(
      validDocuments.map(async doc => {
        try {
          if (process.env.DEBUG_DOCUMENT_PROCESSOR === 'true') {
            logger.info({ url: doc.url }, 'Converting scraped document to canonical draft');
          }
          // Extract metadata for enrichment
          const metadata = await this.metadataExtractionService.extractMetadata(doc);

          // Use scrapedDocumentToCanonicalDraft for conversion
          // It handles fullText extraction from samenvatting and other fields
          const draft = scrapedDocumentToCanonicalDraft(
            doc,
            undefined, // fullText - will use samenvatting as fallback
            queryId.toString(),
            workflowRunId
          );

          // Enhance enrichment metadata with extracted metadata
          if (metadata.themes && Array.isArray(metadata.themes) && metadata.themes.length > 0) {
            const existingThemes = Array.isArray(draft.enrichmentMetadata?.themes) ? draft.enrichmentMetadata.themes : [];
            const allThemes = Array.from(new Set([...existingThemes, ...metadata.themes]));
            draft.enrichmentMetadata = {
              ...draft.enrichmentMetadata,
              themes: allThemes,
            };
          }

          if (metadata.issuingAuthority) {
            draft.enrichmentMetadata = {
              ...draft.enrichmentMetadata,
              issuingAuthority: metadata.issuingAuthority,
            };
          }

          if (metadata.documentStatus) {
            draft.enrichmentMetadata = {
              ...draft.enrichmentMetadata,
              documentStatus: metadata.documentStatus,
            };
          }

          if (metadata.metadataConfidence !== undefined) {
            draft.enrichmentMetadata = {
              ...draft.enrichmentMetadata,
              metadataConfidence: metadata.metadataConfidence,
            };
          }

          return draft;
        } catch (error) {
          logger.warn({ error, url: doc.url }, 'Failed to convert scraped document to canonical draft');
          return null;
        }
      })
    );

    // Filter out null results
    return convertedDocs.filter((draft): draft is CanonicalDocumentDraft => draft !== null);
  }

  /**
   * Convert scraped sources to BronWebsiteCreateInput
   */
  convertToWebsiteCreateInput(
    sources: ScrapedSource[],
    queryId: ObjectId
  ): BronWebsiteCreateInput[] {
    // Iteration 145: Filter valid sources
    const validSources = sources.filter(source => {
      // Iteration 146: Validate required fields
      return source.titel && source.url && source.samenvatting;
    });

    // Iteration 147: Map with enhanced validation
    return validSources.map(source => {
      try {
        return {
          titel: source.titel.trim(),
          url: source.url.trim(),
          label: 'Nieuw gevonden bron',
          samenvatting: source.samenvatting.trim(),
          'relevantie voor zoekopdracht': 'Automatisch gevonden tijdens scan',
          accepted: null as boolean | null | undefined, // Requires admin approval
          website_types: source.website_types || [],
          subjects: source.subjects || [],
          themes: source.themes || [],
          queryId: queryId.toString()
        } as BronWebsiteCreateInput;
      } catch (error) {
        // Iteration 148: Error handling in source conversion
        logger.warn({ error, url: source.url }, 'Failed to convert source');
        return null;
      }
    }).filter((source): source is BronWebsiteCreateInput => {
      return source !== null && typeof source === 'object' && 'titel' in source && 'url' in source;
    });
  }

  /**
   * Re-rank documents using Knowledge Graph insights
   * Uses KG entities and relationships to improve document scores
   */
  async rerankWithKG(
    documents: ScrapedDocument[],
    query: string
  ): Promise<ScrapedDocument[]> {
    try {
      const kgService = this.graphManager.getKnowledgeGraphService();
      if (!kgService) {
        logger.debug('[DocumentProcessor] KG service not available for re-ranking');
        return documents;
      }

      // Re-rank documents based on KG insights
      const rerankedDocuments = await Promise.all(
        documents.map(async (doc) => {
          try {
            // Get entity for this document from KG
            const entity = await kgService.getNode(doc.url);

            if (!entity) {
              // No entity found, keep original score
              return doc;
            }

            // Calculate KG-based boost based on entity properties
            let kgBoost = 0;

            // Boost based on entity type importance
            const typeWeights: Record<string, number> = {
              'PolicyDocument': 0.3,
              'Regulation': 0.4,
              'SpatialUnit': 0.2,
              'LandUse': 0.2,
              'Requirement': 0.3,
            };
            kgBoost += typeWeights[entity.type] || 0.1;

            // Boost based on entity relationships (more connections = more important)
            try {
              const neighbors = await kgService.getNeighbors(entity.id);
              const incomingNeighbors = await kgService.getIncomingNeighbors(entity.id);
              const connectionCount = neighbors.length + incomingNeighbors.length;
              // Normalize: 0-10 connections = 0-0.2 boost
              kgBoost += Math.min(connectionCount / 10, 0.2);
            } catch (err) {
              // Skip relationship boost if it fails
              logger.debug({ error: err, entityId: entity.id }, '[DocumentProcessor] Failed to get neighbors for re-ranking');
            }

            // Boost based on entity metadata (e.g., relevance score if available)
            if (entity.metadata?.relevanceScore) {
              const relevanceScore = typeof entity.metadata.relevanceScore === 'number'
                ? entity.metadata.relevanceScore
                : 0;
              kgBoost += relevanceScore * 0.1; // Scale relevance score
            }

            // Apply KG boost to document relevance score
            // Combine original score (70%) with KG boost (30%)
            const originalScore = doc.relevanceScore || 0;
            const newScore = originalScore * 0.7 + kgBoost * 0.3;

            return {
              ...doc,
              relevanceScore: Math.min(newScore, 1.0), // Cap at 1.0
              ...(('metadata' in doc && doc.metadata) ? {
                metadata: {
                  ...(doc.metadata as Record<string, unknown>),
                  kgBoost,
                  kgReranked: true,
                  entityType: entity.type,
                }
              } : {
                metadata: {
                  kgBoost,
                  kgReranked: true,
                  entityType: entity.type,
                }
              }),
            };
          } catch (error) {
            // If KG lookup fails, keep original document
            logger.debug({ error, url: doc.url }, '[DocumentProcessor] Failed to get KG entity for re-ranking');
            return doc;
          }
        })
      );

      // Sort by new relevance score (highest first)
      rerankedDocuments.sort((a: ScrapedDocument, b: ScrapedDocument) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      logger.debug({
        query,
        documentsReranked: rerankedDocuments.length,
        avgBoost: rerankedDocuments.reduce((sum: number, d: ScrapedDocument) => sum + (('metadata' in d && d.metadata && typeof d.metadata === 'object' && 'kgBoost' in d.metadata) ? (d.metadata as { kgBoost?: number }).kgBoost || 0 : 0), 0) / rerankedDocuments.length
      }, '[DocumentProcessor] KG re-ranking completed');

      return rerankedDocuments;
    } catch (error) {
      logger.error({ error }, '[DocumentProcessor] KG re-ranking failed');
      // Return original documents if re-ranking fails
      return documents;
    }
  }

  /**
   * Discover new sources from scraped documents
   */
  discoverNewSources(
    documents: ScrapedDocument[],
    existingWebsites: Array<{ url: string }>
  ): ScrapedSource[] {
    // Iteration 119: Source map with domain normalization
    const sources = new Map<string, ScrapedSource>();
    // Iteration 120: Enhanced existing URL set with normalization
    const existingUrls = new Set(existingWebsites.map(w => {
      try {
        return this.extractDomain(w.url);
      } catch {
        return w.url;
      }
    }));

    // Iteration 121: Document processing with validation
    for (const doc of documents) {
      if (!doc.website_url) {
        // Iteration 122: Skip documents without website URL
        continue;
      }

      const domain = this.extractDomain(doc.website_url);

      // Iteration 123: Skip if already exists with case-insensitive check
      if (existingUrls.has(domain.toLowerCase())) continue;

      // Iteration 124: Enhanced source aggregation
      if (sources.has(domain)) {
        const source = sources.get(domain)!;
        // Iteration 125: Truncate long titles in aggregation
        const titleSnippet = doc.titel.length > 50 ? doc.titel.substring(0, 50) + '...' : doc.titel;
        source.samenvatting += ` Ook: ${titleSnippet}`;
        // Iteration 126: Limit aggregation length
        if (source.samenvatting.length > 500) {
          source.samenvatting = source.samenvatting.substring(0, 497) + '...';
        }
        continue;
      }

      // Iteration 127: Enhanced source creation with validation
      const sourceTitle = doc.website_titel || domain;
      const titleSnippet = doc.titel.length > 50 ? doc.titel.substring(0, 50) + '...' : doc.titel;

      sources.set(domain, {
        titel: sourceTitle,
        url: domain,
        samenvatting: `Gevonden via zoekresultaten. Relevant document: "${titleSnippet}". Kan mogelijk meer documenten over dit onderwerp bevatten.`,
        website_types: ['kennisinstituut'], // Default to kennisinstituut
        subjects: [],
        themes: []
      });
    }

    // Iteration 128: Source validation before return
    const validSources = Array.from(sources.values()).filter(source => {
      // Iteration 129: Validate source has required fields
      return source.url && source.titel && source.samenvatting;
    });

    return validSources;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    if (!url || url.trim().length === 0) {
      // Iteration 131: Empty URL handling
      return '';
    }

    try {
      // Iteration 132: URL normalization
      let normalizedUrl = url.trim();
      // Iteration 133: Add protocol if missing
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      const urlObj = new URL(normalizedUrl);
      // Iteration 134: Return normalized domain
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      // Iteration 135: Fallback to original URL
      return url;
    }
  }

}
