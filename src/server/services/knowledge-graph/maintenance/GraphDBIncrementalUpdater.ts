/**
 * GraphDB Incremental Updater
 * 
 * SPARQL-based implementation of incremental updater for GraphDB backend.
 * Uses SPARQL UPDATE (INSERT/DELETE WHERE) for atomic updates with conflict resolution.
 * 
 * Architecture: Knowledge Graph operations MUST use GraphDB (SPARQL), not Neo4j (Cypher).
 * See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { GraphDBClient } from '../../../config/graphdb.js';
import { GraphDBKnowledgeGraphService } from '../../graphs/knowledge/GraphDBKnowledgeGraphService.js';
import { ChangeSet, EntityChange, RelationshipChange } from './ChangeSet.js';
import { ConflictResolver, ConflictResolutionStrategy } from './ConflictResolver.js';
import { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import { KnowledgeGraphVersionManager } from '../versioning/KnowledgeGraphVersionManager.js';

// Re-export interfaces from IncrementalUpdater for compatibility
export type {
    IncrementalUpdateOptions,
    IncrementalUpdateMetrics,
    ReviewItem,
    IncrementalUpdateResult,
} from './IncrementalUpdater.js';

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
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

/**
 * Convert entity ID to GraphDB URI
 */
function entityUri(id: string): string {
    return `http://data.example.org/id/${encodeURIComponent(id)}`;
}

/**
 * Maps RelationType to SPARQL property
 */
function relationTypeToProperty(relationType: RelationType): string {
    const propertyMap: Record<RelationType, string> = {
        APPLIES_TO: 'beleid:appliesTo',
        DEFINED_IN: 'beleid:definedIn',
        LOCATED_IN: 'beleid:locatedIn',
        OVERRIDES: 'beleid:overrides',
        REFINES: 'beleid:refines',
        CONSTRAINS: 'beleid:constrains',
        HAS_REQUIREMENT: 'beleid:hasRequirement',
        RELATED_TO: 'beleid:relatedTo',
    };
    return propertyMap[relationType] || `beleid:${relationType.toLowerCase()}`;
}

/**
 * Service for processing incremental updates to the knowledge graph using GraphDB.
 * Uses SPARQL UPDATE operations for atomic updates with conflict resolution.
 */
export class GraphDBIncrementalUpdater {
    private kgService: GraphDBKnowledgeGraphService;
    private conflictResolver: ConflictResolver;
    private client: GraphDBClient;
    private versionManager: KnowledgeGraphVersionManager | null = null;

    constructor(
        kgService: GraphDBKnowledgeGraphService,
        client: GraphDBClient,
        conflictResolver?: ConflictResolver
    ) {
        this.kgService = kgService;
        this.client = client;
        this.conflictResolver = conflictResolver || new ConflictResolver();

        // Initialize version manager if versioning is enabled
        if (FeatureFlag.isEnabled(KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED, false)) {
            try {
                this.versionManager = new KnowledgeGraphVersionManager(client);
            } catch (error) {
                logger.warn({ error }, '[GraphDBIncrementalUpdater] Failed to initialize version manager');
            }
        }
    }

    /**
     * Check if incremental updates are enabled
     */
    private isEnabled(): boolean {
        return FeatureFlag.isEnabled(KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED, false);
    }

