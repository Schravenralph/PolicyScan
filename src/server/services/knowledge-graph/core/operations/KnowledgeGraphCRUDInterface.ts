/**
 * Interface for Knowledge Graph CRUD operations
 * Defines the contract for basic create, read, update, delete operations
 */

import type { BaseEntity, EntityType, RelationType } from '../../../../domain/ontology.js';
import type { Driver } from 'neo4j-driver';
import type { DynamicValidator } from '../../validators/DynamicValidator.js';
import type { DeduplicationService } from '../../DeduplicationService.js';
import type { EventEmitter } from 'events';

/**
 * Dependencies required by CRUD operations
 */
export interface KnowledgeGraphCRUDDependencies {
  driver: Driver;
  dynamicValidator: DynamicValidator;
  deduplicationService: DeduplicationService;
  eventEmitter: EventEmitter;
  getVersioningService: () => Promise<{ createVersion: (entity: BaseEntity, options: { timestamp: string; changeReason: string; author: string }) => Promise<unknown> } | null>;
  runTruthDiscovery: (entity: BaseEntity) => Promise<void>;
  invalidateTraversalCacheForNode: (nodeId: string) => number;
  invalidateTraversalCacheForRelationship: (relationType: RelationType) => number;
}

/**
 * Interface for Knowledge Graph CRUD operations
 */
export interface KnowledgeGraphCRUDOperations {
  /**
   * Add a single node to the knowledge graph
   */
  addNode(node: BaseEntity): Promise<void>;

  /**
   * Add multiple nodes to the knowledge graph in bulk
   */
  addNodesBulk(entities: BaseEntity[]): Promise<{ successful: number; failed: number; errors: string[] }>;

  /**
   * Add an edge (relationship) between two entities
   */
  addEdge(sourceId: string, targetId: string, type: RelationType, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Add multiple edges (relationships) to the knowledge graph in bulk
   */
  addEdgesBulk(relationships: Array<{ sourceId: string; targetId: string; type: RelationType; metadata?: Record<string, unknown> }>): Promise<{ successful: number; failed: number; errors: string[] }>;

  /**
   * Delete multiple nodes from the knowledge graph in bulk
   */
  deleteNodesBulk(ids: string[], softDelete?: boolean): Promise<{ successful: number; failed: number; errors: string[] }>;

  /**
   * Delete multiple relationships from the knowledge graph in bulk
   */
  deleteRelationshipsBulk(relationships: Array<{ sourceId: string; targetId: string; type: RelationType }>): Promise<{ successful: number; failed: number; errors: string[] }>;

  /**
   * Get a node by its ID
   */
  getNode(id: string): Promise<BaseEntity | undefined>;

  /**
   * Get multiple nodes by ID
   */
  getNodes(ids: string[]): Promise<(BaseEntity | undefined)[]>;

  /**
   * Get a node by its schema.org URI
   */
  getNodeByUri(uri: string): Promise<BaseEntity | undefined>;

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(type: EntityType): Promise<BaseEntity[]>;

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): Promise<BaseEntity[]>;

  /**
   * Clear all nodes and relationships from the graph
   */
  clear(): Promise<void>;

  /**
   * Convert Neo4j node to BaseEntity
   */
  neo4jNodeToEntity(node: { properties: Record<string, unknown> }): BaseEntity;
}

