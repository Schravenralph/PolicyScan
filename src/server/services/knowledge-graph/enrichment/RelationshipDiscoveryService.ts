/**
 * Relationship Discovery Service
 * 
 * Discovers relationships between entities using various methods:
 * - Web search for entity pairs
 * - Document co-occurrence analysis
 * - Citation analysis
 * - Semantic similarity
 * - Graph pattern analysis
 */

import type { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { GoogleSearchService } from '../../external/googleSearch.js';
import { FactValidator } from '../validators/FactValidator.js';
import { RuleBasedRelationshipDiscovery } from './RuleBasedRelationshipDiscovery.js';
import { logger } from '../../../utils/logger.js';

export interface RelationshipDiscoveryOptions {
  maxRelationships?: number;
  minConfidence?: number;
  methods?: ('web_search' | 'co_occurrence' | 'citation' | 'semantic' | 'graph_pattern' | 'rule_based')[];
}

export interface DiscoveredRelationship {
  relationship: Relation;
  confidence: number; // 0-1
  discoveryMethod: string;
  evidence: string[];
}

export class RelationshipDiscoveryService {
  private googleSearch: GoogleSearchService;
  private kgService: KnowledgeGraphServiceInterface;
  private factValidator: FactValidator;
  private ruleBasedDiscovery: RuleBasedRelationshipDiscovery;

  constructor(kgService: KnowledgeGraphServiceInterface) {
    this.kgService = kgService;
    this.googleSearch = new GoogleSearchService();
    this.ruleBasedDiscovery = new RuleBasedRelationshipDiscovery();
    this.factValidator = new FactValidator(
      undefined, // documentService
      async (id: string) => {
        const rels = await this.kgService.getRelationshipsForEntity?.(id) || [];
        return rels.map((r: { sourceId: string; targetId: string; type: RelationType }) => ({ sourceId: r.sourceId, targetId: r.targetId, type: r.type }));
      }
    );
  }

  /**
   * Discover relationships between entities
   */
  async discoverRelationships(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity,
    options: RelationshipDiscoveryOptions = {}
  ): Promise<DiscoveredRelationship[]> {
    const {
      maxRelationships = 10,
      minConfidence = 0.6,
      methods = ['rule_based', 'co_occurrence', 'graph_pattern'],
    } = options;

    logger.info(
      { sourceId: sourceEntity.id, targetId: targetEntity.id, methods },
      'Discovering relationships between entities'
    );

    const discovered: DiscoveredRelationship[] = [];

    // 1. Rule-based discovery (new, high priority)
    if (methods.includes('rule_based')) {
      const ruleBasedRels = await this.discoverViaRuleBased(sourceEntity, targetEntity, minConfidence);
      discovered.push(...ruleBasedRels);
    }

    // 2. Web search for entity pairs
    if (methods.includes('web_search')) {
      const webSearchRels = await this.discoverViaWebSearch(sourceEntity, targetEntity);
      discovered.push(...webSearchRels);
    }

    // 3. Co-occurrence analysis
    if (methods.includes('co_occurrence')) {
      const coOccurrenceRels = await this.discoverViaCoOccurrence(sourceEntity, targetEntity);
      discovered.push(...coOccurrenceRels);
    }

    // 4. Citation analysis
    if (methods.includes('citation')) {
      const citationRels = await this.discoverViaCitations(sourceEntity, targetEntity);
      discovered.push(...citationRels);
    }

    // 5. Graph pattern analysis
    if (methods.includes('graph_pattern')) {
      const patternRels = await this.discoverViaGraphPatterns(sourceEntity, targetEntity);
      discovered.push(...patternRels);
    }

    // Filter by confidence and remove duplicates
    const filtered = discovered
      .filter(rel => rel.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxRelationships);

    // Remove duplicates (same source, target, type)
    const unique = this.deduplicateRelationships(filtered);

    logger.info({ count: unique.length }, 'Relationship discovery completed');
    return unique;
  }

  /**
   * Discover relationships via rule-based methods
   */
  private async discoverViaRuleBased(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity,
    minConfidence: number
  ): Promise<DiscoveredRelationship[]> {
    try {
      const ruleBasedResults = await this.ruleBasedDiscovery.discoverRelationships(
        sourceEntity,
        targetEntity,
        { minConfidence }
      );

      return ruleBasedResults.map(rel => ({
        relationship: rel.relationship,
        confidence: rel.confidence,
        discoveryMethod: rel.discoveryMethod,
        evidence: rel.evidence,
      }));
    } catch (error) {
      logger.debug({ error }, 'Rule-based relationship discovery failed');
      return [];
    }
  }

  /**
   * Discover relationships via web search
   */
  private async discoverViaWebSearch(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<DiscoveredRelationship[]> {
    if (!this.googleSearch.isConfigured()) {
      return [];
    }

    const relationships: DiscoveredRelationship[] = [];

    try {
      // Search for co-occurrence
      const query = `"${sourceEntity.name}" "${targetEntity.name}" site:overheid.nl`;
      const results = await this.googleSearch.search(query, {
        numResults: 5,
      });

      if (results.length > 0) {
        // Infer relationship type based on entity types
        const relationType = this.inferRelationshipType(sourceEntity, targetEntity);

        const relationship: Relation = {
          sourceId: sourceEntity.id,
          targetId: targetEntity.id,
          type: relationType,
          metadata: {
            source: results[0].url,
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'web_search',
            evidenceCount: results.length,
          },
        };

        // Validate relationship
        const validation = await this.factValidator.validateFact(relationship);
        const confidence = validation.confidence * 0.8 + (results.length / 10) * 0.2; // Boost for multiple results

        relationships.push({
          relationship,
          confidence: Math.min(1.0, confidence),
          discoveryMethod: 'web_search',
          evidence: results.map(r => r.url || '').filter(Boolean),
        });
      }
    } catch (error) {
      logger.debug({ error }, 'Web search relationship discovery failed');
    }

    return relationships;
  }

  /**
   * Discover relationships via co-occurrence in documents
   */
  private async discoverViaCoOccurrence(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];

    // Check if entities share metadata sources
    const sourceSource = sourceEntity.metadata?.source as string | undefined;
    const targetSource = targetEntity.metadata?.source as string | undefined;

    if (sourceSource && targetSource && sourceSource === targetSource) {
      // Entities from same document - likely related
      const relationType = this.inferRelationshipType(sourceEntity, targetEntity);

      const relationship: Relation = {
        sourceId: sourceEntity.id,
        targetId: targetEntity.id,
        type: relationType,
        metadata: {
          source: sourceSource,
          discoveredAt: new Date().toISOString(),
          discoveryMethod: 'co_occurrence',
        },
      };

      relationships.push({
        relationship,
        confidence: 0.7, // Medium confidence for co-occurrence
        discoveryMethod: 'co_occurrence',
        evidence: [sourceSource],
      });
    }

    return relationships;
  }

  /**
   * Discover relationships via citation analysis
   */
  private async discoverViaCitations(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];

    // Check if source entity cites target entity
    const sourceUrl = (sourceEntity as any).url || sourceEntity.metadata?.source as string | undefined;
    const targetUrl = (targetEntity as any).url || targetEntity.metadata?.source as string | undefined;

    if (sourceUrl && targetUrl && sourceUrl !== targetUrl) {
      // In a real implementation, would check if sourceUrl contains citation to targetUrl
      // For now, use a simplified check
      if (this.googleSearch.isConfigured()) {
        try {
          const query = `"${sourceEntity.name}" citeert "${targetEntity.name}"`;
          const results = await this.googleSearch.search(query, {
            numResults: 3,
          });

          if (results.length > 0) {
            const relationship: Relation = {
              sourceId: sourceEntity.id,
              targetId: targetEntity.id,
              type: 'REFINES' as RelationType,
              metadata: {
                source: results[0].url,
                discoveredAt: new Date().toISOString(),
                discoveryMethod: 'citation',
              },
            };

            relationships.push({
              relationship,
              confidence: 0.8, // High confidence for citations
              discoveryMethod: 'citation',
              evidence: results.map(r => r.url || '').filter(Boolean),
            });
          }
        } catch (error) {
          logger.debug({ error }, 'Citation analysis failed');
        }
      }
    }

    return relationships;
  }

  /**
   * Discover relationships via graph patterns
   */
  private async discoverViaGraphPatterns(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<DiscoveredRelationship[]> {
    const relationships: DiscoveredRelationship[] = [];

    try {
      // Get existing relationships for both entities
      const sourceRels = await this.kgService.getRelationshipsForEntity?.(sourceEntity.id) || [];
      const targetRels = await this.kgService.getRelationshipsForEntity?.(targetEntity.id) || [];

      // Find common neighbors (entities connected to both)
      const sourceNeighbors = new Set(sourceRels.map((r: { sourceId: string; targetId: string; type: RelationType }) => r.targetId));
      const targetNeighbors = new Set(targetRels.map((r: { sourceId: string; targetId: string; type: RelationType }) => r.targetId));

      const commonNeighbors = Array.from(sourceNeighbors).filter(id => targetNeighbors.has(id));

      if (commonNeighbors.length > 0) {
        // Entities share neighbors - likely related
        const relationType = this.inferRelationshipType(sourceEntity, targetEntity);

        const relationship: Relation = {
          sourceId: sourceEntity.id,
          targetId: targetEntity.id,
          type: relationType,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'graph_pattern',
            commonNeighbors: commonNeighbors.length,
          },
        };

        // Confidence based on number of common neighbors
        const confidence = Math.min(0.9, 0.5 + commonNeighbors.length * 0.1);

        relationships.push({
          relationship,
          confidence,
          discoveryMethod: 'graph_pattern',
          evidence: [`${commonNeighbors.length} common neighbors`],
        });
      }
    } catch (error) {
      logger.debug({ error }, 'Graph pattern analysis failed');
    }

    return relationships;
  }

  /**
   * Infer relationship type based on entity types
   */
  private inferRelationshipType(sourceEntity: BaseEntity, targetEntity: BaseEntity): RelationType {
    // PolicyDocument -> PolicyDocument: REFINES or OVERRIDES
    if (sourceEntity.type === 'PolicyDocument' && targetEntity.type === 'PolicyDocument') {
      return 'REFINES' as RelationType;
    }

    // Regulation -> PolicyDocument: DEFINED_IN
    if (sourceEntity.type === 'Regulation' && targetEntity.type === 'PolicyDocument') {
      return 'DEFINED_IN' as RelationType;
    }

    // Regulation -> SpatialUnit: APPLIES_TO
    if (sourceEntity.type === 'Regulation' && targetEntity.type === 'SpatialUnit') {
      return 'APPLIES_TO' as RelationType;
    }

    // Default: RELATED_TO
    return 'RELATED_TO' as RelationType;
  }

  /**
   * Remove duplicate relationships
   */
  private deduplicateRelationships(
    relationships: DiscoveredRelationship[]
  ): DiscoveredRelationship[] {
    const seen = new Set<string>();
    const unique: DiscoveredRelationship[] = [];

    for (const rel of relationships) {
      const key = `${rel.relationship.sourceId}-${rel.relationship.targetId}-${rel.relationship.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(rel);
      }
    }

    return unique;
  }
}
