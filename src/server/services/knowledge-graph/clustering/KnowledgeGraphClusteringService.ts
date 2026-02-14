import { KnowledgeGraphService } from '../core/KnowledgeGraph.js';
import { BaseEntity, EntityType, PolicyDocument, Regulation, RelationType } from '../../../domain/ontology.js';
import { int } from 'neo4j-driver';
import { ChangeSet } from '../maintenance/ChangeSet.js';
import { logger } from '../../../utils/logger.js';

/**
 * Represents a cluster of knowledge graph entities
 */
export interface KnowledgeClusterNode {
    id: string;
    label: string;
    type: 'knowledge-cluster';
    clusterType: 'entity-type' | 'domain' | 'jurisdiction' | 'category' | 'community-wcc';
    level: number;
    nodeCount: number;
    entityIds: string[]; // IDs of entities in this cluster
    representativeEntity?: BaseEntity; // Sample entity for preview
    metadata: {
        entityType?: EntityType;
        domain?: string;
        jurisdiction?: string;
        category?: string;
        algorithm?: string;
    };
}

/**
 * Edge between knowledge graph clusters
 */
export interface KnowledgeMetaEdge {
    source: string;
    target: string;
    weight: number;
    relationTypes: RelationType[]; // Types of relations between clusters
}

/**
 * Meta-graph structure for knowledge graph clustering
 */
export interface KnowledgeMetaGraph {
    clusters: { [id: string]: KnowledgeClusterNode };
    edges: KnowledgeMetaEdge[];
    totalNodes: number;
    totalClusters: number;
    metadata: {
        clusteringStrategy: string;
        entityTypeDistribution: Record<EntityType, number>;
        evaluationMetrics?: {
            algorithm?: string;
            communityCount?: number;
            modularity?: number;
            ranIterations?: number;
            executionTime?: number;
        };
    };
}

/**
 * Options for creating a meta-knowledge-graph
 */
export interface KnowledgeClusteringOptions {
    strategy?: 'entity-type' | 'domain' | 'jurisdiction' | 'community-wcc' | 'hybrid' | 'gds-louvain' | 'gds-lpa' | 'gds-leiden' | 'gds-wcc' | 'gds-infomap' | 'gds-modularity';
    minClusterSize?: number;
    groupByDomain?: boolean; // For hybrid strategy
    groupByJurisdiction?: boolean; // For hybrid strategy
    gdsOptions?: {
        maxIterations?: number;
        tolerance?: number;
        maxLevels?: number;
        consecutiveIds?: boolean;
    };
}

/**
 * Layout algorithm types for visualization
 */
export type KnowledgeLayoutAlgorithm = 'grid' | 'force' | 'circular' | 'hierarchical';

/**
 * Node position for visualization
 */
export interface KnowledgeNodePosition {
    x: number;
    y: number;
}

/**
 * Visualized knowledge cluster node with position
 */
export interface VisualizedKnowledgeClusterNode extends KnowledgeClusterNode {
    position: KnowledgeNodePosition;
}

/**
 * Visualization data for knowledge graph clusters
 */
export interface KnowledgeVisualizationData {
    nodes: VisualizedKnowledgeClusterNode[];
    edges: KnowledgeMetaEdge[];
    totalNodes: number;
    totalClusters: number;
    layout: KnowledgeLayoutAlgorithm;
    bounds: {
        width: number;
        height: number;
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
}

/**
 * Service for clustering knowledge graph entities into meta-graphs
 * to reduce complexity and enable high-level queries.
 * 
 * OPTIMIZED: Uses Cypher queries instead of loading all nodes for better performance.
 * Supports both custom clustering and Neo4j GDS community detection algorithms.
 */
export class KnowledgeGraphClusteringService {
    private knowledgeGraph: KnowledgeGraphService;
    private metaGraphCache: Map<string, KnowledgeMetaGraph> = new Map();
    private gdsClusteringService: import('./KnowledgeGraphGDSClusteringService.js').KnowledgeGraphGDSClusteringService | null = null;

    constructor(knowledgeGraph: KnowledgeGraphService) {
        this.knowledgeGraph = knowledgeGraph;
    }

    /**
     * Get or create GDS clustering service (lazy initialization)
     */
    private async getGDSClusteringService(): Promise<import('./KnowledgeGraphGDSClusteringService.js').KnowledgeGraphGDSClusteringService | null> {
        if (this.gdsClusteringService) {
            return this.gdsClusteringService;
        }

        try {
            const { getNeo4jDriver } = await import('../../../config/neo4j.js');
            const { KnowledgeGraphGDSClusteringService } = await import('./KnowledgeGraphGDSClusteringService.js');
            const driver = getNeo4jDriver();

            // Check if GDS is available
            const gdsService = new KnowledgeGraphGDSClusteringService(driver, this.knowledgeGraph);
            const isAvailable = await gdsService.isGDSAvailable();

            if (isAvailable) {
                this.gdsClusteringService = gdsService;
                return gdsService;
            } else {
                logger.warn('GDS plugin not available, falling back to custom clustering');
                return null;
            }
        } catch (error) {
            logger.warn({ error }, 'Could not initialize GDS service');
            return null;
        }
    }

    /**
     * Create a meta-graph by clustering knowledge graph entities
     * OPTIMIZED: Uses Cypher queries for efficient clustering
     */
    async createMetaGraph(options: KnowledgeClusteringOptions = {}): Promise<KnowledgeMetaGraph> {
        const {
            strategy = 'gds-louvain', // Default to GDS Louvain for better community detection
            minClusterSize = 3,
            groupByDomain = true,
            groupByJurisdiction = true
        } = options;

        // Check cache first
        const cacheKey = `${strategy}-${minClusterSize}-${groupByDomain}-${groupByJurisdiction}`;
        if (this.metaGraphCache.has(cacheKey)) {
            logger.debug({ cacheKey, strategy, minClusterSize, groupByDomain, groupByJurisdiction }, 'Returning cached meta-graph');
            return this.metaGraphCache.get(cacheKey)!;
        }

        logger.info({ strategy, minClusterSize, groupByDomain, groupByJurisdiction }, 'Computing meta-graph');
        const startTime = Date.now();

        // Get entity type distribution efficiently via Cypher
        const typeDistribution = await this.knowledgeGraph.getEntityTypeDistribution();
        const totalNodes = Object.values(typeDistribution).reduce((sum, count) => sum + count, 0);

        let clusters: { [id: string]: KnowledgeClusterNode } = {};

        // Check if GDS strategy is requested (or default)
        if (strategy.startsWith('gds-') || strategy === 'gds-louvain') {
            const gdsService = await this.getGDSClusteringService();
            if (gdsService) {
                try {
                    const algorithm = strategy.replace('gds-', '') as 'louvain' | 'lpa' | 'leiden' | 'wcc' | 'infomap' | 'modularity';
                    const gdsOptions = options.gdsOptions || {};

                    const metaGraph = await gdsService.buildMetaGraphFromCommunities(
                        algorithm,
                        minClusterSize,
                        gdsOptions
                    );

                    // Cache and return
                    this.metaGraphCache.set(cacheKey, metaGraph);
                    logger.info({ algorithm, cacheKey }, 'Using GDS clustering');
                    return metaGraph;
                } catch (error) {
                    const algorithm = strategy.replace('gds-', '') as 'louvain' | 'lpa' | 'leiden' | 'wcc' | 'infomap' | 'modularity';
                    logger.warn({ error, algorithm }, 'GDS clustering failed, falling back to custom');
                    // Fall through to custom clustering
                }
            } else {
                logger.warn('GDS not available, using custom clustering');
                // Fall through to custom clustering
            }
        }

        // Use custom clustering strategies
        switch (strategy) {
            case 'entity-type':
                clusters = await this.clusterByEntityTypeOptimized(typeDistribution, minClusterSize);
                break;
            case 'domain':
                clusters = await this.clusterByDomainOptimized(minClusterSize);
                break;
            case 'jurisdiction':
                clusters = await this.clusterByJurisdictionOptimized(minClusterSize);
                break;
            case 'hybrid':
                clusters = await this.clusterHybridOptimized(typeDistribution, minClusterSize, groupByDomain, groupByJurisdiction);
                break;
        }

        // Calculate edges between clusters efficiently
        const edges = await this.calculateClusterEdgesOptimized(clusters);

        // Debug: Verify clusters have entityIds after calculateClusterEdgesOptimized
        const clusterIds = Object.keys(clusters);
        const clustersWithoutEntityIds: string[] = [];
        for (const clusterId of clusterIds) {
            const cluster = clusters[clusterId];
            if (cluster.metadata.entityType && cluster.entityIds.length === 0) {
                clustersWithoutEntityIds.push(clusterId);
            }
        }
        if (clustersWithoutEntityIds.length > 0) {
            // Use logger.error to ensure it shows up
            logger.error({
                clustersWithoutEntityIds,
                totalClusters: clusterIds.length
            }, 'Clusters missing entityIds after calculateClusterEdgesOptimized');
        }

        const metaGraph: KnowledgeMetaGraph = {
            clusters,
            edges,
            totalNodes,
            totalClusters: Object.keys(clusters).length,
            metadata: {
                clusteringStrategy: strategy,
                entityTypeDistribution: typeDistribution as Record<EntityType, number>
            }
        };

        // Cache the result
        this.metaGraphCache.set(cacheKey, metaGraph);

        // Apply semantic labels if enabled
        const labeledMetaGraph = await this.applySemanticLabels(metaGraph);

        const elapsed = Date.now() - startTime;
        logger.info({
            elapsed,
            clusterCount: Object.keys(clusters).length,
            edgeCount: edges.length,
            strategy,
            cacheKey,
        }, 'Computed meta-graph');

        return labeledMetaGraph;
    }

