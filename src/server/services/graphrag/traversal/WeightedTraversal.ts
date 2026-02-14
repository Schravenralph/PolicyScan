import { Driver } from 'neo4j-driver';
import { RelationType } from '../../../domain/ontology.js';
import { TraversalConfig, TraversalResult } from './BFSTraversal.js';
import { CycleDetector } from './CycleDetector.js';

/**
 * Weight function type for calculating edge weights
 */
export type WeightFunction = (
    relationship: {
        type: RelationType;
        metadata?: Record<string, unknown>;
        sourceMetadata?: Record<string, unknown>;
        targetMetadata?: Record<string, unknown>;
    }
) => number;

/**
 * Configuration for weighted traversal
 */
export interface WeightedTraversalConfig extends TraversalConfig {
    weightFunction?: WeightFunction;
    minWeight?: number; // Minimum weight to consider an edge (default: 0)
    prioritizeHighWeight?: boolean; // If true, prioritize higher weights (default: true)
}

/**
 * Weighted neighbor with weight information
 */
export interface WeightedNeighbor {
    targetId: string;
    type: RelationType;
    weight: number;
    metadata?: Record<string, unknown>;
}

/**
 * Weighted Traversal Implementation
 * Supports BFS and DFS traversal with edge weights for prioritizing paths
 */
export class WeightedTraversal {
    private driver: Driver;
    private cycleDetector: CycleDetector;

    constructor(driver: Driver) {
        this.driver = driver;
        this.cycleDetector = new CycleDetector();
    }

    /**
     * Default weight function based on relationship confidence
     * Extracts confidence from metadata or returns default weight
     */
    static defaultWeightFunction: WeightFunction = (relationship) => {
        // Extract confidence from metadata
        const confidence = relationship.metadata?.confidence;
        if (confidence !== undefined && typeof confidence === 'number') {
            return confidence;
        }
        
        // Check for alternative confidence fields
        const extractionConfidence = relationship.metadata?.extractionConfidence;
        if (extractionConfidence !== undefined && typeof extractionConfidence === 'number') {
            return extractionConfidence;
        }

        // Default weight for relationships without confidence
        return 0.5;
    };

    /**
     * Weight function based on confidence scores
     */
    static confidenceWeightFunction: WeightFunction = (relationship) => {
        return WeightedTraversal.defaultWeightFunction(relationship);
    };

    /**
     * Weight function based on recency (if available in metadata)
     */
    static recencyWeightFunction: WeightFunction = (relationship) => {
        const metadata = relationship.metadata;
        if (!metadata) return 0.5;

        // Extract timestamp if available
        const timestamp = metadata.lastVerified || metadata.createdAt || metadata.timestamp;
        if (timestamp && (typeof timestamp === 'string' || timestamp instanceof Date)) {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                const now = new Date();
                const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
                // Recent relationships (< 30 days) get higher weight
                return Math.max(0, 1.0 - daysDiff / 365); // Decay over 1 year
            }
        }

