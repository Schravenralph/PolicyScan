import { Driver } from 'neo4j-driver';
import { RelationType } from '../../../domain/ontology.js';
import { WeightedNeighbor, WeightFunction, WeightedTraversal } from './WeightedTraversal.js';

/**
 * Heuristic function type for A* pathfinding
 * Estimates the cost from a node to the goal
 */
export type HeuristicFunction = (nodeId: string, goalId: string) => Promise<number> | number;

/**
 * Cost metric type for A* pathfinding
 */
export type CostMetric = 'hop' | 'weight' | 'relevance';

/**
 * Configuration for A* pathfinding
 */
export interface AStarConfig {
    maxDepth?: number; // Maximum depth to search (default: 10)
    maxNodes?: number; // Maximum nodes to visit (default: 1000)
    relationshipTypes?: RelationType[];
    entityTypes?: string[];
    direction?: 'outgoing' | 'incoming' | 'both';
    weightFunction?: WeightFunction;
    heuristicFunction?: HeuristicFunction;
    costMetric?: CostMetric; // 'hop' (number of hops), 'weight' (sum of weights), 'relevance' (relevance-based)
    weightInvert?: boolean; // If true, lower weight = higher cost (default: true for weight metric)
}

/**
 * A* node for pathfinding
 */
interface AStarNode {
    id: string;
    g: number; // Cost from start to this node
    h: number; // Heuristic estimate from this node to goal
    f: number; // Total cost (g + h)
    parent: string | null; // Parent node ID for path reconstruction
    depth: number;
}

/**
 * Pathfinding result
 */
export interface PathfindingResult {
    path: string[] | null; // Path from start to goal, or null if not found
    cost: number; // Total cost of the path
    nodesVisited: number; // Number of nodes visited during search
    depth: number; // Depth of the path
}

/**
 * A* Pathfinding Implementation
 * Finds optimal paths between nodes using A* algorithm with configurable heuristics
 */
export class AStarPathfinding {
    private driver: Driver;
    // private weightedTraversal: WeightedTraversal; // Unused

    constructor(driver: Driver) {
        this.driver = driver;
    }

    /**
     * Default heuristic: returns 0 (equivalent to Dijkstra's algorithm)
     * This is admissible (never overestimates) but not very efficient
     */
    private static defaultHeuristic: HeuristicFunction = () => 0;

    /**
     * Hop-based heuristic: estimates remaining hops (optimistic, always returns 1)
     * This is admissible if we're using hop count as cost metric
     */
    static hopHeuristic: HeuristicFunction = () => 1;

    /**
     * Zero heuristic (Dijkstra's algorithm)
     */
    static zeroHeuristic: HeuristicFunction = () => 0;

    /**
     * Find optimal path from start to goal using A* algorithm
     */
    async findPath(
        startId: string,
        goalId: string,
        config: AStarConfig = {}
    ): Promise<PathfindingResult> {
        const maxDepth = config.maxDepth ?? 10;
        const maxNodes = config.maxNodes ?? 1000;
        const costMetric = config.costMetric ?? 'hop';
        const weightFunction = config.weightFunction || WeightedTraversal.defaultWeightFunction;
        const heuristicFunction = config.heuristicFunction || AStarPathfinding.defaultHeuristic;
        const weightInvert = config.weightInvert ?? (costMetric === 'weight');

        // If start equals goal, return immediate path
        if (startId === goalId) {
            return {
                path: [startId],
                cost: 0,
                nodesVisited: 1,
                depth: 0,
            };
        }

        // Open set: nodes to be explored (priority queue by f-score)
        const openSet = new Map<string, AStarNode>();

        // Closed set: nodes already explored (we keep parent info here too)
        const closedSet = new Map<string, AStarNode>();

        // Initialize start node
        const hStart = typeof heuristicFunction(startId, goalId) === 'number'
            ? heuristicFunction(startId, goalId) as number
            : await heuristicFunction(startId, goalId);

        const startNode: AStarNode = {
            id: startId,
            g: 0,
            h: hStart,
            f: hStart,
            parent: null,
            depth: 0,
        };

        openSet.set(startId, startNode);

        let nodesVisited = 0;

        while (openSet.size > 0 && nodesVisited < maxNodes) {
            // Get node with lowest f-score from open set
            let currentId: string | null = null;
            let currentF = Infinity;

            for (const [id, node] of openSet.entries()) {
                if (node.f < currentF) {
                    currentId = id;
                    currentF = node.f;
                }
            }

            if (!currentId) {
                break;
            }

            // Remove from open set and add to closed set
            const current = openSet.get(currentId)!;
            openSet.delete(currentId);
            closedSet.set(currentId, current);
            nodesVisited++;

            // Check if we reached the goal
            if (current.id === goalId) {
                // Reconstruct path
                const path = this.reconstructPath(current, closedSet);
                return {
                    path,
                    cost: current.g,
                    nodesVisited,
                    depth: current.depth,
                };
            }

            // Check depth limit
            if (current.depth >= maxDepth) {
                continue;
            }

            // Get neighbors
            const neighbors = await this.getWeightedNeighbors(current.id, config, weightFunction);

            for (const neighbor of neighbors) {
                // Skip if already in closed set
                if (closedSet.has(neighbor.targetId)) {
                    continue;
                }

                // Calculate edge cost based on cost metric
                let edgeCost: number;
                if (costMetric === 'hop') {
                    edgeCost = 1;
                } else if (costMetric === 'weight') {
                    // For weight metric, use inverted weight as cost (lower weight = higher cost)
                    edgeCost = weightInvert ? (1.0 - neighbor.weight) : neighbor.weight;
                } else {
                    // relevance: use inverted weight
                    edgeCost = 1.0 - neighbor.weight;
                }

                const tentativeG = current.g + edgeCost;

                // Check if neighbor is in open set
                const existingNode = openSet.get(neighbor.targetId);
                if (existingNode) {
                    // If we found a better path, update it
                    if (tentativeG < existingNode.g) {
                        existingNode.g = tentativeG;
                        existingNode.f = tentativeG + existingNode.h;
                        existingNode.parent = current.id;
                        existingNode.depth = current.depth + 1;
                    }
                } else {
                    // Calculate heuristic
                    const h = typeof heuristicFunction(neighbor.targetId, goalId) === 'number'
                        ? heuristicFunction(neighbor.targetId, goalId) as number
                        : await heuristicFunction(neighbor.targetId, goalId);

                    // Add to open set
                    const newNode: AStarNode = {
                        id: neighbor.targetId,
                        g: tentativeG,
                        h,
                        f: tentativeG + h,
                        parent: current.id,
                        depth: current.depth + 1,
                    };

                    openSet.set(neighbor.targetId, newNode);
                }
            }
        }

        // No path found
        return {
            path: null,
            cost: Infinity,
            nodesVisited,
            depth: 0,
        };
    }