    /**
     * Cluster by entity type (OPTIMIZED: Uses Cypher)
     */
    private async clusterByEntityTypeOptimized(
        typeDistribution: Record<string, number>,
        minClusterSize: number
    ): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        let clusterIndex = 0;

        for (const [entityType, count] of Object.entries(typeDistribution)) {
            if (count < minClusterSize) continue;

            // Get a sample entity for this type
            const sampleEntities = await this.knowledgeGraph.getEntitiesByType(entityType as EntityType, 1);
            const representative = sampleEntities[0];

            const clusterId = `type_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: this.getEntityTypeLabel(entityType as EntityType),
                type: 'knowledge-cluster',
                clusterType: 'entity-type',
                level: 1,
                nodeCount: count,
                entityIds: [], // Will be populated on-demand if needed
                representativeEntity: representative,
                metadata: {
                    entityType: entityType as EntityType
                }
            };
        }

        return clusters;
    }

    /**
     * Cluster by domain (OPTIMIZED: Uses Cypher)
     * 
     * Recommendation: Use Cypher queries instead of loading all nodes into memory.
     * This scales to much larger graphs.
     */
    private async clusterByDomainOptimized(minClusterSize: number): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const session = this.knowledgeGraph['driver'].session();
        const clusters: { [id: string]: KnowledgeClusterNode } = {};

        try {
            // Use Cypher to group nodes by domain property efficiently
            // Parse JSON metadata string to extract domain (works without APOC)
            // Try multiple patterns to match domain values in JSON string
            const result = await session.run(
                `
                MATCH (e:Entity)
                WHERE e.metadata IS NOT NULL 
                  AND (e.metadata CONTAINS '"domain"' OR e.metadata CONTAINS 'domain')
                WITH e, e.metadata AS metadataStr
                // Extract domain using string matching (works without APOC)
                // Check for domain value patterns: "domain":"value" or "domain":"value"
                WITH e, 
                     CASE 
                       WHEN metadataStr CONTAINS '"ruimtelijke ordening"' OR metadataStr CONTAINS 'ruimtelijke ordening' THEN 'ruimtelijke ordening'
                       WHEN metadataStr CONTAINS '"milieu"' OR metadataStr CONTAINS 'milieu' THEN 'milieu'
                       WHEN metadataStr CONTAINS '"water"' OR metadataStr CONTAINS 'water' THEN 'water'
                       WHEN metadataStr CONTAINS '"natuur"' OR metadataStr CONTAINS 'natuur' THEN 'natuur'
                       WHEN metadataStr CONTAINS '"verkeer"' OR metadataStr CONTAINS 'verkeer' THEN 'verkeer'
                       WHEN metadataStr CONTAINS '"wonen"' OR metadataStr CONTAINS 'wonen' THEN 'wonen'
                       WHEN metadataStr CONTAINS '"economie"' OR metadataStr CONTAINS 'economie' THEN 'economie'
                       WHEN metadataStr CONTAINS '"cultuur"' OR metadataStr CONTAINS 'cultuur' THEN 'cultuur'
                       WHEN metadataStr CONTAINS '"onderwijs"' OR metadataStr CONTAINS 'onderwijs' THEN 'onderwijs'
                       WHEN metadataStr CONTAINS '"gezondheid"' OR metadataStr CONTAINS 'gezondheid' THEN 'gezondheid'
                       WHEN metadataStr CONTAINS '"energie"' OR metadataStr CONTAINS 'energie' THEN 'energie'
                       WHEN metadataStr CONTAINS '"klimaat"' OR metadataStr CONTAINS 'klimaat' THEN 'klimaat'
                       WHEN metadataStr CONTAINS '"bodem"' OR metadataStr CONTAINS 'bodem' THEN 'bodem'
                       WHEN metadataStr CONTAINS '"geluid"' OR metadataStr CONTAINS 'geluid' THEN 'geluid'
                       WHEN metadataStr CONTAINS '"lucht"' OR metadataStr CONTAINS 'lucht' THEN 'lucht'
                       WHEN metadataStr CONTAINS '"afval"' OR metadataStr CONTAINS 'afval' THEN 'afval'
                       ELSE NULL
                     END AS domain
                WHERE domain IS NOT NULL
                WITH domain, collect(e.id) AS entityIds, count(e) AS count
                WHERE count >= $minClusterSize
                RETURN domain, entityIds, count
                ORDER BY count DESC
                `,
                { minClusterSize: int(minClusterSize) }
            );

            const records = result.records;
            let clusterIndex = 0;

            for (const record of records) {
                const domain = record.get('domain');
                const entityIds = record.get('entityIds') as string[];
                const countValue = record.get('count');
                const count = countValue?.toNumber() ?? 0;

                // Get a representative entity
                const representative = entityIds.length > 0
                    ? await this.knowledgeGraph.getNode(entityIds[0])
                    : undefined;

                const clusterId = `domain_cluster_${clusterIndex++}`;
                clusters[clusterId] = {
                    id: clusterId,
                    label: this.generateDomainLabel(domain, count),
                    type: 'knowledge-cluster',
                    clusterType: 'domain',
                    level: 1,
                    nodeCount: count,
                    entityIds: entityIds,
                    representativeEntity: representative,
                    metadata: {
                        domain
                    }
                };
            }
        } catch (error) {
            logger.error({ error }, 'Error in clusterByDomainOptimized');
            // Fallback to loading nodes if Cypher query fails
            logger.warn('Falling back to loading nodes with domains');
            // Optimized fallback: load only relevant nodes without edges
            const nodesWithDomain = await this.getNodesWithDomainsFallback(10000);
            return this.clusterByDomain(nodesWithDomain, minClusterSize);
        } finally {
            await session.close();
        }

        return clusters;
    }

    /**
     * Fallback for loading nodes with potential domains
     */
    private async getNodesWithDomainsFallback(limit: number): Promise<BaseEntity[]> {
        // Use executeCypherQuery to avoid direct session management
        // Note: CypherQueryService handles parameter escaping and basic validation
        const query = `
            MATCH (e:Entity)
            WHERE e.metadata IS NOT NULL
              AND (e.metadata CONTAINS '"domain"' OR e.metadata CONTAINS 'domain')
            RETURN e
        `;

        try {
            const result = await this.knowledgeGraph.executeCypherQuery(query, {
                limit // Pass limit to executeCypherQuery which appends LIMIT clause
            });

            return result.records.map(record => {
                // CypherQueryService returns records as plain objects where keys are return variables
                // In this case, 'e' is the node
                const node = record.e as any;

                // CypherQueryService converts Neo4j nodes to objects:
                // { id: ..., labels: ..., properties: ... }
                // So we access properties
                const properties = node.properties || {};
                let metadata = properties.metadata;

                if (typeof metadata === 'string') {
                    try {
                        metadata = JSON.parse(metadata);
                    } catch (e) {
                        logger.warn({ error: e, nodeId: properties.id }, 'Failed to parse metadata in fallback');
                        metadata = {};
                    }
                }

                return {
                    id: properties.id,
                    name: properties.name || '',
                    type: properties.type,
                    description: properties.description,
                    uri: properties.uri,
                    schemaType: properties.schemaType,
                    metadata: metadata || {}
                } as BaseEntity;
            });
        } catch (error) {
            logger.error({ error }, 'Error executing fallback query');
            // Return empty array on error to allow graceful degradation
            return [];
        }
    }

    /**
     * Cluster by jurisdiction (OPTIMIZED: Uses Cypher)
     */
    private async clusterByJurisdictionOptimized(minClusterSize: number): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        const distribution = await this.knowledgeGraph.getJurisdictionDistribution();

        let clusterIndex = 0;
        for (const [jurisdiction, data] of Object.entries(distribution)) {
            if (data.count < minClusterSize) continue;

            // Get a representative entity if we have IDs
            const representative = data.entityIds.length > 0
                ? await this.knowledgeGraph.getNode(data.entityIds[0])
                : undefined;

            const clusterId = `jurisdiction_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: jurisdiction,
                type: 'knowledge-cluster',
                clusterType: 'jurisdiction',
                level: 1,
                nodeCount: data.count,
                entityIds: data.entityIds,
                representativeEntity: representative,
                metadata: {
                    jurisdiction
                }
            };
        }

