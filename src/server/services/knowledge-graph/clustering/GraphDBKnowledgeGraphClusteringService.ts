import { GraphDBKnowledgeGraphService } from '../../graphs/knowledge/GraphDBKnowledgeGraphService.js';
import { BaseEntity, EntityType, RelationType } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';
import type {
    KnowledgeClusterNode,
    KnowledgeMetaGraph,
    KnowledgeMetaEdge,
    KnowledgeClusteringOptions
} from './KnowledgeGraphClusteringService.js';

/**
 * GraphDB-backed clustering service for knowledge graph entities
 * Uses SPARQL queries instead of Cypher for GraphDB compatibility
 */
export class GraphDBKnowledgeGraphClusteringService {
    private knowledgeGraph: GraphDBKnowledgeGraphService;
    private metaGraphCache: Map<string, KnowledgeMetaGraph> = new Map();

    constructor(knowledgeGraph: GraphDBKnowledgeGraphService) {
        this.knowledgeGraph = knowledgeGraph;
    }

    /**
     * Create a meta-graph by clustering knowledge graph entities
     * Uses SPARQL queries for efficient clustering
     */
    async createMetaGraph(options: KnowledgeClusteringOptions = {}): Promise<KnowledgeMetaGraph> {
        const {
            strategy = 'hybrid',
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

        logger.info({ strategy, minClusterSize, groupByDomain, groupByJurisdiction }, 'Computing meta-graph (GraphDB)');
        const startTime = Date.now();
        const performanceMetrics = {
            clusteringTime: 0,
            edgeCalculationTime: 0,
            totalTime: 0,
            cacheHit: false
        };

        // Get entity type distribution efficiently via SPARQL
        const typeDistributionStart = Date.now();
        const typeDistribution = await this.knowledgeGraph.getEntityTypeDistribution();
        const typeDistributionTime = Date.now() - typeDistributionStart;
        const totalNodes = Object.values(typeDistribution).reduce((sum, count) => sum + count, 0);

        // Handle empty graph case
        if (totalNodes === 0) {
            logger.info({ strategy }, 'Empty knowledge graph detected, returning empty meta-graph structure');
            const emptyMetaGraph: KnowledgeMetaGraph = {
                clusters: {},
                edges: [],
                totalNodes: 0,
                totalClusters: 0,
                metadata: {
                    clusteringStrategy: strategy,
                    entityTypeDistribution: typeDistribution as Record<EntityType, number>
                }
            };
            // Cache empty result
            this.metaGraphCache.set(cacheKey, emptyMetaGraph);
            return emptyMetaGraph;
        }

        let clusters: { [id: string]: KnowledgeClusterNode } = {};

        // GraphDB doesn't support GDS algorithms, so fall back to custom clustering
        if (strategy.startsWith('gds-')) {
            logger.warn({ strategy }, 'GDS algorithms not available for GraphDB, falling back to hybrid');
            // Fall through to hybrid strategy
        }

        // Use custom clustering strategies
        const clusteringStart = Date.now();
        switch (strategy) {
            case 'entity-type':
                clusters = await this.clusterByEntityType(typeDistribution, minClusterSize);
                break;
            case 'domain':
                clusters = await this.clusterByDomain(minClusterSize);
                break;
            case 'jurisdiction':
                clusters = await this.clusterByJurisdiction(minClusterSize);
                break;
            case 'community-wcc':
                clusters = await this.clusterByConnectedComponents(minClusterSize);
                break;
            case 'hybrid':
            default:
                clusters = await this.clusterHybrid(typeDistribution, minClusterSize, groupByDomain, groupByJurisdiction);
                break;
        }
        performanceMetrics.clusteringTime = Date.now() - clusteringStart;

        // Calculate edges between clusters
        const edgeCalculationStart = Date.now();
        const edges = await this.calculateClusterEdges(clusters);
        performanceMetrics.edgeCalculationTime = Date.now() - edgeCalculationStart;

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

        performanceMetrics.totalTime = Date.now() - startTime;
        logger.info({
            elapsed: performanceMetrics.totalTime,
            clusterCount: Object.keys(clusters).length,
            edgeCount: edges.length,
            totalNodes,
            strategy,
            cacheKey,
            performance: {
                typeDistributionTime,
                clusteringTime: performanceMetrics.clusteringTime,
                edgeCalculationTime: performanceMetrics.edgeCalculationTime,
                totalTime: performanceMetrics.totalTime
            }
        }, 'Computed meta-graph (GraphDB)');

        return metaGraph;
    }

    /**
     * Cluster by entity type using SPARQL
     */
    private async clusterByEntityType(
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
     * Cluster by domain using optimized SPARQL queries
     * OPTIMIZED: Uses getDomainDistribution() method which uses SPARQL to group by domain directly
     * This avoids loading all nodes into memory
     */
    private async clusterByDomain(minClusterSize: number): Promise<{ [id: string]: KnowledgeClusterNode }> {
        // Use the optimized domain distribution method from GraphDBKnowledgeGraphService
        // This uses SPARQL queries directly instead of loading all nodes
        try {
            const distribution = await this.knowledgeGraph.getDomainDistribution();
            return this.createDomainClustersFromDistribution(distribution, minClusterSize);
        } catch (error) {
            logger.warn({ error }, 'Error using domain distribution method, falling back to snapshot method');
            // Fallback to old method if getDomainDistribution is not available or fails
            return this.clusterByDomainFallback(minClusterSize);
        }
    }

    /**
     * Create domain clusters from a distribution map
     */
    private async createDomainClustersFromDistribution(
        distribution: Record<string, { count: number; entityIds: string[] }>,
        minClusterSize: number
    ): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const domainMap = new Map<string, string[]>();
        for (const [domain, data] of Object.entries(distribution)) {
            if (data.count >= minClusterSize) {
                domainMap.set(domain, data.entityIds);
            }
        }
        return this.createDomainClustersFromMap(domainMap, minClusterSize);
    }

    /**
     * Verify which entityIds actually exist in the database
     * Returns only the entityIds that correspond to existing entities
     */
    private async verifyEntityIdsExist(entityIds: string[]): Promise<string[]> {
        if (entityIds.length === 0) return [];
        
        // Use batch getNodes for efficiency
        const nodes = await this.knowledgeGraph.getNodes(entityIds);
        const existingIds: string[] = [];
        
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i] !== undefined) {
                existingIds.push(entityIds[i]);
            }
        }
        
        return existingIds;
    }

    /**
     * Create cluster nodes from domain map
     */
    private async createDomainClustersFromMap(
        domainMap: Map<string, string[]>,
        minClusterSize: number
    ): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        let clusterIndex = 0;
        
        for (const [domain, entityIds] of domainMap.entries()) {
            if (entityIds.length < minClusterSize) continue;

            // Verify entityIds exist before creating cluster
            const verifiedEntityIds = await this.verifyEntityIdsExist(entityIds);
            
            // Skip if verified count is below minimum
            if (verifiedEntityIds.length < minClusterSize) continue;

            // Get a representative entity
            const representative = verifiedEntityIds.length > 0
                ? await this.knowledgeGraph.getNode(verifiedEntityIds[0])
                : undefined;

            const clusterId = `domain_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: this.generateDomainLabel(domain, verifiedEntityIds.length),
                type: 'knowledge-cluster',
                clusterType: 'domain',
                level: 1,
                nodeCount: verifiedEntityIds.length, // Use verified count
                entityIds: verifiedEntityIds, // Use verified entityIds
                representativeEntity: representative,
                metadata: {
                    domain
                }
            };
        }

        return clusters;
    }

    /**
     * Fallback method for domain clustering (loads all nodes)
     * Used when direct SPARQL queries are not available
     */
    private async clusterByDomainFallback(minClusterSize: number): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        
        // Get all nodes and extract domains from metadata
        const snapshot = await this.knowledgeGraph.getGraphSnapshot(10000, null);
        const domainMap = new Map<string, string[]>();

        for (const node of snapshot.nodes) {
            const domain = this.extractDomain(node);
            if (domain && domain !== 'unknown') {
                if (!domainMap.has(domain)) {
                    domainMap.set(domain, []);
                }
                domainMap.get(domain)!.push(node.id);
            }
        }

        let clusterIndex = 0;
        for (const [domain, entityIds] of domainMap.entries()) {
            if (entityIds.length < minClusterSize) continue;

            // Verify entityIds exist before creating cluster
            const verifiedEntityIds = await this.verifyEntityIdsExist(entityIds);
            
            // Skip if verified count is below minimum
            if (verifiedEntityIds.length < minClusterSize) continue;

            // Get a representative entity
            const representative = verifiedEntityIds.length > 0
                ? await this.knowledgeGraph.getNode(verifiedEntityIds[0])
                : undefined;

            const clusterId = `domain_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: this.generateDomainLabel(domain, verifiedEntityIds.length),
                type: 'knowledge-cluster',
                clusterType: 'domain',
                level: 1,
                nodeCount: verifiedEntityIds.length, // Use verified count
                entityIds: verifiedEntityIds, // Use verified entityIds
                representativeEntity: representative,
                metadata: {
                    domain
                }
            };
        }

        return clusters;
    }

    /**
     * Cluster by jurisdiction using SPARQL
     */
    private async clusterByJurisdiction(minClusterSize: number): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};
        const distribution = await this.knowledgeGraph.getJurisdictionDistribution();

        let clusterIndex = 0;
        for (const [jurisdiction, data] of Object.entries(distribution)) {
            if (data.count < minClusterSize) continue;

            // Verify entityIds exist before creating cluster
            const verifiedEntityIds = await this.verifyEntityIdsExist(data.entityIds);
            
            // Skip if verified count is below minimum
            if (verifiedEntityIds.length < minClusterSize) continue;

            // Get a representative entity if we have IDs
            const representative = verifiedEntityIds.length > 0
                ? await this.knowledgeGraph.getNode(verifiedEntityIds[0])
                : undefined;

            const clusterId = `jurisdiction_cluster_${clusterIndex++}`;
            clusters[clusterId] = {
                id: clusterId,
                label: jurisdiction,
                type: 'knowledge-cluster',
                clusterType: 'jurisdiction',
                level: 1,
                nodeCount: verifiedEntityIds.length, // Use verified count
                entityIds: verifiedEntityIds, // Use verified entityIds
                representativeEntity: representative,
                metadata: {
                    jurisdiction
                }
            };
        }

        return clusters;
    }

    /**
     * Cluster by Weakly Connected Components (WCC) using Union-Find in memory
     * Optimized to avoid N+1 queries by fetching all edges in one go.
     */
    private async clusterByConnectedComponents(minClusterSize: number): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};

        // 1. Get all nodes (for mapping and result building)
        const allNodes = await this.knowledgeGraph.getAllNodes();
        const nodeMap = new Map<string, BaseEntity>();
        for (const node of allNodes) {
            nodeMap.set(node.id, node);
        }

        // 2. Fetch all edges relevant for connectivity
        // We fetch edges defined by common relationship predicates
        const query = `
            SELECT ?sourceId ?targetId WHERE {
                ?s (beleid:relatedTo|beleid:appliesTo|beleid:constrains) ?o .
                ?s beleid:id ?sourceId .
                ?o beleid:id ?targetId .
            }
            LIMIT 50000
        `;

        let edges: Array<{ sourceId: string; targetId: string }> = [];
        try {
            edges = await this.knowledgeGraph.executeSparql(query);
        } catch (error) {
            logger.error({ error }, 'Error fetching edges for WCC');
            return clusters;
        }

        // 3. Union-Find Algorithm
        const parent = new Map<string, string>();

        // Initialize parent for each node to itself
        for (const node of allNodes) {
            parent.set(node.id, node.id);
        }

        // Find function with path compression
        const find = (i: string): string => {
            // Safe navigation in case node is not in parent map (should not happen if allNodes is complete)
            if (!parent.has(i)) return i;
            if (parent.get(i) === i) return i;
            const root = find(parent.get(i)!);
            parent.set(i, root);
            return root;
        };

        // Union function
        const union = (i: string, j: string) => {
            const rootI = find(i);
            const rootJ = find(j);
            if (rootI !== rootJ) {
                parent.set(rootI, rootJ);
            }
        };

        // Process edges
        for (const edge of edges) {
            // Ensure nodes exist in our set
            if (nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId)) {
                union(edge.sourceId, edge.targetId);
            }
        }

        // 4. Group by component
        const components = new Map<string, string[]>();
        for (const node of allNodes) {
            const root = find(node.id);
            if (!components.has(root)) {
                components.set(root, []);
            }
            components.get(root)!.push(node.id);
        }

        // 5. Create clusters
        let clusterIndex = 0;
        for (const [root, entityIds] of components.entries()) {
            if (entityIds.length >= minClusterSize) {
                const clusterId = `wcc_cluster_${clusterIndex++}`;

                // Get representative (first one)
                const representative = nodeMap.get(entityIds[0]);

                clusters[clusterId] = {
                    id: clusterId,
                    label: `Community ${clusterIndex} (${entityIds.length})`,
                    type: 'knowledge-cluster',
                    clusterType: 'community-wcc',
                    level: 1,
                    nodeCount: entityIds.length,
                    entityIds: entityIds,
                    representativeEntity: representative,
                    metadata: {
                        algorithm: 'WCC'
                    }
                };
            }
        }

        return clusters;
    }

    /**
     * Hybrid clustering combining entity-type, domain, and jurisdiction
     */
    private async clusterHybrid(
        typeDistribution: Record<string, number>,
        minClusterSize: number,
        groupByDomain: boolean,
        groupByJurisdiction: boolean
    ): Promise<{ [id: string]: KnowledgeClusterNode }> {
        const clusters: { [id: string]: KnowledgeClusterNode } = {};

        // Start with entity-type clusters
        const entityTypeClusters = await this.clusterByEntityType(typeDistribution, minClusterSize);
        Object.assign(clusters, entityTypeClusters);

        // Add domain clusters if enabled (these are the "semantic labels")
        if (groupByDomain) {
            const domainClusters = await this.clusterByDomain(minClusterSize);
            Object.assign(clusters, domainClusters);
        }

        // Add jurisdiction clusters if enabled
        if (groupByJurisdiction) {
            const jurisdictionClusters = await this.clusterByJurisdiction(minClusterSize);
            Object.assign(clusters, jurisdictionClusters);
        }

        return clusters;
    }

    /**
     * Calculate edges between clusters based on relationships
     * OPTIMIZED: Uses getRelationshipsBetweenEntities for clusters with entityIds
     * LAZY LOADING: Entity-type clusters keep entityIds empty - they are only loaded when getClusterEntities is called
     * This avoids loading all entity IDs into memory during edge calculation for large graphs
     */
    private async calculateClusterEdges(clusters: { [id: string]: KnowledgeClusterNode }): Promise<KnowledgeMetaEdge[]> {
        const edges: KnowledgeMetaEdge[] = [];
        
        // LAZY LOADING OPTIMIZATION: Only calculate edges for clusters that already have entityIds
        // Entity-type clusters keep entityIds empty until getClusterEntities is called (when UI expands cluster)
        // This significantly reduces memory usage for large graphs
        
        // Build entity-to-cluster mapping only for clusters with entityIds
        const entityToClusters = new Map<string, string[]>();
        const entityIds: string[] = [];
        
        for (const [clusterId, cluster] of Object.entries(clusters)) {
            // Skip clusters without entityIds (entity-type clusters use lazy loading)
            if (cluster.entityIds.length === 0) {
                if (cluster.metadata.entityType) {
                    // Entity-type cluster - keep entityIds empty for lazy loading
                    logger.debug({ clusterId, entityType: cluster.metadata.entityType }, 'Skipping edge calculation for entity-type cluster (lazy loading - entityIds will be loaded on-demand)');
                } else {
                    logger.warn({ clusterId, clusterType: cluster.clusterType }, 'Cluster has no entityIds and no entityType, skipping edge calculation');
                }
                continue;
            }
            
            // Cluster has entityIds (domain/jurisdiction clusters) - include in edge calculation
            for (const entityId of cluster.entityIds) {
                if (!entityToClusters.has(entityId)) {
                    entityToClusters.set(entityId, []);
                    entityIds.push(entityId);
                }
                entityToClusters.get(entityId)!.push(clusterId);
            }
        }

        if (entityIds.length === 0) {
            logger.debug('No clusters with entityIds found, returning empty edges');
            return edges;
        }

        // Use optimized method to get relationships between entities in clusters with entityIds
        // This avoids loading the full graph snapshot
        try {
            const relationships = await this.knowledgeGraph.getRelationshipsBetweenEntities(entityIds);
            
            // Build edge map: clusterId -> clusterId -> { count, relationTypes }
            const edgeMap = new Map<string, Map<string, { count: number; relationTypes: Set<RelationType> }>>();

            for (const rel of relationships) {
                const sourceClusters = entityToClusters.get(rel.sourceId) || [];
                const targetClusters = entityToClusters.get(rel.targetId) || [];

                // Create edges between all cluster pairs (entity can be in multiple clusters)
                for (const sourceClusterId of sourceClusters) {
                    for (const targetClusterId of targetClusters) {
                        if (sourceClusterId !== targetClusterId) {
                            if (!edgeMap.has(sourceClusterId)) {
                                edgeMap.set(sourceClusterId, new Map());
                            }
                            const targetMap = edgeMap.get(sourceClusterId)!;
                            
                            if (!targetMap.has(targetClusterId)) {
                                targetMap.set(targetClusterId, { count: 0, relationTypes: new Set() });
                            }
                            
                            const edgeData = targetMap.get(targetClusterId)!;
                            edgeData.count++;
                            edgeData.relationTypes.add(rel.type);
                        }
                    }
                }
            }

            // Convert edge map to edges array
            for (const [sourceClusterId, targetMap] of edgeMap.entries()) {
                for (const [targetClusterId, edgeData] of targetMap.entries()) {
                    edges.push({
                        source: sourceClusterId,
                        target: targetClusterId,
                        weight: edgeData.count,
                        relationTypes: Array.from(edgeData.relationTypes)
                    });
                }
            }
        } catch (error) {
            logger.warn({ error }, 'Error using optimized relationship query, falling back to snapshot method');
            // Fallback to snapshot method if getRelationshipsBetweenEntities fails
            return this.calculateClusterEdgesFallback(clusters);
        }

        return edges;
    }

    /**
     * Fallback method for edge calculation using snapshot
     * Used when getRelationshipsBetweenEntities is not available or fails
     */
    private async calculateClusterEdgesFallback(clusters: { [id: string]: KnowledgeClusterNode }): Promise<KnowledgeMetaEdge[]> {
        const edges: KnowledgeMetaEdge[] = [];
        const clusterMap = new Map<string, string>(); // entityId -> clusterId

        // Build entity-to-cluster mapping (take first cluster if entity in multiple)
        for (const [clusterId, cluster] of Object.entries(clusters)) {
            for (const entityId of cluster.entityIds) {
                if (!clusterMap.has(entityId)) {
                    clusterMap.set(entityId, clusterId);
                }
            }
        }

        // Get all relationships using snapshot (fallback)
        const snapshot = await this.knowledgeGraph.getGraphSnapshot(10000, null);
        
        // Build edge map: clusterId -> clusterId -> { count, relationTypes }
        const edgeMap = new Map<string, Map<string, { count: number; relationTypes: Set<RelationType> }>>();

        for (const edge of snapshot.edges) {
            const sourceClusterId = clusterMap.get(edge.sourceId);
            const targetClusterId = clusterMap.get(edge.targetId);

            if (sourceClusterId && targetClusterId && sourceClusterId !== targetClusterId) {
                if (!edgeMap.has(sourceClusterId)) {
                    edgeMap.set(sourceClusterId, new Map());
                }
                const targetMap = edgeMap.get(sourceClusterId)!;
                
                if (!targetMap.has(targetClusterId)) {
                    targetMap.set(targetClusterId, { count: 0, relationTypes: new Set() });
                }
                
                const edgeData = targetMap.get(targetClusterId)!;
                edgeData.count++;
                edgeData.relationTypes.add(edge.type);
            }
        }

        // Convert edge map to edges array
        for (const [sourceClusterId, targetMap] of edgeMap.entries()) {
            for (const [targetClusterId, edgeData] of targetMap.entries()) {
                edges.push({
                    source: sourceClusterId,
                    target: targetClusterId,
                    weight: edgeData.count,
                    relationTypes: Array.from(edgeData.relationTypes)
                });
            }
        }

        return edges;
    }

    /**
     * Extract domain from entity metadata
     */
    /**
     * Extract domain from entity metadata with fallback strategies
     * Handles malformed metadata gracefully
     */
    private extractDomain(entity: BaseEntity): string | undefined {
        if (!entity.metadata) return undefined;
        
        try {
            // Primary: Try to get domain directly from metadata
            const domain = entity.metadata.domain;
            if (typeof domain === 'string' && domain !== 'unknown' && domain.trim() !== '') {
                return domain;
            }
            
            // Fallback 1: Check if metadata has rawMetadata (from failed JSON parse)
            if (entity.metadata.rawMetadata) {
                const rawMetadata = entity.metadata.rawMetadata;
                if (typeof rawMetadata === 'string') {
                    // Try to extract domain from raw string using regex
                    const domainMatch = rawMetadata.match(/"domain"\s*:\s*"([^"]+)"/i);
                    if (domainMatch && domainMatch[1] && domainMatch[1] !== 'unknown') {
                        return domainMatch[1];
                    }
                }
            }
            
            // Fallback 2: Check for domain in other metadata fields
            if (typeof entity.metadata === 'object') {
                // Check common alternative field names
                const alternativeFields = ['domein', 'categorie', 'category', 'thema', 'theme'];
                for (const field of alternativeFields) {
                    const value = entity.metadata[field];
                    if (typeof value === 'string' && value !== 'unknown' && value.trim() !== '') {
                        return value;
                    }
                }
            }
        } catch (error) {
            // Handle any errors gracefully (e.g., if metadata structure is unexpected)
            logger.debug({ error, entityId: entity.id }, 'Error extracting domain from entity metadata');
        }
        
        return undefined;
    }

    /**
     * Generate label for domain cluster
     */
    private generateDomainLabel(domain: string, count: number): string {
        return `${domain} (${count})`;
    }

    /**
     * Get human-readable label for entity type
     */
    private getEntityTypeLabel(type: EntityType): string {
        const labels: Record<EntityType, string> = {
            PolicyDocument: 'Policy Documents',
            Regulation: 'Regulations',
            SpatialUnit: 'Spatial Units',
            LandUse: 'Land Use',
            Requirement: 'Requirements',
            Concept: 'Concepts'
        };
        return labels[type] || type;
    }

    /**
     * Get entities in a cluster with optional pagination
     * Used by the cluster endpoint to return paginated entities
     * 
     * @param clusterId - ID of the cluster
     * @param metaGraph - The meta-graph containing the cluster
     * @param options - Optional pagination parameters
     * @param options.limit - Maximum number of entities to return (default: all)
     * @param options.offset - Number of entities to skip (default: 0)
     * @returns Array of entities in the cluster (paginated if options provided)
     */
    async getClusterEntities(
        clusterId: string, 
        metaGraph: KnowledgeMetaGraph,
        options?: { limit?: number; offset?: number }
    ): Promise<BaseEntity[]> {
        const cluster = metaGraph.clusters[clusterId];
        if (!cluster) {
            return [];
        }

        const limit = options?.limit;
        const offset = options?.offset ?? 0;

        // If cluster has entityIds, fetch them directly with pagination (optimized with parallel fetching)
        if (cluster.entityIds && cluster.entityIds.length > 0) {
            // Apply pagination to entityIds before fetching
            const paginatedEntityIds = limit !== undefined
                ? cluster.entityIds.slice(offset, offset + limit)
                : cluster.entityIds.slice(offset);
            
            // Fetch entities in parallel for better performance
            const entityPromises = paginatedEntityIds.map(entityId => 
                this.knowledgeGraph.getNode(entityId)
            );
            const entities = await Promise.all(entityPromises);
            return entities.filter((e): e is BaseEntity => e !== undefined);
        }

        // Fallback: fetch entities based on cluster metadata
        if (cluster.metadata.entityType) {
            // For entity-type clusters, use getEntitiesByType with pagination
            const entities = await this.knowledgeGraph.getEntitiesByType(cluster.metadata.entityType as EntityType, limit, offset);
            return entities;
        }

        if (cluster.metadata.domain) {
            // For domain clusters, get entities from domain distribution (optimized)
            const distribution = await this.knowledgeGraph.getDomainDistribution();
            const domainData = distribution[cluster.metadata.domain];
            if (domainData && domainData.entityIds.length > 0) {
                // Apply pagination to entityIds before fetching
                const paginatedEntityIds = limit !== undefined
                    ? domainData.entityIds.slice(offset, offset + limit)
                    : domainData.entityIds.slice(offset);
                
                // Fetch entities in parallel for better performance
                const entityPromises = paginatedEntityIds.map(entityId => 
                    this.knowledgeGraph.getNode(entityId)
                );
                const entities = await Promise.all(entityPromises);
                return entities.filter((e): e is BaseEntity => e !== undefined);
            }
        }

        if (cluster.metadata.jurisdiction) {
            // For jurisdiction clusters, get entities from jurisdiction distribution (optimized)
            const distribution = await this.knowledgeGraph.getJurisdictionDistribution();
            const jurisdictionData = distribution[cluster.metadata.jurisdiction];
            if (jurisdictionData && jurisdictionData.entityIds.length > 0) {
                // Apply pagination to entityIds before fetching
                const paginatedEntityIds = limit !== undefined
                    ? jurisdictionData.entityIds.slice(offset, offset + limit)
                    : jurisdictionData.entityIds.slice(offset);
                
                // Fetch entities in parallel for better performance
                const entityPromises = paginatedEntityIds.map(entityId => 
                    this.knowledgeGraph.getNode(entityId)
                );
                const entities = await Promise.all(entityPromises);
                return entities.filter((e): e is BaseEntity => e !== undefined);
            }
        }

        // No entities found
        return [];
    }

    /**
     * Invalidate clustering cache
     */
    invalidateCache(): void {
        this.metaGraphCache.clear();
        logger.info('GraphDB clustering cache invalidated');
    }
}

