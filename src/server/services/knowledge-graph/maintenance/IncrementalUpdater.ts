import { Driver } from 'neo4j-driver';
import { KnowledgeGraphService } from '../core/KnowledgeGraph.js';
import { ChangeSet, EntityChange, RelationshipChange } from './ChangeSet.js';
import { ConflictResolver, ConflictResolutionStrategy } from './ConflictResolver.js';
import { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import { EntityVersioningService, VersionMetadata } from './EntityVersioningService.js';

/**
 * Options for incremental updates
 */
export interface IncrementalUpdateOptions {
  conflictResolutionStrategy?: ConflictResolutionStrategy;
  createVersions?: boolean; // Whether to create versions when updating entities (requires versioning service)
  softDelete?: boolean; // Whether to soft-delete entities (mark as deleted) vs hard delete
  batchSize?: number; // Number of operations per batch
  rollbackOnError?: boolean; // Whether to rollback transaction on error
}

/**
 * Metrics for incremental update operation
 */
export interface IncrementalUpdateMetrics {
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
}

/**
 * Review item for manual review
 */
export interface ReviewItem {
  type: 'entity' | 'relationship';
  id: string;
  reason: string;
  conflict: EntityChange | RelationshipChange;
}

/**
 * Result of incremental update operation
 */
export interface IncrementalUpdateResult {
  success: boolean;
  changeSetId: string;
  metrics: IncrementalUpdateMetrics;
  requiresManualReview: boolean;
  reviewItems?: ReviewItem[];
}

/**
 * Service for processing incremental updates to the knowledge graph
 * 
 * @deprecated This Neo4j-based implementation is deprecated in favor of GraphDBIncrementalUpdater.
 * According to the architecture (docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md),
 * the Knowledge Graph MUST use GraphDB (SPARQL), not Neo4j (Cypher).
 * 
 * Migration path:
 * - Use GraphDBIncrementalUpdater for all knowledge graph incremental update operations
 * - This class is kept only as a fallback for development/test environments
 * - In production, GraphDB is required and this fallback will not be used
 * 
 * See: src/server/services/knowledge-graph/maintenance/GraphDBIncrementalUpdater.ts
 */
export class IncrementalUpdater {
  private kgService: KnowledgeGraphService;
  private conflictResolver: ConflictResolver;
  private driver: Driver;
  private versioningService: EntityVersioningService | null = null;

  constructor(
    kgService: KnowledgeGraphService,
    driver: Driver,
    conflictResolver?: ConflictResolver
  ) {
    this.kgService = kgService;
    this.driver = driver;
    this.conflictResolver = conflictResolver || new ConflictResolver();
    
    // Initialize versioning service if enabled
    if (FeatureFlag.isEnabled(KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED, false)) {
      try {
        this.versioningService = new EntityVersioningService(driver);
      } catch (error) {
        logger.warn({ error }, '[IncrementalUpdater] Failed to initialize versioning service');
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
    options: IncrementalUpdateOptions = {}
  ): Promise<IncrementalUpdateResult> {
    if (!this.isEnabled()) {
      logger.debug('[IncrementalUpdater] Incremental updates are disabled');
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
          errors: ['Incremental updates are disabled']
        },
        requiresManualReview: false
      };
    }

    const startTime = Date.now();
    const metrics: IncrementalUpdateMetrics = {
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
      errors: []
    };

    const reviewItems: ReviewItem[] = [];

    const conflictStrategy = options.conflictResolutionStrategy || ConflictResolutionStrategy.LAST_WRITE_WINS;
    const batchSize = options.batchSize || 100;
    const rollbackOnError = options.rollbackOnError !== false;

    try {
      // Process entity changes in batches
      // Note: KnowledgeGraphService methods create their own sessions,
      // so we can't use a single transaction. Individual operations are atomic.
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

      // If rollback on error and we have errors, note it but can't actually rollback
      // individual operations since they use separate sessions
      if (rollbackOnError && metrics.errors.length > 0) {
        logger.warn('[IncrementalUpdater] Errors encountered during processing. Some operations may have succeeded.');
      }

      metrics.processingTimeMs = Date.now() - startTime;
      logger.info(`[IncrementalUpdater] Processed change set ${changeSet.id}: ${metrics.entitiesAdded} added, ${metrics.entitiesUpdated} updated, ${metrics.entitiesDeleted} deleted`);

      return {
        success: metrics.errors.length === 0,
        changeSetId: changeSet.id,
        metrics,
        requiresManualReview: reviewItems.length > 0,
        reviewItems: reviewItems.length > 0 ? reviewItems : undefined
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, changeSetId: changeSet.id }, `[IncrementalUpdater] Error processing change set ${changeSet.id}`);
      metrics.errors.push(errorMsg);
      metrics.processingTimeMs = Date.now() - startTime;

      return {
        success: false,
        changeSetId: changeSet.id,
        metrics,
        requiresManualReview: reviewItems.length > 0,
        reviewItems: reviewItems.length > 0 ? reviewItems : undefined
      };
    }
  }

  /**
   * Process entity changes (add, update, delete)
   */
  private async processEntityChanges(
    changeSet: ChangeSet,
    metrics: IncrementalUpdateMetrics,
    reviewItems: ReviewItem[],
    conflictStrategy: ConflictResolutionStrategy,
    batchSize: number,
    createVersions: boolean,
    softDelete: boolean
  ): Promise<void> {
    // Process new entities
    for (const entityChange of changeSet.newEntities) {
      try {
        if (entityChange.newValue) {
          await this.kgService.addNode(entityChange.newValue);
          metrics.entitiesAdded++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to add entity ${entityChange.entityId}: ${errorMsg}`);
        logger.error({ error, entityId: entityChange.entityId }, `[IncrementalUpdater] Error adding entity ${entityChange.entityId}`);
      }
    }

    // Process updated entities
    // Batch fetch existing entities to avoid N+1 reads
    const entityIds = changeSet.updatedEntities.map(e => e.entityId);
    const existingEntitiesMap = new Map<string, BaseEntity>();

    try {
        const existingEntities = await this.kgService.getNodes(entityIds);
        existingEntities.forEach(e => {
            if (e) existingEntitiesMap.set(e.id, e);
        });
    } catch (error) {
        logger.warn({ error }, '[IncrementalUpdater] Failed to batch fetch existing entities, falling back to individual fetch');
    }

    // Collect versioning requests for bulk creation
    const versioningRequests: Array<{ entity: BaseEntity, metadata?: VersionMetadata }> = [];

    for (const entityChange of changeSet.updatedEntities) {
      try {
        if (entityChange.newValue) {
          // Check if entity exists (from map or individual fetch as fallback)
          let existingEntity = existingEntitiesMap.get(entityChange.entityId);
          if (!existingEntity) {
             // Fallback to individual fetch if entity not in batch map
             existingEntity = await this.kgService.getNode(entityChange.entityId);
          }
          
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
                  conflict: entityChange
                });
                // Skip update if manual review required
                continue;
              } else {
                metrics.conflictsResolved++;
              }
            }

            // Collect version request for bulk creation after the loop
            if (createVersions && this.versioningService) {
              versioningRequests.push({
                entity: existingEntity,
                metadata: {
                  timestamp: new Date().toISOString(),
                  changeReason: `Incremental update: ${entityChange.changedFields?.join(', ') || 'entity updated'}`,
                  author: 'incremental-updater'
                }
              });
            }

            // Update entity immediately (MERGE will update if exists)
            await this.kgService.addNode(resolution.resolved);
            metrics.entitiesUpdated++;
            // Update the map only after successful write so subsequent
            // updates for the same entity resolve against persisted state
            existingEntitiesMap.set(entityChange.entityId, resolution.resolved);
          } else {
            // Entity doesn't exist, treat as new
            await this.kgService.addNode(entityChange.newValue);
            metrics.entitiesAdded++;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to update entity ${entityChange.entityId}: ${errorMsg}`);
        logger.error({ error, entityId: entityChange.entityId }, '[IncrementalUpdater] Error updating entity');
      }
    }

    // Bulk create versions for all updated entities
    if (versioningRequests.length > 0 && this.versioningService) {
      try {
        await this.versioningService.createVersions(versioningRequests);
      } catch (error) {
        logger.warn({ error }, '[IncrementalUpdater] Failed to create versions in bulk');
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
        logger.error({ error, entityId: entityChange.entityId }, '[IncrementalUpdater] Error deleting entity');
      }
    }
  }

  /**
   * Process relationship changes (add, update, delete)
   */
  private async processRelationshipChanges(
    changeSet: ChangeSet,
    metrics: IncrementalUpdateMetrics,
    reviewItems: ReviewItem[],
    conflictStrategy: ConflictResolutionStrategy,
    batchSize: number
  ): Promise<void> {
    // Process new relationships
    for (const relChange of changeSet.newRelationships) {
      try {
        if (relChange.newValue) {
          await this.kgService.addEdge(
            relChange.sourceId,
            relChange.targetId,
            relChange.newValue.type as RelationType,
            relChange.newValue.metadata
          );
          metrics.relationshipsAdded++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to add relationship ${relChange.sourceId}->${relChange.targetId}: ${errorMsg}`);
        logger.error({ error, sourceId: relChange.sourceId, targetId: relChange.targetId }, '[IncrementalUpdater] Error adding relationship');
      }
    }

    // Process updated relationships
    for (const relChange of changeSet.updatedRelationships) {
      try {
        if (relChange.newValue) {
          // Get existing relationship
          const existingRelations = await this.kgService.getRelationshipsForEntity(relChange.sourceId);
          const existingRelInfo = existingRelations.find(
            r => r.targetId === relChange.targetId && r.type === relChange.newValue!.type
          );

          // Convert to Relation format for conflict resolution
          const existingRel: Relation | null = existingRelInfo ? {
            sourceId: existingRelInfo.sourceId,
            targetId: existingRelInfo.targetId,
            type: existingRelInfo.type,
            metadata: {} // Metadata not available from getRelationshipsForEntity, will be handled by merge
          } : null;

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
                conflict: relChange
              });
              // Skip update if manual review required
              continue;
            } else {
              metrics.conflictsResolved++;
            }
          }

          // Update relationship (MERGE will update if exists)
          await this.kgService.addEdge(
            relChange.sourceId,
            relChange.targetId,
            resolution.resolved.type as RelationType,
            resolution.resolved.metadata
          );
          metrics.relationshipsUpdated++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to update relationship ${relChange.sourceId}->${relChange.targetId}: ${errorMsg}`);
        logger.error({ error, sourceId: relChange.sourceId, targetId: relChange.targetId }, '[IncrementalUpdater] Error updating relationship');
      }
    }

    // Process deleted relationships
    for (const relChange of changeSet.deletedRelationships) {
      try {
        await this.deleteRelationship(
          relChange.sourceId,
          relChange.targetId,
          relChange.relationType as RelationType
        );
        metrics.relationshipsDeleted++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to delete relationship ${relChange.sourceId}->${relChange.targetId}: ${errorMsg}`);
        logger.error({ error, sourceId: relChange.sourceId, targetId: relChange.targetId }, '[IncrementalUpdater] Error deleting relationship');
      }
    }
  }

  /**
   * Delete an entity (soft delete by default)
   */
  private async deleteEntity(entityId: string, softDelete: boolean = true): Promise<void> {
    const session = this.driver.session();
    try {
      if (softDelete) {
        // Soft delete: mark as deleted
        await session.run(
          `MATCH (e:Entity {id: $id})
           SET e.deleted = true, e.deletedAt = datetime()
           RETURN e`,
          { id: entityId }
        );
      } else {
        // Hard delete: remove entity and all relationships
        await session.run(
          `MATCH (e:Entity {id: $id})
           DETACH DELETE e`,
          { id: entityId }
        );
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a relationship
   */
  private async deleteRelationship(
    sourceId: string,
    targetId: string,
    relationType: RelationType
  ): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MATCH (source:Entity {id: $sourceId})-[r:RELATES_TO {type: $type}]->(target:Entity {id: $targetId})
         DELETE r`,
        { sourceId, targetId, type: relationType }
      );
    } finally {
      await session.close();
    }
  }
}