        return clusters;
    }

    /**
     * Hybrid clustering (OPTIMIZED: Uses Cypher where possible)
     */
    private async clusterHybridOptimized(
        typeDistribution: Record<string, number>,
        minClusterSize: number,
        groupByDomain: boolean,
        groupByJurisdiction: boolean
    ): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};

        // Start with entity-type clusters
        const entityTypeClusters = await this.clusterByEntityTypeOptimized(typeDistribution, minClusterSize);
        Object.assign(clusters, entityTypeClusters);

        // Add domain clusters if enabled (these are the "semantic labels")
        if (groupByDomain) {
            const domainClusters = await this.clusterByDomainOptimized(minClusterSize);
            Object.assign(clusters, domainClusters);
        }

        // Add jurisdiction clusters if enabled
        if (groupByJurisdiction) {
            const jurisdictionClusters = await this.clusterByJurisdictionOptimized(minClusterSize);
            Object.assign(clusters, jurisdictionClusters);
        }

        return clusters;
    }

    /**
     * Calculate edges between clusters (OPTIMIZED: Uses Cypher)
     * Now properly extracts relationship types and counts actual relationships
     */
    private async calculateClusterEdgesOptimized(
        clusters: { [id: string]: KnowledgeClusterNode }
    ): Promise<KnowledgeMetaEdge[]> {
        // Force debug output to stderr
        process.stderr.write(`[DEBUG] calculateClusterEdgesOptimized called with ${Object.keys(clusters).length} clusters\n`);
        const edges: KnowledgeMetaEdge[] = [];
        const clusterArray = Object.values(clusters);

        // Build entity-to-cluster mapping efficiently using Cypher
        const entityToClusters = new Map<string, string[]>();

        // For each cluster, get its entities
        for (const cluster of clusterArray) {
            let entityIds: string[] = cluster.entityIds || [];
            logger.debug({
                clusterId: cluster.id,
                entityIdsLength: entityIds.length,
                entityType: cluster.metadata.entityType,
            }, 'calculateClusterEdgesOptimized: processing cluster');

            // If entityIds not populated (e.g. legacy or entity-type clusters), fetch them
            if (entityIds.length === 0) {
                logger.debug({ clusterId: cluster.id }, 'entityIds is empty, fetching entities for cluster');
                if (cluster.metadata.entityType) {
                    // Get all entities of this type
                    const entities = await this.knowledgeGraph.getEntitiesByType(cluster.metadata.entityType, 10000);
                    // Debug: log entity structure
                    logger.debug({
                        clusterId: cluster.id,
                        entityType: cluster.metadata.entityType,
                        entityCount: entities.length,
                        firstEntityId: entities[0]?.id,
                        firstEntityKeys: entities[0] ? Object.keys(entities[0]) : undefined,
                    }, 'Fetched entities for cluster type');
                    entityIds = entities.map(e => e.id).filter((id): id is string => id !== undefined);
                    logger.debug({
                        clusterId: cluster.id,
                        entityIdsCount: entityIds.length,
                    }, 'Mapped entityIds for cluster');
                    // Assign populated entityIds back to cluster
                    cluster.entityIds = entityIds;
                    logger.debug({
                        clusterId: cluster.id,
                        assignedEntityIdsCount: cluster.entityIds.length,
                    }, 'Assigned entityIds to cluster');
                } else if (cluster.metadata.jurisdiction) {
                    // Should be populated by clusterByJurisdictionOptimized, but fallback if not
                    const allPolicyDocs = await this.knowledgeGraph.getEntitiesByType('PolicyDocument', 10000);
                    entityIds = allPolicyDocs
                        .filter(doc => {
                            const pd = doc as PolicyDocument;
                            return pd.jurisdiction === cluster.metadata.jurisdiction;
                        })
                        .map(doc => doc.id)
                        .filter((id): id is string => id !== undefined);
                    // Assign populated entityIds back to cluster
                    cluster.entityIds = entityIds;
                }
            }

            // Map entities to cluster
            for (const entityId of entityIds) {
                if (!entityToClusters.has(entityId)) {
                    entityToClusters.set(entityId, []);
                }
                entityToClusters.get(entityId)!.push(cluster.id);
            }
        }

        // Now calculate edges between clusters by querying actual relationships
        const clusterEdgeMap = new Map<string, { count: number; types: Set<RelationType> }>();

        // Use KnowledgeGraphService method to efficiently get relationships
        try {
            const entityIds = Array.from(entityToClusters.keys());
            const relationships = await this.knowledgeGraph.getRelationshipsBetweenEntities(entityIds);

            for (const rel of relationships) {
                const sourceClusters = entityToClusters.get(rel.sourceId) || [];
                const targetClusters = entityToClusters.get(rel.targetId) || [];

                // Create edges between all cluster pairs
                for (const sourceCluster of sourceClusters) {
                    for (const targetCluster of targetClusters) {
                        if (sourceCluster !== targetCluster) {
                            const key = `${sourceCluster}->${targetCluster}`;
                            if (!clusterEdgeMap.has(key)) {
                                clusterEdgeMap.set(key, { count: 0, types: new Set() });
                            }
                            const edgeData = clusterEdgeMap.get(key)!;
                            edgeData.count++;
                            edgeData.types.add(rel.type);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error({ error }, 'Error calculating cluster edges');
            return this.calculateClusterEdgesFallback(clusters, entityToClusters);
        }

        // Convert to KnowledgeMetaEdge array
        clusterEdgeMap.forEach((edgeData, key) => {
            const [source, target] = key.split('->');
            edges.push({
                source,
                target,
                weight: edgeData.count,
                relationTypes: Array.from(edgeData.types)
            });
        });

        return edges;
    }

    /**
     * Fallback edge calculation using snapshot
     */
    private async calculateClusterEdgesFallback(
        clusters: { [id: string]: KnowledgeClusterNode },
        entityToClusters: Map<string, string[]>
    ): Promise<KnowledgeMetaEdge[]> {
        const snapshot = await this.knowledgeGraph.getGraphSnapshot(10000);
        const clusterEdgeMap = new Map<string, { count: number; types: Set<RelationType> }>();

        snapshot.edges.forEach(edge => {
            const sourceClusters = entityToClusters.get(edge.sourceId) || [];
            const targetClusters = entityToClusters.get(edge.targetId) || [];

            sourceClusters.forEach(sourceCluster => {
                targetClusters.forEach(targetCluster => {
                    if (sourceCluster !== targetCluster) {
                        const key = `${sourceCluster}->${targetCluster}`;
                        if (!clusterEdgeMap.has(key)) {
                            clusterEdgeMap.set(key, { count: 0, types: new Set() });
                        }
                        const edgeData = clusterEdgeMap.get(key)!;
                        edgeData.count++;
                        edgeData.types.add(edge.type);
                    }
                });
            });
        });

        const edges: KnowledgeMetaEdge[] = [];
        clusterEdgeMap.forEach((edgeData, key) => {
            const [source, target] = key.split('->');
            edges.push({
                source,
                target,
                weight: edgeData.count,
                relationTypes: Array.from(edgeData.types)
            });
        });

        return edges;
    }

    /**
     * Get entity type label (Dutch)
     */
    private getEntityTypeLabel(type: EntityType): string {
        const labels: Record<EntityType, string> = {
            PolicyDocument: 'Beleidsdocumenten',
            Regulation: 'Regelgeving',
            SpatialUnit: 'Ruimtelijke Eenheden',
            LandUse: 'Gebruiksfuncties',
            Requirement: 'Eisen',
            Concept: 'Concepten'
        };
        return labels[type] || type;
    }

    /**
     * Legacy methods (kept for compatibility, but will load nodes)
     */
    private clusterByEntityType(nodes: BaseEntity[], minClusterSize: number): { [id: string]: KnowledgeClusterNode } {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        const typeMap = new Map<EntityType, BaseEntity[]>();

        nodes.forEach(node => {
            if (!typeMap.has(node.type)) {
                typeMap.set(node.type, []);
            }
            typeMap.get(node.type)!.push(node);
        });

        let clusterIndex = 0;
        for (const [type, entities] of typeMap.entries()) {
            if (entities.length < minClusterSize) continue;

            const clusterId = `type_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: this.getEntityTypeLabel(type),
                type: 'knowledge-cluster',
                clusterType: 'entity-type',
                level: 1,
                nodeCount: entities.length,
                entityIds: entities.map(e => e.id),
                representativeEntity: entities[0],
                metadata: {
                    entityType: type
                }
            };
        }

        return clusters;
    }

    private clusterByDomain(nodes: BaseEntity[], minClusterSize: number): { [id: string]: KnowledgeClusterNode } {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        const domainMap = new Map<string, BaseEntity[]>();

        nodes.forEach(node => {
            const domain = this.extractDomain(node);
            // Only cluster nodes with valid domains (skip undefined/unknown)
            if (domain && domain !== 'unknown') {
                if (!domainMap.has(domain)) {
                    domainMap.set(domain, []);
                }
                domainMap.get(domain)!.push(node);
            }
        });

        let clusterIndex = 0;
        for (const [domain, entities] of domainMap.entries()) {
            if (entities.length < minClusterSize) continue;

            const clusterId = `domain_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: this.generateDomainLabel(domain, entities.length),
                type: 'knowledge-cluster',
                clusterType: 'domain',
                level: 1,
                nodeCount: entities.length,
                entityIds: entities.map(e => e.id),
                representativeEntity: entities[0],
                metadata: {
                    domain
                }
            };
        }

        return clusters;
    }

    private clusterByJurisdiction(nodes: BaseEntity[], minClusterSize: number): { [id: string]: KnowledgeClusterNode } {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        const jurisdictionMap = new Map<string, BaseEntity[]>();

        nodes.forEach(node => {
            const jurisdiction = this.extractJurisdiction(node);
            if (!jurisdictionMap.has(jurisdiction)) {
                jurisdictionMap.set(jurisdiction, []);
            }
            jurisdictionMap.get(jurisdiction)!.push(node);
        });

        let clusterIndex = 0;
        for (const [jurisdiction, entities] of jurisdictionMap.entries()) {
            if (entities.length < minClusterSize) continue;

            const clusterId = `jurisdiction_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: jurisdiction,
                type: 'knowledge-cluster',
                clusterType: 'jurisdiction',
                level: 1,
                nodeCount: entities.length,
                entityIds: entities.map(e => e.id),
                representativeEntity: entities[0],
                metadata: {
                    jurisdiction
                }
            };
        }

        return clusters;
    }

    private clusterHybrid(
        nodes: BaseEntity[],
        minClusterSize: number,
        groupByDomain: boolean,
        groupByJurisdiction: boolean
    ): { [id: string]: KnowledgeClusterNode } {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};

        // Start with entity-type clusters
        const entityTypeClusters = this.clusterByEntityType(nodes, minClusterSize);
        Object.assign(clusters, entityTypeClusters);

        // Add domain clusters if enabled
        if (groupByDomain) {
            const domainClusters = this.clusterByDomain(nodes, minClusterSize);
            Object.assign(clusters, domainClusters);
        }

        // Add jurisdiction clusters if enabled
        if (groupByJurisdiction) {
            const jurisdictionClusters = this.clusterByJurisdiction(nodes, minClusterSize);
            Object.assign(clusters, jurisdictionClusters);
        }

        return clusters;
    }

    private calculateClusterEdges(
        clusters: { [id: string]: KnowledgeClusterNode },
        allEdges: Array<{ sourceId: string; targetId: string; type: RelationType }>
    ): KnowledgeMetaEdge[] {
        const edges: KnowledgeMetaEdge[] = [];
        const clusterArray = Object.values(clusters);

        // Build entity-to-cluster mapping
        const entityToCluster = new Map<string, string[]>();
        clusterArray.forEach(cluster => {
            cluster.entityIds.forEach(entityId => {
                if (!entityToCluster.has(entityId)) {
                    entityToCluster.set(entityId, []);
                }
                entityToCluster.get(entityId)!.push(cluster.id);
            });
        });

        // Count edges between clusters
        const clusterEdgeMap = new Map<string, { count: number; types: Set<RelationType> }>();

        allEdges.forEach(edge => {
            const sourceClusters = entityToCluster.get(edge.sourceId) || [];
            const targetClusters = entityToCluster.get(edge.targetId) || [];

            sourceClusters.forEach(sourceCluster => {
                targetClusters.forEach(targetCluster => {
                    if (sourceCluster !== targetCluster) {
                        const key = `${sourceCluster}->${targetCluster}`;
                        if (!clusterEdgeMap.has(key)) {
                            clusterEdgeMap.set(key, { count: 0, types: new Set() });
                        }
                        const edgeData = clusterEdgeMap.get(key)!;
                        edgeData.count++;
                        edgeData.types.add(edge.type);
                    }
                });
            });
        });

        // Convert to KnowledgeMetaEdge array
        clusterEdgeMap.forEach((edgeData, key) => {
            const [source, target] = key.split('->');
            edges.push({
                source,
                target,
                weight: edgeData.count,
                relationTypes: Array.from(edgeData.types)
            });
        });

        return edges;
    }

    /**
     * Get all entities in a specific cluster
     */
    async getClusterEntities(clusterId: string, metaGraph: KnowledgeMetaGraph): Promise<BaseEntity[]> {
        const cluster = metaGraph.clusters[clusterId];
        if (!cluster) {
            return [];
        }

        // If cluster has entityIds, fetch them
        if (cluster.entityIds.length > 0) {
            const entities: BaseEntity[] = [];
            for (const entityId of cluster.entityIds) {
                const entity = await this.knowledgeGraph.getNode(entityId);
                if (entity) {
                    entities.push(entity);
                }
            }
            return entities;
        }

        // Otherwise, fetch based on cluster metadata
        if (cluster.metadata.entityType) {
            // Entity-type cluster: fetch all entities of this type
            return await this.knowledgeGraph.getEntitiesByType(cluster.metadata.entityType, 10000);
        }

        // For domain clusters, fetch all entities with matching domain metadata
        if (cluster.metadata.domain) {
            const domain = cluster.metadata.domain;
            // Get all entities and filter by domain
            const snapshot = await this.knowledgeGraph.getGraphSnapshot(10000);
            return snapshot.nodes.filter(node => {
                const nodeDomain = this.extractDomain(node);
                return nodeDomain === domain;
            });
        }

        // For jurisdiction clusters, fetch PolicyDocuments with that jurisdiction
        if (cluster.metadata.jurisdiction) {
            const allPolicyDocs = await this.knowledgeGraph.getEntitiesByType('PolicyDocument', 10000);
            return allPolicyDocs.filter(doc => {
                const pd = doc as PolicyDocument;
                return pd.jurisdiction === cluster.metadata.jurisdiction;
            });
        }

        return [];
    }

    /**
     * Extract domain from entity metadata
     * 
     * Recommendation: Removed URI parsing fallback to avoid incorrect domain assignments.
     * Domain should be set during entity creation via domain classification.
     */
    private extractDomain(node: BaseEntity): string | undefined {
        if (node.metadata?.domain) {
            return node.metadata.domain as string;
        }
        // No fallback - return undefined if domain is not set
        // This prevents incorrect domain assignments from URI parsing
        return undefined;
    }

    /**
     * Extract jurisdiction from entity
     */
    private extractJurisdiction(node: BaseEntity): string {
        if (node.type === 'PolicyDocument') {
            const pd = node as PolicyDocument;
            return pd.jurisdiction || 'unknown';
        }
        if (node.metadata?.jurisdiction) {
            return node.metadata.jurisdiction as string;
        }
        return 'unknown';
    }

    /**
     * Generate domain label
     */
    private generateDomainLabel(domain: string, count: number): string {
        return `${domain} (${count})`;
    }

    /**
     * Apply semantic labels to clusters using SemanticCommunityLabeler
     * This replaces structural cluster IDs with meaningful semantic labels
     * 
     * @param metaGraph Meta-graph to apply labels to
     * @param options Options for label application
     * @param options.useHierarchical Whether to build hierarchical label structure (default: false)
     * @returns Meta-graph with semantic labels applied
     */
    async applySemanticLabels(
        metaGraph: KnowledgeMetaGraph,
        options: { useHierarchical?: boolean } = {}
    ): Promise<KnowledgeMetaGraph> {
        // Check if semantic labeling is enabled
        const { FeatureFlag, KGFeatureFlag } = await import('../../../models/FeatureFlag.js');
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED, false)) {
            return metaGraph; // Return unchanged if disabled
        }

        try {
            const { SemanticCommunityLabeler } = await import('../../graphrag/SemanticCommunityLabeler.js');
            const labeler = new SemanticCommunityLabeler(this, this.knowledgeGraph);

            // Get all clusters
            const clusters = Object.values(metaGraph.clusters);

            // Generate labels for all clusters (batch processing)
            const labelingResults = await labeler.generateLabelsBatch(clusters, {
                skipExisting: true,
            });

            // Update cluster labels with semantic labels
            let successCount = 0;
            let cachedCount = 0;
            for (const result of labelingResults) {
                if (result.label) {
                    const cluster = metaGraph.clusters[result.clusterId];
                    if (cluster) {
                        cluster.label = result.label;
                        if (result.cached) {
                            cachedCount++;
                        } else {
                            successCount++;
                        }
                    }
                }
            }

            logger.info({
                successCount,
                cachedCount,
            }, 'Applied semantic labels');

            // Optionally build hierarchical structure from labels
            if (options.useHierarchical) {
                try {
                    const { semanticLabelingService } = await import('../../semantic/SemanticLabelingService.js');
                    await semanticLabelingService.buildHierarchicalStructure(3);
                    logger.info('Built hierarchical label structure');
                } catch (error) {
                    logger.warn({ error }, 'Failed to build hierarchical structure');
                }
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to apply semantic labels');
            // Return unchanged on error
        }

        return metaGraph;
    }

    /**
     * Clear the cache
     */
    clearCache(): void {
        this.metaGraphCache.clear();
    }

    /**
     * Update meta-graph incrementally based on entity and relationship changes
     * This method is more efficient than recomputing the entire clustering
     * 
     * @param changeSet - Change set containing entity and relationship changes
     * @param existingMetaGraph - Current meta-graph to update
     * @param options - Clustering options (must match existing meta-graph options)
     * @returns Updated meta-graph
     */
    async updateMetaGraphIncremental(
        changeSet: ChangeSet,
        existingMetaGraph: KnowledgeMetaGraph,
        options: KnowledgeClusteringOptions = {}
    ): Promise<KnowledgeMetaGraph> {
        const startTime = Date.now();
        logger.info({
            newEntities: changeSet.newEntities.length,
            updatedEntities: changeSet.updatedEntities.length,
            deletedEntities: changeSet.deletedEntities.length,
        }, 'Updating meta-graph incrementally');

        // Create a copy of the existing meta-graph to modify
        const updatedMetaGraph: KnowledgeMetaGraph = {
            ...existingMetaGraph,
            clusters: { ...existingMetaGraph.clusters },
            edges: [...existingMetaGraph.edges]
        };

        const strategy = options.strategy || existingMetaGraph.metadata.clusteringStrategy || 'gds-louvain';
        const minClusterSize = options.minClusterSize || 3;

        // For GDS strategies, use optimized incremental update by re-running algorithm
        if (strategy.startsWith('gds-')) {
            // Check if we have significant changes that warrant re-running the algorithm
            const totalChanges = changeSet.newEntities.length + changeSet.updatedEntities.length +
                changeSet.deletedEntities.length + changeSet.newRelationships.length +
                changeSet.deletedRelationships.length;

            if (totalChanges > 0) {
                // Re-run GDS algorithm on updated graph
                return await this.updateGDSMetaGraphIncremental(changeSet, existingMetaGraph, options);
            }

            // No changes, return existing meta-graph
            return existingMetaGraph;
        }

        // For non-GDS strategies, use existing incremental update logic
        // Handle entity deletions first (removes entities from clusters)
        for (const deletedEntity of changeSet.deletedEntities) {
            await this.handleEntityDeletion(deletedEntity, updatedMetaGraph, strategy, minClusterSize);
        }

        // Handle entity updates (may move entities between clusters)
        for (const updatedEntity of changeSet.updatedEntities) {
            if (updatedEntity.newValue) {
                await this.handleEntityUpdate(updatedEntity, updatedMetaGraph, strategy, minClusterSize, options);
            }
        }

        // Handle new entities (adds entities to appropriate clusters)
        for (const newEntity of changeSet.newEntities) {
            if (newEntity.newValue) {
                await this.handleEntityAddition(newEntity, updatedMetaGraph, strategy, minClusterSize, options);
            }
        }

        // Update cluster edges based on relationship changes
        if (changeSet.newRelationships.length > 0 || changeSet.deletedRelationships.length > 0) {
            await this.updateClusterEdgesFromRelationships(
                changeSet,
                updatedMetaGraph
            );
        }

        // Recalculate cluster statistics
        this.recalculateClusterStatistics(updatedMetaGraph);

        // Re-validate clusters (remove clusters below minClusterSize)
        this.validateClusterSizes(updatedMetaGraph, minClusterSize);

        // Update cache
        const cacheKey = `${strategy}-${minClusterSize}-${options.groupByDomain || false}-${options.groupByJurisdiction || false}`;
        this.metaGraphCache.set(cacheKey, updatedMetaGraph);

        const elapsed = Date.now() - startTime;
        logger.info({ elapsed }, 'Incremental update completed');

        return updatedMetaGraph;
    }

    /**
     * Handle entity deletion - remove entity from clusters
     */
    private async handleEntityDeletion(
        deletedEntity: { entityId: string },
        metaGraph: KnowledgeMetaGraph,
        strategy: string,
        minClusterSize: number
    ): Promise<void> {
        // Find all clusters containing this entity
        const affectedClusters: string[] = [];

        for (const [clusterId, cluster] of Object.entries(metaGraph.clusters)) {
            // Check if entity is in cluster's entityIds array
            if (cluster.entityIds.includes(deletedEntity.entityId)) {
                affectedClusters.push(clusterId);
                // Remove entity from cluster
                cluster.entityIds = cluster.entityIds.filter(id => id !== deletedEntity.entityId);
                cluster.nodeCount = Math.max(0, cluster.nodeCount - 1);
            } else {
                // For clusters without explicit entityIds (like entity-type clusters),
                // we check based on metadata
                if (cluster.metadata.entityType) {
                    // Entity-type cluster - removal will be handled by recounting later
                    affectedClusters.push(clusterId);
                } else if (cluster.metadata.domain) {
                    // Domain cluster - need to check if entity belonged
                    const entity = await this.knowledgeGraph.getNode(deletedEntity.entityId);
                    if (entity) {
                        const entityDomain = this.extractDomain(entity);
                        if (entityDomain === cluster.metadata.domain) {
                            affectedClusters.push(clusterId);
                            cluster.nodeCount = Math.max(0, cluster.nodeCount - 1);
                        }
                    }
                } else if (cluster.metadata.jurisdiction) {
                    // Jurisdiction cluster - need to check
                    const entity = await this.knowledgeGraph.getNode(deletedEntity.entityId);
                    if (entity && entity.type === 'PolicyDocument') {
                        const pd = entity as PolicyDocument;
                        if (pd.jurisdiction === cluster.metadata.jurisdiction) {
                            affectedClusters.push(clusterId);
                            cluster.nodeCount = Math.max(0, cluster.nodeCount - 1);
                        }
                    }
                }
            }
        }

        // Remove edges connected to affected clusters if they become invalid
        if (affectedClusters.length > 0) {
            metaGraph.edges = metaGraph.edges.filter(edge => {
                // Keep edges that don't involve affected clusters or have valid connections
                return !(affectedClusters.includes(edge.source) && affectedClusters.includes(edge.target));
            });
        }
    }

    /**
     * Handle entity update - may move entity between clusters
     */
    private async handleEntityUpdate(
        updatedEntity: { entityId: string; newValue?: BaseEntity },
        metaGraph: KnowledgeMetaGraph,
        strategy: string,
        minClusterSize: number,
        options: KnowledgeClusteringOptions
    ): Promise<void> {
        if (!updatedEntity.newValue) return;

        // First, remove entity from old clusters (treat as deletion)
        await this.handleEntityDeletion({ entityId: updatedEntity.entityId }, metaGraph, strategy, minClusterSize);

        // Then, add entity to new clusters (treat as addition)
        await this.handleEntityAddition(
            { entityId: updatedEntity.entityId, newValue: updatedEntity.newValue },
            metaGraph,
            strategy,
            minClusterSize,
            options
        );
    }

    /**
     * Handle entity addition - add entity to appropriate clusters
     */
    private async handleEntityAddition(
        newEntity: { entityId: string; newValue?: BaseEntity },
        metaGraph: KnowledgeMetaGraph,
        strategy: string,
        minClusterSize: number,
        options: KnowledgeClusteringOptions
    ): Promise<void> {
        if (!newEntity.newValue) return;

        const entity = newEntity.newValue;
        const entityType = entity.type;

        // Determine which clusters this entity belongs to based on strategy
        if (strategy === 'entity-type' || strategy === 'hybrid') {
            await this.addEntityToTypeCluster(entity, metaGraph, minClusterSize);
        }

        if (strategy === 'domain' || (strategy === 'hybrid' && options.groupByDomain)) {
            await this.addEntityToDomainCluster(entity, metaGraph, minClusterSize);
        }

        if (strategy === 'jurisdiction' || (strategy === 'hybrid' && options.groupByJurisdiction)) {
            await this.addEntityToJurisdictionCluster(entity, metaGraph, minClusterSize);
        }

        // For GDS strategies, we need to determine cluster assignment based on algorithm
        if (strategy.startsWith('gds-')) {
            await this.addEntityToGDSCluster(entity, metaGraph, strategy);
        }
    }

    /**
     * Add entity to appropriate entity-type cluster
     */
    private async addEntityToTypeCluster(
        entity: BaseEntity,
        metaGraph: KnowledgeMetaGraph,
        minClusterSize: number
    ): Promise<void> {
        // Find or create entity-type cluster
        let cluster = Object.values(metaGraph.clusters).find(
            c => c.clusterType === 'entity-type' && c.metadata.entityType === entity.type
        );

        if (!cluster) {
            // Create new cluster for this entity type
            const clusterId = `cluster_${Object.keys(metaGraph.clusters).length}`;
            cluster = {
                id: clusterId,
                label: this.getEntityTypeLabel(entity.type),
                type: 'knowledge-cluster',
                clusterType: 'entity-type',
                level: 1,
                nodeCount: 0,
                entityIds: [],
                representativeEntity: entity,
                metadata: {
                    entityType: entity.type
                }
            };
            metaGraph.clusters[clusterId] = cluster;
        }

        // Add entity to cluster
        if (!cluster.entityIds.includes(entity.id)) {
            cluster.entityIds.push(entity.id);
            cluster.nodeCount++;
        }

        // Update representative if this is the first entity
        if (!cluster.representativeEntity) {
            cluster.representativeEntity = entity;
        }
    }

    /**
     * Add entity to appropriate domain cluster
     */
    private async addEntityToDomainCluster(
        entity: BaseEntity,
        metaGraph: KnowledgeMetaGraph,
        minClusterSize: number
    ): Promise<void> {
        const domain = this.extractDomain(entity);
        if (!domain) return; // Entity has no domain

        // Find or create domain cluster
        let cluster = Object.values(metaGraph.clusters).find(
            c => c.clusterType === 'domain' && c.metadata.domain === domain
        );

        if (!cluster) {
            // Create new cluster for this domain
            const clusterId = `cluster_${Object.keys(metaGraph.clusters).length}`;
            cluster = {
                id: clusterId,
                label: this.generateDomainLabel(domain, 1),
                type: 'knowledge-cluster',
                clusterType: 'domain',
                level: 1,
                nodeCount: 0,
                entityIds: [],
                representativeEntity: entity,
                metadata: {
                    domain
                }
            };
            metaGraph.clusters[clusterId] = cluster;
        }

        // Add entity to cluster
        if (!cluster.entityIds.includes(entity.id)) {
            cluster.entityIds.push(entity.id);
            cluster.nodeCount++;
            cluster.label = this.generateDomainLabel(domain, cluster.nodeCount);
        }
    }

    /**
     * Add entity to appropriate jurisdiction cluster
     */
    private async addEntityToJurisdictionCluster(
        entity: BaseEntity,
        metaGraph: KnowledgeMetaGraph,
        minClusterSize: number
    ): Promise<void> {
        if (entity.type !== 'PolicyDocument') return;

        const pd = entity as PolicyDocument;
        const jurisdiction = pd.jurisdiction || 'unknown';
        if (jurisdiction === 'unknown') return;

        // Find or create jurisdiction cluster
        let cluster = Object.values(metaGraph.clusters).find(
            c => c.clusterType === 'jurisdiction' && c.metadata.jurisdiction === jurisdiction
        );

        if (!cluster) {
            // Create new cluster for this jurisdiction
            const clusterId = `cluster_${Object.keys(metaGraph.clusters).length}`;
            cluster = {
                id: clusterId,
                label: jurisdiction,
                type: 'knowledge-cluster',
                clusterType: 'jurisdiction',
                level: 1,
                nodeCount: 0,
                entityIds: [],
                representativeEntity: entity,
                metadata: {
                    jurisdiction
                }
            };
            metaGraph.clusters[clusterId] = cluster;
        }

        // Add entity to cluster
        if (!cluster.entityIds.includes(entity.id)) {
            cluster.entityIds.push(entity.id);
            cluster.nodeCount++;
        }
    }

    /**
     * Add entity to GDS cluster (for GDS-based clustering strategies)
     * For GDS algorithms, we re-run the algorithm on the updated graph projection
     * This is more efficient than full recomputation since we update the projection incrementally
     */
    private async addEntityToGDSCluster(
        entity: BaseEntity,
        metaGraph: KnowledgeMetaGraph,
        strategy: string
    ): Promise<void> {
        // GDS algorithms consider the entire graph structure, so we need to re-run the algorithm
        // However, we can do this efficiently by updating the projection and re-running
        // This method is called during incremental updates, so we'll handle it there
        // For now, mark that GDS update is needed
        // The actual update will be handled in updateMetaGraphIncremental for GDS strategies
    }

    /**
     * Update GDS meta-graph incrementally by re-running the algorithm on updated projection
     */
    private async updateGDSMetaGraphIncremental(
        changeSet: ChangeSet,
        existingMetaGraph: KnowledgeMetaGraph,
        options: KnowledgeClusteringOptions
    ): Promise<KnowledgeMetaGraph> {
        const strategy = options.strategy || existingMetaGraph.metadata.clusteringStrategy || 'gds-louvain';
        const minClusterSize = options.minClusterSize || 3;

        // Extract algorithm from strategy (e.g., 'gds-louvain' -> 'louvain')
        const algorithm = strategy.replace('gds-', '') as 'louvain' | 'lpa' | 'leiden' | 'wcc' | 'infomap' | 'modularity' | 'kcore' | 'scc';

        const gdsService = await this.getGDSClusteringService();
        if (!gdsService) {
            logger.warn('GDS not available for incremental update, invalidating cache');
            this.clearCache();
            return existingMetaGraph;
        }

        try {
            // Drop old projection to ensure it's up to date
            await gdsService.dropGraphProjection();

            // Create new projection (includes all current entities, including new/updated ones)
            await gdsService.createGraphProjection();

            // Re-run the GDS algorithm on the updated projection
            const gdsOptions = options.gdsOptions || {};
            const detectionResult = await gdsService.detectCommunities(algorithm, gdsOptions);

            // Rebuild meta-graph from updated communities
            const updatedMetaGraph = await gdsService.buildMetaGraphFromCommunities(
                algorithm,
                minClusterSize,
                gdsOptions
            );

            // Preserve metadata from existing meta-graph
            updatedMetaGraph.metadata.clusteringStrategy = strategy;
            updatedMetaGraph.metadata.evaluationMetrics = {
                algorithm,
                communityCount: detectionResult.communityCount,
                modularity: detectionResult.modularity,
                ranIterations: detectionResult.ranIterations,
                executionTime: detectionResult.executionTime
            };

            logger.info({
                communityCount: detectionResult.communityCount,
                executionTime: detectionResult.executionTime,
            }, 'GDS incremental update completed');

            return updatedMetaGraph;
        } catch (error) {
            logger.error({ error }, 'Error in GDS incremental update');
            // Fall back to cache invalidation
            this.clearCache();
            return existingMetaGraph;
        }
    }

    /**
     * Update cluster edges based on relationship changes
     */
    private async updateClusterEdgesFromRelationships(
        changeSet: ChangeSet,
        metaGraph: KnowledgeMetaGraph
    ): Promise<void> {
        // Build entity-to-cluster mapping
        const entityToClusters = new Map<string, string[]>();
        for (const [clusterId, cluster] of Object.entries(metaGraph.clusters)) {
            if (cluster.entityIds.length > 0) {
                for (const entityId of cluster.entityIds) {
                    if (!entityToClusters.has(entityId)) {
                        entityToClusters.set(entityId, []);
                    }
                    entityToClusters.get(entityId)!.push(clusterId);
                }
            } else {
                // For clusters without explicit entityIds, we need to query
                // For now, skip - edges will be recalculated on next full clustering
            }
        }

        // Remove edges for deleted relationships
        for (const deletedRel of changeSet.deletedRelationships) {
            const sourceClusters = entityToClusters.get(deletedRel.sourceId) || [];
            const targetClusters = entityToClusters.get(deletedRel.targetId) || [];

            // Decrease weight or remove edges between these clusters
            for (const sourceCluster of sourceClusters) {
                for (const targetCluster of targetClusters) {
                    if (sourceCluster !== targetCluster) {
                        const edgeIndex = metaGraph.edges.findIndex(
                            e => e.source === sourceCluster && e.target === targetCluster
                        );
                        if (edgeIndex >= 0) {
                            metaGraph.edges[edgeIndex].weight = Math.max(0, metaGraph.edges[edgeIndex].weight - 1);
                            // Remove edge if weight becomes 0
                            if (metaGraph.edges[edgeIndex].weight === 0) {
                                metaGraph.edges.splice(edgeIndex, 1);
                            }
                        }
                    }
                }
            }
        }

        // Add edges for new relationships
        for (const newRel of changeSet.newRelationships) {
            const sourceClusters = entityToClusters.get(newRel.sourceId) || [];
            const targetClusters = entityToClusters.get(newRel.targetId) || [];

            // Add or increase weight of edges between these clusters
            for (const sourceCluster of sourceClusters) {
                for (const targetCluster of targetClusters) {
                    if (sourceCluster !== targetCluster) {
                        const existingEdge = metaGraph.edges.find(
                            e => e.source === sourceCluster && e.target === targetCluster
                        );
                        if (existingEdge) {
                            existingEdge.weight++;
                            if (newRel.relationType && !existingEdge.relationTypes.includes(newRel.relationType as RelationType)) {
                                existingEdge.relationTypes.push(newRel.relationType as RelationType);
                            }
                        } else {
                            metaGraph.edges.push({
                                source: sourceCluster,
                                target: targetCluster,
                                weight: 1,
                                relationTypes: newRel.relationType ? [newRel.relationType as RelationType] : []
                            });
                        }
                    }
                }
            }
        }
    }

    /**
     * Recalculate cluster statistics (node counts, etc.)
     */
    private recalculateClusterStatistics(metaGraph: KnowledgeMetaGraph): void {
        metaGraph.totalClusters = Object.keys(metaGraph.clusters).length;
        metaGraph.totalNodes = Object.values(metaGraph.clusters).reduce(
            (sum, cluster) => sum + cluster.nodeCount,
            0
        );
    }

    /**
     * Validate cluster sizes and remove clusters below minimum size
     */
    private validateClusterSizes(metaGraph: KnowledgeMetaGraph, minClusterSize: number): void {
        const clustersToRemove: string[] = [];

        for (const [clusterId, cluster] of Object.entries(metaGraph.clusters)) {
            if (cluster.nodeCount < minClusterSize) {
                clustersToRemove.push(clusterId);
            }
        }

        // Remove small clusters
        for (const clusterId of clustersToRemove) {
            delete metaGraph.clusters[clusterId];
        }

        // Remove edges connected to removed clusters
        metaGraph.edges = metaGraph.edges.filter(
            edge => metaGraph.clusters[edge.source] && metaGraph.clusters[edge.target]
        );

        // Update statistics
        this.recalculateClusterStatistics(metaGraph);
    }

    /**
     * Generate visualization data with node positions using the specified layout algorithm
     */
    generateVisualizationData(
        metaGraph: KnowledgeMetaGraph,
        options: {
            layout?: KnowledgeLayoutAlgorithm;
            width?: number;
            height?: number;
            nodeSpacing?: number;
            iterations?: number; // For force-directed layout
        } = {}
    ): KnowledgeVisualizationData {
        const {
            layout = 'grid',
            width = 2000,
            height = 1500,
            nodeSpacing = 300,
            iterations = 100
        } = options;

        const clusterIds = Object.keys(metaGraph.clusters);
        const positions = this.calculateLayout(clusterIds, metaGraph.edges, layout, {
            width,
            height,
            nodeSpacing,
            iterations
        });

        // Create visualized nodes with positions
        const visualizedNodes: VisualizedKnowledgeClusterNode[] = clusterIds.map(id => ({
            ...metaGraph.clusters[id],
            position: positions.get(id) || { x: 0, y: 0 }
        }));

        // Calculate bounds
        const nodePositions = Array.from(positions.values());
        const xs = nodePositions.map(p => p.x);
        const ys = nodePositions.map(p => p.y);
        const bounds = {
            width: Math.max(...xs) - Math.min(...xs) + nodeSpacing,
            height: Math.max(...ys) - Math.min(...ys) + nodeSpacing,
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys)
        };

        return {
            nodes: visualizedNodes,
            edges: metaGraph.edges,
            totalNodes: metaGraph.totalNodes,
            totalClusters: metaGraph.totalClusters,
            layout,
            bounds
        };
    }

    /**
     * Calculate node positions using the specified layout algorithm
     */
    private calculateLayout(
        nodeIds: string[],
        edges: KnowledgeMetaEdge[],
        algorithm: KnowledgeLayoutAlgorithm,
        options: {
            width: number;
            height: number;
            nodeSpacing: number;
            iterations: number;
        }
    ): Map<string, KnowledgeNodePosition> {
        switch (algorithm) {
            case 'grid':
                return this.gridLayout(nodeIds, options);
            case 'force':
                return this.forceDirectedLayout(nodeIds, edges, options);
            case 'circular':
                return this.circularLayout(nodeIds, options);
            case 'hierarchical':
                return this.hierarchicalLayout(nodeIds, edges, options);
            default:
                return this.gridLayout(nodeIds, options);
        }
    }

    /**
     * Grid layout: Arrange nodes in a grid pattern
     */
    private gridLayout(
        nodeIds: string[],
        options: { width: number; height: number; nodeSpacing: number }
    ): Map<string, KnowledgeNodePosition> {
        const { nodeSpacing } = options;
        const positions = new Map<string, KnowledgeNodePosition>();
        const cols = Math.ceil(Math.sqrt(nodeIds.length));
        const startX = 100;
        const startY = 100;

        nodeIds.forEach((id, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            positions.set(id, {
                x: startX + col * nodeSpacing,
                y: startY + row * nodeSpacing
            });
        });

        return positions;
    }

    /**
     * Force-directed layout: Simulate physical forces between nodes
     */
    private forceDirectedLayout(
        nodeIds: string[],
        edges: KnowledgeMetaEdge[],
        options: { width: number; height: number; nodeSpacing: number; iterations: number }
    ): Map<string, KnowledgeNodePosition> {
        const { width, height, iterations } = options;
        const positions = new Map<string, KnowledgeNodePosition>();
        const velocities = new Map<string, { x: number; y: number }>();

        // Initialize positions randomly in center
        nodeIds.forEach(id => {
            positions.set(id, {
                x: width / 2 + (Math.random() - 0.5) * width * 0.3,
                y: height / 2 + (Math.random() - 0.5) * height * 0.3
            });
            velocities.set(id, { x: 0, y: 0 });
        });

        // Force simulation
        const k = Math.sqrt((width * height) / nodeIds.length); // Optimal distance
        const alpha = 1.0;
        const alphaDecay = 0.0228;
        let currentAlpha = alpha;

        for (let i = 0; i < iterations; i++) {
            // Repulsion force (nodes repel each other)
            for (let j = 0; j < nodeIds.length; j++) {
                const nodeA = nodeIds[j];
                const posA = positions.get(nodeA)!;
                const velA = velocities.get(nodeA)!;

                for (let k = j + 1; k < nodeIds.length; k++) {
                    const nodeB = nodeIds[k];
                    const posB = positions.get(nodeB)!;
                    const velB = velocities.get(nodeB)!;

                    const dx = posB.x - posA.x;
                    const dy = posB.y - posA.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                    const force = (k * k) / distance;
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;

                    velA.x -= fx * currentAlpha;
                    velA.y -= fy * currentAlpha;
                    velB.x += fx * currentAlpha;
                    velB.y += fy * currentAlpha;
                }
            }

            // Attraction force (edges attract connected nodes)
            edges.forEach(edge => {
                const posA = positions.get(edge.source);
                const posB = positions.get(edge.target);
                if (!posA || !posB) return;

                const velA = velocities.get(edge.source)!;
                const velB = velocities.get(edge.target)!;

                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                const force = (distance * distance) / k;
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                velA.x += fx * currentAlpha;
                velA.y += fy * currentAlpha;
                velB.x -= fx * currentAlpha;
                velB.y -= fy * currentAlpha;
            });

            // Update positions and apply damping
            nodeIds.forEach(id => {
                const pos = positions.get(id)!;
                const vel = velocities.get(id)!;

                pos.x += vel.x * currentAlpha;
                pos.y += vel.y * currentAlpha;

                // Damping
                vel.x *= 0.6;
                vel.y *= 0.6;
            });

            currentAlpha *= (1 - alphaDecay);
        }

        return positions;
    }

    /**
     * Circular layout: Arrange nodes in a circle
     */
    private circularLayout(
        nodeIds: string[],
        options: { width: number; height: number; nodeSpacing: number }
    ): Map<string, KnowledgeNodePosition> {
        const { width, height } = options;
        const positions = new Map<string, KnowledgeNodePosition>();
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.35;

        nodeIds.forEach((id, index) => {
            const angle = (index / nodeIds.length) * 2 * Math.PI;
            positions.set(id, {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius
            });
        });

        return positions;
    }

    /**
     * Hierarchical layout: Arrange nodes in levels based on graph structure
     */
    private hierarchicalLayout(
        nodeIds: string[],
        edges: KnowledgeMetaEdge[],
        options: { width: number; height: number; nodeSpacing: number }
    ): Map<string, KnowledgeNodePosition> {
        const { width, height, nodeSpacing } = options;
        const positions = new Map<string, KnowledgeNodePosition>();

        // Build adjacency map
        const inDegree = new Map<string, number>();
        const outEdges = new Map<string, string[]>();

        nodeIds.forEach(id => {
            inDegree.set(id, 0);
            outEdges.set(id, []);
        });

        edges.forEach(edge => {
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
            outEdges.get(edge.source)!.push(edge.target);
        });

        // Assign levels using BFS
        const levels = new Map<string, number>();
        const queue: string[] = [];

        // Start with nodes that have no incoming edges (root nodes)
        nodeIds.forEach(id => {
            if (inDegree.get(id) === 0) {
                levels.set(id, 0);
                queue.push(id);
            }
        });

        // If no root nodes, start with first node
        if (queue.length === 0 && nodeIds.length > 0) {
            levels.set(nodeIds[0], 0);
            queue.push(nodeIds[0]);
        }

        // BFS to assign levels
        while (queue.length > 0) {
            const current = queue.shift()!;
            const currentLevel = levels.get(current)!;

            outEdges.get(current)?.forEach(neighbor => {
                if (!levels.has(neighbor)) {
                    levels.set(neighbor, currentLevel + 1);
                    queue.push(neighbor);
                }
            });
        }

        // Group nodes by level
        const nodesByLevel = new Map<number, string[]>();
        nodeIds.forEach(id => {
            const level = levels.get(id) || 0;
            if (!nodesByLevel.has(level)) {
                nodesByLevel.set(level, []);
            }
            nodesByLevel.get(level)!.push(id);
        });

        // Calculate positions
        const maxLevel = Math.max(...Array.from(nodesByLevel.keys()));
        const levelHeight = maxLevel > 0 ? (height - 200) / maxLevel : height - 200;
        const startY = 100;

        nodesByLevel.forEach((nodes, level) => {
            const levelY = startY + level * levelHeight;
            const nodeWidth = nodes.length > 0 ? (width - 200) / nodes.length : width - 200;
            const startX = 100;

            nodes.forEach((id, index) => {
                positions.set(id, {
                    x: startX + index * nodeWidth,
                    y: levelY
                });
            });
        });

        return positions;
    }
}
