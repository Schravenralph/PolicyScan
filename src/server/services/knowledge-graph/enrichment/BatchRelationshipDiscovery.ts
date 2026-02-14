/**
 * Batch Relationship Discovery Service
 * 
 * Discovers relationships between entities in batches using:
 * - Rule-based discovery
 * - Existing RelationshipDiscoveryService methods
 * - Validation
 * - Confidence scoring and ranking
 */

import type {
  BaseEntity,
  Relation,
  RelationType,
  EntityType,
} from '../../../domain/ontology.js';
import type { KnowledgeGraphServiceInterface } from '../core/KnowledgeGraphInterface.js';
import { RuleBasedRelationshipDiscovery, DiscoveredRelationship as RuleBasedDiscoveredRelationship } from './RuleBasedRelationshipDiscovery.js';
import { RelationshipDiscoveryService, DiscoveredRelationship } from './RelationshipDiscoveryService.js';
import { RelationshipValidator } from '../validators/RelationshipValidator.js';
import { logger } from '../../../utils/logger.js';

export interface BatchDiscoveryOptions {
  maxRelationships?: number;
  minConfidence?: number;
  batchSize?: number;
  enableParallelProcessing?: boolean;
  enableRuleBased?: boolean;
  enableWebSearch?: boolean;
  enableCoOccurrence?: boolean;
  enableCitation?: boolean;
  enableGraphPattern?: boolean;
  entityTypeFilter?: EntityType[];
  relationshipTypeFilter?: RelationType[];
  jurisdictionFilter?: string[];
}

export interface BatchDiscoveryResult {
  discovered: DiscoveredRelationship[];
  valid: Relation[];
  invalid: DiscoveredRelationship[];
  statistics: {
    totalPairs: number;
    pairsProcessed: number;
    relationshipsDiscovered: number;
    relationshipsValidated: number;
    relationshipsValid: number;
    relationshipsInvalid: number;
    processingTime: number;
  };
}

export class BatchRelationshipDiscovery {
  private ruleBasedDiscovery: RuleBasedRelationshipDiscovery;
  private relationshipDiscovery: RelationshipDiscoveryService;
  private relationshipValidator: RelationshipValidator;
  private kgService: KnowledgeGraphServiceInterface;

  constructor(kgService: KnowledgeGraphServiceInterface) {
    this.kgService = kgService;
    this.ruleBasedDiscovery = new RuleBasedRelationshipDiscovery();
    this.relationshipDiscovery = new RelationshipDiscoveryService(kgService);
    this.relationshipValidator = new RelationshipValidator();
  }

  /**
   * Discover relationships for a batch of entities
   */
  async discoverRelationships(
    entities: BaseEntity[],
    options: BatchDiscoveryOptions = {}
  ): Promise<BatchDiscoveryResult> {
    const startTime = Date.now();
    const {
      maxRelationships = 1000,
      minConfidence = 0.6,
      batchSize = 50,
      enableParallelProcessing = true,
      enableRuleBased = true,
      enableWebSearch = false,
      enableCoOccurrence = true,
      enableCitation = false,
      enableGraphPattern = true,
      entityTypeFilter,
      relationshipTypeFilter,
      jurisdictionFilter,
    } = options;

    logger.info({
      entityCount: entities.length,
      options,
    }, 'Starting batch relationship discovery');

    // Filter entities if needed
    let filteredEntities = entities;
    if (entityTypeFilter && entityTypeFilter.length > 0) {
      filteredEntities = entities.filter(e => entityTypeFilter.includes(e.type));
      logger.debug({
        originalCount: entities.length,
        filteredCount: filteredEntities.length,
        filter: entityTypeFilter,
      }, 'Filtered entities by type');
    }

    if (jurisdictionFilter && jurisdictionFilter.length > 0) {
      filteredEntities = filteredEntities.filter(e => {
        const jurisdiction = this.extractJurisdiction(e);
        return jurisdiction && jurisdictionFilter.some(j => this.jurisdictionsMatch(jurisdiction, j));
      });
      logger.debug({
        originalCount: entities.length,
        filteredCount: filteredEntities.length,
        filter: jurisdictionFilter,
      }, 'Filtered entities by jurisdiction');
    }

    // Generate candidate pairs
    const candidatePairs = this.generateCandidatePairs(filteredEntities);
    logger.info({
      candidatePairs: candidatePairs.length,
    }, 'Generated candidate pairs');

    // Process pairs in batches
    const allDiscovered: DiscoveredRelationship[] = [];
    let pairsProcessed = 0;

    for (let i = 0; i < candidatePairs.length; i += batchSize) {
      const batch = candidatePairs.slice(i, i + batchSize);
      
      if (enableParallelProcessing && batch.length > 1) {
        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(pair => this.discoverForPair(pair, options))
        );
        for (const result of batchResults) {
          allDiscovered.push(...result);
        }
        pairsProcessed += batch.length;
      } else {
        // Process sequentially
        for (const pair of batch) {
          const result = await this.discoverForPair(pair, options);
          allDiscovered.push(...result);
          pairsProcessed++;
        }
      }

      // Log progress
      if (pairsProcessed % 100 === 0) {
        logger.debug({
          pairsProcessed,
          totalPairs: candidatePairs.length,
          discovered: allDiscovered.length,
        }, 'Batch discovery progress');
      }
    }

