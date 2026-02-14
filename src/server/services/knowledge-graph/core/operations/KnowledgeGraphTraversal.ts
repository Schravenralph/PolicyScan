/**
 * Knowledge Graph Traversal and Fusion Operations
 * Handles graph traversal, path finding, and knowledge fusion operations
 */

import type { BaseEntity } from '../../../../domain/ontology.js';
import type { TraversalOptions, TraversalResult, PathResult, SubgraphResult } from '../../../graphrag/GraphTraversalService.js';
import { FeatureFlag } from '../../../../models/FeatureFlag.js';
import type { KnowledgeGraphTraversalOperations, KnowledgeGraphTraversalDependencies } from './KnowledgeGraphTraversalInterface.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Implementation of Knowledge Graph Traversal operations
 */
export class KnowledgeGraphTraversal implements KnowledgeGraphTraversalOperations {
    constructor(private dependencies: KnowledgeGraphTraversalDependencies) {}

    /**
     * Perform graph traversal from a starting node
     * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
     */
    async traverseGraph(
        startNodeId: string,
        options: Partial<TraversalOptions> = {}
    ): Promise<TraversalResult> {
        const traversalService = this.dependencies.getTraversalService();
        if (!traversalService) {
            throw new Error('Graph traversal is disabled. Enable KG_TRAVERSAL_ENABLED feature flag.');
        }
        return traversalService.traverse(startNodeId, options);
    }

    /**
     * Find a path between two nodes
     * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
     */
    async findPath(
        startNodeId: string,
        endNodeId: string,
        options: Partial<TraversalOptions> = {}
    ): Promise<PathResult | null> {
        const traversalService = this.dependencies.getTraversalService();
        if (!traversalService) {
            throw new Error('Graph traversal is disabled. Enable KG_TRAVERSAL_ENABLED feature flag.');
        }
        return traversalService.findPath(startNodeId, endNodeId, options);
    }

    /**
     * Extract a subgraph around a node
     * Requires KG_TRAVERSAL_ENABLED feature flag to be enabled
     */
    async extractSubgraph(
        centerNodeId: string,
        radius: number = 2,
        options: Partial<Omit<TraversalOptions, 'maxDepth'>> = {}
    ): Promise<SubgraphResult> {
        const traversalService = this.dependencies.getTraversalService();
        if (!traversalService) {
            throw new Error('Graph traversal is disabled. Enable KG_TRAVERSAL_ENABLED feature flag.');
        }
        return traversalService.extractSubgraph(centerNodeId, radius, options);
    }

    /**
     * Fuse entities from multiple sources into a canonical entity
     * Only works if KG_FUSION_ENABLED feature flag is enabled
     */
    async fuseEntities(
        primaryEntity: BaseEntity,
        sourceEntities: BaseEntity[],
        options?: { strategy?: 'merge_all' | 'keep_primary' | 'keep_most_recent' | 'resolve_conflicts' }
    ): Promise<{
        fusedEntity: BaseEntity;
        mergedFrom: string[];
        conflictsResolved: number;
        propertiesMerged: number;
        sourcesMerged: number;
    }> {
        // Check if fusion is enabled
        const fusionEnabled = FeatureFlag.isFusionEnabled();
        if (!fusionEnabled) {
            throw new Error('Knowledge fusion is disabled. Enable KG_FUSION_ENABLED feature flag.');
        }

        const result = await this.dependencies.fusionService.fuseEntities(
            primaryEntity,
            sourceEntities,
            {
                strategy: options?.strategy || 'merge_all',
                preserveProvenance: true,
                updateTimestamps: true,
            } as any
        );

        // Update the fused entity in the graph
        await this.dependencies.addNode(result.fusedEntity);

        return {
            fusedEntity: result.fusedEntity,
            mergedFrom: result.mergedFrom,
            conflictsResolved: result.conflictsResolved,
            propertiesMerged: result.propertiesMerged,
            sourcesMerged: result.sourcesMerged,
        };
    }

    /**
     * Incrementally update an entity with new facts from a source
     * Uses knowledge fusion to merge new information
     */
    async incrementalUpdate(
        entityId: string,
        newFacts: Partial<BaseEntity>,
        sourceUrl?: string
    ): Promise<BaseEntity> {
        const fusionEnabled = FeatureFlag.isFusionEnabled();
        if (!fusionEnabled) {
            throw new Error('Knowledge fusion is disabled. Enable KG_FUSION_ENABLED feature flag.');
        }

        const existingEntity = await this.dependencies.getNode(entityId);
        if (!existingEntity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const result = await this.dependencies.fusionService.incrementalUpdate(
            existingEntity,
            newFacts,
            sourceUrl
        );

        // Update the entity in the graph
        await this.dependencies.addNode(result.fusedEntity);

        return result.fusedEntity;
    }

    /**
     * Run truth discovery for an entity
     */
    async runTruthDiscovery(entity: BaseEntity): Promise<void> {
        const truthDiscoveryService = this.dependencies.getTruthDiscoveryService();
        if (!truthDiscoveryService) {
            return;
        }

        try {
            // Get all entities of the same type to check for conflicts
            const allEntities = await this.dependencies.getNodesByType(entity.type);
            
            // Detect conflicts
            const detectionResult = await truthDiscoveryService.detectConflicts(entity, allEntities);
            
            if (detectionResult.conflicts.length > 0) {
                // Resolve conflicts automatically
                const resolutions = await truthDiscoveryService.resolveConflicts(
                    detectionResult.conflicts,
                    'most_reliable'
                );

                // Log conflicts that require review
                const pendingReview = resolutions.filter((r: any) => r.resolution?.requiresReview);
                if (pendingReview.length > 0) {
                    logger.warn({
                        entityId: entity.id,
                        pendingReviewCount: pendingReview.length,
                    }, 'Conflicts require human review for entity');
                }
            }
        } catch (error) {
            logger.error({ error, entityId: entity.id }, 'Error running truth discovery for entity');
            // Don't throw - truth discovery failures shouldn't block entity insertion
        }
    }
}

