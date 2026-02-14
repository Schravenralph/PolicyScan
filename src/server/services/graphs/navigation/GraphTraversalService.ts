/**
 * Graph Traversal Service for Navigation Graph
 * 
 * Provides graph traversal algorithms (BFS, depth calculation) for NavigationGraph.
 * Extracted from NavigationGraph.ts to improve maintainability and testability.
 * 
 * This service handles:
 * - BFS traversal for subgraph extraction
 * - Maximum depth calculation
 * - Traversal strategies (bfs_traversal, all_nodes_fallback, isolated_root_fallback)
 */

import type { Driver, Session } from 'neo4j-driver';
import type { NavigationNode } from '../../../types/navigationGraph.js';
import { logger } from '../../../utils/logger.js';
import { Neo4jQueryBuilder } from './Neo4jQueryBuilder.js';

/**
 * Filter options for subgraph extraction
 */
export interface SubgraphFilters {
    documentType?: string | string[];
    publishedAfter?: string;
    publishedBefore?: string;
    publisherAuthority?: string | string[];
    recentlyPublished?: string; // e.g., "30d"
    recentlyVisited?: string; // e.g., "7d"
    lastVisitedAfter?: string;
    lastVisitedBefore?: string;
}

/**
 * Options for subgraph extraction
 */
export interface SubgraphOptions {
    startNode?: string;
    maxDepth?: number;
    maxNodes?: number;
    runId?: string;
    workflowId?: string;
    filters?: SubgraphFilters;
}

/**
 * Result of subgraph extraction
 */
export interface SubgraphResult {
    nodes: { [url: string]: NavigationNode };
    rootUrl: string;
    metadata: {
        totalNodesInGraph: number;
        nodesReturned: number;
        totalEdgesInGraph: number;
        edgesReturned: number;
        depthLimit: number;
        startNode: string;
    };
}

/**
 * Service for graph traversal operations
 */
export class GraphTraversalService {
    constructor(
        private driver: Driver,
        private queryBuilder: Neo4jQueryBuilder
    ) {}

    /**
     * Parse a Neo4j node record into a NavigationNode
     */
    private parseNodeFromRecord(
        record: any,
        childrenKey: string = 'children'
    ): NavigationNode | null {
        const neo4jNode = record.get('n');
        if (!neo4jNode) {
            return null;
        }

        const nodeProps = neo4jNode.properties;
        const children = record.get(childrenKey)?.filter((c: string | null) => c !== null) || [];

        // Safely parse xpaths if present
        let xpaths: { [key: string]: string } | undefined;
        if (nodeProps.xpaths) {
            try {
                xpaths = typeof nodeProps.xpaths === 'string' 
                    ? JSON.parse(nodeProps.xpaths) 
                    : nodeProps.xpaths;
            } catch (error) {
                logger.warn({ url: nodeProps.url, error }, 'Failed to parse xpaths for node');
                xpaths = undefined;
            }
        }

        return {
            url: nodeProps.url,
            type: nodeProps.type,
            title: nodeProps.title,
            filePath: nodeProps.filePath,
            children: children,
            lastVisited: nodeProps.lastVisited,
            schemaType: nodeProps.schemaType,
            uri: nodeProps.uri,
            sourceUrl: nodeProps.sourceUrl || nodeProps.url,
            ...(xpaths && { xpaths }),
            ...(nodeProps.thema && { thema: nodeProps.thema }),
            ...(nodeProps.onderwerp && { onderwerp: nodeProps.onderwerp }),
            ...(nodeProps.content && { content: nodeProps.content }),
            ...(nodeProps.summary && { summary: nodeProps.summary }),
            ...(nodeProps.documentType && { documentType: nodeProps.documentType }),
            ...(nodeProps.publishedAt && { publishedAt: nodeProps.publishedAt }),
            ...(nodeProps.publisherAuthority && { publisherAuthority: nodeProps.publisherAuthority })
        };
    }

