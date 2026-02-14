/**
 * Interface for Knowledge Graph Traversal and Fusion operations
 * Defines the contract for graph traversal, path finding, and knowledge fusion operations
 */

import type { BaseEntity } from '../../../../domain/ontology.js';
import type { TraversalOptions, TraversalResult, PathResult, SubgraphResult } from '../../../graphrag/GraphTraversalService.js';
import type { KnowledgeFusionService } from '../../fusion/KnowledgeFusionService.js';
import type { TruthDiscoveryService } from '../../fusion/TruthDiscoveryService.js';

/**
 * Dependencies required by Traversal operations
 */
export interface KnowledgeGraphTraversalDependencies {
  getTraversalService: () => { 
    traverse: (startNodeId: string, options: Partial<TraversalOptions>) => Promise<TraversalResult>;
    findPath: (startNodeId: string, endNodeId: string, options: Partial<TraversalOptions>) => Promise<PathResult | null>;
    extractSubgraph: (centerNodeId: string, radius: number, options: Partial<Omit<TraversalOptions, 'maxDepth'>>) => Promise<SubgraphResult>;
  } | null;
  fusionService: {
    fuseEntities: (
      primaryEntity: BaseEntity,
      sourceEntities: BaseEntity[],
      options: { strategy?: string; preserveProvenance?: boolean; updateTimestamps?: boolean }
    ) => Promise<{
      fusedEntity: BaseEntity;
      mergedFrom: string[];
      conflictsResolved: number;
      propertiesMerged: number;
      sourcesMerged: number;
    }>;
    incrementalUpdate: (
      existingEntity: BaseEntity,
      newFacts: Partial<BaseEntity>,
      sourceUrl?: string
    ) => Promise<{
      fusedEntity: BaseEntity;
    }>;
  };
  getTruthDiscoveryService: () => {
    detectConflicts: (entity: BaseEntity, allEntities: BaseEntity[]) => Promise<{ conflicts: unknown[] }>;
    resolveConflicts: (conflicts: unknown[], strategy: string) => Promise<Array<{ resolution: { requiresReview: boolean } }>>;
  } | null;
  getNodesByType: (type: string) => Promise<BaseEntity[]>;
  getNode: (id: string) => Promise<BaseEntity | undefined>;
  addNode: (entity: BaseEntity) => Promise<void>;
}

/**
 * Interface for Knowledge Graph Traversal operations
 */
export interface KnowledgeGraphTraversalOperations {
  /**
   * Perform graph traversal from a starting node
   * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
   */
  traverseGraph(
    startNodeId: string,
    options?: Partial<TraversalOptions>
  ): Promise<TraversalResult>;

  /**
   * Find a path between two nodes
   * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
   */
  findPath(
    startNodeId: string,
    endNodeId: string,
    options?: Partial<TraversalOptions>
  ): Promise<PathResult | null>;

  /**
   * Extract a subgraph around a node
   * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
   */
  extractSubgraph(
    centerNodeId: string,
    radius?: number,
    options?: Partial<Omit<TraversalOptions, 'maxDepth'>>
  ): Promise<SubgraphResult>;

  /**
   * Fuse entities from multiple sources into a canonical entity
   * Only works if KG_FUSION_ENABLED feature flag is enabled
   */
  fuseEntities(
    primaryEntity: BaseEntity,
    sourceEntities: BaseEntity[],
    options?: { strategy?: 'merge_all' | 'keep_primary' | 'keep_most_recent' | 'resolve_conflicts' }
  ): Promise<{
    fusedEntity: BaseEntity;
    mergedFrom: string[];
    conflictsResolved: number;
    propertiesMerged: number;
    sourcesMerged: number;
  }>;

  /**
   * Incrementally update an entity with new facts from a source
   * Uses knowledge fusion to merge new information
   */
  incrementalUpdate(
    entityId: string,
    newFacts: Partial<BaseEntity>,
    sourceUrl?: string
  ): Promise<BaseEntity>;

  /**
   * Run truth discovery for an entity
   */
  runTruthDiscovery(entity: BaseEntity): Promise<void>;
}