    // Deduplicate relationships
    const uniqueDiscovered = this.deduplicateRelationships(allDiscovered);

    // Filter by confidence and relationship type
    let filteredDiscovered = uniqueDiscovered.filter(rel => rel.confidence >= minConfidence);

    if (relationshipTypeFilter && relationshipTypeFilter.length > 0) {
      filteredDiscovered = filteredDiscovered.filter(rel =>
        relationshipTypeFilter.includes(rel.relationship.type)
      );
    }

    // Sort by confidence and limit
    filteredDiscovered.sort((a, b) => b.confidence - a.confidence);
    filteredDiscovered = filteredDiscovered.slice(0, maxRelationships);

    // Validate relationships
    const { valid, invalid } = await this.validateRelationships(filteredDiscovered);

    const processingTime = Date.now() - startTime;

    logger.info({
      totalPairs: candidatePairs.length,
      pairsProcessed,
      discovered: uniqueDiscovered.length,
      valid: valid.length,
      invalid: invalid.length,
      processingTime,
    }, 'Batch relationship discovery completed');

    return {
      discovered: filteredDiscovered,
      valid,
      invalid,
      statistics: {
        totalPairs: candidatePairs.length,
        pairsProcessed,
        relationshipsDiscovered: uniqueDiscovered.length,
        relationshipsValidated: filteredDiscovered.length,
        relationshipsValid: valid.length,
        relationshipsInvalid: invalid.length,
        processingTime,
      },
    };
  }

  /**
   * Discover relationships for a single entity pair
   */
  private async discoverForPair(
    pair: [BaseEntity, BaseEntity],
    options: BatchDiscoveryOptions
  ): Promise<DiscoveredRelationship[]> {
    const [source, target] = pair;
    const discovered: DiscoveredRelationship[] = [];

    try {
      // Rule-based discovery
      if (options.enableRuleBased !== false) {
        const ruleBasedResults = await this.ruleBasedDiscovery.discoverRelationships(source, target, {
          minConfidence: options.minConfidence || 0.6,
        });
        discovered.push(...this.convertRuleBasedToDiscovered(ruleBasedResults));
      }

      // Existing discovery methods
      const discoveryMethods: Array<'web_search' | 'co_occurrence' | 'citation' | 'graph_pattern'> = [];
      if (options.enableWebSearch) discoveryMethods.push('web_search');
      if (options.enableCoOccurrence !== false) discoveryMethods.push('co_occurrence');
      if (options.enableCitation) discoveryMethods.push('citation');
      if (options.enableGraphPattern !== false) discoveryMethods.push('graph_pattern');

      if (discoveryMethods.length > 0) {
        const existingResults = await this.relationshipDiscovery.discoverRelationships(source, target, {
          methods: discoveryMethods,
          minConfidence: options.minConfidence || 0.6,
        });
        discovered.push(...existingResults);
      }
    } catch (error) {
      logger.debug({
        error: error instanceof Error ? error.message : String(error),
        sourceId: source.id,
        targetId: target.id,
      }, 'Error discovering relationships for pair');
    }

    return discovered;
  }

  /**
   * Generate candidate pairs from entities
   */
  private generateCandidatePairs(entities: BaseEntity[]): Array<[BaseEntity, BaseEntity]> {
    const pairs: Array<[BaseEntity, BaseEntity]> = [];

    // Generate all pairs (excluding self-pairs)
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        pairs.push([entities[i], entities[j]]);
        // Also check reverse direction for asymmetric relationships
        pairs.push([entities[j], entities[i]]);
      }
    }

    return pairs;
  }

  /**
   * Validate discovered relationships
   */
  private async validateRelationships(
    discovered: DiscoveredRelationship[]
  ): Promise<{ valid: Relation[]; invalid: DiscoveredRelationship[] }> {
    const valid: Relation[] = [];
    const invalid: DiscoveredRelationship[] = [];

    // Fetch entities in batch
    const entityIds = new Set<string>();
    for (const rel of discovered) {
      entityIds.add(rel.relationship.sourceId);
      entityIds.add(rel.relationship.targetId);
    }

    const entityMap = new Map<string, BaseEntity>();
    for (const id of entityIds) {
      try {
        const entity = await this.kgService.getNode(id);
        if (entity) {
          entityMap.set(id, entity);
        }
      } catch (error) {
        logger.debug({ error, entityId: id }, 'Failed to fetch entity for validation');
      }
    }

    // Validate each relationship
    for (const discoveredRel of discovered) {
      const source = entityMap.get(discoveredRel.relationship.sourceId);
      const target = entityMap.get(discoveredRel.relationship.targetId);

      if (!source || !target) {
        invalid.push(discoveredRel);
        continue;
      }

      const validation = await this.relationshipValidator.validate(
        discoveredRel.relationship,
        source,
        target
      );

      if (validation.isValid) {
        valid.push(discoveredRel.relationship);
      } else {
        invalid.push(discoveredRel);
      }
    }

    return { valid, invalid };
  }

  /**
   * Convert rule-based discovered relationships to standard format
   */
  private convertRuleBasedToDiscovered(
    ruleBased: RuleBasedDiscoveredRelationship[]
  ): DiscoveredRelationship[] {
    return ruleBased.map(rel => ({
      relationship: rel.relationship,
      confidence: rel.confidence,
      discoveryMethod: rel.discoveryMethod,
      evidence: rel.evidence,
    }));
  }

  /**
   * Deduplicate relationships
   */
  private deduplicateRelationships(
    relationships: DiscoveredRelationship[]
  ): DiscoveredRelationship[] {
    const seen = new Map<string, DiscoveredRelationship>();

    for (const rel of relationships) {
      const key = `${rel.relationship.sourceId}-${rel.relationship.targetId}-${rel.relationship.type}`;
      const existing = seen.get(key);

      if (!existing || rel.confidence > existing.confidence) {
        seen.set(key, rel);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Extract jurisdiction from entity
   */
  private extractJurisdiction(entity: BaseEntity): string | null {
    if (entity.type === 'PolicyDocument') {
      return (entity as any).jurisdiction || null;
    }
    return (entity.metadata?.jurisdiction as string) || null;
  }

  /**
   * Check if two jurisdictions match
   */
  private jurisdictionsMatch(jurisdiction1: string, jurisdiction2: string): boolean {
    const j1 = jurisdiction1.toLowerCase().trim();
    const j2 = jurisdiction2.toLowerCase().trim();

    if (j1 === j2) {
      return true;
    }

    if (j1.includes(j2) || j2.includes(j1)) {
      return true;
    }

    const normalize = (j: string) => j.replace(/^(gemeente|provincie|rijksoverheid)\s+/i, '').trim();
    const n1 = normalize(j1);
    const n2 = normalize(j2);

    return n1 === n2;
  }
}
