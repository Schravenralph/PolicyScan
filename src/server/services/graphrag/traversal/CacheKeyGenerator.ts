import { TraversalOptions } from '../GraphTraversalService.js';
import { RelationType, EntityType } from '../../../domain/ontology.js';
import crypto from 'crypto';

/**
 * Generate cache keys for traversal operations
 * 
 * Cache keys are based on:
 * - Start node ID
 * - Traversal options (depth, strategy, filters, etc.)
 * - Operation type (traverse, findPath, extractSubgraph)
 */
export class CacheKeyGenerator {
    /**
     * Generate cache key for traverse operation
     */
    static generateTraverseKey(startNodeId: string, options: Partial<TraversalOptions>): string {
        const keyData = {
            operation: 'traverse',
            startNodeId,
            maxDepth: options.maxDepth ?? 3,
            maxNodes: options.maxNodes ?? 1000,
            strategy: options.strategy ?? 'bfs',
            relationshipTypes: options.relationshipTypes ? [...options.relationshipTypes].sort() : [],
            entityTypes: options.entityTypes ? [...options.entityTypes].sort() : [],
            direction: options.direction ?? 'both',
            minWeight: options.minWeight,
            prioritizeHighWeight: options.prioritizeHighWeight,
            costMetric: options.costMetric,
            relevanceConfig: options.relevanceConfig ? {
                threshold: options.relevanceConfig.threshold,
                earlyTerminationThreshold: options.relevanceConfig.earlyTerminationThreshold,
                vectorWeight: options.relevanceConfig.vectorWeight,
                graphWeight: options.relevanceConfig.graphWeight,
            } : undefined,
        };

        return this.hashKey(keyData);
    }

    /**
     * Generate cache key for findPath operation
     */
    static generateFindPathKey(
        startNodeId: string,
        endNodeId: string,
        options: Partial<TraversalOptions>
    ): string {
        const keyData = {
            operation: 'findPath',
            startNodeId,
            endNodeId,
            maxDepth: options.maxDepth ?? 5,
            maxNodes: options.maxNodes ?? 1000,
            strategy: options.strategy ?? 'bfs',
            relationshipTypes: options.relationshipTypes ? [...options.relationshipTypes].sort() : [],
            entityTypes: options.entityTypes ? [...options.entityTypes].sort() : [],
            direction: options.direction ?? 'both',
            costMetric: options.costMetric,
            weightFunction: options.weightFunction ? 'custom' : undefined,
        };

        return this.hashKey(keyData);
    }

    /**
     * Generate cache key for extractSubgraph operation
     */
    static generateSubgraphKey(
        centerNodeId: string,
        radius: number,
        options: Partial<Omit<TraversalOptions, 'maxDepth'>>
    ): string {
        const keyData = {
            operation: 'extractSubgraph',
            centerNodeId,
            radius,
            maxNodes: options.maxNodes ?? 1000,
            strategy: options.strategy ?? 'bfs',
            relationshipTypes: options.relationshipTypes ? [...options.relationshipTypes].sort() : [],
            entityTypes: options.entityTypes ? [...options.entityTypes].sort() : [],
            direction: options.direction ?? 'both',
        };

        return this.hashKey(keyData);
    }

    /**
     * Generate pattern-based cache key (for partial caching)
     * Used to cache intermediate traversal levels
     */
    static generatePatternKey(
        nodeId: string,
        depth: number,
        relationshipTypes?: RelationType[],
        entityTypes?: EntityType[]
    ): string {
        const keyData = {
            operation: 'pattern',
            nodeId,
            depth,
            relationshipTypes: relationshipTypes ? [...relationshipTypes].sort() : [],
            entityTypes: entityTypes ? [...entityTypes].sort() : [],
        };

        return this.hashKey(keyData);
    }

    /**
     * Generate cache key prefix for a node
     * Used for invalidation (all keys starting with this prefix)
     */
    static generateNodePrefix(nodeId: string): string {
        return `node:${nodeId}:`;
    }

    /**
     * Generate cache key prefix for a relationship type
     * Used for invalidation (all keys with this relationship type)
     */
    static generateRelationshipPrefix(relationshipType: RelationType): string {
        return `rel:${relationshipType}:`;
    }

    /**
     * Hash key data to create cache key
     */
    private static hashKey(keyData: unknown): string {
        const json = JSON.stringify(keyData, (_key, value) => {
            // Sort arrays for consistent hashing
            if (Array.isArray(value)) {
                // Return a sorted copy to avoid mutating the original array
                return [...value].sort();
            }
            return value;
        });
        
        const hash = crypto.createHash('sha256').update(json).digest('hex');
        return `traversal:${hash.substring(0, 16)}`;
    }
}

