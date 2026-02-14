import { Driver } from 'neo4j-driver';
import { RelationType, EntityType, BaseEntity } from '../../domain/ontology.js';
import { BFSTraversal, TraversalConfig, TraversalResult, TraversalNode } from './traversal/BFSTraversal.js';

import { DFSTraversal } from './traversal/DFSTraversal.js';
import { WeightedTraversal, WeightedTraversalConfig, WeightFunction } from './traversal/WeightedTraversal.js';
import { AStarPathfinding, AStarConfig } from './traversal/AStarPathfinding.js';
import { RelevanceScorer, RelevanceScoringConfig } from './traversal/RelevanceScorer.js';
import { getFeatureFlagsService } from '../knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import { TraversalCache } from './traversal/TraversalCache.js';
import { CacheKeyGenerator } from './traversal/CacheKeyGenerator.js';
import { CacheInvalidator } from './traversal/CacheInvalidator.js';
import { VectorService } from '../query/VectorService.js';

// Re-export TraversalResult for external use
export type { TraversalResult } from './traversal/BFSTraversal.js';

/**
 * Traversal strategy types
 */
export type TraversalStrategy = 'bfs' | 'dfs' | 'hybrid' | 'weighted-bfs' | 'weighted-dfs' | 'relevance-based';

export interface TraversalOptions extends TraversalConfig {
    strategy?: TraversalStrategy;
    // Weighted traversal options
    weightFunction?: WeightFunction;
    minWeight?: number;
    prioritizeHighWeight?: boolean;
    // A* pathfinding options (used when finding paths)
    costMetric?: 'hop' | 'weight' | 'relevance';
    heuristicFunction?: (nodeId: string, goalId: string) => Promise<number> | number;
    // Relevance-based options
    relevanceConfig?: RelevanceScoringConfig;
    earlyTerminationThreshold?: number;
}

export interface PathResult {
    path: string[];
    nodes: BaseEntity[];
    edges: Array<{ sourceId: string; targetId: string; type: RelationType }>;
    depth: number;
}

export interface SubgraphResult {
    nodes: BaseEntity[];
    edges: Array<{ sourceId: string; targetId: string; type: RelationType }>;
    centerNodeId: string;
    radius: number;
}

/**
 * Graph Traversal Service for Multi-Hop Reasoning
 * 
 * Provides BFS and DFS traversal capabilities for querying the knowledge graph
 * with multi-hop reasoning support. Enables complex queries requiring relationship
 * traversal across multiple hops.
 */
export class GraphTraversalService {
    private driver: Driver;
    private bfsTraversal: BFSTraversal;
    private dfsTraversal: DFSTraversal;
    private weightedTraversal: WeightedTraversal;
    private aStarPathfinding: AStarPathfinding;
    private featureFlagsService = getFeatureFlagsService();
    private cache: TraversalCache;
    private cacheInvalidator: CacheInvalidator;
    private cacheEnabled: boolean = false;
    private vectorService?: VectorService;

    constructor(driver: Driver, vectorService?: VectorService, cacheConfig?: { maxSize?: number; defaultTTL?: number }) {
        this.driver = driver;
        this.bfsTraversal = new BFSTraversal(driver);
        this.dfsTraversal = new DFSTraversal(driver);
        this.weightedTraversal = new WeightedTraversal(driver);
        this.aStarPathfinding = new AStarPathfinding(driver);
        // Store vector service for relevance scoring if provided
        this.vectorService = vectorService;
        
        // Initialize cache
        const maxSize = cacheConfig?.maxSize ?? 1000;
        const defaultTTL = cacheConfig?.defaultTTL ?? 60 * 60 * 1000; // 1 hour default
        this.cache = new TraversalCache(maxSize, defaultTTL);
        this.cacheInvalidator = new CacheInvalidator(this.cache);
        
        // Check if caching is enabled via feature flag
        this.cacheEnabled = this.featureFlagsService.isEnabled(KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED, false);
    }

    /**
     * Check if traversal is enabled via feature flag
     */
    private isEnabled(): boolean {
        return this.featureFlagsService.isEnabled(KGFeatureFlag.KG_TRAVERSAL_ENABLED, false);
    }

