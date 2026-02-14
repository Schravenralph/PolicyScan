import { TraversalCache } from './TraversalCache.js';
import { CacheKeyGenerator } from './CacheKeyGenerator.js';
import { RelationType } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

/**
 * Cache invalidation strategies for traversal cache
 * 
 * Supports:
 * - Time-based invalidation (TTL)
 * - Event-based invalidation (graph updates)
 * - Manual invalidation
 */
export class CacheInvalidator {
    private cache: TraversalCache;

    constructor(cache: TraversalCache) {
        this.cache = cache;
    }

    /**
     * Invalidate all cache entries
     */
    invalidateAll(): void {
        this.cache.clear();
        logger.debug('[CacheInvalidator] All cache entries invalidated');
    }

    /**
     * Invalidate cache entries for a specific node
     * Invalidates all traversals starting from or passing through this node
     */
    async invalidateNode(nodeId: string): Promise<number> {
        const prefix = CacheKeyGenerator.generateNodePrefix(nodeId);
        const invalidated = await this.cache.invalidateByPrefix(prefix);
        
        if (invalidated > 0) {
            logger.debug(`[CacheInvalidator] Invalidated ${invalidated} entries for node ${nodeId}`);
        }
        
        return invalidated;
    }

    /**
     * Invalidate cache entries for multiple nodes
     */
    async invalidateNodes(nodeIds: string[]): Promise<number> {
        let total = 0;
        for (const nodeId of nodeIds) {
            total += await this.invalidateNode(nodeId);
        }
        return total;
    }

    /**
     * Invalidate cache entries for a specific relationship type
     * Invalidates all traversals using this relationship type
     */
    async invalidateRelationship(relationshipType: RelationType): Promise<number> {
        const prefix = CacheKeyGenerator.generateRelationshipPrefix(relationshipType);
        const invalidated = await this.cache.invalidateByPrefix(prefix);
        
        if (invalidated > 0) {
            logger.debug(`[CacheInvalidator] Invalidated ${invalidated} entries for relationship ${relationshipType}`);
        }
        
        return invalidated;
    }

    /**
     * Invalidate cache entries for multiple relationship types
     */
    async invalidateRelationships(relationshipTypes: RelationType[]): Promise<number> {
        let total = 0;
        for (const relType of relationshipTypes) {
            total += await this.invalidateRelationship(relType);
        }
        return total;
    }

    /**
     * Invalidate cache entries affected by entity updates
     * Called when entities are added, updated, or deleted
     */
    async invalidateEntityUpdates(entityIds: string[]): Promise<number> {
        return await this.invalidateNodes(entityIds);
    }

    /**
     * Invalidate cache entries affected by relationship updates
     * Called when relationships are added, updated, or deleted
     */
    async invalidateRelationshipUpdates(
        sourceIds: string[],
        targetIds: string[],
        relationshipTypes?: RelationType[]
    ): Promise<number> {
        // Invalidate nodes involved in relationship changes
        const allNodeIds = Array.from(new Set([...sourceIds, ...targetIds]));
        let total = await this.invalidateNodes(allNodeIds);

        // If specific relationship types are provided, invalidate those too
        if (relationshipTypes && relationshipTypes.length > 0) {
            total += await this.invalidateRelationships(relationshipTypes);
        }

        return total;
    }

    /**
     * Invalidate cache entries older than specified age
     * Time-based invalidation
     */
    async invalidateOlderThan(ageMs: number): Promise<number> {
        const now = Date.now();
        const invalidated = await this.cache.invalidateOlderThan(now - ageMs);
        
        if (invalidated > 0) {
            logger.debug(`[CacheInvalidator] Invalidated ${invalidated} entries older than ${ageMs}ms`);
        }
        
        return invalidated;
    }

    /**
     * Invalidate cache entries matching a pattern
     * Useful for custom invalidation strategies
     */
    async invalidateByPattern(pattern: RegExp): Promise<number> {
        const invalidated = await this.cache.invalidateByPattern(pattern);
        
        if (invalidated > 0) {
            logger.debug(`[CacheInvalidator] Invalidated ${invalidated} entries matching pattern ${pattern}`);
        }
        
        return invalidated;
    }
}

