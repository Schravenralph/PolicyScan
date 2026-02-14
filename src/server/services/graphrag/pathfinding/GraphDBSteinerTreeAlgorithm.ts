/**
 * GraphDB Steiner Tree Algorithm Implementation
 * 
 * SPARQL-based implementation of Steiner tree algorithm for GraphDB backend.
 * Uses SPARQL property paths to find shortest paths between terminal nodes.
 * 
 * Architecture: Knowledge Graph operations MUST use GraphDB (SPARQL), not Neo4j (Cypher).
 * See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { GraphDBClient } from '../../../config/graphdb.js';
import { BaseEntity, RelationType, BELEID_RELATION_MAPPING } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';
import { GraphDBGraphTraversalService } from '../GraphDBGraphTraversalService.js';

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

const BELEID_NAMESPACE = 'http://data.example.org/def/beleid#';
const KG_GRAPH_URI = 'http://data.example.org/graph/knowledge';

/**
 * SPARQL prefixes for GraphDB queries
 */
const PREFIXES = `
PREFIX beleid: <${BELEID_NAMESPACE}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

/**
 * Maps RelationType to SPARQL property paths
 */
function relationTypeToPropertyPath(relationTypes?: RelationType[]): string {
    if (!relationTypes || relationTypes.length === 0) {
        // Default: all relationship types
        return '(beleid:appliesTo|beleid:definedIn|beleid:locatedIn|beleid:overrides|beleid:refines|beleid:contains|beleid:partOf|beleid:relatedTo)';
    }
    
    const properties = relationTypes.map(rt => BELEID_RELATION_MAPPING[rt] || `beleid:${rt.toLowerCase()}`).join('|');
    return `(${properties})`;
}

/**
 * Convert entity ID to GraphDB URI
 */
function entityUri(id: string): string {
    return `http://data.example.org/id/${encodeURIComponent(id)}`;
}

/**
 * Steiner Tree Algorithm Implementation for GraphDB
 * 
 * Uses an approximation algorithm since exact Steiner tree is NP-hard:
 * 1. Build complete graph of shortest paths between all terminal nodes
 * 2. Find minimum spanning tree (MST) of that complete graph
 * 3. Expand MST back to original graph paths
 * 
 * This is a 2-approximation algorithm (cost ≤ 2 × optimal cost).
 */
export class GraphDBSteinerTreeAlgorithm {
    private client: GraphDBClient;
    private traversalService: GraphDBGraphTraversalService;

    constructor(client: GraphDBClient, traversalService?: GraphDBGraphTraversalService) {
        this.client = client;
        this.traversalService = traversalService || new GraphDBGraphTraversalService(client);
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
        const steinerTree = await this.expandMSTToGraph(mst, terminalNodeIds, config);

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
    ): Promise<Array<{ source: string; target: string; path: string[]; cost: number }>> {
        const completeGraph: Array<{ source: string; target: string; path: string[]; cost: number }> = [];

        // Find shortest path between each pair of terminals
        for (let i = 0; i < terminalNodeIds.length; i++) {
            for (let j = i + 1; j < terminalNodeIds.length; j++) {
                const sourceId = terminalNodeIds[i];
                const targetId = terminalNodeIds[j];

                const path = await this.findShortestPath(sourceId, targetId, config);
                if (path && path.length > 0) {
                    const cost = await this.calculatePathCost(path, config);
                    completeGraph.push({
                        source: sourceId,
                        target: targetId,
                        path,
                        cost,
                    });
                }
            }
        }

        return completeGraph;
    }

    /**
     * Find shortest path between two nodes using GraphDBGraphTraversalService
     * This uses SPARQL-based pathfinding which is more robust than manual queries
     */
    private async findShortestPath(
        sourceId: string,
        targetId: string,
        config: SteinerTreeConfig
    ): Promise<string[] | null> {
        try {
            // Use GraphDBGraphTraversalService for pathfinding
            const pathResult = await this.traversalService.findShortestPath(
                sourceId,
                targetId,
                {
                    relationshipTypes: config.relationshipTypes,
                    maxDepth: config.maxDepth ?? 10,
                }
            );

            if (!pathResult || !pathResult.path || pathResult.path.length === 0) {
                return null;
            }

            return pathResult.path;
        } catch (error) {
            logger.error({ error }, '[SteinerTree] Error finding shortest path');
            return null;
        }
    }

    /**
     * Calculate total cost of a path
     */
    private async calculatePathCost(path: string[], config: SteinerTreeConfig): Promise<number> {
        if (path.length < 2) {
            return 0;
        }

        try {
            let totalCost = 0;

            for (let i = 0; i < path.length - 1; i++) {
                const sourceId = path[i];
                const targetId = path[i + 1];

                const edge = await this.getEdgeWeight(sourceId, targetId, config);
                if (edge) {
                    const weight = config.weightFunction
                        ? config.weightFunction(edge)
                        : edge.weight;

                    if (config.minWeight && weight < config.minWeight) {
                        return Infinity; // Path is invalid
                    }

                    totalCost += weight;
                } else {
                    return Infinity; // Edge not found
                }
            }

            return totalCost;
        } catch (error) {
            logger.error({ error }, '[SteinerTree] Error calculating path cost');
            return Infinity;
        }
    }