    /**
     * Process a change set and apply incremental updates
     */
    async processChangeSet(
        changeSet: ChangeSet,
        options: {
            conflictResolutionStrategy?: ConflictResolutionStrategy;
            createVersions?: boolean;
            softDelete?: boolean;
            batchSize?: number;
            rollbackOnError?: boolean;
        } = {}
    ): Promise<{
        success: boolean;
        changeSetId: string;
        metrics: {
            entitiesAdded: number;
            entitiesUpdated: number;
            entitiesDeleted: number;
            relationshipsAdded: number;
            relationshipsUpdated: number;
            relationshipsDeleted: number;
            conflictsDetected: number;
            conflictsResolved: number;
            conflictsRequiringReview: number;
            processingTimeMs: number;
            errors: string[];
        };
        requiresManualReview: boolean;
        reviewItems?: Array<{
            type: 'entity' | 'relationship';
            id: string;
            reason: string;
            conflict: EntityChange | RelationshipChange;
        }>;
    }> {
        if (!this.isEnabled()) {
            logger.debug('[GraphDBIncrementalUpdater] Incremental updates are disabled');
            return {
                success: false,
                changeSetId: changeSet.id,
                metrics: {
                    entitiesAdded: 0,
                    entitiesUpdated: 0,
                    entitiesDeleted: 0,
                    relationshipsAdded: 0,
                    relationshipsUpdated: 0,
                    relationshipsDeleted: 0,
                    conflictsDetected: 0,
                    conflictsResolved: 0,
                    conflictsRequiringReview: 0,
                    processingTimeMs: 0,
                    errors: ['Incremental updates are disabled'],
                },
                requiresManualReview: false,
            };
        }

        const startTime = Date.now();
        const metrics = {
            entitiesAdded: 0,
            entitiesUpdated: 0,
            entitiesDeleted: 0,
            relationshipsAdded: 0,
            relationshipsUpdated: 0,
            relationshipsDeleted: 0,
            conflictsDetected: 0,
            conflictsResolved: 0,
            conflictsRequiringReview: 0,
            processingTimeMs: 0,
            errors: [] as string[],
        };

        const reviewItems: Array<{
            type: 'entity' | 'relationship';
            id: string;
            reason: string;
            conflict: EntityChange | RelationshipChange;
        }> = [];

        const conflictStrategy = options.conflictResolutionStrategy || ConflictResolutionStrategy.LAST_WRITE_WINS;
        const batchSize = options.batchSize || 100;
        const rollbackOnError = options.rollbackOnError !== false;

        try {
            // Process entity changes in batches
            await this.processEntityChanges(
                changeSet,
                metrics,
                reviewItems,
                conflictStrategy,
                batchSize,
                options.createVersions || false,
                options.softDelete !== false // Default to true if not specified
            );

            // Process relationship changes in batches
            await this.processRelationshipChanges(
                changeSet,
                metrics,
                reviewItems,
                conflictStrategy,
                batchSize
            );

            // If rollback on error and we have errors, note it
            // Note: SPARQL UPDATE operations are atomic per statement, but we can't rollback across statements
            if (rollbackOnError && metrics.errors.length > 0) {
                logger.warn('[GraphDBIncrementalUpdater] Errors encountered during processing. Some operations may have succeeded.');
            }

            metrics.processingTimeMs = Date.now() - startTime;
            logger.info(`[GraphDBIncrementalUpdater] Processed change set ${changeSet.id}: ${metrics.entitiesAdded} added, ${metrics.entitiesUpdated} updated, ${metrics.entitiesDeleted} deleted`);

            return {
                success: metrics.errors.length === 0,
                changeSetId: changeSet.id,
                metrics,
                requiresManualReview: reviewItems.length > 0,
                reviewItems: reviewItems.length > 0 ? reviewItems : undefined,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ error, changeSetId: changeSet.id }, `[GraphDBIncrementalUpdater] Error processing change set ${changeSet.id}`);
            metrics.errors.push(errorMsg);
            metrics.processingTimeMs = Date.now() - startTime;

            return {
                success: false,
                changeSetId: changeSet.id,
                metrics,
                requiresManualReview: reviewItems.length > 0,
                reviewItems: reviewItems.length > 0 ? reviewItems : undefined,
            };
        }
    }

    /**
     * Process entity changes (add, update, delete) using SPARQL UPDATE
     */
    private async processEntityChanges(
        changeSet: ChangeSet,
        metrics: {
            entitiesAdded: number;
            entitiesUpdated: number;
            entitiesDeleted: number;
            conflictsDetected: number;
            conflictsResolved: number;
            conflictsRequiringReview: number;
            errors: string[];
        },
        reviewItems: Array<{
            type: 'entity' | 'relationship';
            id: string;
            reason: string;
            conflict: EntityChange | RelationshipChange;
        }>,
        conflictStrategy: ConflictResolutionStrategy,
        batchSize: number,
        createVersions: boolean,
        softDelete: boolean
    ): Promise<void> {
        // Process new entities
        const entitiesToAdd: BaseEntity[] = [];
        for (const entityChange of changeSet.newEntities) {
            if (entityChange.newValue) {
                entitiesToAdd.push(entityChange.newValue);
            }
        }

        if (entitiesToAdd.length > 0) {
            try {
                const result = await this.kgService.addNodesBulk(entitiesToAdd);
                metrics.entitiesAdded += result.successful;
                if (result.failed > 0) {
                    metrics.errors.push(...result.errors);
                    logger.warn({
                        failedCount: result.failed,
                        errors: result.errors
                    }, '[GraphDBIncrementalUpdater] Some entities failed to add during bulk operation');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to add batch of entities: ${errorMsg}`);
                logger.error({ error }, '[GraphDBIncrementalUpdater] Error adding batch of entities');
            }
        }

        // Process updated entities
        for (const entityChange of changeSet.updatedEntities) {
            try {
                if (entityChange.newValue) {
                    // Check if entity exists
                    const existingEntity = await this.kgService.getNode(entityChange.entityId);

                    if (existingEntity) {
                        // Resolve conflicts
                        const resolution = this.conflictResolver.resolveEntityConflict(
                            existingEntity,
                            entityChange.newValue,
                            conflictStrategy
                        );

                        if (resolution.conflictDetected) {
                            metrics.conflictsDetected++;

                            if (resolution.requiresManualReview) {
                                metrics.conflictsRequiringReview++;
                                reviewItems.push({
                                    type: 'entity',
                                    id: entityChange.entityId,
                                    reason: resolution.reason || 'Conflict requires manual review',
                                    conflict: entityChange,
                                });
                                // Skip update if manual review required
                                continue;
                            } else {
                                metrics.conflictsResolved++;
                            }
                        }

                        // Create version before update if versioning is enabled
                        if (createVersions && this.versionManager && existingEntity) {
                            try {
                                // Use GraphDB version manager to create version snapshot
                                // Note: This creates a branch-level snapshot, not entity-level version
                                // For entity-level versioning, we'd need a different approach
                                logger.debug({ entityId: entityChange.entityId }, '[GraphDBIncrementalUpdater] Versioning enabled but entity-level versioning not yet implemented for GraphDB');
                            } catch (error) {
                                logger.warn({ error, entityId: entityChange.entityId }, '[GraphDBIncrementalUpdater] Failed to create version for entity');
                            }
                        }

                        // Update entity using SPARQL UPDATE
                        await this.updateEntity(entityChange.entityId, resolution.resolved);
                        metrics.entitiesUpdated++;
                    } else {
                        // Entity doesn't exist, treat as new
                        await this.kgService.addNode(entityChange.newValue);
                        metrics.entitiesAdded++;
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to update entity ${entityChange.entityId}: ${errorMsg}`);
                logger.error({ error, entityId: entityChange.entityId }, '[GraphDBIncrementalUpdater] Error updating entity');
            }
        }

        // Process deleted entities
        for (const entityChange of changeSet.deletedEntities) {
            try {
                await this.deleteEntity(entityChange.entityId, softDelete);
                metrics.entitiesDeleted++;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to delete entity ${entityChange.entityId}: ${errorMsg}`);
                logger.error({ error, entityId: entityChange.entityId }, '[GraphDBIncrementalUpdater] Error deleting entity');
            }
        }
    }

    /**
     * Process relationship changes (add, update, delete) using SPARQL UPDATE
     */
    private async processRelationshipChanges(
        changeSet: ChangeSet,
        metrics: {
            relationshipsAdded: number;
            relationshipsUpdated: number;
            relationshipsDeleted: number;
            conflictsDetected: number;
            conflictsResolved: number;
            conflictsRequiringReview: number;
            errors: string[];
        },
        reviewItems: Array<{
            type: 'entity' | 'relationship';
            id: string;
            reason: string;
            conflict: EntityChange | RelationshipChange;
        }>,
        conflictStrategy: ConflictResolutionStrategy,
        _batchSize: number
    ): Promise<void> {
        // Process new relationships
        const relsToAdd: Relation[] = [];
        for (const relChange of changeSet.newRelationships) {
            if (relChange.newValue) {
                relsToAdd.push(relChange.newValue);
            }
        }
        if (relsToAdd.length > 0) {
            try {
                const result = await this.kgService.addEdgesBulk(relsToAdd);
                metrics.relationshipsAdded += result.successful;
                if (result.failed > 0) {
                    metrics.errors.push(...result.errors);
                    logger.warn({
                        failedCount: result.failed,
                        errors: result.errors
                    }, '[GraphDBIncrementalUpdater] Some new relationships failed to add during bulk operation');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to add batch of new relationships: ${errorMsg}`);
                logger.error({ error }, '[GraphDBIncrementalUpdater] Error adding batch of new relationships');
            }
        }

        // Process updated relationships
        if (changeSet.updatedRelationships.length > 0) {
            try {
                // Collect keys for existing relationships
                const keys = changeSet.updatedRelationships
                    .filter(r => r.newValue)
                    .map(r => ({
                        sourceId: r.sourceId,
                        targetId: r.targetId,
                        type: r.newValue!.type
                    }));

                // Fetch existing relationships in batch
                const existingRelsMap: Map<string, Relation> = new Map();
                try {
                    const existingRels = await this.kgService.getRelationships(keys);
                    // Map by composite key for easy lookup
                    for (const rel of existingRels) {
                        const key = `${rel.sourceId}:${rel.targetId}:${rel.type}`;
                        existingRelsMap.set(key, rel);
                    }
                } catch (error) {
                    logger.warn({ error }, '[GraphDBIncrementalUpdater] Failed to fetch existing relationships for updates, treating as new where possible');
                    // Continue with empty map
                }

                const relsToDeleteForUpdate: Array<{ sourceId: string; targetId: string; type: RelationType }> = [];
                const relsToAddForUpdate: Relation[] = [];
                // Track counts for metrics adjustment
                let potentialUpdates = 0;
                let potentialAdds = 0;

                for (const relChange of changeSet.updatedRelationships) {
                    if (!relChange.newValue) continue;

                    const key = `${relChange.sourceId}:${relChange.targetId}:${relChange.newValue.type}`;
                    const existingRel = existingRelsMap.get(key) || null;

                    if (existingRel) {
                        // Resolve conflicts
                        const resolution = this.conflictResolver.resolveRelationshipConflict(
                            existingRel,
                            relChange.newValue,
                            conflictStrategy
                        );

                        if (resolution.conflictDetected) {
                            metrics.conflictsDetected++;

                            if (resolution.requiresManualReview) {
                                metrics.conflictsRequiringReview++;
                                reviewItems.push({
                                    type: 'relationship',
                                    id: `${relChange.sourceId}->${relChange.targetId}`,
                                    reason: resolution.reason || 'Conflict requires manual review',
                                    conflict: relChange,
                                });
                                // Skip update if manual review required
                                continue;
                            } else {
                                metrics.conflictsResolved++;
                            }
                        }

                        // Prepare update: delete old + add new
                        relsToDeleteForUpdate.push({
                            sourceId: relChange.sourceId,
                            targetId: relChange.targetId,
                            type: resolution.resolved.type
                        });
                        relsToAddForUpdate.push(resolution.resolved);
                        potentialUpdates++;
                    } else {
                        // Relationship doesn't exist, treat as new
                        relsToAddForUpdate.push(relChange.newValue);
                        potentialAdds++;
                    }
                }

                // Execute updates in batches
                // Note: We execute adds even if deletes fail to ensure "last write wins" consistency where possible
                // (better to have potentially duplicate or lingering old data + new data than missing new data)
                if (relsToDeleteForUpdate.length > 0) {
                    const deleteResult = await this.kgService.deleteEdgesBulk(relsToDeleteForUpdate);
                    if (deleteResult.failed > 0) {
                        metrics.errors.push(...deleteResult.errors);
                        logger.warn({ errors: deleteResult.errors }, '[GraphDBIncrementalUpdater] Failed to delete some old relationships during update. Proceeding with adds to prevent data loss.');
                    }
                }

                if (relsToAddForUpdate.length > 0) {
                    const addResult = await this.kgService.addEdgesBulk(relsToAddForUpdate);

                    // Distribute success count between updates and adds
                    if (addResult.successful > 0) {
                         const totalAttempted = potentialUpdates + potentialAdds;
                         if (totalAttempted > 0) {
                             // Proportional distribution (approximate)
                             const successRate = addResult.successful / totalAttempted;
                             metrics.relationshipsUpdated += Math.round(potentialUpdates * successRate);
                             metrics.relationshipsAdded += Math.round(potentialAdds * successRate);
                         }
                    }

                    if (addResult.failed > 0) {
                        metrics.errors.push(...addResult.errors);
                        logger.warn({ errors: addResult.errors }, '[GraphDBIncrementalUpdater] Failed to add some updated relationships');
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to process batch of relationship updates: ${errorMsg}`);
                logger.error({ error }, '[GraphDBIncrementalUpdater] Error processing batch of relationship updates');
            }
        }

        // Process deleted relationships
        const relsToDelete: Array<{ sourceId: string; targetId: string; type: RelationType }> = [];
        for (const relChange of changeSet.deletedRelationships) {
            relsToDelete.push({
                sourceId: relChange.sourceId,
                targetId: relChange.targetId,
                type: relChange.relationType as RelationType
            });
        }

        if (relsToDelete.length > 0) {
            try {
                const result = await this.kgService.deleteEdgesBulk(relsToDelete);
                metrics.relationshipsDeleted += result.successful;
                if (result.failed > 0) {
                    metrics.errors.push(...result.errors);
                    logger.warn({
                        failedCount: result.failed,
                        errors: result.errors
                    }, '[GraphDBIncrementalUpdater] Some relationships failed to delete during bulk operation');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to delete batch of relationships: ${errorMsg}`);
                logger.error({ error }, '[GraphDBIncrementalUpdater] Error deleting batch of relationships');
            }
        }
    }

    /**
     * Update an entity using SPARQL UPDATE
     */
    private async updateEntity(entityId: string, updatedEntity: BaseEntity): Promise<void> {
        const entityUri = `http://data.example.org/id/${encodeURIComponent(entityId)}`;
        const timestamp = new Date().toISOString();

        // Build DELETE clause for old values
        const deleteClause = `
DELETE {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity beleid:name ?oldName .
    ?entity dct:description ?oldDesc .
    ?entity beleid:metadata ?oldMetadata .
  }
}`;

        // Build INSERT clause for new values
        const metadataStr = updatedEntity.metadata ? JSON.stringify(updatedEntity.metadata) : '{}';
        const insertClause = `
INSERT {
  GRAPH <${KG_GRAPH_URI}> {
    ?entity beleid:name ${this.literal(updatedEntity.name || entityId)} .
    ${updatedEntity.description ? `?entity dct:description ${this.literal(updatedEntity.description)} .` : ''}
    ?entity beleid:metadata "${metadataStr.replace(/"/g, '\\"')}" .
    ?entity beleid:updatedAt "${timestamp}"^^xsd:dateTime .
  }
}`;

        const update = `
${PREFIXES}
${deleteClause}
${insertClause}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:id ?id .
    OPTIONAL { <${entityUri}> beleid:name ?oldName }
    OPTIONAL { <${entityUri}> dct:description ?oldDesc }
    OPTIONAL { <${entityUri}> beleid:metadata ?oldMetadata }
  }
}
`;

        await this.client.update(update);
    }

    /**
     * Delete an entity using SPARQL DELETE (soft delete by default)
     */
    private async deleteEntity(entityId: string, softDelete: boolean = true): Promise<void> {
        const entityUri = `http://data.example.org/id/${encodeURIComponent(entityId)}`;

        if (softDelete) {
            // Soft delete: mark as deleted
            const timestamp = new Date().toISOString();
            const update = `
${PREFIXES}
INSERT {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:deleted true .
    <${entityUri}> beleid:deletedAt "${timestamp}"^^xsd:dateTime .
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> beleid:id ?id .
  }
}
`;
            await this.client.update(update);
        } else {
            // Hard delete: remove entity and all relationships
            const update = `
${PREFIXES}
DELETE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> ?p ?o .
    ?s ?p2 <${entityUri}> .
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${entityUri}> ?p ?o .
    OPTIONAL {
      ?s ?p2 <${entityUri}> .
    }
  }
}
`;
            await this.client.update(update);
        }
    }

    /**
     * Update a relationship using SPARQL UPDATE
     */
    private async updateRelationship(
        sourceId: string,
        targetId: string,
        relationType: RelationType,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        // For GraphDB, relationships are properties, so we delete and re-insert
        // First delete the old relationship
        await this.deleteRelationship(sourceId, targetId, relationType);

        // Then add the new one
        await this.kgService.addEdge(sourceId, targetId, relationType, metadata);
    }

    /**
     * Delete a relationship using SPARQL DELETE
     */
    private async deleteRelationship(
        sourceId: string,
        targetId: string,
        relationType: RelationType
    ): Promise<void> {
        const sourceUri = entityUri(sourceId);
        const targetUri = entityUri(targetId);
        const relProperty = relationTypeToProperty(relationType);

        const update = `
${PREFIXES}
DELETE {
  GRAPH <${KG_GRAPH_URI}> {
    <${sourceUri}> ${relProperty} <${targetUri}> .
  }
}
WHERE {
  GRAPH <${KG_GRAPH_URI}> {
    <${sourceUri}> ${relProperty} <${targetUri}> .
  }
}
`;

        await this.client.update(update);
    }

    /**
     * Helper to create SPARQL literal
     */
    private literal(value: string | number | boolean): string {
        if (typeof value === 'string') {
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        if (typeof value === 'number') {
            return String(value);
        }
        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }
        return `"${String(value).replace(/"/g, '\\"')}"`;
    }
}
