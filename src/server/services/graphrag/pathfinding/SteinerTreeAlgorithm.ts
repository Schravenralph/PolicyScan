import { Driver } from 'neo4j-driver';
import { BaseEntity, RelationType } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

/**
 * Edge in the graph with weight
 */
export interface WeightedEdge {
    sourceId: string;
    targetId: string;
    type: RelationType;
    weight: number; // Combined weight: KG confidence × ontology weight
    kgConfidence?: number; // S_KG: KG confidence score
    ontologyWeight?: number; // weight_O: Ontology structural weight
}

/**
 * Steiner tree result
 */
export interface SteinerTreeResult {
    nodes: BaseEntity[];
    edges: WeightedEdge[];
    totalCost: number;
    terminalNodes: string[];
    steinerNodes: string[]; // Intermediate nodes in the tree
}

/**
 * Configuration for Steiner tree algorithm
 */
export interface SteinerTreeConfig {
    maxDepth?: number; // Maximum depth to search (default: 10)
    maxNodes?: number; // Maximum nodes to explore (default: 1000)
    relationshipTypes?: RelationType[]; // Filter by relationship types
    weightFunction?: (edge: WeightedEdge) => number; // Custom weight function
    minWeight?: number; // Minimum edge weight to consider
}

/**
 * Steiner Tree Algorithm Implementation
 * 
 * Uses an approximation algorithm since exact Steiner tree is NP-hard:
 * 1. Build complete graph of shortest paths between all terminal nodes
 * 2. Find minimum spanning tree (MST) of that complete graph
 * 3. Expand MST back to original graph paths
 * 
 * This is a 2-approximation algorithm (cost ≤ 2 × optimal cost).
 */
export class SteinerTreeAlgorithm {
    private driver: Driver;

    constructor(driver: Driver) {
        this.driver = driver;
    }

    /**
     * Find Steiner tree connecting terminal nodes
     * @param terminalNodeIds Terminal nodes (query entities) to connect
     * @param config Configuration
     * @returns Steiner tree result
     */
    async findSteinerTree(
        terminalNodeIds: string[],
        config: SteinerTreeConfig = {}
    ): Promise<SteinerTreeResult | null> {
        if (terminalNodeIds.length < 2) {
            logger.warn('[SteinerTree] Need at least 2 terminal nodes');
            return null;
        }

        const startTime = Date.now();

        logger.debug(
            `[SteinerTree] Finding Steiner tree for ${terminalNodeIds.length} terminals: ${terminalNodeIds.join(', ')}`
        );

        // Step 1: Build complete graph of shortest paths between all terminal pairs
        const completeGraph = await this.buildCompleteGraph(terminalNodeIds, config);

        if (completeGraph.length === 0) {
            logger.warn('[SteinerTree] No paths found between terminal nodes');
            return null;
        }

        // Step 2: Find minimum spanning tree of the complete graph
        const mst = this.findMinimumSpanningTree(completeGraph, terminalNodeIds);

        // Step 3: Expand MST edges back to original graph paths
        const steinerTree = await this.expandMSTToGraph(mst, terminalNodeIds);

        const duration = Date.now() - startTime;
        logger.debug(
            `[SteinerTree] Found Steiner tree with ${steinerTree.nodes.length} nodes, ` +
            `cost: ${steinerTree.totalCost.toFixed(3)} in ${duration}ms`
        );

        return steinerTree;
    }

    /**
     * Build complete graph: shortest paths between all terminal pairs
     */
    private async buildCompleteGraph(
        terminalNodeIds: string[],
        config: SteinerTreeConfig
    ): Promise<Array<{ source: string; target: string; path: string[]; edges: WeightedEdge[]; cost: number }>> {
        const completeGraph: Array<{ source: string; target: string; path: string[]; edges: WeightedEdge[]; cost: number }> = [];

        // Find shortest path between each pair of terminals
        for (let i = 0; i < terminalNodeIds.length; i++) {
            for (let j = i + 1; j < terminalNodeIds.length; j++) {
                const sourceId = terminalNodeIds[i];
                const targetId = terminalNodeIds[j];

                const result = await this.findShortestPath(sourceId, targetId, config);
                if (result && result.path.length > 0) {
                    const cost = this.calculatePathCost(result.edges, config);
                    completeGraph.push({
                        source: sourceId,
                        target: targetId,
                        path: result.path,
                        edges: result.edges,
                        cost,
                    });
                }
            }
        }

        return completeGraph;
    }

