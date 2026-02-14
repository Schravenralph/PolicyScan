/**
 * Service for clustering knowledge graph entities using GraphDB algorithms.
 * 
 * This service uses GraphDB's native community detection algorithms
 * to detect structural communities in the knowledge graph, which can then be used to build a meta-graph.
 * 
 * Note: GraphDB is the knowledge graph backend.
 */

import { Driver, Session, int, Integer } from 'neo4j-driver';
import { KnowledgeGraphService } from '../core/KnowledgeGraph.js';
import {
    KnowledgeMetaGraph,
    KnowledgeClusterNode,
    KnowledgeMetaEdge
} from './KnowledgeGraphClusteringService.js';
import { BaseEntity, EntityType, RelationType } from '../../../domain/ontology.js';
import { SemanticLabelingService } from '../../semantic/SemanticLabelingService.js';
import { logger } from '../../../utils/logger.js';

export type CommunityDetectionAlgorithm = 'louvain' | 'lpa' | 'leiden' | 'wcc' | 'infomap' | 'modularity' | 'kcore' | 'scc';

export interface CommunityDetectionOptions {
    maxIterations?: number;
    tolerance?: number;
    maxLevels?: number; // For Louvain/Leiden
    consecutiveIds?: boolean; // For LPA
}

export interface CommunityDetectionResult {
    algorithm: CommunityDetectionAlgorithm;
    communityCount: number;
    modularity?: number; // For Louvain/Leiden
    ranIterations?: number; // For LPA
    executionTime: number;
}

export interface CommunityStats {
    communityId: number;
    size: number;
    entityTypes: Record<EntityType, number>;
    representativeEntity?: BaseEntity;
}

export interface PageRankResult {
    nodePropertiesWritten: number;
    ranIterations: number;
    didConverge: boolean;
    executionTime: number;
}

export interface BetweennessResult {
    nodePropertiesWritten: number;
    executionTime: number;
}

export interface DegreeResult {
    nodePropertiesWritten: number;
    executionTime: number;
}

export interface EigenvectorResult {
    nodePropertiesWritten: number;
    ranIterations: number;
    didConverge: boolean;
    executionTime: number;
}

export interface AllMetricsResult {
    pagerank?: PageRankResult;
    betweenness?: BetweennessResult;
    degree?: DegreeResult;
    eigenvector?: EigenvectorResult;
    totalExecutionTime: number;
}

/**
 * Service for GDS-based community detection clustering
 */
export class KnowledgeGraphGDSClusteringService {
    private driver: Driver;
    private knowledgeGraph: KnowledgeGraphService;
    private projectionName = 'knowledgeGraph';
    private communityPropertyName = 'communityId';
    private semanticLabeling: SemanticLabelingService;
    
    // Property names for GDS metrics written to nodes
    public static readonly PROPERTY_NAMES = {
        communityId: 'communityId',
        pagerank: 'pagerank',
        betweenness: 'betweenness',
        degree: 'degree',
        eigenvector: 'eigenvector'
    };

    constructor(driver: Driver, knowledgeGraph: KnowledgeGraphService) {
        this.driver = driver;
        this.knowledgeGraph = knowledgeGraph;
        this.semanticLabeling = new SemanticLabelingService();
    }