    /**
     * Get a subgraph using BFS traversal
     * 
     * @param session Neo4j session
     * @param options Traversal options
     * @param getNode Function to get a single node by URL
     * @param getRoot Function to get the root URL
     * @returns Subgraph result
     */
    async getSubgraph(
        session: Session,
        options: SubgraphOptions,
        getNode: (url: string) => Promise<NavigationNode | undefined>,
        getRoot: () => Promise<string>
    ): Promise<SubgraphResult> {
        const startTime = Date.now();
        const {
            startNode: providedStartNode,
            maxDepth: rawMaxDepth = 3,
            maxNodes: rawMaxNodes = 500,
            runId,
            workflowId
        } = options;
        
        // Ensure maxNodes is an integer (Neo4j LIMIT requires integer, not float)
        const maxNodes = Math.floor(rawMaxNodes);

        // Clamp maxDepth to safe limit (1-50) to prevent performance issues with unbounded traversal
        const maxDepth = Math.max(1, Math.min(Math.floor(rawMaxDepth), 50));

        const startNode = providedStartNode || await getRoot();
        const contextInfo = {
            runId,
            workflowId,
            operation: 'getSubgraph' as const,
            startNode: startNode || 'none',
            maxDepth,
            maxNodes,
        };

        logger.debug(contextInfo, 'Getting navigation graph subgraph');

        // Get total node count
        const totalQuery = this.queryBuilder.buildGetNodeCountQuery();
        const totalResult = await session.run(totalQuery);
        const totalNodes = totalResult.records[0]?.get('total')?.toNumber() ?? 0;

        // If no start node, return a sample of all nodes instead of empty subgraph
        let strategy: 'bfs_traversal' | 'all_nodes_fallback' | 'isolated_root_fallback' = 'bfs_traversal';
        if (!startNode) {
            strategy = 'all_nodes_fallback';
            logger.debug({ ...contextInfo, strategy }, 'No start node provided, using all_nodes_fallback strategy');
            
            return this.getAllNodesFallback(session, maxNodes, totalNodes, maxDepth, contextInfo, options.filters);
        }

        // BFS traversal using Neo4j path queries
        const bfsQuery = this.queryBuilder.buildBfsTraversalQuery(startNode, maxDepth, maxNodes, options.filters);
        const subgraphResult = await session.run(bfsQuery.query, bfsQuery.params);

        const nodes: { [url: string]: NavigationNode } = {};
        let edgeCount = 0;

        // Also include the start node
        const startNodeData = await getNode(startNode);
        if (startNodeData) {
            nodes[startNode] = startNodeData;
            edgeCount += startNodeData.children.length;
        }

        // Parse traversal results
        for (const record of subgraphResult.records) {
            const node = this.parseNodeFromRecord(record);
            if (node) {
                nodes[node.url] = node;
                edgeCount += node.children.length;
            }
        }

        // If only the start node was found (no connections), return a sample of all nodes instead
        if (Object.keys(nodes).length === 1 && nodes[startNode] && totalNodes > 1) {
            strategy = 'isolated_root_fallback';
            logger.debug({ ...contextInfo, strategy, startNode, totalNodes }, 'Start node has no connections, using isolated_root_fallback strategy');
            
            return this.getIsolatedRootFallback(
                session,
                startNode,
                maxNodes,
                totalNodes,
                maxDepth,
                nodes,
                edgeCount,
                contextInfo
            );
        }

        // Get total edge count
        const edgeCountQuery = this.queryBuilder.buildGetEdgeCountQuery();
        const edgeResult = await session.run(edgeCountQuery);
        const totalEdges = edgeResult.records[0]?.get('total')?.toNumber() ?? 0;

        const nodesReturned = Object.keys(nodes).length;
        const duration = (Date.now() - startTime) / 1000;
        logger.info({
            ...contextInfo,
            strategy,
            totalNodes,
            nodesReturned,
            totalEdgesInGraph: totalEdges,
            edgesReturned: edgeCount,
            duration,
        }, 'Navigation graph subgraph retrieved using BFS traversal');

        return {
            nodes,
            rootUrl: startNode,
            metadata: {
                totalNodesInGraph: totalNodes,
                nodesReturned,
                totalEdgesInGraph: totalEdges,
                edgesReturned: edgeCount,
                depthLimit: maxDepth,
                startNode
            }
        };
    }

