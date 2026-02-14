import { Driver } from 'neo4j-driver';
import { KnowledgeGraphService } from '../../knowledge-graph/core/KnowledgeGraph.js';
import { ChangeSet, EntityChange, RelationshipChange } from '../../knowledge-graph/maintenance/ChangeSet.js';
import { ConflictResolver, ConflictResolutionStrategy } from '../../knowledge-graph/maintenance/ConflictResolver.js';
import { BaseEntity, Relation, RelationType } from '../../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import { EntityVersioningService } from '../../knowledge-graph/maintenance/EntityVersioningService.js';

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
 */
export class IncrementalUpdater {
  private kgService: KnowledgeGraphService;
  private conflictResolver: ConflictResolver;
  private versioningService: EntityVersioningService | null = null;

  constructor(
    kgService: KnowledgeGraphService,
    driver: Driver,
    conflictResolver?: ConflictResolver
  ) {
    this.kgService = kgService;
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
    const softDelete = options.softDelete !== false;

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
        softDelete
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
      logger.error({ error, changeSetId: changeSet.id }, '[IncrementalUpdater] Error processing change set');
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
    _batchSize: number,
    createVersions: boolean,
    softDelete: boolean
  ): Promise<void> {
    // Process new entities
    if (changeSet.newEntities.length > 0) {
      const newEntities = changeSet.newEntities
        .map(e => e.newValue)
        .filter((e): e is BaseEntity => !!e);

      if (newEntities.length > 0) {
        try {
          const result = await this.kgService.addNodesBulk(newEntities);
          metrics.entitiesAdded += result.successful;
          if (result.errors.length > 0) {
             metrics.errors.push(...result.errors);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          metrics.errors.push(`Failed to add batch of new entities: ${errorMsg}`);
          logger.error({ error }, '[IncrementalUpdater] Error adding batch of entities');
        }
      }
    }

    // Process updated entities
    if (changeSet.updatedEntities.length > 0) {
      try {
        const ids = changeSet.updatedEntities.map(e => e.entityId);
        const existingEntities = await this.kgService.getNodes(ids);
        const existingMap = new Map();
        existingEntities.forEach(e => {
            if (e) existingMap.set(e.id, e);
        });

        const entitiesToUpdate: BaseEntity[] = [];
        const entitiesToAdd: BaseEntity[] = [];

        for (const entityChange of changeSet.updatedEntities) {
            if (!entityChange.newValue) continue;

            const existingEntity = existingMap.get(entityChange.entityId);

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

                // Create version before update if versioning is enabled
                if (createVersions && this.versioningService && existingEntity) {
                  try {
                    await this.versioningService.createVersion(existingEntity, {
                      timestamp: new Date().toISOString(),
                      changeReason: `Incremental update: ${entityChange.changedFields?.join(', ') || 'entity updated'}`,
                      author: 'incremental-updater'
                    });
                  } catch (error) {
                    logger.warn({ error, entityId: entityChange.entityId }, '[IncrementalUpdater] Failed to create version for entity');
                  }
                }

                entitiesToUpdate.push(resolution.resolved);
            } else {
                // Entity doesn't exist, treat as new
                entitiesToAdd.push(entityChange.newValue);
            }
        }

        if (entitiesToUpdate.length > 0) {
            const result = await this.kgService.addNodesBulk(entitiesToUpdate);
            metrics.entitiesUpdated += result.successful;
            if (result.errors.length > 0) {
                metrics.errors.push(...result.errors);
            }
        }

        if (entitiesToAdd.length > 0) {
            const result = await this.kgService.addNodesBulk(entitiesToAdd);
            metrics.entitiesAdded += result.successful;
            if (result.errors.length > 0) {
                metrics.errors.push(...result.errors);
            }
        }
      } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          metrics.errors.push(`Failed to process updated entities batch: ${errorMsg}`);
          logger.error({ error }, '[IncrementalUpdater] Error processing updated entities');
      }
    }

    // Process deleted entities
    if (changeSet.deletedEntities.length > 0) {
      try {
        const ids = changeSet.deletedEntities.map(e => e.entityId);
        const result = await this.kgService.deleteNodesBulk(ids, softDelete);
        metrics.entitiesDeleted += result.successful;
        if (result.errors.length > 0) {
            metrics.errors.push(...result.errors);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to delete batch of entities: ${errorMsg}`);
        logger.error({ error }, '[IncrementalUpdater] Error deleting batch of entities');
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
    _batchSize: number
  ): Promise<void> {
    // Process new relationships
    if (changeSet.newRelationships.length > 0) {
        const newRelationships = changeSet.newRelationships
            .filter(r => r.newValue)
            .map(r => ({
                sourceId: r.sourceId,
                targetId: r.targetId,
                type: r.newValue!.type as RelationType,
                metadata: r.newValue!.metadata
            }));

        if (newRelationships.length > 0) {
            try {
                const result = await this.kgService.addEdgesBulk(newRelationships);
                metrics.relationshipsAdded += result.successful;
                if (result.errors.length > 0) {
                    metrics.errors.push(...result.errors);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                metrics.errors.push(`Failed to add batch of relationships: ${errorMsg}`);
                logger.error({ error }, '[IncrementalUpdater] Error adding batch of relationships');
            }
        }
    }

    // Process updated relationships
    // Logic: fetching existing relationships for EACH updated relationship sourceId is still N reads.
    // Optimizing this requires getRelationshipsBulk which we didn't implement yet.
    // So we keep the read loop but optimize the write loop.
    const relationshipsToUpdate: Array<{ sourceId: string; targetId: string; type: RelationType; metadata?: Record<string, unknown> }> = [];

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

          relationshipsToUpdate.push({
              sourceId: relChange.sourceId,
              targetId: relChange.targetId,
              type: resolution.resolved.type as RelationType,
              metadata: resolution.resolved.metadata
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        metrics.errors.push(`Failed to process updated relationship ${relChange.sourceId}->${relChange.targetId}: ${errorMsg}`);
        logger.error({ error }, '[IncrementalUpdater] Error processing updated relationship');
      }
    }

    if (relationshipsToUpdate.length > 0) {
        try {
            const result = await this.kgService.addEdgesBulk(relationshipsToUpdate);
            metrics.relationshipsUpdated += result.successful;
            if (result.errors.length > 0) {
                metrics.errors.push(...result.errors);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            metrics.errors.push(`Failed to update batch of relationships: ${errorMsg}`);
            logger.error({ error }, '[IncrementalUpdater] Error updating batch of relationships');
        }
    }

    // Process deleted relationships
    if (changeSet.deletedRelationships.length > 0) {
        const relationshipsToDelete = changeSet.deletedRelationships.map(r => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            type: r.relationType as RelationType
        }));

        try {
            const result = await this.kgService.deleteRelationshipsBulk(relationshipsToDelete);
            metrics.relationshipsDeleted += result.successful;
            if (result.errors.length > 0) {
                metrics.errors.push(...result.errors);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            metrics.errors.push(`Failed to delete batch of relationships: ${errorMsg}`);
            logger.error({ error }, '[IncrementalUpdater] Error deleting batch of relationships');
        }
    }
  }

}
