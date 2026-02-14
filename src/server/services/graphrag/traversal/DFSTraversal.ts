import { Driver } from 'neo4j-driver';
import { RelationType } from '../../../domain/ontology.js';
import { CycleDetector } from './CycleDetector.js';
import { TraversalConfig, TraversalResult } from './BFSTraversal.js';

/**
 * Depth-First Search (DFS) Traversal Implementation
 * Explores nodes deeply before backtracking, useful for path finding
 */
export class DFSTraversal {
    private driver: Driver;
    private cycleDetector: CycleDetector;

    constructor(driver: Driver) {
        this.driver = driver;
        this.cycleDetector = new CycleDetector();
    }

    /**
     * Perform DFS traversal from a starting node
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

        await this.dfsRecursive(startNodeId, 0, [startNodeId], config, result, new Set<string>());

        return result;
    }

    /**
     * Recursive DFS implementation
     */
    private async dfsRecursive(
        nodeId: string,
        depth: number,
        path: string[],
        config: TraversalConfig,
        result: TraversalResult,
        visited: Set<string>
    ): Promise<void> {
        // Stop conditions
        if (visited.has(nodeId) || depth > config.maxDepth || result.visitedCount >= config.maxNodes) {
            return;
        }

        // Check for cycles
        if (this.cycleDetector.wouldCreateCycle(nodeId)) {
            return;
        }

        // Visit node
        visited.add(nodeId);
        this.cycleDetector.visit(nodeId);
        result.visitedCount++;
        result.depthReached = Math.max(result.depthReached, depth);

        result.nodes.push({
            id: nodeId,
            depth,
            path: [...path],
        });

        // Stop if max depth reached
        if (depth >= config.maxDepth) {
            this.cycleDetector.unvisit(nodeId);
            return;
        }

        // Get neighbors
        const neighbors = await this.getNeighbors(nodeId, config);

        for (const neighbor of neighbors) {
            // Skip if already visited or would create cycle
            if (visited.has(neighbor.targetId)) {
                continue;
            }

            // Add edge
            result.edges.push({
                sourceId: nodeId,
                targetId: neighbor.targetId,
                type: neighbor.type,
            });

            // Recursively visit neighbor
            await this.dfsRecursive(
                neighbor.targetId,
                depth + 1,
                [...path, neighbor.targetId],
                config,
                result,
                visited
            );
        }

        // Backtrack
        this.cycleDetector.unvisit(nodeId);
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