    /**
     * Perform graph traversal from a starting node
     * @param startNodeId The starting node ID
     * @param options Traversal options
     * @returns Traversal result
     */
    async traverse(
        startNodeId: string,
        options: Partial<TraversalOptions> = {}
    ): Promise<TraversalResult> {
        if (!this.isEnabled()) {
            logger.warn('[GraphTraversal] Traversal is disabled via feature flag');
            return {
                nodes: [],
                edges: [],
                visitedCount: 0,
                depthReached: 0,
            };
        }

        const config: TraversalOptions = {
            maxDepth: options.maxDepth ?? 3,
            maxNodes: options.maxNodes ?? 1000,
            relationshipTypes: options.relationshipTypes,
            entityTypes: options.entityTypes,
            direction: options.direction ?? 'both',
            strategy: options.strategy ?? 'bfs',
            weightFunction: options.weightFunction,
            minWeight: options.minWeight,
            prioritizeHighWeight: options.prioritizeHighWeight,
            relevanceConfig: options.relevanceConfig,
            earlyTerminationThreshold: options.earlyTerminationThreshold,
        };

        // Check cache if caching is enabled
        if (this.cacheEnabled) {
            const cacheKey = CacheKeyGenerator.generateTraverseKey(startNodeId, config);
            const cached = await this.cache.get(cacheKey);
            if (cached && 'visitedCount' in cached) {
                logger.debug(`[GraphTraversal] Cache hit for traverse operation`);
                return cached as TraversalResult;
            }
        }

        const startTime = Date.now();

        let result: TraversalResult;
        
        if (config.strategy === 'weighted-bfs') {
            // Weighted BFS traversal
            const weightedConfig: WeightedTraversalConfig = {
                maxDepth: config.maxDepth,
                maxNodes: config.maxNodes,
                relationshipTypes: config.relationshipTypes,
                entityTypes: config.entityTypes,
                direction: config.direction,
                weightFunction: config.weightFunction,
                minWeight: config.minWeight,
                prioritizeHighWeight: config.prioritizeHighWeight,
            };
            result = await this.weightedTraversal.traverseBFS(startNodeId, weightedConfig);
        } else if (config.strategy === 'weighted-dfs') {
            // Weighted DFS traversal
            const weightedConfig: WeightedTraversalConfig = {
                maxDepth: config.maxDepth,
                maxNodes: config.maxNodes,
                relationshipTypes: config.relationshipTypes,
                entityTypes: config.entityTypes,
                direction: config.direction,
                weightFunction: config.weightFunction,
                minWeight: config.minWeight,
                prioritizeHighWeight: config.prioritizeHighWeight,
            };
            result = await this.weightedTraversal.traverseDFS(startNodeId, weightedConfig);
        } else if (config.strategy === 'relevance-based') {
            // Relevance-based traversal (uses weighted traversal with relevance scoring)
            result = await this.relevanceBasedTraverse(startNodeId, config);
        } else if (config.strategy === 'dfs') {
            result = await this.dfsTraversal.traverse(startNodeId, config);
        } else if (config.strategy === 'hybrid') {
            // Hybrid: BFS for first 2 levels, then DFS for deeper exploration
            const bfsConfig = { ...config, maxDepth: Math.min(2, config.maxDepth) };
            const bfsResult = await this.bfsTraversal.traverse(startNodeId, bfsConfig);
            
            if (config.maxDepth > 2) {
                // Continue with DFS from BFS results
                const dfsConfig = { ...config, maxDepth: config.maxDepth - 2 };
                const dfsResults: TraversalResult[] = [];
                
                // Get unique nodes at depth 2
                const depth2Nodes = bfsResult.nodes.filter(n => n.depth === 2);
                const uniqueDepth2Nodes = Array.from(new Set(depth2Nodes.map(n => n.id)));
                
                for (const nodeId of uniqueDepth2Nodes.slice(0, 10)) { // Limit to 10 nodes
                    const dfsResult = await this.dfsTraversal.traverse(nodeId, dfsConfig);
                    dfsResults.push(dfsResult);
                }
                
                // Merge results
                result = this.mergeTraversalResults(bfsResult, dfsResults);
            } else {
                result = bfsResult;
            }
        } else {
            result = await this.bfsTraversal.traverse(startNodeId, config);
        }

        const duration = Date.now() - startTime;
        logger.debug(
            `[GraphTraversal] Traversed ${result.visitedCount} nodes in ${duration}ms ` +
            `(depth: ${result.depthReached}, strategy: ${config.strategy})`
        );

        // Cache result if caching is enabled
        if (this.cacheEnabled) {
            const cacheKey = CacheKeyGenerator.generateTraverseKey(startNodeId, config);
            await this.cache.set(cacheKey, result, undefined, {
                cachedAt: Date.now(),
                operation: 'traverse',
                nodeId: startNodeId,
                depth: result.depthReached,
            });
        }

        return result;
    }