    /**
     * Find shortest path between two nodes using BFS (unweighted shortest path)
     * For weighted shortest path, we'll use a simple BFS and then calculate costs
     */
    private async findShortestPath(
        sourceId: string,
        targetId: string,
        config: SteinerTreeConfig
    ): Promise<{ path: string[]; edges: WeightedEdge[] } | null> {
        const session = this.driver.session();
        try {
            // Use Neo4j's shortestPath function (unweighted, but we'll calculate weights after)
            const maxDepth = config.maxDepth ?? 10;
            const relationshipFilter = config.relationshipTypes
                ? `AND type(r) IN $relationshipTypes`
                : '';

            const query = `
                MATCH path = shortestPath((source:Entity {id: $sourceId})-[r:RELATES_TO*1..${maxDepth}]-(target:Entity {id: $targetId}))
                WHERE all(rel in relationships(path) WHERE type(rel) = 'RELATES_TO' ${relationshipFilter})
                RETURN path
                ORDER BY length(path)
                LIMIT 1
            `;

            const params: Record<string, unknown> = { sourceId, targetId };
            if (config.relationshipTypes) {
                params.relationshipTypes = config.relationshipTypes;
            }

            const result = await session.run(query, params);

            if (result.records.length === 0) {
                return null;
            }

            const path = result.records[0].get('path');
            const nodes: string[] = [];
            const edges: WeightedEdge[] = [];

            // Extract node IDs from path
            if (path.start) {
                nodes.push(path.start.properties.id);
            }

            for (const segment of path.segments || []) {
                if (segment.end) {
                    nodes.push(segment.end.properties.id);
                }

                const rel = segment.relationship;
                // Assuming properties are available on the relationship object in the driver result
                const props = rel.properties || {};
                const kgConfidence = props.confidence ?? 0.5;
                const ontologyWeight = props.ontologyWeight ?? 1.0;
                // Use stored weight or calculate it
                const weight = props.weight ?? (kgConfidence * ontologyWeight);

                // Determine edge direction
                let edgeSourceId: string;
                let edgeTargetId: string;

                // Check if traversal aligns with relationship direction
                // segment.start.identity matches rel.startIdentity implies forward traversal
                // Note: segment.start is a Node object, rel is a Relationship object
                if (segment.start.identity.toString() === rel.start.toString()) {
                    edgeSourceId = segment.start.properties.id;
                    edgeTargetId = segment.end.properties.id;
                } else {
                    edgeSourceId = segment.end.properties.id;
                    edgeTargetId = segment.start.properties.id;
                }

                edges.push({
                    sourceId: edgeSourceId,
                    targetId: edgeTargetId,
                    type: (props.type as RelationType) || (rel.type as RelationType),
                    weight,
                    kgConfidence,
                    ontologyWeight,
                });
            }

            return nodes.length > 0 ? { path: nodes, edges } : null;
        } catch (error) {
            logger.error({ error }, '[SteinerTree] Error finding shortest path');
            return null;
        } finally {
            await session.close();
        }
    }

    /**
     * Calculate total cost of a path
     */
    private calculatePathCost(edges: WeightedEdge[], config: SteinerTreeConfig): number {
        if (edges.length === 0) {
            return 0;
        }

        let totalCost = 0;

        for (const edge of edges) {
            const weight = config.weightFunction
                ? config.weightFunction(edge)
                : edge.weight;

            if (config.minWeight && weight < config.minWeight) {
                return Infinity; // Path is invalid
            }

            totalCost += weight;
        }

        return totalCost;
    }

    /**
     * Find minimum spanning tree using Kruskal's algorithm
     */
    private findMinimumSpanningTree(
        completeGraph: Array<{ source: string; target: string; path: string[]; edges: WeightedEdge[]; cost: number }>,
        terminalNodeIds: string[]
    ): Array<{ source: string; target: string; path: string[]; edges: WeightedEdge[]; cost: number }> {
        // Sort edges by cost
        const sortedEdges = [...completeGraph].sort((a, b) => a.cost - b.cost);

        // Union-Find data structure for MST
        const parent: Record<string, string> = {};
        const rank: Record<string, number> = {};

        const find = (node: string): string => {
            if (parent[node] !== node) {
                parent[node] = find(parent[node]);
            }
            return parent[node];
        };

        const union = (x: string, y: string): boolean => {
            const rootX = find(x);
            const rootY = find(y);

            if (rootX === rootY) {
                return false; // Already in same component
            }

            if (rank[rootX] < rank[rootY]) {
                parent[rootX] = rootY;
            } else if (rank[rootX] > rank[rootY]) {
                parent[rootY] = rootX;
            } else {
                parent[rootY] = rootX;
                rank[rootX]++;
            }

            return true;
        };

        // Initialize Union-Find
        for (const nodeId of terminalNodeIds) {
            parent[nodeId] = nodeId;
            rank[nodeId] = 0;
        }

        // Kruskal's algorithm
        const mst: Array<{ source: string; target: string; path: string[]; edges: WeightedEdge[]; cost: number }> = [];
        for (const edge of sortedEdges) {
            if (find(edge.source) !== find(edge.target)) {
                union(edge.source, edge.target);
                mst.push(edge);
            }

            // Stop when all terminals are connected
            if (mst.length === terminalNodeIds.length - 1) {
                break;
            }
        }

        return mst;
    }

    /**
     * Expand MST edges back to original graph paths
     */
    private async expandMSTToGraph(
        mst: Array<{ source: string; target: string; path: string[]; edges: WeightedEdge[]; cost: number }>,
        terminalNodeIds: string[]
    ): Promise<SteinerTreeResult> {
        const nodeIds = new Set<string>(terminalNodeIds);
        const edges: WeightedEdge[] = [];
        let totalCost = 0;

        // Collect all nodes and edges from MST paths
        for (const mstEdge of mst) {
            totalCost += mstEdge.cost;

            // Add all nodes in the path
            for (const nodeId of mstEdge.path) {
                nodeIds.add(nodeId);
            }

            // Add all edges in the path
            for (const edge of mstEdge.edges) {
                if (
                    !edges.some(
                        e =>
                            (e.sourceId === edge.sourceId && e.targetId === edge.targetId) ||
                            (e.sourceId === edge.targetId && e.targetId === edge.sourceId)
                    )
                ) {
                    edges.push(edge);
                }
            }
        }

        // Get all nodes
        const nodes = await this.getNodesByIds(Array.from(nodeIds));

        // Identify Steiner nodes (non-terminal nodes)
        const terminalSet = new Set(terminalNodeIds);
        const steinerNodes = Array.from(nodeIds).filter(id => !terminalSet.has(id));

        return {
            nodes,
            edges,
            totalCost,
            terminalNodes: terminalNodeIds,
            steinerNodes,
        };
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
                    type: node.properties.type,
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
}
