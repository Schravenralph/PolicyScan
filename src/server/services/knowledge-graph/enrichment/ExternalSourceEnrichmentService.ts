/**
 * External Source Enrichment Service
 * 
 * Discovers entities and relationships from external sources (web searches, APIs)
 * and validates them before adding to the knowledge graph.
 */

import type { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { GoogleSearchService } from '../../external/googleSearch.js';
import { DocumentDiscoveryService } from '../../document-discovery/DocumentDiscoveryService.js';
import { RechtspraakService } from '../../external/RechtspraakService.js';
import { FactValidator } from '../validators/FactValidator.js';
import { ReliabilityScorer, type SourceInfo } from '../fusion/ReliabilityScorer.js';
import { logger } from '../../../utils/logger.js';

export interface EnrichmentResult {
  entities: BaseEntity[];
  relationships: Relation[];
  sources: string[];
  qualityScore: number; // 0-1
  metadata: {
    enrichmentMethod: string;
    searchQueries: string[];
    documentsFound: number;
    entitiesExtracted: number;
    relationshipsExtracted: number;
  };
}

export interface EnrichmentOptions {
  maxEntities?: number;
  maxRelationships?: number;
  minQualityScore?: number;
  searchDepth?: number; // How many search iterations
  includeUnofficialSources?: boolean;
}

export class ExternalSourceEnrichmentService {
  private googleSearch: GoogleSearchService;
  private documentDiscovery: DocumentDiscoveryService;
  private rechtspraakService: RechtspraakService;
  private factValidator: FactValidator;
  private reliabilityScorer: ReliabilityScorer;
  private kgService: KnowledgeGraphServiceInterface;

  constructor(kgService: KnowledgeGraphServiceInterface) {
    this.kgService = kgService;
    this.googleSearch = new GoogleSearchService();
    this.documentDiscovery = new DocumentDiscoveryService();
    this.rechtspraakService = new RechtspraakService();
    this.factValidator = new FactValidator(
      undefined, // documentService
      async (id: string) => {
        const rels = await this.kgService.getRelationshipsForEntity?.(id) || [];
        return rels.map((r: { sourceId: string; targetId: string; type: RelationType }) => ({ sourceId: r.sourceId, targetId: r.targetId, type: r.type }));
      }
    );
    this.reliabilityScorer = new ReliabilityScorer();
  }

  /**
   * Discover entities related to a topic or entity
   */
  async discoverEntities(
    query: string,
    options: EnrichmentOptions = {}
  ): Promise<EnrichmentResult> {
    const {
      maxEntities = 50,
      maxRelationships = 100,
      minQualityScore = 0.6,
      searchDepth = 1,
      includeUnofficialSources = false,
    } = options;

    logger.info({ query, options }, 'Starting entity discovery from external sources');

    const searchQueries: string[] = [];
    const discoveredEntities: BaseEntity[] = [];
    const discoveredRelationships: Relation[] = [];
    const sources: string[] = [];

    // 1. Search for policy documents
    const policyDocs = await this.searchPolicyDocuments(query, includeUnofficialSources);
    searchQueries.push(`policy documents: ${query}`);
    sources.push(...policyDocs.map(doc => doc.url || '').filter(Boolean));

    // 2. Search for regulations
    const regulations = await this.searchRegulations(query, includeUnofficialSources);
    searchQueries.push(`regulations: ${query}`);
    sources.push(...regulations.map(doc => doc.url || '').filter(Boolean));

    // 3. Extract entities from discovered documents
    // Note: This would typically use PolicyParser or EntityExtractionService
    // For now, we'll create a simplified version
    for (const doc of [...policyDocs, ...regulations].slice(0, maxEntities)) {
      try {
        // Extract entities from document (simplified - would use actual extraction service)
        const entities = await this.extractEntitiesFromDocument(doc);
        discoveredEntities.push(...entities);
      } catch (error) {
        logger.debug({ error, url: doc.url }, 'Failed to extract entities from document');
      }
    }

    // 4. Validate and filter entities
    const validatedEntities = await this.validateEntities(discoveredEntities, minQualityScore);

    // 5. Discover relationships between entities
    const relationships = await this.discoverRelationships(validatedEntities, maxRelationships);

    // 6. Calculate quality score
    const qualityScore = this.calculateEnrichmentQuality(validatedEntities, relationships, sources);

    return {
      entities: validatedEntities.slice(0, maxEntities),
      relationships: relationships.slice(0, maxRelationships),
      sources: [...new Set(sources)],
      qualityScore,
      metadata: {
        enrichmentMethod: 'external_source_search',
        searchQueries,
        documentsFound: policyDocs.length + regulations.length,
        entitiesExtracted: validatedEntities.length,
        relationshipsExtracted: relationships.length,
      },
    };
  }

  /**
   * Discover relationships between existing entities
   */
  async discoverRelationshipsForEntities(
    entityIds: string[],
    options: EnrichmentOptions = {}
  ): Promise<Relation[]> {
    const { maxRelationships = 50, minQualityScore = 0.6 } = options;

    logger.info({ entityCount: entityIds.length }, 'Discovering relationships for entities');

    const relationships: Relation[] = [];

    // Get entities from KG
    const entities = await Promise.all(
      entityIds.map(id => this.kgService.getNode(id))
    );
    const validEntities = entities.filter((e): e is BaseEntity => e !== undefined);

    // Search for relationships between entity pairs
    for (let i = 0; i < validEntities.length && relationships.length < maxRelationships; i++) {
      for (let j = i + 1; j < validEntities.length && relationships.length < maxRelationships; j++) {
        const sourceEntity = validEntities[i];
        const targetEntity = validEntities[j];

        // Search for co-occurrence or citations
        const foundRelationships = await this.searchEntityRelationships(
          sourceEntity,
          targetEntity
        );

        // Validate relationships
        for (const rel of foundRelationships) {
          const validation = await this.factValidator.validateFact(rel);
          if (validation.confidence >= minQualityScore) {
            relationships.push(rel);
          }
        }
      }
    }

    return relationships.slice(0, maxRelationships);
  }

  /**
   * Search for policy documents
   */
  private async searchPolicyDocuments(
    query: string,
    includeUnofficial: boolean
  ): Promise<Array<{ url: string; title: string; snippet?: string }>> {
    const documents: Array<{ url: string; title: string; snippet?: string }> = [];

    try {
      // Use DocumentDiscoveryService for deep research
      const discoveredDocs = await this.documentDiscovery.discoverDocuments({
        onderwerp: query,
        websiteTypes: includeUnofficial ? [] : ['municipality', 'province', 'national'],
      });

      documents.push(...discoveredDocs.map(doc => ({
        url: doc.url,
        title: doc.titel || '',
        snippet: doc.samenvatting,
      })));
    } catch (error) {
      logger.warn({ error, query }, 'Document discovery failed, falling back to Google Search');
    }

    // Fallback to Google Search
    if (this.googleSearch.isConfigured() && documents.length === 0) {
      try {
        const searchQuery = `"${query}" site:overheid.nl OR site:gemeente.nl OR site:provincie.nl`;
        const results = await this.googleSearch.search(searchQuery, {
          numResults: 10,
        });

        documents.push(...results.map(result => ({
          url: result.url || '',
          title: result.titel || '',
          snippet: result.samenvatting,
        })));
      } catch (error) {
        logger.error({ error, query }, 'Google Search failed');
      }
    }

    return documents;
  }

  /**
   * Search for regulations
   */
  private async searchRegulations(
    query: string,
    includeUnofficial: boolean
  ): Promise<Array<{ url: string; title: string; snippet?: string }>> {
    const documents: Array<{ url: string; title: string; snippet?: string }> = [];

    // Use RechtspraakService for legal documents
    if (this.rechtspraakService.isConfigured()) {
      try {
        const legalDocs = await this.rechtspraakService.searchJurisprudence({
          query,
          maxResults: 10,
        });

        documents.push(...legalDocs.map(doc => ({
          url: doc.url,
          title: doc.title || '',
          snippet: doc.summary,
        })));
      } catch (error) {
        logger.debug({ error, query }, 'Rechtspraak search failed');
      }
    }

    // Also search for regulations on government sites
    if (this.googleSearch.isConfigured()) {
      try {
        const searchQuery = `"${query}" +regelgeving +beleid site:overheid.nl`;
        const results = await this.googleSearch.search(searchQuery, {
          numResults: 10,
        });

        documents.push(...results.map(result => ({
          url: result.url || '',
          title: result.titel || '',
          snippet: result.samenvatting,
        })));
      } catch (error) {
        logger.debug({ error, query }, 'Regulation search failed');
      }
    }

    return documents;
  }

  /**
   * Extract entities from a document
   * Note: This is a simplified version - would use PolicyParser in production
   */
  private async extractEntitiesFromDocument(
    doc: { url: string; title: string; snippet?: string }
  ): Promise<BaseEntity[]> {
    // Simplified entity extraction - in production would use PolicyParser
    const entities: BaseEntity[] = [];

    // Extract basic entity from title
    if (doc.title) {
      entities.push({
        id: `extracted-${doc.url.replace(/[^a-zA-Z0-9]/g, '-')}`,
        type: 'PolicyDocument',
        name: doc.title,
        metadata: {
          source: doc.url,
          extractedAt: new Date().toISOString(),
        },
      });
    }

    return entities;
  }

  /**
   * Validate entities and filter by quality
   */
  private async validateEntities(
    entities: BaseEntity[],
    minQualityScore: number
  ): Promise<BaseEntity[]> {
    const validated: BaseEntity[] = [];

    for (const entity of entities) {
      // Check if entity already exists in KG
      const existing = await this.kgService.getNode(entity.id);
      if (existing) {
        continue; // Skip duplicates
      }

      // Calculate quality score
      const sourceInfo: SourceInfo = {
        url: entity.metadata?.source as string | undefined,
        entityId: entity.id,
        entityType: entity.type,
        sourceType: this.inferSourceType(entity.metadata?.source as string | undefined),
      };

      const reliabilityScore = this.reliabilityScorer.calculateScore(sourceInfo, entity, [sourceInfo]);

      if (reliabilityScore.overall >= minQualityScore) {
        validated.push(entity);
      }
    }

    return validated;
  }

  /**
   * Discover relationships between entities
   */
  private async discoverRelationships(
    entities: BaseEntity[],
    maxRelationships: number
  ): Promise<Relation[]> {
    const relationships: Relation[] = [];

    // Simple co-occurrence based relationship discovery
    // In production, would use more sophisticated methods
    for (let i = 0; i < entities.length && relationships.length < maxRelationships; i++) {
      for (let j = i + 1; j < entities.length && relationships.length < maxRelationships; j++) {
        const sourceEntity = entities[i];
        const targetEntity = entities[j];

        // Check if they share a source
        if (sourceEntity.metadata?.source === targetEntity.metadata?.source) {
          relationships.push({
            sourceId: sourceEntity.id,
            targetId: targetEntity.id,
            type: 'RELATED_TO' as any,
            metadata: {
              source: sourceEntity.metadata?.source,
              discoveredAt: new Date().toISOString(),
            },
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Search for relationships between two entities
   */
  private async searchEntityRelationships(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<Relation[]> {
    const relationships: Relation[] = [];

    if (!this.googleSearch.isConfigured()) {
      return relationships;
    }

    try {
      // Search for co-occurrence
      const query = `"${sourceEntity.name}" "${targetEntity.name}" site:overheid.nl`;
      const results = await this.googleSearch.search(query, {
        numResults: 5,
      });

      if (results.length > 0) {
        // Found co-occurrence - create relationship
        relationships.push({
          sourceId: sourceEntity.id,
          targetId: targetEntity.id,
          type: 'RELATED_TO' as any,
          metadata: {
            source: results[0].url,
            discoveredAt: new Date().toISOString(),
            evidence: results.length,
          },
        });
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to search entity relationships');
    }

    return relationships;
  }

  /**
   * Calculate enrichment quality score
   */
  private calculateEnrichmentQuality(
    entities: BaseEntity[],
    relationships: Relation[],
    sources: string[]
  ): number {
    if (entities.length === 0) return 0;

    // Calculate average source authority
    let totalAuthority = 0;
    for (const entity of entities) {
      const sourceInfo: SourceInfo = {
        url: entity.metadata?.source as string | undefined,
        entityId: entity.id,
        entityType: entity.type,
        sourceType: this.inferSourceType(entity.metadata?.source as string | undefined),
      };
      const score = this.reliabilityScorer.calculateScore(sourceInfo, entity, [sourceInfo]);
      totalAuthority += score.authority;
    }

    const avgAuthority = totalAuthority / entities.length;

    // Factor in relationship count and source diversity
    const relationshipRatio = Math.min(1, relationships.length / entities.length);
    const sourceDiversity = Math.min(1, new Set(sources).size / 10);

    return (avgAuthority * 0.5 + relationshipRatio * 0.3 + sourceDiversity * 0.2);
  }

  /**
   * Infer source type from URL
   */
  private inferSourceType(url?: string): 'official' | 'unofficial' | 'unknown' {
    if (!url) return 'unknown';

    const officialPatterns = [
      /\.(nl|be|eu)$/i,
      /overheid\.nl/i,
      /gemeente\./i,
      /provincie\./i,
      /rijksoverheid\.nl/i,
      /waterschap/i,
    ];

    return officialPatterns.some(pattern => pattern.test(url)) ? 'official' : 'unofficial';
  }
}