    /**
     * Find a path between two nodes
     * @param startNodeId Starting node ID
     * @param endNodeId Target node ID
     * @param options Traversal options (can specify A* options)
     * @returns Path result if found, null otherwise
     */
    async findPath(
        startNodeId: string,
        endNodeId: string,
        options: Partial<TraversalOptions> = {}
    ): Promise<PathResult | null> {
        if (!this.isEnabled()) {
            return null;
        }

        // Check cache if caching is enabled
        if (this.cacheEnabled) {
            const cacheKey = CacheKeyGenerator.generateFindPathKey(startNodeId, endNodeId, options);
            const cached = await this.cache.get(cacheKey);
            if (cached && 'path' in cached) {
                logger.debug(`[GraphTraversal] Cache hit for findPath operation`);
                return cached as PathResult;
            }
        }

        const startTime = Date.now();

        // Check if A* pathfinding is requested (via costMetric option)
        if (options.costMetric) {
            // Use A* pathfinding for optimal path
            const aStarConfig: AStarConfig = {
                maxDepth: options.maxDepth ?? 10,
                maxNodes: options.maxNodes ?? 1000,
                relationshipTypes: options.relationshipTypes,
                entityTypes: options.entityTypes,
                direction: options.direction ?? 'both',
                weightFunction: options.weightFunction,
                heuristicFunction: options.heuristicFunction,
                costMetric: options.costMetric,
            };

            const pathfindingResult = await this.aStarPathfinding.findPath(startNodeId, endNodeId, aStarConfig);
            
            if (!pathfindingResult.path || pathfindingResult.path.length === 0) {
                return null;
            }

            // Get nodes along the path
            const pathNodes = await this.getNodesByIds(pathfindingResult.path);

            // Get edges along the path
            const pathEdges: Array<{ sourceId: string; targetId: string; type: RelationType }> = [];
            for (let i = 0; i < pathfindingResult.path.length - 1; i++) {
                // Query edges between consecutive nodes
                const edge = await this.getEdge(pathfindingResult.path[i], pathfindingResult.path[i + 1]);
                if (edge) {
                    pathEdges.push(edge);
                }
            }

            const duration = Date.now() - startTime;
            logger.debug(
                `[GraphTraversal] Found optimal path of length ${pathfindingResult.path.length} ` +
                `(cost: ${pathfindingResult.cost.toFixed(2)}) in ${duration}ms using A*`
            );

            return {
                path: pathfindingResult.path,
                nodes: pathNodes,
                edges: pathEdges,
                depth: pathfindingResult.depth,
            };
        } else {
            // Use BFS for shortest path (original implementation)
            const config: TraversalOptions = {
                maxDepth: options.maxDepth ?? 5,
                maxNodes: options.maxNodes ?? 1000,
                relationshipTypes: options.relationshipTypes,
                entityTypes: options.entityTypes,
                direction: options.direction ?? 'both',
                strategy: options.strategy ?? 'bfs', // BFS finds shortest path
            };

            const result = await this.bfsTraversal.traverse(startNodeId, config);

            // Find path to end node
            const endNode = result.nodes.find(n => n.id === endNodeId);
            if (!endNode) {
                return null;
            }

            // Get nodes along the path
            const pathNodes = await this.getNodesByIds(endNode.path);

            // Get edges along the path
            const pathEdges: Array<{ sourceId: string; targetId: string; type: RelationType }> = [];
            for (let i = 0; i < endNode.path.length - 1; i++) {
                const edge = result.edges.find(
                    e => e.sourceId === endNode.path[i] && e.targetId === endNode.path[i + 1]
                ) || result.edges.find(
                    e => e.targetId === endNode.path[i] && e.sourceId === endNode.path[i + 1]
                );
                if (edge) {
                    pathEdges.push(edge);
                }
            }

            const duration = Date.now() - startTime;
            logger.debug(
                `[GraphTraversal] Found path of length ${endNode.path.length} in ${duration}ms using BFS`
            );

            const pathResult: PathResult = {
                path: endNode.path,
                nodes: pathNodes,
                edges: pathEdges,
                depth: endNode.depth,
            };

            // Cache result if caching is enabled
            if (this.cacheEnabled) {
                const cacheKey = CacheKeyGenerator.generateFindPathKey(startNodeId, endNodeId, options);
                await this.cache.set(cacheKey, pathResult, undefined, {
                    cachedAt: Date.now(),
                    operation: 'findPath',
                    nodeId: startNodeId,
                });
            }

            return pathResult;
        }
    }