        return 0.5;
    };

    /**
     * Weight function based on source authority (if available)
     */
    static authorityWeightFunction: WeightFunction = (relationship) => {
        const sourceMetadata = relationship.sourceMetadata;
        if (!sourceMetadata) return 0.5;

        // Check for authority information in source metadata
        const authority = sourceMetadata.authority;
        if (typeof authority === 'string') {
            if (authority === 'official') {
                return 1.0;
            } else if (authority === 'unofficial') {
                return 0.3;
            }
        }

        // Check provenance authority
        const provenance = sourceMetadata.provenance;
        if (provenance && typeof provenance === 'object' && 'authority' in provenance) {
            const provAuthority = provenance.authority;
            if (typeof provAuthority === 'string') {
                if (provAuthority === 'official') {
                    return 1.0;
                } else if (provAuthority === 'unofficial') {
                    return 0.3;
                }
            }
        }

        // Check sources array for authority
        const provSources = provenance && typeof provenance === 'object' && 'sources' in provenance
            ? provenance.sources
            : undefined;
        if (Array.isArray(provSources) && provSources.length > 0) {
            // Check if first source has explicit authority
            const firstSource = provSources[0];
            if (firstSource && typeof firstSource === 'object' && 'authority' in firstSource) {
                const sourceAuthority = firstSource.authority;
                if (typeof sourceAuthority === 'string') {
                    if (sourceAuthority === 'official') {
                        return 1.0;
                    } else if (sourceAuthority === 'unofficial') {
                        return 0.3;
                    }
                }
            }
        }

        // Check URL-based authority
        const sourceUrls = sourceMetadata.sourceUrls;
        let urls: unknown[] = [];
        if (Array.isArray(sourceUrls)) {
            urls = sourceUrls;
        } else if (Array.isArray(provSources)) {
            // Extract URLs from source objects
            urls = provSources.map((source: unknown) => {
                if (source && typeof source === 'object' && 'url' in source) {
                    return source.url;
                }
                return source;
            });
        }
        
        if (urls.length > 0) {
            const url = urls[0];
            if (typeof url === 'string') {
                const lowerUrl = url.toLowerCase();
                if (
                    lowerUrl.includes('.nl') &&
                    (lowerUrl.includes('gemeente') ||
                        lowerUrl.includes('provincie') ||
                        lowerUrl.includes('rijksoverheid') ||
                        lowerUrl.includes('overheid.nl'))
                ) {
                    return 1.0;
                }
                if (lowerUrl.includes('iplo.nl') || lowerUrl.includes('ruimtelijkeplannen')) {
                    return 0.9;
                }
            }
        }

        return 0.5;
    };

    /**
     * Combined weight function (confidence + recency + authority)
     */
    static combinedWeightFunction: WeightFunction = (relationship) => {
        const confidenceWeight = WeightedTraversal.confidenceWeightFunction(relationship) * 0.5;
        const recencyWeight = WeightedTraversal.recencyWeightFunction(relationship) * 0.25;
        const authorityWeight = WeightedTraversal.authorityWeightFunction(relationship) * 0.25;
        return confidenceWeight + recencyWeight + authorityWeight;
    };

    /**
     * Perform weighted BFS traversal from a starting node
     * Prioritizes high-weight paths by exploring them first
     */
    async traverseBFS(
        startNodeId: string,
        config: WeightedTraversalConfig
    ): Promise<TraversalResult> {
        this.cycleDetector.reset();

        const result: TraversalResult = {
            nodes: [],
            edges: [],
            visitedCount: 0,
            depthReached: 0,
        };

        const weightFunction = config.weightFunction || WeightedTraversal.defaultWeightFunction;
        const minWeight = config.minWeight ?? 0;
        const prioritizeHighWeight = config.prioritizeHighWeight ?? true;

        // Priority queue: [nodeId, depth, path, cumulativeWeight]
        // For BFS, we use a priority queue sorted by weight (higher weight = higher priority)
        const queue: Array<[string, number, string[], number]> = [[startNodeId, 0, [startNodeId], 0]];
        const visited = new Set<string>();

        while (queue.length > 0 && result.visitedCount < config.maxNodes) {
            // Sort queue by weight (if prioritizing high weight) or use FIFO
            if (prioritizeHighWeight) {
                queue.sort((a, b) => b[3] - a[3]); // Sort by cumulative weight descending
            }

            const [currentId, depth, path, cumulativeWeight] = queue.shift()!;

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

            // Get weighted neighbors
            const neighbors = await this.getWeightedNeighbors(currentId, config, weightFunction);

            // Filter by minimum weight
            const validNeighbors = neighbors.filter(n => n.weight >= minWeight);

            for (const neighbor of validNeighbors) {
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
                    const newCumulativeWeight = cumulativeWeight + neighbor.weight;
                    queue.push([neighbor.targetId, depth + 1, [...path, neighbor.targetId], newCumulativeWeight]);
                }
            }
        }

        return result;
    }

    /**
     * Perform weighted DFS traversal from a starting node
     * Uses weight-based backtracking: explores higher-weight paths first
     */
    async traverseDFS(
        startNodeId: string,
        config: WeightedTraversalConfig
    ): Promise<TraversalResult> {
        this.cycleDetector.reset();

        const result: TraversalResult = {
            nodes: [],
            edges: [],
            visitedCount: 0,
            depthReached: 0,
        };

        const weightFunction = config.weightFunction || WeightedTraversal.defaultWeightFunction;
        const minWeight = config.minWeight ?? 0;

        await this.dfsRecursiveWeighted(
            startNodeId,
            0,
            [startNodeId],
            0,
            config,
            result,
            new Set<string>(),
            weightFunction,
            minWeight
        );

        return result;
    }

    /**
     * Recursive weighted DFS implementation
     */
    private async dfsRecursiveWeighted(
        nodeId: string,
        depth: number,
        path: string[],
        cumulativeWeight: number,
        config: WeightedTraversalConfig,
        result: TraversalResult,
        visited: Set<string>,
        weightFunction: WeightFunction,
        minWeight: number
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

        // Get weighted neighbors
        const neighbors = await this.getWeightedNeighbors(nodeId, config, weightFunction);

        // Filter by minimum weight and sort by weight (descending for higher priority)
        const validNeighbors = neighbors
            .filter(n => n.weight >= minWeight)
            .sort((a, b) => b.weight - a.weight); // Higher weight first

        for (const neighbor of validNeighbors) {
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
            await this.dfsRecursiveWeighted(
                neighbor.targetId,
                depth + 1,
                [...path, neighbor.targetId],
                cumulativeWeight + neighbor.weight,
                config,
                result,
                visited,
                weightFunction,
                minWeight
            );
        }

        // Backtrack
        this.cycleDetector.unvisit(nodeId);
    }

    /**
     * Get weighted neighbors of a node
     */
    private async getWeightedNeighbors(
        nodeId: string,
        config: WeightedTraversalConfig,
        weightFunction: WeightFunction
    ): Promise<WeightedNeighbor[]> {
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
                // both directions
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

                // Parse metadata
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

                // Calculate weight
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

