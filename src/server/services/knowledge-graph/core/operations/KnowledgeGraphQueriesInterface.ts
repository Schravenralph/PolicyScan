/**
 * Interface for Knowledge Graph Query operations
 * Defines the contract for query and retrieval operations
 */

import type { BaseEntity, EntityType, RelationType, Relation, Regulation } from '../../../../domain/ontology.js';
import type { Driver } from 'neo4j-driver';
import type { NeighborCounts } from '../KnowledgeGraphInterface.js';

/**
 * Dependencies required by Query operations
 */
export interface KnowledgeGraphQueriesDependencies {
  driver: Driver;
  neo4jNodeToEntity: (node: { properties: Record<string, unknown> }) => BaseEntity;
}

/**
 * Interface for Knowledge Graph Query operations
 */
export interface KnowledgeGraphQueriesOperations {
  /**
   * Search entities by keywords in name or description
   */
  searchEntities(keywords: string[]): Promise<BaseEntity[]>;

  /**
   * Get all neighbors of a node (outgoing edges)
   * Supports multi-hop traversals
   */
  getNeighbors(id: string, relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]>;

  /**
   * Get all neighbors of multiple nodes (outgoing edges) in a batch
   * Supports multi-hop traversals
   */
  getNeighborsBatch(ids: string[], relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]>;

  /**
   * Get all nodes that point to a specific node (incoming edges)
   * Supports multi-hop traversals
   */
  getIncomingNeighbors(id: string, relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]>;

  /**
   * Get relationships between multiple entities efficiently
   */
  getRelationshipsBetweenEntities(entityIds: string[]): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>;

  /**
   * Get all outgoing relationships for an entity
   */
  getRelationshipsForEntity(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>;

  /**
   * Get all incoming relationships for an entity
   */
  getIncomingRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>;

  /**
   * Get neighbor counts (outgoing and incoming) efficiently
   */
  getNeighborCounts(id: string): Promise<NeighborCounts>;

  /**
   * Get applicable regulations for a given spatial unit or land use
   */
  getApplicableRegulations(entityId: string): Promise<Regulation[]>;

  /**
   * Get the entire graph structure (for debugging/visualization)
   * WARNING: This can be slow for large graphs. Use with limit.
   */
  getGraphSnapshot(limit?: number): Promise<{ nodes: BaseEntity[]; edges: Relation[] }>;

  /**
   * Get graph statistics
   */
  getStats(): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }>;

  /**
   * Get entity type distribution (optimized for clustering)
   */
  getEntityTypeDistribution(): Promise<Record<string, number>>;

  /**
   * Get jurisdiction distribution (optimized for clustering)
   */
  getJurisdictionDistribution(): Promise<Record<string, { count: number; entityIds: string[] }>>;

  /**
   * Count edges between two entity types
   */
  countEdgesBetweenTypes(sourceType: EntityType, targetType: EntityType): Promise<number>;

  /**
   * Get entities grouped by type (for entity-type clustering)
   */
  getEntitiesByType(type: EntityType, limit?: number): Promise<BaseEntity[]>;
}



