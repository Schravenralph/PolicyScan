import { Driver } from 'neo4j-driver';
import { RelationType } from '../../../domain/ontology.js';
import { CycleDetector } from './CycleDetector.js';

export interface TraversalNode {
    id: string;
    depth: number;
    path: string[];
}

export interface TraversalConfig {
    maxDepth: number;
    maxNodes: number;
    relationshipTypes?: RelationType[];
    entityTypes?: string[];
    direction: 'outgoing' | 'incoming' | 'both';
}

export interface TraversalResult {
    nodes: TraversalNode[];
    edges: Array<{ sourceId: string; targetId: string; type: RelationType }>;
    visitedCount: number;
    depthReached: number;
}

/**
 * Breadth-First Search (BFS) Traversal Implementation
 * Explores nodes level by level, useful for finding shortest paths
 */
export class BFSTraversal {
    private driver: Driver;
    private cycleDetector: CycleDetector;

    constructor(driver: Driver) {
        this.driver = driver;
        this.cycleDetector = new CycleDetector();
    }

    /**
     * Perform BFS traversal from a starting node
     * @param startNodeId The starting node ID
     * @param config Traversal configuration
     * @returns Traversal result with nodes and edges
     */
    async traverse(
        startNodeId: string,
        config: TraversalConfig
    ): Promise<TraversalResult> {
        this.cycleDetector.reset();

        const result: TraversalResult = {
            nodes: [],
            edges: [],
            visitedCount: 0,
            depthReached: 0,
        };

        // Queue: [nodeId, depth, path]
        const queue: Array<[string, number, string[]]> = [[startNodeId, 0, [startNodeId]]];
        const visited = new Set<string>();

        while (queue.length > 0 && result.visitedCount < config.maxNodes) {
            const [currentId, depth, path] = queue.shift()!;

            // Skip if already visited or max depth reached
            if (visited.has(currentId) || depth > config.maxDepth) {
                continue;
            }

            visited.add(currentId);
            result.visitedCount++;
            result.depthReached = Math.max(result.depthReached, depth);

            result.nodes.push({
                id: currentId,
                depth,
                path: [...path],
            });

            // Stop if max depth reached
            if (depth >= config.maxDepth) {
                continue;
            }

            // Get neighbors
            const neighbors = await this.getNeighbors(currentId, config);

            for (const neighbor of neighbors) {
                // Skip if would create cycle or already visited
                if (visited.has(neighbor.targetId)) {
                    continue;
                }

                // Add edge
                result.edges.push({
                    sourceId: currentId,
                    targetId: neighbor.targetId,
                    type: neighbor.type,
                });

                // Add to queue if not visited and within depth limit
                if (!visited.has(neighbor.targetId) && depth + 1 <= config.maxDepth) {
                    queue.push([neighbor.targetId, depth + 1, [...path, neighbor.targetId]]);
                }
            }
        }

        return result;
    }

    /**
     * Get neighbors of a node based on configuration
     */
    private async getNeighbors(
        nodeId: string,
        config: TraversalConfig
    ): Promise<Array<{ targetId: string; type: RelationType }>> {
        const session = this.driver.session();
        try {
            let query = '';
            const params: Record<string, unknown> = { nodeId };

            // Build relationship type filter
            const relTypeFilter = config.relationshipTypes
                ? `r.type IN $relationshipTypes`
                : 'true';

            // Build entity type filter
            const entityTypeFilter = config.entityTypes
                ? `target.type IN $entityTypes`
                : 'true';

            if (config.direction === 'outgoing') {
                query = `
                    MATCH (source:Entity {id: $nodeId})-[r:RELATES_TO]->(target:Entity)
                    WHERE ${relTypeFilter} AND ${entityTypeFilter}
                    RETURN target.id AS targetId, r.type AS type
                    LIMIT 100
                `;
            } else if (config.direction === 'incoming') {
                query = `
                    MATCH (source:Entity)-[r:RELATES_TO]->(target:Entity {id: $nodeId})
                    WHERE ${relTypeFilter} AND ${entityTypeFilter}
                    RETURN source.id AS targetId, r.type AS type
                    LIMIT 100
                `;
            } else {
                // both directions
                query = `
                    MATCH (source:Entity {id: $nodeId})-[r:RELATES_TO]-(target:Entity)
                    WHERE ${relTypeFilter} AND ${entityTypeFilter}
                    RETURN target.id AS targetId, r.type AS type
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
            return result.records.map(record => ({
                targetId: record.get('targetId'),
                type: record.get('type') as RelationType,
            }));
        } finally {
            await session.close();
        }
    }
}