    /**
     * Reconstruct path from goal to start using parent pointers
     */
    private reconstructPath(goalNode: AStarNode, closedSet: Map<string, AStarNode>): string[] {
        const path: string[] = [];
        let current: AStarNode | null = goalNode;

        while (current) {
            path.unshift(current.id);
            if (current.parent) {
                current = closedSet.get(current.parent) || null;
            } else {
                break;
            }
        }

        return path;
    }

    /**
     * Get weighted neighbors for A* search
     */
    private async getWeightedNeighbors(
        nodeId: string,
        config: AStarConfig,
        weightFunction: WeightFunction
    ): Promise<WeightedNeighbor[]> {
        // Use WeightedTraversal's method but adapt the config
        const _traversalConfig = {
            maxDepth: 1,
            maxNodes: 100,
            relationshipTypes: config.relationshipTypes,
            entityTypes: config.entityTypes,
            direction: config.direction ?? 'both',
            weightFunction,
        };

        // We need to access the private method, so we'll query directly
        const session = this.driver.session();
        try {
            let query = '';
            const params: Record<string, unknown> = { nodeId };

            const relTypeFilter = config.relationshipTypes
                ? `r.type IN $relationshipTypes`
                : 'true';

            const entityTypeFilter = config.entityTypes
                ? `target.type IN $entityTypes`
                : 'true';

            if (config.direction === 'outgoing') {
                query = `
                    MATCH (source:Entity {id: $nodeId})-[r:RELATES_TO]->(target:Entity)
                    WHERE ${relTypeFilter} AND ${entityTypeFilter}
                    RETURN target.id AS targetId, r.type AS type, r.metadata AS metadata,
                           source.metadata AS sourceMetadata, target.metadata AS targetMetadata
                    LIMIT 100
                `;
            } else if (config.direction === 'incoming') {
                query = `
                    MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity {id: $nodeId})
                    WHERE ${relTypeFilter} AND ${entityTypeFilter}
                    RETURN source.id AS targetId, r.type AS type, r.metadata AS metadata,
                           source.metadata AS sourceMetadata, target.metadata AS targetMetadata
                    LIMIT 100
                `;
            } else {
                query = `
                    MATCH (source:Entity {id: $nodeId})-[r:RELATES_TO]-(target:Entity)
                    WHERE ${relTypeFilter} AND ${entityTypeFilter}
                    RETURN target.id AS targetId, r.type AS type, r.metadata AS metadata,
                           source.metadata AS sourceMetadata, target.metadata AS targetMetadata
                    LIMIT 100
                `;
            }

            if (config.relationshipTypes) {
                params.relationshipTypes = config.relationshipTypes;
            }
            if (config.entityTypes) {
                params.entityTypes = config.entityTypes;
            }

            const result = await session.run(query, params);
            const neighbors: WeightedNeighbor[] = [];

            for (const record of result.records) {
                const targetId = record.get('targetId');
                const type = record.get('type') as RelationType;
                const metadataStr = record.get('metadata');
                const sourceMetadataStr = record.get('sourceMetadata');
                const targetMetadataStr = record.get('targetMetadata');

                let metadata: Record<string, unknown> | undefined;
                try {
                    metadata = metadataStr ? (typeof metadataStr === 'string' ? JSON.parse(metadataStr) : metadataStr) : undefined;
                } catch {
                    metadata = undefined;
                }

                let sourceMetadata: Record<string, unknown> | undefined;
                try {
                    sourceMetadata = sourceMetadataStr ? (typeof sourceMetadataStr === 'string' ? JSON.parse(sourceMetadataStr) : sourceMetadataStr) : undefined;
                } catch {
                    sourceMetadata = undefined;
                }

                let targetMetadata: Record<string, unknown> | undefined;
                try {
                    targetMetadata = targetMetadataStr ? (typeof targetMetadataStr === 'string' ? JSON.parse(targetMetadataStr) : targetMetadataStr) : undefined;
                } catch {
                    targetMetadata = undefined;
                }

                const weight = weightFunction({
                    type,
                    metadata,
                    sourceMetadata,
                    targetMetadata,
                });

                neighbors.push({
                    targetId,
                    type,
                    weight,
                    metadata,
                });
            }

            return neighbors;
        } finally {
            await session.close();
        }
    }
}