    /**
     * Check if GDS plugin is available
     */
    async isGDSAvailable(): Promise<boolean> {
        const session = this.driver.session();
        try {
            // Try calling gds.version() - different Neo4j versions return different formats
            await session.run('CALL gds.version()');
            return true;
        } catch {
            // If version() fails, try listing graphs as alternative check
            try {
                await session.run('CALL gds.graph.list()');
                return true;
            } catch {
                return false;
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Create or update graph projection for GDS algorithms
     */
    async createGraphProjection(): Promise<void> {
        const session = this.driver.session();

        try {
            // Check if projection already exists
            const existingGraphs = await session.run('CALL gds.graph.list() YIELD graphName RETURN graphName');
            const graphNames = existingGraphs.records.map(r => r.get('graphName'));

            if (graphNames.includes(this.projectionName)) {
                logger.debug({ projectionName: this.projectionName }, 'Graph projection already exists');
                return;
            }

            logger.info({ projectionName: this.projectionName }, 'Creating graph projection');

            // First, discover what relationship types actually exist in the graph
            const relTypesResult = await session.run(`
                CALL db.relationshipTypes() YIELD relationshipType
                RETURN collect(relationshipType) as types
            `);
            const existingTypes = relTypesResult.records[0]?.get('types') as string[] || [];

            if (existingTypes.length === 0) {
                throw new Error('No relationship types found in the graph. Cannot create projection.');
            }

            logger.debug({ relationshipTypes: existingTypes, count: existingTypes.length }, 'Found relationship types');

            // Build relationship projection dynamically based on what exists
            const relProjections: Record<string, { orientation: string; properties: Record<string, never> }> = {};
            for (const relType of existingTypes) {
                relProjections[relType] = {
                    orientation: 'UNDIRECTED', // Use UNDIRECTED for community detection
                    properties: {}
                };
            }

            // Create graph projection with only existing relationship types
            const result = await session.run(`
                CALL gds.graph.project(
                    $projectionName,
                    'Entity',
                    $relProjections
                )
                YIELD graphName, nodeCount, relationshipCount
                RETURN graphName, nodeCount, relationshipCount
            `, { 
                projectionName: this.projectionName,
                relProjections
            });

            const record = result.records[0];
            const nodeCount = record.get('nodeCount');
            const relationshipCount = record.get('relationshipCount');
            logger.info({
                projectionName: this.projectionName,
                nodeCount,
                relationshipCount,
            }, 'Graph projection created successfully');
        } catch (error) {
            logger.error({ error, projectionName: this.projectionName }, 'Error creating graph projection');
            throw new Error(`Failed to create graph projection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            await session.close();
        }
    }

    /**
     * Drop graph projection (to free memory)
     */
    async dropGraphProjection(): Promise<void> {
        const session = this.driver.session();
        try {
            await session.run(`CALL gds.graph.drop($projectionName)`, {
                projectionName: this.projectionName
            });
            logger.info({ projectionName: this.projectionName }, 'Graph projection dropped');
        } catch (error) {
            // Ignore if projection doesn't exist
            if (error instanceof Error && !error.message.includes('does not exist')) {
                logger.error({ error, projectionName: this.projectionName }, 'Error dropping graph projection');
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Louvain algorithm
     */
    async detectCommunitiesLouvain(options: CommunityDetectionOptions = {}): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const {
                maxIterations = 10,
                tolerance = 0.0001,
                maxLevels = 10
            } = options;

            const result = await session.run(`
                CALL gds.louvain.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        tolerance: $tolerance,
                        maxLevels: $maxLevels
                    }
                )
                YIELD communityCount, modularity, modularities
                RETURN communityCount, modularity
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName,
                maxIterations: int(Math.floor(maxIterations)),
                tolerance: Number(tolerance),
                maxLevels: int(Math.floor(maxLevels))
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Louvain algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'louvain',
                communityCount: this.toNumber(record.get('communityCount')),
                modularity: record.get('modularity'),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Label Propagation Algorithm
     */
    async detectCommunitiesLPA(options: CommunityDetectionOptions = {}): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const {
                maxIterations = 10,
                consecutiveIds = true
            } = options;

            const result = await session.run(`
                CALL gds.labelPropagation.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        consecutiveIds: $consecutiveIds
                    }
                )
                YIELD communityCount, ranIterations
                RETURN communityCount, ranIterations
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName,
                maxIterations: int(Math.floor(maxIterations)),
                consecutiveIds: Boolean(consecutiveIds)
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Label Propagation algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'lpa',
                communityCount: this.toNumber(record.get('communityCount')),
                ranIterations: this.toNumber(record.get('ranIterations')),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Leiden algorithm
     */
    async detectCommunitiesLeiden(options: CommunityDetectionOptions = {}): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const {
                maxIterations = 10,
                tolerance = 0.0001
            } = options;

            const result = await session.run(`
                CALL gds.leiden.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        tolerance: $tolerance
                    }
                )
                YIELD communityCount, modularity
                RETURN communityCount, modularity
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName,
                maxIterations: int(Math.floor(maxIterations)),
                tolerance: Number(tolerance)
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Leiden algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'leiden',
                communityCount: this.toNumber(record.get('communityCount')),
                modularity: record.get('modularity'),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using specified algorithm
     */
    async detectCommunities(
        algorithm: CommunityDetectionAlgorithm = 'louvain',
        options: CommunityDetectionOptions = {}
    ): Promise<CommunityDetectionResult> {
        // Ensure graph projection exists
        await this.createGraphProjection();

        switch (algorithm) {
            case 'louvain':
                return this.detectCommunitiesLouvain(options);
            case 'lpa':
                return this.detectCommunitiesLPA(options);
            case 'leiden':
                return this.detectCommunitiesLeiden(options);
            case 'wcc':
                // WCC doesn't need options
                return this.detectCommunitiesWCC();
            case 'infomap':
                return this.detectCommunitiesInfomap(options);
            case 'modularity':
                return this.detectCommunitiesModularity(options);
            case 'kcore':
                return this.detectCommunitiesKCore(options);
            case 'scc':
                return this.detectCommunitiesSCC();
            default:
                throw new Error(`Unknown algorithm: ${algorithm}`);
        }
    }

    /**
     * Detect communities using K-Core decomposition
     * K-Core finds the largest subgraph where each node has at least k neighbors
     */
    async detectCommunitiesKCore(options: CommunityDetectionOptions = {}): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            // K-Core typically uses a k value, but GDS kcore.write doesn't take k as parameter
            // It finds the maximum k-core for each node
            const result = await session.run(`
                CALL gds.kcore.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName
                    }
                )
                YIELD nodePropertiesWritten
                RETURN nodePropertiesWritten
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS K-Core algorithm returned no results');
            }

            // Count distinct communities
            const communityCountResult = await session.run(`
                MATCH (e:Entity)
                WHERE e.${this.communityPropertyName} IS NOT NULL
                RETURN count(DISTINCT e.${this.communityPropertyName}) AS communityCount
            `);

            const communityCountRecord = communityCountResult.records[0];
            const communityCount = communityCountRecord 
                ? this.toNumber(communityCountRecord.get('communityCount'))
                : 0;

            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'kcore',
                communityCount,
                executionTime
            };
        } catch (error) {
            // K-Core might not be available in all GDS versions
            if (error instanceof Error && error.message.includes('does not exist')) {
                throw new Error('GDS K-Core algorithm is not available. Please ensure you have a compatible version of Neo4j GDS plugin installed.');
            }
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Strongly Connected Components (SCC)
     * SCC finds strongly connected components in directed graphs
     */
    async detectCommunitiesSCC(): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const result = await session.run(`
                CALL gds.scc.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName
                    }
                )
                YIELD componentCount
                RETURN componentCount
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS SCC algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'scc',
                communityCount: this.toNumber(record.get('componentCount')),
                executionTime
            };
        } catch (error) {
            // SCC might not be available in all GDS versions
            if (error instanceof Error && error.message.includes('does not exist')) {
                throw new Error('GDS SCC algorithm is not available. Please ensure you have a compatible version of Neo4j GDS plugin installed.');
            }
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Weakly Connected Components
     */
    async detectCommunitiesWCC(): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const result = await session.run(`
                CALL gds.wcc.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName
                    }
                )
                YIELD componentCount
                RETURN componentCount
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS WCC algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'wcc',
                communityCount: this.toNumber(record.get('componentCount')),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Infomap algorithm
     * Infomap uses information-theoretic principles to detect communities
     * by finding the optimal partition that minimizes the description length of random walks.
     */
    async detectCommunitiesInfomap(options: CommunityDetectionOptions = {}): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const {
                maxIterations = 10,
                tolerance = 0.0001
            } = options;

            const result = await session.run(`
                CALL gds.infomap.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        tolerance: $tolerance
                    }
                )
                YIELD communityCount, ranIterations, modularity
                RETURN communityCount, ranIterations, modularity
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName,
                maxIterations: int(Math.floor(maxIterations)),
                tolerance: Number(tolerance)
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Infomap algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'infomap',
                communityCount: this.toNumber(record.get('communityCount')),
                modularity: record.get('modularity'),
                ranIterations: this.toNumber(record.get('ranIterations')),
                executionTime
            };
        } catch (error) {
            // Infomap might not be available in all GDS versions
            if (error instanceof Error && error.message.includes('does not exist')) {
                throw new Error('GDS Infomap algorithm is not available. Please ensure you have a compatible version of Neo4j GDS plugin installed.');
            }
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Detect communities using Modularity Optimization algorithm
     * This algorithm optimizes modularity directly using a greedy approach.
     */
    async detectCommunitiesModularity(options: CommunityDetectionOptions = {}): Promise<CommunityDetectionResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            const {
                maxIterations = 10,
                tolerance = 0.0001
            } = options;

            const result = await session.run(`
                CALL gds.modularityOptimization.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        tolerance: $tolerance
                    }
                )
                YIELD communityCount, ranIterations, modularity
                RETURN communityCount, ranIterations, modularity
            `, {
                projectionName: this.projectionName,
                propertyName: this.communityPropertyName,
                maxIterations: int(Math.floor(maxIterations)),
                tolerance: Number(tolerance)
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Modularity Optimization algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                algorithm: 'modularity',
                communityCount: this.toNumber(record.get('communityCount')),
                modularity: record.get('modularity'),
                ranIterations: this.toNumber(record.get('ranIterations')),
                executionTime
            };
        } catch (error) {
            // Modularity Optimization might not be available in all GDS versions
            if (error instanceof Error && error.message.includes('does not exist')) {
                throw new Error('GDS Modularity Optimization algorithm is not available. Please ensure you have a compatible version of Neo4j GDS plugin installed.');
            }
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Get statistics for each community
     */
    async getCommunityStats(minClusterSize: number = 3): Promise<CommunityStats[]> {
        const session = this.driver.session();

        try {
            const result = await session.run(`
                MATCH (e:Entity)
                WHERE e.${this.communityPropertyName} IS NOT NULL
                WITH e.${this.communityPropertyName} AS communityId, e
                WITH communityId, collect(e) AS entities
                WHERE size(entities) >= $minClusterSize
                WITH communityId, entities,
                     [entity IN entities | entity.type] AS types
                RETURN communityId,
                       size(entities) AS size,
                       [type IN apoc.coll.frequencies(types) | {type: type.item, count: type.count}] AS typeDistribution,
                       entities[0].id AS representativeId
                ORDER BY size DESC
            `, { minClusterSize });

            const stats: CommunityStats[] = [];

            for (const record of result.records) {
                const communityId = this.toNumber(record.get('communityId'));
                const size = this.toNumber(record.get('size'));
                const representativeId = record.get('representativeId');

                // Get representative entity
                let representativeEntity: BaseEntity | undefined;
                if (representativeId) {
                    representativeEntity = await this.knowledgeGraph.getNode(representativeId);
                }

                // Parse type distribution
                const typeDistRaw = record.get('typeDistribution');
                const entityTypes: Record<EntityType, number> = {
                    PolicyDocument: 0,
                    Regulation: 0,
                    SpatialUnit: 0,
                    LandUse: 0,
                    Requirement: 0,
                    Concept: 0
                };

                if (Array.isArray(typeDistRaw)) {
                    typeDistRaw.forEach((item: { type: string; count: number }) => {
                        if (item.type in entityTypes) {
                            entityTypes[item.type as EntityType] = item.count;
                        }
                    });
                }

                stats.push({
                    communityId,
                    size,
                    entityTypes,
                    representativeEntity
                });
            }

            return stats;
        } catch (_error) {
            // Fallback if apoc is not available
            return this.getCommunityStatsSimple(minClusterSize);
        } finally {
            await session.close();
        }
    }

    /**
     * Simple community stats (fallback without apoc)
     */
    private async getCommunityStatsSimple(minClusterSize: number): Promise<CommunityStats[]> {
        const session = this.driver.session();

        try {
            const result = await session.run(`
                MATCH (e:Entity)
                WHERE e.${this.communityPropertyName} IS NOT NULL
                WITH e.${this.communityPropertyName} AS communityId, e
                WITH communityId, collect(e) AS entities
                WHERE size(entities) >= $minClusterSize
                RETURN communityId,
                       size(entities) AS size,
                       entities[0].id AS representativeId
                ORDER BY size DESC
            `, { minClusterSize });

            const stats: CommunityStats[] = [];

            for (const record of result.records) {
                const communityId = this.toNumber(record.get('communityId'));
                const size = this.toNumber(record.get('size'));
                const representativeId = record.get('representativeId');

                let representativeEntity: BaseEntity | undefined;
                if (representativeId) {
                    representativeEntity = await this.knowledgeGraph.getNode(representativeId);
                }

                stats.push({
                    communityId,
                    size,
                    entityTypes: {
                        PolicyDocument: 0,
                        Regulation: 0,
                        SpatialUnit: 0,
                        LandUse: 0,
                        Requirement: 0,
                        Concept: 0
                    },
                    representativeEntity
                });
            }

            return stats;
        } finally {
            await session.close();
        }
    }

    /**
     * Build meta-graph from detected communities
     */
    async buildMetaGraphFromCommunities(
        algorithm: CommunityDetectionAlgorithm = 'louvain',
        minClusterSize: number = 3,
        options: CommunityDetectionOptions = {}
    ): Promise<KnowledgeMetaGraph> {
        logger.info({ algorithm, minClusterSize }, 'Building meta-graph using GDS algorithm');
        const startTime = Date.now();

        // Detect communities
        const detectionResult = await this.detectCommunities(algorithm, options);
        logger.info({
            algorithm,
            communityCount: detectionResult.communityCount,
            executionTime: detectionResult.executionTime,
        }, 'Detected communities');

        // Get community statistics
        const communityStats = await this.getCommunityStats(minClusterSize);
        logger.info({
            minClusterSize,
            communityCount: communityStats.length,
        }, 'Found communities with minimum size');

        // Build cluster nodes - ONLY fetch existing labels, never generate
        const clusters: { [id: string]: KnowledgeClusterNode } = {};

        // Fetch existing labels from Neo4j (no generation - that's done separately)
        logger.debug({ clusterCount: communityStats.length }, 'Fetching existing labels for clusters');
        
        for (const stat of communityStats) {
            const clusterId = `gds-${algorithm}-${stat.communityId}`;
            
            // ONLY fetch existing label from Neo4j - never generate labels here
            // Label generation should be done separately via dedicated endpoint/script
            let label: string | null = await this.knowledgeGraph.getClusterLabel(clusterId);
            
            // If no label exists, use fallback based on entity type (no LLM calls)
            if (!label) {
                const dominantType = Object.entries(stat.entityTypes)
                    .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] as EntityType | undefined;
                label = dominantType 
                    ? `${this.getEntityTypeLabel(dominantType)} (${stat.communityId})`
                    : `Cluster ${stat.communityId}`;
            }

            clusters[clusterId] = {
                id: clusterId,
                label,
                type: 'knowledge-cluster',
                clusterType: 'category', // GDS communities are structural, but now with semantic labels
                level: 1,
                nodeCount: stat.size,
                entityIds: [], // Will be populated on-demand
                representativeEntity: stat.representativeEntity,
                metadata: {
                    entityType: Object.entries(stat.entityTypes)
                        .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] as EntityType | undefined,
                    category: `gds-${algorithm}-community`
                }
            };
        }
        
        logger.debug({ clusterCount: Object.keys(clusters).length }, 'Fetched labels for clusters');

        // Calculate inter-community edges
        const edges = await this.calculateInterCommunityEdges(
            communityStats.map(s => s.communityId),
            algorithm
        );

        // Get total node count
        const typeDistribution = await this.knowledgeGraph.getEntityTypeDistribution();
        const totalNodes = Object.values(typeDistribution).reduce((sum, count) => sum + count, 0);

        const elapsed = Date.now() - startTime;
        logger.info({
            elapsed,
            clusterCount: Object.keys(clusters).length,
            edgeCount: edges.length,
            algorithm,
        }, 'Meta-graph built');

        return {
            clusters,
            edges,
            totalNodes,
            totalClusters: Object.keys(clusters).length,
            metadata: {
                clusteringStrategy: `gds-${algorithm}`,
                entityTypeDistribution: typeDistribution as Record<EntityType, number>,
                // Include evaluation metrics
                evaluationMetrics: {
                    algorithm,
                    communityCount: detectionResult.communityCount,
                    modularity: detectionResult.modularity,
                    ranIterations: detectionResult.ranIterations,
                    executionTime: detectionResult.executionTime
                }
            }
        };
    }

    /**
     * Safely convert Neo4j Integer objects to JavaScript numbers
     * Handles: numbers, bigints, Neo4j Integer objects (with toNumber method), and low/high properties
     */
    private toNumber(value: unknown): number {
        if (value === undefined || value === null) {
            throw new Error('Cannot convert undefined or null to number');
        }
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'bigint') {
            return Number(value);
        }
        // Check if it's a Neo4j Integer object (has toNumber method)
        if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as Integer).toNumber === 'function') {
            return (value as Integer).toNumber();
        }
        // Check if it's a Neo4j Integer object with low/high properties
        if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
            const intValue = value as { low: number; high: number };
            // Convert Neo4j Integer to number
            return intValue.low + (intValue.high * 0x100000000);
        }
        throw new Error(`Cannot convert value to number: ${typeof value}`);
    }

    /**
     * Calculate edges between communities
     */
    private async calculateInterCommunityEdges(communityIds: number[], algorithm: CommunityDetectionAlgorithm): Promise<KnowledgeMetaEdge[]> {
        const session = this.driver.session();

        try {
            // Convert communityIds to Neo4j integers for comparison
            const communityIdInts = communityIds.map(id => int(id));
            
            const result = await session.run(`
                MATCH (source:Entity)-[r]->(target:Entity)
                WHERE source.${this.communityPropertyName} IS NOT NULL
                  AND target.${this.communityPropertyName} IS NOT NULL
                  AND source.${this.communityPropertyName} <> target.${this.communityPropertyName}
                WITH source.${this.communityPropertyName} AS sourceCommunity,
                     target.${this.communityPropertyName} AS targetCommunity,
                     type(r) AS relType
                WHERE sourceCommunity IN $communityIds AND targetCommunity IN $communityIds
                WITH sourceCommunity, targetCommunity, collect(DISTINCT relType) AS relTypes, count(*) AS edgeCount
                RETURN sourceCommunity, targetCommunity, relTypes, edgeCount
                ORDER BY edgeCount DESC
            `, { communityIds: communityIdInts });

            const edges: KnowledgeMetaEdge[] = [];

            for (const record of result.records) {
                const sourceCommunityRaw = record.get('sourceCommunity');
                const sourceCommunity = this.toNumber(sourceCommunityRaw);
                const targetCommunityRaw = record.get('targetCommunity');
                const targetCommunity = this.toNumber(targetCommunityRaw);
                const relTypes = record.get('relTypes') as string[];
                const weightRaw = record.get('edgeCount');
                const weight = this.toNumber(weightRaw);

                // Make algorithm dynamic based on what was used
                const algorithmPrefix = this.getAlgorithmPrefix(algorithm);
                edges.push({
                    source: `${algorithmPrefix}-${sourceCommunity}`,
                    target: `${algorithmPrefix}-${targetCommunity}`,
                    weight,
                    relationTypes: relTypes as RelationType[]
                });
            }

            return edges;
        } finally {
            await session.close();
        }
    }

    /**
     * Get all entities in a community for semantic labeling
     */
    private async getCommunityEntities(communityId: number): Promise<BaseEntity[]> {
        const session = this.driver.session();
        
        try {
            const result = await session.run(`
                MATCH (e:Entity)
                WHERE e.${this.communityPropertyName} = $communityId
                RETURN e.id AS id
                LIMIT 100
            `, { communityId: int(communityId) });

            const entityIds = result.records.map(r => r.get('id'));
            const entities: BaseEntity[] = [];

            // Fetch entities from knowledge graph service
            for (const entityId of entityIds) {
                const entity = await this.knowledgeGraph.getNode(entityId);
                if (entity) {
                    entities.push(entity);
                }
            }

            return entities;
        } finally {
            await session.close();
        }
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
     * Get algorithm prefix for cluster IDs
     */
    private getAlgorithmPrefix(algorithm: CommunityDetectionAlgorithm): string {
        return `gds-${algorithm}`;
    }

    /**
     * Compute and write PageRank to nodes
     * Returns PageRank scores for visualization (size, importance)
     */
    async computePageRank(maxIterations: number = 20, dampingFactor: number = 0.85): Promise<PageRankResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            await this.createGraphProjection();

            const result = await session.run(`
                CALL gds.pageRank.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        dampingFactor: $dampingFactor
                    }
                )
                YIELD nodePropertiesWritten, ranIterations, didConverge
                RETURN nodePropertiesWritten, ranIterations, didConverge
            `, {
                projectionName: this.projectionName,
                propertyName: KnowledgeGraphGDSClusteringService.PROPERTY_NAMES.pagerank,
                maxIterations: int(maxIterations),
                dampingFactor: Number(dampingFactor)
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS PageRank algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                nodePropertiesWritten: this.toNumber(record.get('nodePropertiesWritten')),
                ranIterations: this.toNumber(record.get('ranIterations')),
                didConverge: record.get('didConverge'),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Compute and write Betweenness Centrality to nodes
     * Returns betweenness scores (bottleneck nodes, bridge nodes)
     */
    async computeBetweennessCentrality(): Promise<BetweennessResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            await this.createGraphProjection();

            const result = await session.run(`
                CALL gds.betweenness.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName
                    }
                )
                YIELD nodePropertiesWritten
                RETURN nodePropertiesWritten
            `, {
                projectionName: this.projectionName,
                propertyName: KnowledgeGraphGDSClusteringService.PROPERTY_NAMES.betweenness
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Betweenness Centrality algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                nodePropertiesWritten: this.toNumber(record.get('nodePropertiesWritten')),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Compute and write Degree Centrality to nodes
     * Returns degree scores (number of connections)
     */
    async computeDegreeCentrality(): Promise<DegreeResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            await this.createGraphProjection();

            const result = await session.run(`
                CALL gds.degree.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName
                    }
                )
                YIELD nodePropertiesWritten
                RETURN nodePropertiesWritten
            `, {
                projectionName: this.projectionName,
                propertyName: KnowledgeGraphGDSClusteringService.PROPERTY_NAMES.degree
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Degree Centrality algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                nodePropertiesWritten: this.toNumber(record.get('nodePropertiesWritten')),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Compute and write Eigenvector Centrality to nodes
     * Returns eigenvector scores (influence based on connected nodes' importance)
     */
    async computeEigenvectorCentrality(maxIterations: number = 100, tolerance: number = 1e-6): Promise<EigenvectorResult> {
        const session = this.driver.session();
        const startTime = Date.now();

        try {
            await this.createGraphProjection();

            const result = await session.run(`
                CALL gds.eigenvector.write(
                    $projectionName,
                    {
                        writeProperty: $propertyName,
                        maxIterations: $maxIterations,
                        tolerance: $tolerance
                    }
                )
                YIELD nodePropertiesWritten, ranIterations, didConverge
                RETURN nodePropertiesWritten, ranIterations, didConverge
            `, {
                projectionName: this.projectionName,
                propertyName: KnowledgeGraphGDSClusteringService.PROPERTY_NAMES.eigenvector,
                maxIterations: int(maxIterations),
                tolerance: Number(tolerance)
            });

            const record = result.records[0];
            if (!record) {
                throw new Error('GDS Eigenvector Centrality algorithm returned no results');
            }
            const executionTime = Date.now() - startTime;

            return {
                nodePropertiesWritten: this.toNumber(record.get('nodePropertiesWritten')),
                ranIterations: this.toNumber(record.get('ranIterations')),
                didConverge: record.get('didConverge'),
                executionTime
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Compute all centrality metrics and write to nodes
     * This is a convenience method to run all metrics at once
     */
    async computeAllMetrics(options: {
        includePageRank?: boolean;
        includeBetweenness?: boolean;
        includeDegree?: boolean;
        includeEigenvector?: boolean;
        pagerankOptions?: { maxIterations?: number; dampingFactor?: number };
        eigenvectorOptions?: { maxIterations?: number; tolerance?: number };
    } = {}): Promise<AllMetricsResult> {
        const {
            includePageRank = true,
            includeBetweenness = true,
            includeDegree = true,
            includeEigenvector = false, // Slower, optional
            pagerankOptions = {},
            eigenvectorOptions = {}
        } = options;

        const startTime = Date.now();
        const results: Partial<AllMetricsResult> = {};

        logger.info('Computing centrality metrics');

        if (includePageRank) {
            logger.debug('Computing PageRank');
            results.pagerank = await this.computePageRank(
                pagerankOptions.maxIterations,
                pagerankOptions.dampingFactor
            );
        }

        if (includeBetweenness) {
            logger.debug('Computing Betweenness Centrality');
            results.betweenness = await this.computeBetweennessCentrality();
        }

        if (includeDegree) {
            logger.debug('Computing Degree Centrality');
            results.degree = await this.computeDegreeCentrality();
        }

        if (includeEigenvector) {
            logger.debug('Computing Eigenvector Centrality');
            results.eigenvector = await this.computeEigenvectorCentrality(
                eigenvectorOptions.maxIterations,
                eigenvectorOptions.tolerance
            );
        }

        results.totalExecutionTime = Date.now() - startTime;
        logger.info({
            totalExecutionTime: results.totalExecutionTime,
            metricsComputed: {
                pageRank: includePageRank,
                betweenness: includeBetweenness,
                degree: includeDegree,
                eigenvector: includeEigenvector,
            },
        }, 'All centrality metrics computed');

        return results as AllMetricsResult;
    }
}

