import { BaseEntity } from '../../../domain/ontology.js';
import { ProvenanceTracker, EntityProvenance } from '../../knowledge-graph/fusion/ProvenanceTracker.js';

/**
 * Interface for conflict resolution (delegates to TruthDiscoveryService when available)
 */
export interface ConflictResolver {
    resolveConflict(
        property: string,
        values: Array<{ value: unknown; sourceId: string; sourceUrl?: string }>,
        entity: BaseEntity
    ): Promise<{ value: unknown; sourceId: string; reason: string }>;
}

/**
 * Fusion strategy for merging entities
 */
export type FusionStrategy = 'merge_all' | 'keep_primary' | 'keep_most_recent' | 'resolve_conflicts';

export interface FusionOptions {
    strategy?: FusionStrategy;
    conflictResolver?: ConflictResolver;
    preserveProvenance?: boolean;
    updateTimestamps?: boolean;
}

export interface FusionResult {
    fusedEntity: BaseEntity;
    mergedFrom: string[]; // IDs of entities that were merged
    provenance?: EntityProvenance;
    conflictsResolved: number;
    propertiesMerged: number;
    sourcesMerged: number;
}

/**
 * Service for merging facts from multiple sources into canonical knowledge graph entities.
 * Handles incremental updates, preserves provenance, and maintains version history.
 */
export class KnowledgeFusionService {
    private provenanceTracker: ProvenanceTracker;
    private conflictResolver?: ConflictResolver;

    constructor(conflictResolver?: ConflictResolver) {
        this.provenanceTracker = new ProvenanceTracker();
        this.conflictResolver = conflictResolver;
    }

    /**
     * Merge entities from multiple sources into a canonical entity
     */
    async fuseEntities(
        primaryEntity: BaseEntity,
        sourceEntities: BaseEntity[],
        options: FusionOptions = {}
    ): Promise<FusionResult> {
        const {
            strategy = 'merge_all',
            preserveProvenance = true,
            updateTimestamps = true,
        } = options;

        const fusedEntity: BaseEntity = { ...primaryEntity };
        const mergedFrom: string[] = [primaryEntity.id, ...sourceEntities.map(e => e.id)];
        let conflictsResolved = 0;
        let propertiesMerged = 0;

        // Track provenance for primary entity
        if (preserveProvenance) {
            this.provenanceTracker.trackEntity(
                primaryEntity.id,
                primaryEntity,
                this.extractSourceUrl(primaryEntity),
                this.extractTimestamp(primaryEntity)
            );
        }

        // Merge properties from source entities
        for (const sourceEntity of sourceEntities) {
            const sourceUrl = this.extractSourceUrl(sourceEntity);
            const timestamp = this.extractTimestamp(sourceEntity);

            // Track provenance
            if (preserveProvenance) {
                this.provenanceTracker.trackEntity(
                    primaryEntity.id,
                    sourceEntity,
                    sourceUrl,
                    timestamp
                );
            }

            // Merge based on strategy
            if (strategy === 'merge_all') {
                const result = this.mergeAllProperties(fusedEntity, sourceEntity, options);
                propertiesMerged += result.propertiesMerged;
                conflictsResolved += result.conflictsResolved;
            } else if (strategy === 'keep_primary') {
                // Keep primary entity as-is, just track provenance
            } else if (strategy === 'keep_most_recent') {
                const result = this.mergeMostRecent(fusedEntity, sourceEntity, timestamp || '');
                propertiesMerged += result.propertiesMerged;
            } else if (strategy === 'resolve_conflicts') {
                const result = await this.mergeWithConflictResolution(
                    fusedEntity,
                    sourceEntity,
                    options
                );
                propertiesMerged += result.propertiesMerged;
                conflictsResolved += result.conflictsResolved;
            }
        }

        // Update timestamps
        if (updateTimestamps) {
            fusedEntity.metadata = fusedEntity.metadata || {};
            fusedEntity.metadata.updatedAt = new Date().toISOString();
            if (!fusedEntity.metadata.createdAt) {
                fusedEntity.metadata.createdAt = this.extractTimestamp(primaryEntity) || new Date().toISOString();
            }
        }

        // Get provenance
        const provenance = preserveProvenance
            ? this.provenanceTracker.getProvenance(primaryEntity.id)
            : undefined;

        return {
            fusedEntity,
            mergedFrom,
            provenance,
            conflictsResolved,
            propertiesMerged,
            sourcesMerged: sourceEntities.length,
        };
    }

    /**
     * Merge all non-conflicting properties
     */
    private mergeAllProperties(
        target: BaseEntity,
        source: BaseEntity,
        options: FusionOptions
    ): { propertiesMerged: number; conflictsResolved: number } {
        let propertiesMerged = 0;
        let conflictsResolved = 0;

        // Merge simple properties
        for (const [key, value] of Object.entries(source)) {
            if (key === 'id' || key === 'type') continue;

            if (key === 'metadata' && value && typeof value === 'object') {
                // Merge metadata
                target.metadata = target.metadata || {};
                const sourceMetadata = value as Record<string, unknown>;
                for (const [metaKey, metaValue] of Object.entries(sourceMetadata)) {
                    if (!(metaKey in target.metadata)) {
                        target.metadata[metaKey] = metaValue;
                        propertiesMerged++;
                    } else if (target.metadata[metaKey] !== metaValue) {
                        // Conflict detected
                        conflictsResolved++;
                    }
                }
            } else if (value !== undefined && value !== null) {
                if (!(key in target) || target[key as keyof BaseEntity] === undefined) {
                    (target as any)[key] = value;
                    propertiesMerged++;
                } else if ((target as any)[key] !== value) {
                    // Conflict detected
                    conflictsResolved++;
                }
            }
        }

        return { propertiesMerged, conflictsResolved };
    }

