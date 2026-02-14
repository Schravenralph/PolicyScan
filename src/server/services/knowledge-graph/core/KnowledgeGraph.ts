import {
    BaseEntity,
    Relation,
    RelationType,
    EntityType,
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    Requirement,
    generateSchemaOrgUri,
    isValidSchemaOrgUri,
    HierarchyLevel,
    HierarchyInfo
} from '../../../domain/ontology.js';
import { Driver, int, Integer } from 'neo4j-driver';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import { EntitySchemaValidator } from '../validators/EntitySchemaValidator.js';
import { RelationshipValidator } from '../validators/RelationshipValidator.js';
import { DeduplicationService } from '../DeduplicationService.js';
import { ConsistencyChecker, ConsistencyViolation } from '../validators/ConsistencyChecker.js';
import { FactValidator, FactValidationResult } from '../validators/FactValidator.js';
import { HumanValidationService, ValidationTask } from '../validators/HumanValidationService.js';
import { DynamicValidator } from '../validators/DynamicValidator.js';
import { MultiViewValidator, MultiViewValidationResult, SemanticValidationResult, StructuralValidationResult, TemporalValidationResult } from '../validators/MultiViewValidator.js';
import { KnowledgeFusionService } from '../fusion/KnowledgeFusionService.js';
import { TruthDiscoveryService } from '../fusion/TruthDiscoveryService.js';
import { EventEmitter } from 'events';
import { FeatureFlag } from '../../../models/FeatureFlag.js';
import { KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { KnowledgeGraphPersistence, PersistenceOptions } from './KnowledgeGraphPersistence.js';
import { GraphTraversalService, TraversalOptions, TraversalResult, PathResult, SubgraphResult } from '../../graphrag/GraphTraversalService.js';
import { HierarchicalStructureService, HierarchicalQueryOptions, HierarchicalQueryResult } from '../legal/HierarchicalStructureService.js';
import { HierarchyValidationResult } from '../legal/HierarchyValidator.js';
import { EntityVersioningService, EntityVersion } from '../maintenance/EntityVersioningService.js';
import { TemporalQueryService } from '../maintenance/TemporalQueryService.js';
import { VersionDiffGenerator } from '../maintenance/VersionDiffGenerator.js';
import { DocumentDependencyTracker, DocumentDependency, DependencyExtractionResult, DependencyQueryResult } from '../legal/DocumentDependencyTracker.js';
import { ImpactAnalysisService, ImpactAnalysis, ImpactReport } from '../legal/ImpactAnalysisService.js';
import { OntologyAlignmentService, OntologyAlignment, AlignmentResult, AlignmentOptions } from '../legal/OntologyAlignmentService.js';

// Type aliases for backward compatibility
export type EntityAlignment = OntologyAlignment;
export type AlignmentQueryOptions = AlignmentOptions; // Exported for external use
import { CypherQueryService, CypherQueryResult, CypherQueryOptions, CypherQueryValidationResult } from './CypherQueryService.js';
import { GraphInferenceEngine, InferenceOptions, InferenceResult } from '../inference/GraphInferenceEngine.js';
import { KnowledgeGraphCRUD } from './operations/KnowledgeGraphCRUD.js';
import type { KnowledgeGraphCRUDDependencies } from './operations/KnowledgeGraphCRUDInterface.js';
import { KnowledgeGraphQueries } from './operations/KnowledgeGraphQueries.js';
import type { KnowledgeGraphQueriesDependencies } from './operations/KnowledgeGraphQueriesInterface.js';
import { KnowledgeGraphValidation } from './operations/KnowledgeGraphValidation.js';
import type { KnowledgeGraphValidationDependencies } from './operations/KnowledgeGraphValidationInterface.js';
import { KnowledgeGraphTraversal } from './operations/KnowledgeGraphTraversal.js';
import type { KnowledgeGraphTraversalDependencies } from './operations/KnowledgeGraphTraversalInterface.js';
import { KnowledgeGraphServiceManager } from './KnowledgeGraphServiceManager.js';
import { KnowledgeGraphServiceInterface, NeighborCounts } from './KnowledgeGraphInterface.js';
import { logger } from '../../../utils/logger.js';

/**
 * Service to manage the Knowledge Graph using GraphDB.
 * Provides optimized graph traversals and native SPARQL queries.
 * Includes comprehensive validation with event-driven monitoring.
 *
 * Note: GraphDB is the knowledge graph backend.
 */
export class KnowledgeGraphService extends EventEmitter implements KnowledgeGraphServiceInterface {
    private driver: Driver;
    private initialized: boolean = false;
    private entityValidator: EntitySchemaValidator;
    private relationshipValidator: RelationshipValidator;
    private deduplicationService: DeduplicationService;
    private consistencyChecker: ConsistencyChecker;
    private factValidator: FactValidator;
    private humanValidationService: HumanValidationService;
    private dynamicValidator: DynamicValidator;
    private multiViewValidator: MultiViewValidator;
    private fusionService: KnowledgeFusionService;
    private versionDiffGenerator: VersionDiffGenerator;
    private persistence: KnowledgeGraphPersistence | null = null;
    private serviceManager: KnowledgeGraphServiceManager;
    private crudOperations!: KnowledgeGraphCRUD;
    private queryOperations!: KnowledgeGraphQueries;
    private validationOperations!: KnowledgeGraphValidation;
    private traversalOperations!: KnowledgeGraphTraversal;

    constructor(driver?: Driver, persistenceOptions?: PersistenceOptions) {
        super(); // Call EventEmitter constructor
        if (!driver) {
            try {
                this.driver = getNeo4jDriver();
            } catch (_error) {
                throw new Error(
                    'KnowledgeGraphService requires a GraphDB connection. ' +
                    'Ensure connectGraphDB() has been called first.'
                );
            }
        } else {
            this.driver = driver;
        }

        // Initialize Priority 1 validators
        this.entityValidator = new EntitySchemaValidator();
        this.relationshipValidator = new RelationshipValidator();
        
        // Initialize deduplication service with service methods
        this.deduplicationService = new DeduplicationService(
            async (id: string) => this.getNode(id),
            async (uri: string) => this.getNodeByUri(uri),
            async (type: EntityType) => this.getNodesByType(type),
            undefined, // config
            undefined, // enableSemanticMatching
            async (type: EntityType, normalizedName: string) => this.crudOperations.findNodesByNameSubstring(type, normalizedName)
        );

        // Initialize Priority 2 validators
        this.consistencyChecker = new ConsistencyChecker(
            async (id: string) => this.getNode(id),
            async () => this.getAllNodes(),
            async (id: string) => this.getRelationshipsForEntity(id),
            async (id: string) => this.getIncomingRelationships(id)
        );
        this.factValidator = new FactValidator(
            undefined,
            async (id: string) => this.getRelationshipsForEntity(id),
            async (id: string) => this.getIncomingRelationships(id)
        );
        this.humanValidationService = new HumanValidationService();

        // Initialize Priority 3 validators
        this.dynamicValidator = new DynamicValidator(
            this.entityValidator,
            this.relationshipValidator,
            this.factValidator,
            this.consistencyChecker,
            this.deduplicationService
        );
        
        // Forward dynamic validator events to service events
        this.dynamicValidator.on('validation', (event) => {
            this.emit('validation', event);
        });
        this.dynamicValidator.on('validation-error', (event) => {
            this.emit('validation-error', event);
        });
        this.dynamicValidator.on('validation-warning', (event) => {
            this.emit('validation-warning', event);
        });

        this.multiViewValidator = new MultiViewValidator(
            async (id: string) => this.getRelationshipsForEntity(id),
            async (id: string) => this.getIncomingRelationships(id),
            async () => this.getAllNodes()
        );

        // Initialize knowledge fusion service
        // Note: Conflict resolver will be set when TruthDiscoveryService is available
        this.fusionService = new KnowledgeFusionService();

        // Initialize traversal service (lazy initialization when feature flag is enabled)
        // Will be initialized on first use if feature flag is enabled

        // Initialize versioning services (lazy initialization when feature flag is enabled)
        this.versionDiffGenerator = new VersionDiffGenerator();
        // Versioning and temporal query services will be initialized on first use if feature flag is enabled

        // Initialize persistence layer if options provided
        if (persistenceOptions) {
            this.persistence = new KnowledgeGraphPersistence(this.driver, persistenceOptions);
        }

        // Initialize Service Manager for lazy service initialization
        this.serviceManager = new KnowledgeGraphServiceManager(this.driver, {
            getNode: async (id: string) => this.getNode(id),
            getNodesByType: async (type: EntityType) => this.getNodesByType(type),
            addNode: async (entity: BaseEntity) => this.addNode(entity),
        });

        // Initialize CRUD operations
        const crudDependencies: KnowledgeGraphCRUDDependencies = {
            driver: this.driver,
            dynamicValidator: this.dynamicValidator,
            deduplicationService: this.deduplicationService,
            eventEmitter: this,
            getVersioningService: async () => this.serviceManager.getVersioningService(),
            runTruthDiscovery: async (entity: BaseEntity) => this.runTruthDiscovery(entity),
            invalidateTraversalCacheForNode: (nodeId: string) => this.invalidateTraversalCacheForNode(nodeId),
            invalidateTraversalCacheForRelationship: (relationType: RelationType) => this.invalidateTraversalCacheForRelationship(relationType),
        };
        this.crudOperations = new KnowledgeGraphCRUD(crudDependencies);

        // Initialize Query operations
        const queryDependencies: KnowledgeGraphQueriesDependencies = {
            driver: this.driver,
            neo4jNodeToEntity: (node: { properties: Record<string, unknown> }) => this.crudOperations.neo4jNodeToEntity(node),
        };
        this.queryOperations = new KnowledgeGraphQueries(queryDependencies);

        // Initialize Validation operations
        const validationDependencies: KnowledgeGraphValidationDependencies = {
            consistencyChecker: this.consistencyChecker,
            factValidator: this.factValidator,
            humanValidationService: this.humanValidationService,
            dynamicValidator: this.dynamicValidator,
            multiViewValidator: this.multiViewValidator,
        };
        this.validationOperations = new KnowledgeGraphValidation(validationDependencies);

        // Initialize Traversal operations
        const traversalDependencies: KnowledgeGraphTraversalDependencies = {
            getTraversalService: () => this.serviceManager.getTraversalService(),
            fusionService: this.fusionService as any,
            getTruthDiscoveryService: () => this.serviceManager.getTruthDiscoveryService() as any,
            getNodesByType: async (type: string) => this.getNodesByType(type as EntityType),
            getNode: async (id: string) => this.getNode(id),
            addNode: async (entity: BaseEntity) => this.addNode(entity),
        };
        this.traversalOperations = new KnowledgeGraphTraversal(traversalDependencies);
    }

    /**
     * Get or initialize the traversal service
     */
    private getTraversalService(): GraphTraversalService | null {
        return this.serviceManager.getTraversalService();
    }

    /**
     * Get or initialize the hierarchical structure service
     */
    private getHierarchicalStructureService(): HierarchicalStructureService | null {
        return this.serviceManager.getHierarchicalStructureService();
    }

    /**
     * Get or initialize the document dependency tracker
     */
    private getDocumentDependencyTracker(): DocumentDependencyTracker | null {
        return this.serviceManager.getDocumentDependencyTracker();
    }

    /**
     * Get or initialize the ontology alignment service
     */
    private getOntologyAlignmentService(): OntologyAlignmentService | null {
        return this.serviceManager.getOntologyAlignmentService();
    }

    /**
     * Get or initialize the impact analysis service
     */
    private getImpactAnalysisService(): ImpactAnalysisService | null {
        return this.serviceManager.getImpactAnalysisService();
    }

    /**
     * Initialize the knowledge graph (verifies connectivity)
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Test connectivity with a simple query instead of verifyConnectivity()
            const testSession = this.driver.session();
            try {
                await testSession.run('RETURN 1 as test');
                this.initialized = true;
                logger.info('KnowledgeGraphService initialized with GraphDB');
            } finally {
                await testSession.close();
            }
        } catch (error) {
            logger.error({ error }, 'Failed to initialize KnowledgeGraphService with GraphDB');
            throw new Error('Failed to initialize KnowledgeGraphService from GraphDB.');
        }
    }

    /**
     * Adds a node to the graph.
     * Automatically generates a schema.org URI if not provided.
     * Validates the entity schema and checks for duplicates before insertion.
     */
    async addNode(node: BaseEntity): Promise<void> {
        return this.crudOperations.addNode(node);
    }

    /**
     * Bulk insert multiple entities efficiently
     * Uses batch processing for better performance
     */
    async addNodesBulk(entities: BaseEntity[]): Promise<{ successful: number; failed: number; errors: string[] }> {
        return this.crudOperations.addNodesBulk(entities);
    }

    /**
     * Adds an edge (relationship) to the graph.
     * Validates the relationship before insertion.
     */
    async addEdge(sourceId: string, targetId: string, type: RelationType, metadata?: Record<string, unknown>): Promise<void> {
        return this.crudOperations.addEdge(sourceId, targetId, type, metadata);
    }

    /**
     * Bulk insert multiple edges (relationships) efficiently
     */
    async addEdgesBulk(relationships: Array<{ sourceId: string; targetId: string; type: RelationType; metadata?: Record<string, unknown> }>): Promise<{ successful: number; failed: number; errors: string[] }> {
        return this.crudOperations.addEdgesBulk(relationships);
    }

    /**
     * Bulk delete multiple nodes efficiently
     */
    async deleteNodesBulk(ids: string[], softDelete: boolean = true): Promise<{ successful: number; failed: number; errors: string[] }> {
        return this.crudOperations.deleteNodesBulk(ids, softDelete);
    }

    /**
     * Bulk delete multiple relationships efficiently
     */
    async deleteRelationshipsBulk(relationships: Array<{ sourceId: string; targetId: string; type: RelationType }>): Promise<{ successful: number; failed: number; errors: string[] }> {
        return this.crudOperations.deleteRelationshipsBulk(relationships);
    }

    /**
     * Retrieves a node by its ID.
     */
    async getNode(id: string): Promise<BaseEntity | undefined> {
        return this.crudOperations.getNode(id);
    }

    /**
     * Retrieves multiple nodes by their IDs.
     */
    async getNodes(ids: string[]): Promise<(BaseEntity | undefined)[]> {
        return this.crudOperations.getNodes(ids);
    }

    /**
     * Retrieves a node by its schema.org URI.
     */
    async getNodeByUri(uri: string): Promise<BaseEntity | undefined> {
        return this.crudOperations.getNodeByUri(uri);
    }

    /**
     * Retrieves all nodes of a specific type.
     */
    async getNodesByType(type: EntityType): Promise<BaseEntity[]> {
        return this.crudOperations.getNodesByType(type);
    }

    /**
     * Search entities by keywords (for HybridSearch)
     */
    async searchEntities(keywords: string[]): Promise<BaseEntity[]> {
        return this.queryOperations.searchEntities(keywords);
    }

    /**
     * Finds all neighbors of a node (outgoing edges).
     * Supports multi-hop traversals.
     */
    async getNeighbors(id: string, relationType?: RelationType, maxHops: number = 1): Promise<BaseEntity[]> {
        return this.queryOperations.getNeighbors(id, relationType, maxHops);
    }

    /**
     * Finds all neighbors of multiple nodes (outgoing edges).
     * Supports multi-hop traversals.
     */
    async getNeighborsBatch(ids: string[], relationType?: RelationType, maxHops: number = 1): Promise<BaseEntity[]> {
        return this.queryOperations.getNeighborsBatch(ids, relationType, maxHops);
    }

    /**
     * Get relationships between multiple entities efficiently
     * Returns all relationships where both source and target are in the provided entity IDs
     */
    async getRelationshipsBetweenEntities(entityIds: string[]): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        return this.queryOperations.getRelationshipsBetweenEntities(entityIds);
    }

    /**
     * Get all outgoing relationships for an entity
     */
    async getRelationshipsForEntity(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        return this.queryOperations.getRelationshipsForEntity(entityId);
    }

    /**
     * Get all incoming relationships for an entity
     */
    async getIncomingRelationships(entityId: string): Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity {id: $entityId})
                RETURN source.id AS sourceId, target.id AS targetId, r.type AS type
                `,
                { entityId }
            );

            return result.records.map(record => ({
                sourceId: record.get('sourceId'),
                targetId: record.get('targetId'),
                type: record.get('type') as RelationType
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes in the graph
     */
    async getAllNodes(): Promise<BaseEntity[]> {
        return this.crudOperations.getAllNodes();
    }

    /**
     * Finds all nodes that point to a specific node (incoming edges).
     */
    async getIncomingNeighbors(id: string, relationType?: RelationType, maxHops: number = 1): Promise<BaseEntity[]> {
        return this.queryOperations.getIncomingNeighbors(id, relationType, maxHops);
    }

    /**
     * Get neighbor counts (outgoing and incoming) efficiently
     */
    async getNeighborCounts(id: string): Promise<NeighborCounts> {
        return this.queryOperations.getNeighborCounts(id);
    }

    /**
     * Finds applicable regulations for a given spatial unit or land use.
     */
    async getApplicableRegulations(entityId: string): Promise<Regulation[]> {
        return this.queryOperations.getApplicableRegulations(entityId);
    }

    /**
     * Returns the entire graph structure (for debugging/visualization).
     * WARNING: This can be slow for large graphs. Use with limit.
     */
    async getGraphSnapshot(limit: number = 10000): Promise<{ nodes: BaseEntity[]; edges: Relation[] }> {
        return this.queryOperations.getGraphSnapshot(limit);
    }

    /**
     * Get graph statistics
     */
    async getStats(): Promise<{ nodeCount: number; edgeCount: number; typeDistribution: Record<string, number> }> {
        return this.queryOperations.getStats();
    }

    /**
     * Get entity type distribution (optimized for clustering)
     */
    async getEntityTypeDistribution(): Promise<Record<string, number>> {
        return this.queryOperations.getEntityTypeDistribution();
    }

    /**
     * Get jurisdiction distribution (optimized for clustering)
     */
    async getJurisdictionDistribution(): Promise<Record<string, { count: number; entityIds: string[] }>> {
        return this.queryOperations.getJurisdictionDistribution();
    }

    /**
     * Get entities grouped by type (for entity-type clustering)
     */
    async getEntitiesByType(type: EntityType, limit?: number): Promise<BaseEntity[]> {
        return this.queryOperations.getEntitiesByType(type, limit);
    }

    /**
     * Count edges between entity types (for cluster edge calculation)
     */
    async countEdgesBetweenTypes(sourceType: EntityType, targetType: EntityType): Promise<number> {
        return this.queryOperations.countEdgesBetweenTypes(sourceType, targetType);
    }

    /**
     * Clears all data from the graph.
     */
    async clear(): Promise<void> {
        return this.crudOperations.clear();
    }

    /**
     * Store or update cluster label in Neo4j
     */
    async storeClusterLabel(
        clusterId: string,
        label: string,
        metadata: {
            algorithm?: string;
            communityId?: number;
            nodeCount?: number;
            entityType?: string;
        } = {}
    ): Promise<void> {
        const session = this.driver.session();
        
        try {
            await session.run(
                `
                MERGE (c:Cluster {id: $clusterId})
                SET c.label = $label,
                    c.labelUpdatedAt = datetime(),
                    c.algorithm = COALESCE($algorithm, c.algorithm),
                    c.communityId = COALESCE($communityId, c.communityId),
                    c.nodeCount = COALESCE($nodeCount, c.nodeCount),
                    c.entityType = COALESCE($entityType, c.entityType)
                RETURN c
                `,
                {
                    clusterId,
                    label,
                    algorithm: metadata.algorithm || null,
                    communityId: metadata.communityId || null,
                    nodeCount: metadata.nodeCount || null,
                    entityType: metadata.entityType || null
                }
            );
        } finally {
            await session.close();
        }
    }

    /**
     * Get cluster label from Neo4j
     */
    async getClusterLabel(clusterId: string): Promise<string | null> {
        const session = this.driver.session();
        
        try {
            const result = await session.run(
                'MATCH (c:Cluster {id: $clusterId}) RETURN c.label AS label',
                { clusterId }
            );
            
            if (result.records.length === 0) {
                return null;
            }
            
            return result.records[0].get('label');
        } finally {
            await session.close();
        }
    }

    /**
     * Link entities to cluster in Neo4j
     */
    async linkEntitiesToCluster(
        clusterId: string,
        entityIds: string[]
    ): Promise<void> {
        const session = this.driver.session();
        
        try {
            await session.run(
                `
                MATCH (c:Cluster {id: $clusterId})
                UNWIND $entityIds AS entityId
                MATCH (e:Entity {id: entityId})
                MERGE (e)-[:BELONGS_TO_CLUSTER]->(c)
                RETURN count(e) AS linked
                `,
                {
                    clusterId,
                    entityIds
                }
            );
        } finally {
            await session.close();
        }
    }

    // ========== Priority 2 Validation Methods ==========

    /**
     * Run consistency check on the entire graph
     * Returns violations (errors and warnings)
     */
    async checkConsistency(): Promise<ConsistencyViolation[]> {
        return this.validationOperations.checkConsistency();
    }

    /**
     * Get consistency summary statistics
     */
    async getConsistencySummary(): Promise<{
        totalViolations: number;
        errors: number;
        warnings: number;
        byType: Record<string, number>;
    }> {
        return this.validationOperations.getConsistencySummary();
    }

    /**
     * Validate a fact (relationship) for plausibility
     */
    async validateFact(relation: Relation): Promise<FactValidationResult> {
        return this.validationOperations.validateFact(relation);
    }

    /**
     * Validate batch of facts
     */
    async validateFacts(relations: Relation[]): Promise<FactValidationResult[]> {
        return this.validationOperations.validateFacts(relations);
    }

    /**
     * Get human validation tasks
     */
    async getValidationTasks(limit: number = 100): Promise<ValidationTask[]> {
        return this.validationOperations.getValidationTasks(limit);
    }

    /**
     * Submit human validation result
     */
    async submitValidation(
        taskId: string,
        action: 'approve' | 'reject' | 'modify',
        modifiedEntity?: BaseEntity,
        modifiedRelation?: Relation
    ): Promise<void> {
        return this.validationOperations.submitValidation(taskId, action, modifiedEntity, modifiedRelation);
    }

    /**
     * Create validation tasks for entities/relationships that need review
     */
    async createValidationTasks(
        entities: BaseEntity[],
        relations: Relation[]
    ): Promise<ValidationTask[]> {
        return this.validationOperations.createValidationTasks(entities, relations);
    }

    /**
     * Get validation task statistics
     */
    async getValidationTaskStatistics(): Promise<{
        total: number;
        pending: number;
        inProgress: number;
        approved: number;
        rejected: number;
        modified: number;
        byPriority: Record<string, number>;
    }> {
        return this.validationOperations.getValidationTaskStatistics();
    }

    // ========== Priority 3 Validation Methods ==========

    /**
     * Run periodic validation (consistency checks, fact validation)
     * Emits validation events automatically
     */
    async runPeriodicValidation(): Promise<void> {
        return this.validationOperations.runPeriodicValidation();
    }

    /**
     * Validate entity from multiple perspectives (semantic, structural, temporal)
     */
    async validateEntityMultiView(entity: BaseEntity): Promise<MultiViewValidationResult> {
        return this.validationOperations.validateEntityMultiView(entity);
    }

    /**
     * Validate multiple entities from multiple perspectives
     */
    async validateEntitiesMultiView(entities: BaseEntity[]): Promise<MultiViewValidationResult[]> {
        return this.validationOperations.validateEntitiesMultiView(entities);
    }

    /**
     * Get entities with low overall validation scores (potential issues)
     */
    async getLowScoreEntities(threshold: number = 0.7): Promise<MultiViewValidationResult[]> {
        return this.multiViewValidator.getLowScoreEntities(threshold);
    }

    /**
     * Validate semantic plausibility of an entity
     */
    async validateSemanticPlausibility(entity: BaseEntity): Promise<SemanticValidationResult> {
        return this.multiViewValidator.validateSemanticPlausibility(entity);
    }

    /**
     * Validate structural importance of an entity
     */
    async validateStructuralImportance(entity: BaseEntity): Promise<StructuralValidationResult> {
        return this.multiViewValidator.validateStructuralImportance(entity);
    }

    /**
     * Validate temporal consistency of an entity using multi-view validation
     */
    async validateTemporalConsistencyMultiView(entity: BaseEntity): Promise<TemporalValidationResult> {
        return this.multiViewValidator.validateTemporalConsistency(entity);
    }

    /**
     * Perform graph traversal from a starting node
     * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
     */
    async traverseGraph(
        startNodeId: string,
        options: Partial<TraversalOptions> = {}
    ): Promise<TraversalResult> {
        return this.traversalOperations.traverseGraph(startNodeId, options);
    }

    /**
     * Get or initialize truth discovery service
     */
    private getTruthDiscoveryService(): TruthDiscoveryService | null {
        return this.serviceManager.getTruthDiscoveryService();
    }

    /**
     * Run truth discovery for an entity
     */
    private async runTruthDiscovery(entity: BaseEntity): Promise<void> {
        return this.traversalOperations.runTruthDiscovery(entity);
    }

    /**
     * Find a path between two nodes
     * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
     */
    async findPath(
        startNodeId: string,
        endNodeId: string,
        options: Partial<TraversalOptions> = {}
    ): Promise<PathResult | null> {
        return this.traversalOperations.findPath(startNodeId, endNodeId, options);
    }

    /**
     * Extract a subgraph around a node
     * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
     */
    async extractSubgraph(
        centerNodeId: string,
        radius: number = 2,
        options: Partial<Omit<TraversalOptions, 'maxDepth'>> = {}
    ): Promise<SubgraphResult> {
        return this.traversalOperations.extractSubgraph(centerNodeId, radius, options);
    }

    /**
     * Get DynamicValidator instance for advanced event handling
     */
    getDynamicValidator(): DynamicValidator {
        return this.dynamicValidator;
    }

    /**
     * Fuse entities from multiple sources into a canonical entity
     * Only works if KG_FUSION_ENABLED feature flag is enabled
     */
    async fuseEntities(
        primaryEntity: BaseEntity,
        sourceEntities: BaseEntity[],
        options?: { strategy?: 'merge_all' | 'keep_primary' | 'keep_most_recent' | 'resolve_conflicts' }
    ): Promise<{
        fusedEntity: BaseEntity;
        mergedFrom: string[];
        conflictsResolved: number;
        propertiesMerged: number;
        sourcesMerged: number;
    }> {
        return this.traversalOperations.fuseEntities(primaryEntity, sourceEntities, options);
    }

    /**
     * Incremental update: Add new facts to existing entity
     */
    async incrementalUpdate(
        entityId: string,
        newFacts: Partial<BaseEntity>,
        sourceUrl?: string
    ): Promise<BaseEntity> {
        return this.traversalOperations.incrementalUpdate(entityId, newFacts, sourceUrl);
    }

    /**
     * Get provenance information for an entity
     */
    getProvenance(entityId: string): {
        entityId: string;
        records: Record<string, { property: string; sourceEntityIds: string[]; sourceUrls?: string[]; timestamps: string[]; lastUpdated: string }>;
        allSources: string[];
        allSourceUrls: string[];
        createdAt: string;
        updatedAt: string;
    } | null {
        const fusionEnabled = FeatureFlag.isFusionEnabled();
        if (!fusionEnabled) {
            return null;
        }

        return this.fusionService.getProvenanceTracker().exportProvenance(entityId);
    }

    /**
     * Get all source URLs for an entity
     */
    getSourceUrls(entityId: string): string[] {
        const fusionEnabled = FeatureFlag.isFusionEnabled();
        if (!fusionEnabled) {
            return [];
        }

        return this.fusionService.getProvenanceTracker().getSourceUrls(entityId);
    }

    /**
     * Get traversal cache statistics
     * Returns cache statistics if traversal caching is enabled
     */
    getTraversalCacheStats(): {
        size: number;
        maxSize: number;
        hits: number;
        misses: number;
        hitRate: number;
        evictions: number;
    } | null {
        const traversalService = this.getTraversalService();
        if (!traversalService) {
            return null;
        }
        return traversalService.getCacheStats();
    }

    /**
     * Clear traversal cache
     * Clears all cached traversal results
     */
    clearTraversalCache(): void {
        const traversalService = this.getTraversalService();
        if (traversalService) {
            traversalService.clearCache();
            this.emit('cache-cleared', { type: 'traversal', timestamp: new Date() });
        }
    }

    /**
     * Invalidate traversal cache for a specific node
     * Called when a node is updated or deleted
     */
    invalidateTraversalCacheForNode(nodeId: string): number {
        const traversalService = this.getTraversalService();
        if (!traversalService) {
            return 0;
        }
        // Fire and forget - cache invalidation is async but we return synchronously
        traversalService.invalidateNodeCache(nodeId).then(invalidated => {
            if (invalidated > 0) {
                this.emit('cache-invalidated', { type: 'node', nodeId, count: invalidated, timestamp: new Date() });
            }
        }).catch(error => {
            logger.warn({ error, nodeId }, 'Failed to invalidate cache for node');
        });
        return 0; // Return 0 since we can't await the async operation
    }

    /**
     * Invalidate traversal cache for multiple nodes
     */
    invalidateTraversalCacheForNodes(nodeIds: string[]): number {
        const traversalService = this.getTraversalService();
        if (!traversalService) {
            return 0;
        }
        // Fire and forget - cache invalidation is async but we return synchronously
        traversalService.invalidateNodesCache(nodeIds).then(invalidated => {
            if (invalidated > 0) {
                this.emit('cache-invalidated', { type: 'nodes', nodeIds, count: invalidated, timestamp: new Date() });
            }
        }).catch(error => {
            logger.warn({ error, nodeIds }, 'Failed to invalidate cache for nodes');
        });
        return 0; // Return 0 since we can't await the async operation
    }

    /**
     * Invalidate traversal cache for a relationship type
     * Called when relationships of this type are updated or deleted
     */
    invalidateTraversalCacheForRelationship(relationshipType: RelationType): number {
        const traversalService = this.getTraversalService();
        if (!traversalService) {
            return 0;
        }
        // Fire and forget - cache invalidation is async but we return synchronously
        traversalService.invalidateRelationshipCache(relationshipType).then(invalidated => {
            if (invalidated > 0) {
                this.emit('cache-invalidated', { type: 'relationship', relationshipType, count: invalidated, timestamp: new Date() });
            }
        }).catch(error => {
            logger.warn({ error, relationshipType }, 'Failed to invalidate cache for relationship type');
        });
        return 0; // Return 0 since we can't await the async operation
    }

    // ============================================================================
    // Hierarchical Structure Methods
    // ============================================================================

    /**
     * Build hierarchy from entity data.
     * Infers hierarchy levels and establishes parent-child relationships.
     */
    async buildHierarchy(entities: PolicyDocument[]): Promise<Map<string, PolicyDocument>> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return new Map(entities.map(e => [e.id, e]));
        }
        return service.buildHierarchy(entities);
    }

    /**
     * Validate hierarchy integrity for a single entity.
     */
    validateHierarchy(entity: PolicyDocument, parentEntity?: PolicyDocument): HierarchyValidationResult {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return { isValid: true, errors: [], warnings: [] };
        }
        return service.validateEntity(entity, parentEntity);
    }

    /**
     * Validate hierarchy integrity for the entire graph.
     */
    async validateHierarchyGraph(entities: PolicyDocument[]): Promise<HierarchyValidationResult> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return { isValid: true, errors: [], warnings: [] };
        }
        return service.validateGraph(entities);
    }

    /**
     * Find all regulations in a jurisdiction and its parent jurisdictions.
     */
    async findRegulationsInJurisdictionAndParents(
        jurisdictionId: string,
        options: HierarchicalQueryOptions = {}
    ): Promise<PolicyDocument[]> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return [];
        }
        return service.findRegulationsInJurisdictionAndParents(jurisdictionId, options);
    }

    /**
     * Find all child jurisdictions of a given jurisdiction.
     */
    async findChildJurisdictions(
        jurisdictionId: string,
        options: HierarchicalQueryOptions = {}
    ): Promise<PolicyDocument[]> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return [];
        }
        return service.findChildJurisdictions(jurisdictionId, options);
    }

    /**
     * Find regulations at a specific hierarchy level.
     */
    async findRegulationsAtLevel(level: HierarchyLevel): Promise<PolicyDocument[]> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return [];
        }
        return service.findRegulationsAtLevel(level);
    }

    /**
     * Find all entities in a jurisdiction subtree.
     */
    async findJurisdictionSubtree(
        jurisdictionId: string,
        options: HierarchicalQueryOptions = {}
    ): Promise<HierarchicalQueryResult | null> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return null;
        }
        return service.findJurisdictionSubtree(jurisdictionId, options);
    }

    /**
     * Update hierarchy for an entity.
     */
    async updateHierarchy(entityId: string, hierarchy: HierarchyInfo): Promise<void> {
        const service = this.getHierarchicalStructureService();
        if (!service) {
            return;
        }
        return service.updateHierarchy(entityId, hierarchy);
    }

    // ============================================================================
    // Entity Versioning Methods
    // ============================================================================

    /**
     * Get or initialize versioning service
     */
    private getVersioningService(): EntityVersioningService | null {
        return this.serviceManager.getVersioningService();
    }

    /**
     * Get or initialize temporal query service
     */
    private getTemporalQueryService(): TemporalQueryService | null {
        return this.serviceManager.getTemporalQueryService();
    }

    /**
     * Create a version of an entity
     * Requires KG_ENTITY_VERSIONING_ENABLED feature flag to be enabled
     */
    async createEntityVersion(
        entity: BaseEntity,
        metadata?: { changeReason?: string; author?: string; metadata?: Record<string, unknown> }
    ): Promise<EntityVersion> {
        const versioningService = this.getVersioningService();
        if (!versioningService) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }
        return await versioningService.createVersion(entity, {
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Get all versions for an entity
     * Requires KG_ENTITY_VERSIONING_ENABLED feature flag to be enabled
     */
    async getEntityVersions(entityId: string): Promise<EntityVersion[]> {
        const versioningService = this.getVersioningService();
        if (!versioningService) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }
        return await versioningService.getEntityVersions(entityId);
    }

    /**
     * Get a specific version of an entity
     * Requires KG_ENTITY_VERSIONING_ENABLED feature flag to be enabled
     */
    async getEntityVersion(entityId: string, versionNumber: number): Promise<EntityVersion | null> {
        const versioningService = this.getVersioningService();
        if (!versioningService) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }
        return await versioningService.getVersion(entityId, versionNumber);
    }

    /**
     * Rollback entity to a specific version
     * Requires KG_ENTITY_VERSIONING_ENABLED feature flag to be enabled
     */
    async rollbackEntityToVersion(entityId: string, versionNumber: number): Promise<BaseEntity> {
        const versioningService = this.getVersioningService();
        if (!versioningService) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }
        return await versioningService.rollbackToVersion(entityId, versionNumber);
    }

    /**
     * Get entities active on a specific date
     * Requires KG_TEMPORAL_QUERIES_ENABLED feature flag to be enabled
     */
    async getEntitiesActiveOnDate(date: string): Promise<BaseEntity[]> {
        const temporalService = this.getTemporalQueryService();
        if (!temporalService) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }
        return await temporalService.getEntitiesActiveOnDate(date);
    }

    /**
     * Get entities effective in a date range
     * Requires KG_TEMPORAL_QUERIES_ENABLED feature flag to be enabled
     */
    async getEntitiesInDateRange(startDate: string, endDate: string): Promise<BaseEntity[]> {
        const temporalService = this.getTemporalQueryService();
        if (!temporalService) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }
        return await temporalService.getEntitiesInDateRange(startDate, endDate);
    }

    /**
     * Get entity history (all versions)
     * Requires KG_TEMPORAL_QUERIES_ENABLED feature flag to be enabled
     */
    async getEntityHistory(entityId: string): Promise<EntityVersion[]> {
        const temporalService = this.getTemporalQueryService();
        if (!temporalService) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }
        return await temporalService.getEntityHistory(entityId);
    }

    /**
     * Get entity state at a specific date
     * Requires KG_TEMPORAL_QUERIES_ENABLED feature flag to be enabled
     */
    async getEntityStateAtDate(entityId: string, date: string): Promise<BaseEntity | null> {
        const temporalService = this.getTemporalQueryService();
        if (!temporalService) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }
        return await temporalService.getEntityStateAtDate(entityId, date);
    }

    /**
     * Compare two versions of an entity
     * Requires KG_TEMPORAL_QUERIES_ENABLED feature flag to be enabled
     */
    async compareEntityVersions(
        entityId: string,
        version1: number,
        version2: number
    ): Promise<{ version1: EntityVersion; version2: EntityVersion; differences: Array<{ field: string; oldValue: unknown; newValue: unknown }> }> {
        const temporalService = this.getTemporalQueryService();
        if (!temporalService) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }
        return await temporalService.compareVersions(entityId, version1, version2);
    }

    /**
     * Validate temporal consistency for an entity by ID
     * Requires KG_TEMPORAL_QUERIES_ENABLED feature flag to be enabled
     */
    async validateTemporalConsistencyById(entityId: string): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
        conflicts: Array<{ entityId: string; version1?: number; version2?: number; reason: string }>;
    }> {
        const temporalService = this.getTemporalQueryService();
        if (!temporalService) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }
        return await temporalService.validateTemporalConsistency(entityId);
    }

    /**
     * Generate diff between two entity versions
     */
    generateVersionDiff(version1: EntityVersion, version2: EntityVersion) {
        return this.versionDiffGenerator.generateDiff(version1, version2);
    }

    /**
     * Extract dependencies from a document
     * Requires KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to be enabled
     */
    async extractDocumentDependencies(
        documentId: string,
        documentText: string,
        documentTitle?: string
    ): Promise<DependencyExtractionResult> {
        const tracker = this.getDocumentDependencyTracker();
        if (!tracker) {
            throw new Error('Document dependency tracking is disabled. Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag.');
        }
        return await tracker.extractDependencies(documentId, documentText, documentTitle);
    }

    /**
     * Store dependencies in the knowledge graph
     * Requires KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to be enabled
     */
    async storeDocumentDependencies(
        dependencies: DocumentDependency[]
    ): Promise<{ stored: number; failed: number; errors: string[] }> {
        const tracker = this.getDocumentDependencyTracker();
        if (!tracker) {
            throw new Error('Document dependency tracking is disabled. Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag.');
        }
        return await tracker.storeDependencies(dependencies);
    }

    /**
     * Get dependencies for a document
     * Requires KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to be enabled
     */
    async getDocumentDependencies(documentId: string): Promise<DependencyQueryResult> {
        const tracker = this.getDocumentDependencyTracker();
        if (!tracker) {
            throw new Error('Document dependency tracking is disabled. Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag.');
        }
        return await tracker.getDependencies(documentId);
    }

    /**
     * Validate dependency integrity
     * Requires KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to be enabled
     */
    async validateDependencyIntegrity(): Promise<{
        valid: number;
        broken: number;
        brokenDependencies: Array<{ sourceId: string; targetId: string }>;
    }> {
        const tracker = this.getDocumentDependencyTracker();
        if (!tracker) {
            throw new Error('Document dependency tracking is disabled. Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag.');
        }
        return await tracker.validateDependencyIntegrity();
    }

    /**
     * Analyze impact of document changes
     * Requires KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to be enabled
     */
    async analyzeDocumentImpact(
        documentId: string,
        maxDepth: number = 3
    ): Promise<ImpactAnalysis> {
        const impactService = this.getImpactAnalysisService();
        if (!impactService) {
            throw new Error('Impact analysis is disabled. Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag.');
        }
        return await impactService.analyzeImpact(documentId, maxDepth);
    }

    /**
     * Generate impact report for a document
     * Requires KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag to be enabled
     */
    async generateImpactReport(
        documentId: string,
        maxDepth: number = 3
    ): Promise<ImpactReport> {
        const impactService = this.getImpactAnalysisService();
        if (!impactService) {
            throw new Error('Impact analysis is disabled. Enable KG_DOCUMENT_DEPENDENCIES_ENABLED feature flag.');
        }
        return await impactService.generateImpactReport(documentId, maxDepth);
    }

    /**
     * Align a single entity with legal ontologies (IMBOR, EuroVoc)
     * Requires KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to be enabled
     */
    async alignEntityWithOntologies(entity: BaseEntity): Promise<EntityAlignment> {
        const alignmentService = this.getOntologyAlignmentService();
        if (!alignmentService) {
            throw new Error('Ontology alignment is disabled. Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
        }
        return await alignmentService.alignEntity(entity);
    }

    /**
     * Align multiple entities with legal ontologies
     * Requires KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to be enabled
     */
    async alignEntitiesWithOntologies(entities: BaseEntity[]): Promise<AlignmentResult> {
        const alignmentService = this.getOntologyAlignmentService();
        if (!alignmentService) {
            throw new Error('Ontology alignment is disabled. Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
        }
        return await alignmentService.alignEntities(entities);
    }

    /**
     * Query entities by ontology terms (IMBOR, EuroVoc)
     * Requires KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to be enabled
     * @param term The ontology term to search for
     * @param ontology The ontology type ('IMBOR' or 'EuroVoc')
     * @param entities The entities to search within
     * @returns Array of entity IDs matching the ontology term
     */
    async queryEntitiesByOntologyTerms(
        term: string,
        ontology: 'IMBOR' | 'EuroVoc',
        entities: BaseEntity[]
    ): Promise<string[]> {
        const alignmentService = this.getOntologyAlignmentService();
        if (!alignmentService) {
            throw new Error('Ontology alignment is disabled. Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
        }
        const matchingEntities = await alignmentService.queryByOntologyTerm(term, ontology, entities);
        return matchingEntities.map(e => e.id);
    }

    /**
     * Validate alignment quality for an entity
     * Requires KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag to be enabled
     */
    validateOntologyAlignment(alignment: OntologyAlignment): {
        isValid: boolean;
        issues: string[];
        suggestions: string[];
    } {
        const alignmentService = this.getOntologyAlignmentService();
        if (!alignmentService) {
            throw new Error('Ontology alignment is disabled. Enable KG_ONTOLOGY_ALIGNMENT_ENABLED feature flag.');
        }
        
        const issues: string[] = [];
        const suggestions: string[] = [];
        
        // Check if alignment has any alignments
        const hasAlignments = (alignment.imborAlignments && alignment.imborAlignments.length > 0) ||
                              (alignment.euroVocAlignments && alignment.euroVocAlignments.length > 0);
        
        if (!hasAlignments) {
            issues.push('No ontology alignments found');
            suggestions.push('Consider checking if the entity has sufficient metadata for alignment');
        }
        
        // Check confidence threshold
        if (alignment.overallConfidence < 0.6) {
            issues.push(`Low alignment confidence: ${alignment.overallConfidence}`);
            suggestions.push('Consider manual review or enriching entity metadata');
        }
        
        // Check if manual review is needed
        if (alignment.needsManualReview) {
            issues.push('Alignment flagged for manual review');
            suggestions.push('Review the alignment quality and confidence scores');
        }
        
        return {
            isValid: issues.length === 0 && !alignment.needsManualReview,
            issues,
            suggestions,
        };
    }

    // ============================================================================
    // Persistence Layer Methods
    // ============================================================================

    /**
     * Get or initialize Cypher query service
     */
    private getCypherQueryService(): CypherQueryService {
        return this.serviceManager.getCypherQueryService();
    }

    /**
     * Get or initialize persistence layer
     */
    private getPersistence(): KnowledgeGraphPersistence {
        if (!this.persistence) {
            // Initialize with default options (no cache)
            this.persistence = new KnowledgeGraphPersistence(this.driver);
        }
        return this.persistence;
    }

    /**
     * Enable persistence layer with caching
     * @param options Persistence options including cache configuration
     */
    enablePersistenceCache(options?: PersistenceOptions): void {
        this.persistence = new KnowledgeGraphPersistence(this.driver, options);
    }

    /**
     * Load entire graph from persistence layer
     * Useful for backup/export operations
     */
    async loadGraph(limit?: number): Promise<{
        entities: BaseEntity[];
        relationships: Relation[];
        stats: {
            entityCount: number;
            relationshipCount: number;
            loadTime: number;
        };
    }> {
        const persistence = this.getPersistence();
        return await persistence.loadGraph(limit);
    }

    /**
     * Save entire graph to persistence layer
     * Useful for restore/import operations
     */
    async saveGraph(entities: BaseEntity[], relationships: Relation[]): Promise<{
        saved: number;
        failed: number;
        errors: string[];
        saveTime: number;
    }> {
        const persistence = this.getPersistence();
        return await persistence.saveGraph(entities, relationships);
    }

    /**
     * Sync cache with Neo4j database
     * Only works if persistence cache is enabled
     */
    async syncCache(): Promise<void> {
        if (this.persistence) {
            await this.persistence.syncCache();
        }
    }

    /**
     * Clear persistence cache
     * Only works if persistence cache is enabled
     */
    clearPersistenceCache(): void {
        if (this.persistence) {
            this.persistence.clearCache();
        }
    }

    /**
     * Get persistence cache statistics
     * Returns null if cache is not enabled
     */
    getPersistenceCacheStats(): { size: number; maxSize: number; hitRate?: number } | null {
        if (this.persistence) {
            return this.persistence.getCacheStats();
        }
        return null;
    }

    // ============================================================================
    // Cypher Query Methods
    // ============================================================================

    /**
     * Validate a Cypher query for safety and correctness
     * @param query The Cypher query to validate
     * @param allowWriteOperations Whether to allow write operations (default: false)
     * @returns Validation result
     */
    validateCypherQuery(query: string, allowWriteOperations: boolean = false): CypherQueryValidationResult {
        const cypherService = this.getCypherQueryService();
        return cypherService.validateQuery(query, allowWriteOperations);
    }

    /**
     * Execute a Cypher query against the knowledge graph
     * @param query The Cypher query to execute
     * @param options Query options
     * @returns Query result
     */
    async executeCypherQuery(query: string, options: CypherQueryOptions = {}): Promise<CypherQueryResult> {
        const cypherService = this.getCypherQueryService();
        return await cypherService.executeQuery(query, options);
    }

    // ============================================================================
    // Inference Methods
    // ============================================================================

    /**
     * Get or initialize the inference engine
     */
    private getInferenceEngine(): GraphInferenceEngine | null {
        return this.serviceManager.getInferenceEngine();
    }

    /**
     * Run inference rules on the knowledge graph
     * Requires KG_REASONING_ENABLED feature flag to be enabled
     * @param options Inference options
     * @returns Inference result with inferred relationships and properties
     */
    async runInference(options: InferenceOptions = {}): Promise<InferenceResult> {
        const inferenceEngine = this.getInferenceEngine();
        if (!inferenceEngine) {
            throw new Error('Inference is disabled. Enable KG_REASONING_ENABLED feature flag.');
        }
        const result = await inferenceEngine.infer(options);
        this.emit('inference-completed', { result, timestamp: new Date() });
        return result;
    }

    /**
     * Query an entity including inferred relationships
     * Requires KG_REASONING_ENABLED feature flag to be enabled
     * @param entityId Entity ID to query
     * @param includeInferred Whether to include inferred relationships (default: true)
     * @returns Entity with relationships (both explicit and inferred)
     */
    async queryEntityWithInference(
        entityId: string,
        includeInferred: boolean = true
    ): Promise<{
        entity: BaseEntity;
        relationships: Array<{
            target: BaseEntity;
            type: RelationType;
            inferred: boolean;
            confidence?: number;
        }>;
    }> {
        const inferenceEngine = this.getInferenceEngine();
        if (!inferenceEngine) {
            throw new Error('Inference is disabled. Enable KG_REASONING_ENABLED feature flag.');
        }
        return await inferenceEngine.queryWithInference(entityId, includeInferred);
    }
}

let _knowledgeGraphService: KnowledgeGraphService | null = null;

export function getKnowledgeGraphService(driver?: Driver): KnowledgeGraphService {
    if (!driver) {
        try {
            driver = getNeo4jDriver();
        } catch (_error) {
            throw new Error(
                'KnowledgeGraphService requires a GraphDB connection. ' +
                'Ensure connectGraphDB() has been called first.'
            );
        }
    }

    if (!_knowledgeGraphService) {
        _knowledgeGraphService = new KnowledgeGraphService(driver);
    }

    return _knowledgeGraphService;
}

// For backward compatibility, export a singleton getter
// NOTE: This is a deprecated Neo4j-based KnowledgeGraphService. GraphDB is the knowledge graph backend.
// Use GraphDBKnowledgeGraphService directly or getKGService() from knowledgeGraphRoutes.ts.
export const knowledgeGraphService = (() => {
    try {
        return getKnowledgeGraphService();
    } catch (_error) {
        return new Proxy({} as KnowledgeGraphService, {
            get() {
                throw new Error(
                    'knowledgeGraphService singleton is not initialized. ' +
                    'NOTE: This is a deprecated Neo4j-based service. GraphDB is the knowledge graph backend. ' +
                    'Use GraphDBKnowledgeGraphService or getKGService() from knowledgeGraphRoutes.ts. ' +
                    'Ensure GraphDB is connected.'
                );
            }
        });
    }
})();