    /**
     * Extract a subgraph around a node
     * @param centerNodeId The center node ID
     * @param radius The radius (max depth) of the subgraph
     * @param options Traversal options
     * @returns Subgraph result
     */
    async extractSubgraph(
        centerNodeId: string,
        radius: number = 2,
        options: Partial<Omit<TraversalOptions, 'maxDepth'>> = {}
    ): Promise<SubgraphResult> {
        if (!this.isEnabled()) {
            return {
                nodes: [],
                edges: [],
                centerNodeId,
                radius: 0,
            };
        }

        // Check cache if caching is enabled
        if (this.cacheEnabled) {
            const cacheKey = CacheKeyGenerator.generateSubgraphKey(centerNodeId, radius, options);
            const cached = await this.cache.get(cacheKey);
            if (cached && 'centerNodeId' in cached) {
                logger.debug(`[GraphTraversal] Cache hit for extractSubgraph operation`);
                return cached as SubgraphResult;
            }
        }

        const config: TraversalOptions = {
            maxDepth: radius,
            maxNodes: options.maxNodes ?? 1000,
            relationshipTypes: options.relationshipTypes,
            entityTypes: options.entityTypes,
            direction: options.direction ?? 'both',
            strategy: options.strategy ?? 'bfs',
        };

        const result = await this.traverse(centerNodeId, config);

        // Get all nodes
        const nodeIds = Array.from(new Set([
            ...result.nodes.map(n => n.id),
            ...result.edges.flatMap(e => [e.sourceId, e.targetId]),
        ]));
        const nodes = await this.getNodesByIds(nodeIds);

        const subgraphResult: SubgraphResult = {
            nodes,
            edges: result.edges,
            centerNodeId,
            radius: result.depthReached,
        };

        // Cache result if caching is enabled
        if (this.cacheEnabled) {
            const cacheKey = CacheKeyGenerator.generateSubgraphKey(centerNodeId, radius, options);
            await this.cache.set(cacheKey, subgraphResult, undefined, {
                cachedAt: Date.now(),
                operation: 'extractSubgraph',
                nodeId: centerNodeId,
                depth: radius,
            });
        }

        return subgraphResult;
    }

    /**
     * Get nodes by their IDs
     */
    private async getNodesByIds(nodeIds: string[]): Promise<BaseEntity[]> {
        if (nodeIds.length === 0) {
            return [];
        }

        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (e:Entity)
                WHERE e.id IN $nodeIds
                RETURN e
                `,
                { nodeIds }
            );

            return result.records.map(record => {
                const node = record.get('e');
                return {
                    id: node.properties.id,
                    type: node.properties.type as EntityType,
                    name: node.properties.name,
                    description: node.properties.description,
                    metadata: node.properties.metadata ? JSON.parse(node.properties.metadata) : undefined,
                    uri: node.properties.uri,
                    schemaType: node.properties.schemaType,
                } as BaseEntity;
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Relevance-based traversal with early termination
     */
    private async relevanceBasedTraverse(
        startNodeId: string,
        config: TraversalOptions
    ): Promise<TraversalResult> {
        // Create relevance scorer
        const relevanceConfig: RelevanceScoringConfig = {
            queryEmbedding: config.relevanceConfig?.queryEmbedding,
            threshold: config.relevanceConfig?.threshold ?? 0.0,
            earlyTerminationThreshold: config.earlyTerminationThreshold ?? config.relevanceConfig?.earlyTerminationThreshold ?? 0.3,
            vectorWeight: config.relevanceConfig?.vectorWeight,
            graphWeight: config.relevanceConfig?.graphWeight,
        };
        const relevanceScorer = new RelevanceScorer(relevanceConfig, this.vectorService);

        // Use weighted traversal with relevance scoring
        const weightedConfig: WeightedTraversalConfig = {
            maxDepth: config.maxDepth ?? 3,
            maxNodes: config.maxNodes ?? 1000,
            relationshipTypes: config.relationshipTypes,
            entityTypes: config.entityTypes,
            direction: config.direction ?? 'both',
            weightFunction: config.weightFunction,
            minWeight: config.minWeight,
            prioritizeHighWeight: config.prioritizeHighWeight ?? true,
        };

        // Perform weighted traversal
        const result = await this.weightedTraversal.traverseBFS(startNodeId, weightedConfig);

        // Filter nodes by relevance threshold
        const filteredNodes: TraversalNode[] = [];
        const filteredEdges = result.edges;
        const visitedIds = new Set<string>();

        for (const node of result.nodes) {
            // Get node entity for relevance scoring
            const nodeEntity = await this.getNodeEntity(node.id);
            const relevance = await relevanceScorer.calculateRelevance(node.id, nodeEntity);

            // Check if meets threshold
            if (relevanceScorer.meetsThreshold(relevance)) {
                filteredNodes.push(node);
                visitedIds.add(node.id);
            } else if (relevanceScorer.shouldTerminateEarly(relevance)) {
                // Early termination: skip remaining nodes at this depth
                break;
            }
        }

        return {
            nodes: filteredNodes,
            edges: filteredEdges.filter(e => visitedIds.has(e.sourceId) && visitedIds.has(e.targetId)),
            visitedCount: filteredNodes.length,
            depthReached: result.depthReached,
        };
    }

    /**
     * Get a single edge between two nodes
     */
    private async getEdge(sourceId: string, targetId: string): Promise<{ sourceId: string; targetId: string; type: RelationType } | null> {
        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (source:Entity {id: $sourceId})-[r:RELATES_TO]->(target:Entity {id: $targetId})
                RETURN r.type AS type
                LIMIT 1
                `,
                { sourceId, targetId }
            );