    /**
     * Merge keeping most recent values
     */
    private mergeMostRecent(
        target: BaseEntity,
        source: BaseEntity,
        sourceTimestamp: string
    ): { propertiesMerged: number } {
        const targetTimestamp = this.extractTimestamp(target) || '';
        let propertiesMerged = 0;

        // If source is more recent, merge its properties
        if (sourceTimestamp > targetTimestamp) {
            for (const [key, value] of Object.entries(source)) {
                if (key === 'id' || key === 'type') continue;

                if (key === 'metadata' && value && typeof value === 'object') {
                    target.metadata = target.metadata || {};
                    const sourceMetadata = value as Record<string, unknown>;
                    for (const [metaKey, metaValue] of Object.entries(sourceMetadata)) {
                        target.metadata[metaKey] = metaValue;
                        propertiesMerged++;
                    }
                } else if (value !== undefined && value !== null) {
                    (target as any)[key] = value;
                    propertiesMerged++;
                }
            }
        }

        return { propertiesMerged };
    }

    /**
     * Merge with conflict resolution using TruthDiscoveryService
     */
    private async mergeWithConflictResolution(
        target: BaseEntity,
        source: BaseEntity,
        options: FusionOptions
    ): Promise<{ propertiesMerged: number; conflictsResolved: number }> {
        let propertiesMerged = 0;
        let conflictsResolved = 0;

        if (!options.conflictResolver) {
            // Fallback to merge_all if no conflict resolver
            return this.mergeAllProperties(target, source, options);
        }

        // Identify conflicts and resolve them
        for (const [key, sourceValue] of Object.entries(source)) {
            if (key === 'id' || key === 'type') continue;

            const targetValue = (target as any)[key];

            if (key === 'metadata' && sourceValue && typeof sourceValue === 'object') {
                target.metadata = target.metadata || {};
                const sourceMetadata = sourceValue as Record<string, unknown>;
                for (const [metaKey, metaValue] of Object.entries(sourceMetadata)) {
                    const targetMetaValue = target.metadata[metaKey];
                    if (targetMetaValue === undefined) {
                        target.metadata[metaKey] = metaValue;
                        propertiesMerged++;
                    } else if (targetMetaValue !== metaValue) {
                        // Conflict - resolve it
                        try {
                            const resolved = await options.conflictResolver!.resolveConflict(
                                `metadata.${metaKey}`,
                                [
                                    { value: targetMetaValue, sourceId: target.id },
                                    { value: metaValue, sourceId: source.id, sourceUrl: this.extractSourceUrl(source) },
                                ],
                                target
                            );
                            target.metadata[metaKey] = resolved.value;
                            conflictsResolved++;
                            propertiesMerged++;
                        } catch (error) {
                            console.warn(`[KnowledgeFusionService] Failed to resolve conflict for metadata.${metaKey}:`, error);
                            // Keep target value on error
                        }
                    }
                }
            } else if (sourceValue !== undefined && sourceValue !== null) {
                if (targetValue === undefined || targetValue === null) {
                    (target as any)[key] = sourceValue;
                    propertiesMerged++;
                } else if (targetValue !== sourceValue) {
                    // Conflict - resolve it
                    try {
                        const resolved = await options.conflictResolver!.resolveConflict(
                            key,
                            [
                                { value: targetValue, sourceId: target.id },
                                { value: sourceValue, sourceId: source.id, sourceUrl: this.extractSourceUrl(source) },
                            ],
                            target
                        );
                        (target as any)[key] = resolved.value;
                        conflictsResolved++;
                        propertiesMerged++;
                    } catch (error) {
                        console.warn(`[KnowledgeFusionService] Failed to resolve conflict for ${key}:`, error);
                        // Keep target value on error
                    }
                }
            }
        }

        return { propertiesMerged, conflictsResolved };
    }

    /**
     * Incremental update: Add new facts to existing entity
     */
    async incrementalUpdate(
        existingEntity: BaseEntity,
        newFacts: Partial<BaseEntity>,
        sourceUrl?: string
    ): Promise<FusionResult> {
        // Create a temporary entity with new facts
        const newEntity: BaseEntity = {
            ...existingEntity,
            ...newFacts,
            id: existingEntity.id, // Preserve ID
            type: existingEntity.type, // Preserve type
        };

        // Fuse with existing entity
        return this.fuseEntities(
            existingEntity,
            [newEntity],
            {
                strategy: 'merge_all',
                preserveProvenance: true,
                updateTimestamps: true,
            }
        );
    }

    /**
     * Get provenance tracker
     */
    getProvenanceTracker(): ProvenanceTracker {
        return this.provenanceTracker;
    }

    /**
     * Extract source URL from entity metadata
     */
    private extractSourceUrl(entity: BaseEntity): string | undefined {
        if (entity.metadata?.sourceUrl) return entity.metadata.sourceUrl as string;
        if (entity.metadata?.url) return entity.metadata.url as string;
        if ((entity as any).url) return (entity as any).url;
        return undefined;
    }

    /**
     * Extract timestamp from entity metadata
     */
    private extractTimestamp(entity: BaseEntity): string | undefined {
        if (entity.metadata?.createdAt) return entity.metadata.createdAt as string;
        if (entity.metadata?.updatedAt) return entity.metadata.updatedAt as string;
        if (entity.metadata?.date) return entity.metadata.date as string;
        if ((entity as any).date) return (entity as any).date;
        return undefined;
    }
}