    /**
     * Fallback strategy: return all nodes ordered by updatedAt
     */
    private async getAllNodesFallback(
        session: Session,
        maxNodes: number,
        totalNodes: number,
        maxDepth: number,
        contextInfo: Record<string, unknown>,
        filters?: SubgraphFilters
    ): Promise<SubgraphResult> {
        const allNodesQuery = this.queryBuilder.buildGetNodesOrderedByUpdatedQuery(maxNodes, filters);
        const allNodesResult = await session.run(allNodesQuery.query, allNodesQuery.params);

        const nodes: { [url: string]: NavigationNode } = {};
        let edgeCount = 0;

        for (const record of allNodesResult.records) {
            const node = this.parseNodeFromRecord(record);
            if (node) {
                nodes[node.url] = node;
                edgeCount += node.children.length;
            }
        }

        const edgeCountQuery = this.queryBuilder.buildGetEdgeCountQuery();
        const edgeResult = await session.run(edgeCountQuery);
        const totalEdges = edgeResult.records[0]?.get('total')?.toNumber() ?? 0;

        const nodesReturned = Object.keys(nodes).length;
        const duration = (Date.now() - Date.now()) / 1000; // Will be recalculated by caller
        logger.info({
            ...contextInfo,
            strategy: 'all_nodes_fallback',
            totalNodes,
            nodesReturned,
            totalEdgesInGraph: totalEdges,
            edgesReturned: edgeCount,
            duration,
        }, 'Navigation graph subgraph retrieved using all_nodes_fallback strategy');

        return {
            nodes,
            rootUrl: '',
            metadata: {
                totalNodesInGraph: totalNodes,
                nodesReturned,
                totalEdgesInGraph: totalEdges,
                edgesReturned: edgeCount,
                depthLimit: maxDepth,
                startNode: ''
            }
        };
    }

    /**
     * Fallback strategy: isolated root - return start node + sample of other nodes
     */
    private async getIsolatedRootFallback(
        session: Session,
        startNode: string,
        maxNodes: number,
        totalNodes: number,
        maxDepth: number,
        existingNodes: { [url: string]: NavigationNode },
        existingEdgeCount: number,
        contextInfo: Record<string, unknown>
    ): Promise<SubgraphResult> {
        // Subtract 1 from maxNodes because the start node is already in existingNodes
        const additionalNodesNeeded = Math.max(0, maxNodes - 1);
        const excludeUrlQuery = this.queryBuilder.buildGetNodesExcludingUrlQuery(startNode, additionalNodesNeeded);
        const allNodesResult = await session.run(excludeUrlQuery.query, excludeUrlQuery.params);

        const nodes = { ...existingNodes };
        let edgeCount = existingEdgeCount;

        for (const record of allNodesResult.records) {
            const node = this.parseNodeFromRecord(record);
            if (node) {
                nodes[node.url] = node;
                edgeCount += node.children.length;
            }
        }

        const edgeCountQuery = this.queryBuilder.buildGetEdgeCountQuery();
        const edgeResult = await session.run(edgeCountQuery);
        const totalEdges = edgeResult.records[0]?.get('total')?.toNumber() ?? 0;

        const nodesReturned = Object.keys(nodes).length;
        logger.info({
            ...contextInfo,
            strategy: 'isolated_root_fallback',
            totalNodes,
            nodesReturned,
            totalEdgesInGraph: totalEdges,
            edgesReturned: edgeCount,
        }, 'Navigation graph subgraph retrieved using isolated_root_fallback strategy');

        return {
            nodes,
            rootUrl: startNode,
            metadata: {
                totalNodesInGraph: totalNodes,
                nodesReturned,
                totalEdgesInGraph: totalEdges,
                edgesReturned: edgeCount,
                depthLimit: maxDepth,
                startNode
            }
        };
    }

    /**
     * Calculate maximum depth of the graph using iterative BFS
     * 
     * @param session Neo4j session
     * @param rootUrl Root node URL to start traversal from
     * @param getNode Function to get a single node by URL
     * @returns Maximum depth
     */
    async calculateMaxDepth(
        _session: Session,
        rootUrl: string,
        getNode: (url: string) => Promise<NavigationNode | undefined>
    ): Promise<number> {
        if (!rootUrl) {
            return 0;
        }

        const visited = new Set<string>();
        let currentLevel: string[] = [rootUrl];
        let depth = 0;
        const maxSafetyLimit = 1000;

        while (currentLevel.length > 0 && depth < maxSafetyLimit) {
            const nextLevel: string[] = [];

            for (const url of currentLevel) {
                if (visited.has(url)) {
                    continue;
                }
                visited.add(url);

                const node = await getNode(url);
                if (node && node.children) {
                    for (const childUrl of node.children) {
                        if (!visited.has(childUrl)) {
                            nextLevel.push(childUrl);
                        }
                    }
                }
            }

            if (nextLevel.length > 0) {
                depth++;
                currentLevel = nextLevel;
            } else {
                break;
            }
        }

        if (depth >= maxSafetyLimit) {
            logger.warn('Graph depth calculation exceeded safety limit of 1000 levels');
        }

        return depth;
    }
}