    /**
     * Get edge weight between two nodes using SPARQL
     */
    private async getEdgeWeight(
        sourceId: string,
        targetId: string,
        config: SteinerTreeConfig
    ): Promise<WeightedEdge | null> {
        try {
            const relationshipPath = relationTypeToPropertyPath(config.relationshipTypes);
            const sourceUri = entityUri(sourceId);
            const targetUri = entityUri(targetId);

            const query = `
${PREFIXES}
SELECT ?relType ?kgConfidence ?ontologyWeight ?weight WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${sourceUri}> ${relationshipPath} <${targetUri}> .
    
    OPTIONAL {
      ?rel a beleid:Relation ;
           beleid:source <${sourceUri}> ;
           beleid:target <${targetUri}> ;
           beleid:relationType ?relType ;
           beleid:confidence ?kgConfidence ;
           beleid:ontologyWeight ?ontologyWeight ;
           beleid:weight ?weight .
    }
  }
}
LIMIT 1
`;

            const results = await this.client.query(query);

            if (results.length === 0) {
                // Try reverse direction
                const reverseQuery = `
${PREFIXES}
SELECT ?relType ?kgConfidence ?ontologyWeight ?weight WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${targetUri}> ${relationshipPath} <${sourceUri}> .
    
    OPTIONAL {
      ?rel a beleid:Relation ;
           beleid:source <${targetUri}> ;
           beleid:target <${sourceUri}> ;
           beleid:relationType ?relType ;
           beleid:confidence ?kgConfidence ;
           beleid:ontologyWeight ?ontologyWeight ;
           beleid:weight ?weight .
    }
  }
}
LIMIT 1
`;

                const reverseResults = await this.client.query(reverseQuery);
                if (reverseResults.length === 0) {
                    return null;
                }

                const row = reverseResults[0];
                const kgConfidence = row.kgConfidence ? parseFloat(row.kgConfidence) : 0.5;
                const ontologyWeight = row.ontologyWeight ? parseFloat(row.ontologyWeight) : 1.0;
                const weight = row.weight ? parseFloat(row.weight) : (kgConfidence * ontologyWeight);

                return {
                    sourceId: targetId,
                    targetId: sourceId,
                    type: (row.relType || 'RELATED_TO') as RelationType,
                    weight,
                    kgConfidence,
                    ontologyWeight,
                };
            }

            const row = results[0];
            const kgConfidence = row.kgConfidence ? parseFloat(row.kgConfidence) : 0.5;
            const ontologyWeight = row.ontologyWeight ? parseFloat(row.ontologyWeight) : 1.0;
            const weight = row.weight ? parseFloat(row.weight) : (kgConfidence * ontologyWeight);

            return {
                sourceId,
                targetId,
                type: (row.relType || 'RELATED_TO') as RelationType,
                weight,
                kgConfidence,
                ontologyWeight,
            };
        } catch (error) {
            logger.error({ error }, '[SteinerTree] Error getting edge weight');
            return null;
        }
    }

    /**
     * Find minimum spanning tree using Kruskal's algorithm
     */
    private findMinimumSpanningTree(
        completeGraph: Array<{ source: string; target: string; path: string[]; cost: number }>,
        terminalNodeIds: string[]
    ): Array<{ source: string; target: string; path: string[]; cost: number }> {
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
        const mst: Array<{ source: string; target: string; path: string[]; cost: number }> = [];
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
        mst: Array<{ source: string; target: string; path: string[]; cost: number }>,
        terminalNodeIds: string[],
        config: SteinerTreeConfig
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
            for (let i = 0; i < mstEdge.path.length - 1; i++) {
                const sourceId = mstEdge.path[i];
                const targetId = mstEdge.path[i + 1];

                const edge = await this.getEdgeWeight(sourceId, targetId, config);
                if (edge) {
                    // Avoid duplicate edges
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
     * Get nodes by their IDs using SPARQL
     */
    private async getNodesByIds(nodeIds: string[]): Promise<BaseEntity[]> {
        if (nodeIds.length === 0) {
            return [];
        }

        try {
            // Build URIs for all nodes
            const uris = nodeIds.map(id => `<${entityUri(id)}>`).join(' ');

            const query = `
${PREFIXES}
SELECT ?id ?type ?name ?description ?metadata ?uri ?schemaType WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    VALUES ?entity { ${uris} }
    ?entity beleid:id ?id ;
            beleid:type ?type ;
            rdfs:label ?name .
    OPTIONAL { ?entity dct:description ?description }
    OPTIONAL { ?entity beleid:metadata ?metadata }
    OPTIONAL { ?entity beleid:uri ?uri }
    OPTIONAL { ?entity beleid:schemaType ?schemaType }
  }
}
`;

            const results = await this.client.query(query);

            return results.map(row => {
                let metadata: Record<string, unknown> | undefined;
                if (row.metadata) {
                    try {
                        const metadataStr = typeof row.metadata === 'string' ? row.metadata : String(row.metadata);
                        metadata = JSON.parse(metadataStr) as Record<string, unknown>;
                    } catch {
                        metadata = { rawMetadata: row.metadata };
                    }
                }

                return {
                    id: row.id,
                    type: row.type as BaseEntity['type'],
                    name: row.name,
                    description: row.description,
                    metadata,
                    uri: row.uri,
                    schemaType: row.schemaType,
                } as BaseEntity;
            });
        } catch (error) {
            logger.error({ error }, '[SteinerTree] Error getting nodes by IDs');
            return [];
        }
    }
}
