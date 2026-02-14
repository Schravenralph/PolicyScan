import { BaseEntity, RelationType } from '../../../domain/ontology.js';

export interface NeighborCounts {
  outgoing: {
    total: number;
    byType: Record<string, number>;
  };
  incoming: {
    total: number;
    byType: Record<string, number>;
  };
}

export interface KnowledgeGraphServiceInterface {
  /**
   * Initialize the knowledge graph service connection
   */
  initialize(): Promise<void>;

  /**
   * Add a node to the graph
   */
  addNode(node: BaseEntity): Promise<void>;

  /**
   * Add an edge to the graph
   */
  addEdge(sourceId: string, targetId: string, type: RelationType, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Get a node by ID
   */
  getNode(id: string): Promise<BaseEntity | undefined>;

  /**
   * Get multiple nodes by ID
   */
  getNodes(ids: string[]): Promise<(BaseEntity | undefined)[]>;

  /**
   * Get outgoing neighbors of a node
   */
  getNeighbors(id: string, relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]>;

  /**
   * Get outgoing neighbors for multiple nodes in a batch
   */
  getNeighborsBatch(ids: string[], relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]>;

  /**
   * Get incoming neighbors of a node
   */
  getIncomingNeighbors(id: string, relationType?: RelationType, maxHops?: number): Promise<BaseEntity[]>;

  /**
   * Get neighbor counts (outgoing and incoming) efficiently
   */
  getNeighborCounts(id: string): Promise<NeighborCounts>;

  /**
   * Search entities by keywords
   */
  searchEntities(keywords: string[]): Promise<BaseEntity[]>;

  /**
   * Get entity type distribution
   */
  getEntityTypeDistribution(): Promise<Record<string, number>>;

  /**
   * Get jurisdiction distribution
   */
  getJurisdictionDistribution(): Promise<Record<string, { count: number; entityIds: string[] }>>;

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): Promise<BaseEntity[]>;

  /**
   * Get all outgoing relationships for an entity
   */
  getRelationshipsForEntity(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>;

  /**
   * Get all incoming relationships for an entity
   */
  getIncomingRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>;
}