            if (result.records.length === 0) {
                // Try reverse direction
                const reverseResult = await session.run(
                    `
                    MATCH (source:Entity {id: $targetId})-[r:RELATES_TO]->(target:Entity {id: $sourceId})
                    RETURN r.type AS type
                    LIMIT 1
                    `,
                    { sourceId: targetId, targetId: sourceId }
                );

                if (reverseResult.records.length === 0) {
                    return null;
                }

                return {
                    sourceId: targetId,
                    targetId: sourceId,
                    type: reverseResult.records[0].get('type') as RelationType,
                };
            }

            return {
                sourceId,
                targetId,
                type: result.records[0].get('type') as RelationType,
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Get node entity for relevance scoring
     */
    private async getNodeEntity(nodeId: string): Promise<BaseEntity | undefined> {
        const nodes = await this.getNodesByIds([nodeId]);
        return nodes[0];
    }

    /**
     * Merge multiple traversal results
     */
    private mergeTraversalResults(
        base: TraversalResult,
        additional: TraversalResult[]
    ): TraversalResult {
        const merged: TraversalResult = {
            nodes: [...base.nodes],
            edges: [...base.edges],
            visitedCount: base.visitedCount,
            depthReached: base.depthReached,
        };

        const nodeIds = new Set(base.nodes.map(n => n.id));
        const edgeKeys = new Set(
            base.edges.map(e => `${e.sourceId}-${e.targetId}-${e.type}`)
        );

        for (const result of additional) {
            merged.visitedCount += result.visitedCount;
            merged.depthReached = Math.max(merged.depthReached, result.depthReached);

            for (const node of result.nodes) {
                if (!nodeIds.has(node.id)) {
                    merged.nodes.push(node);
                    nodeIds.add(node.id);
                }
            }

            for (const edge of result.edges) {
                const key = `${edge.sourceId}-${edge.targetId}-${edge.type}`;
                if (!edgeKeys.has(key)) {
                    merged.edges.push(edge);
                    edgeKeys.add(key);
                }
            }
        }

        return merged;
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }

    /**
     * Clear traversal cache
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Invalidate cache for a specific node
     */
    async invalidateNodeCache(nodeId: string): Promise<number> {
        return await this.cacheInvalidator.invalidateNode(nodeId);
    }

    /**
     * Invalidate cache for multiple nodes
     */
    async invalidateNodesCache(nodeIds: string[]): Promise<number> {
        return await this.cacheInvalidator.invalidateNodes(nodeIds);
    }

    /**
     * Invalidate cache for a relationship type
     */
    async invalidateRelationshipCache(relationshipType: RelationType): Promise<number> {
        return await this.cacheInvalidator.invalidateRelationship(relationshipType);
    }

    /**
     * Get cache invalidator (for advanced invalidation strategies)
     */
    getCacheInvalidator(): CacheInvalidator {
        return this.cacheInvalidator;
    }
}
