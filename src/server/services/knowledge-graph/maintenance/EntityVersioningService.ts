/**
 * Entity Versioning Service
 * 
 * Tracks entity changes over time, stores version history, and supports version queries.
 * Versions are stored as separate Neo4j nodes with :VERSION_OF relationships.
 */

import { Driver } from 'neo4j-driver';
import { BaseEntity } from '../../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';

export interface EntityVersion {
    versionId: string;
    entityId: string;
    versionNumber: number;
    entity: BaseEntity;
    timestamp: string;
    changeReason?: string;
    author?: string;
    metadata?: Record<string, unknown>;
}

export interface VersionMetadata {
    timestamp: string;
    changeReason?: string;
    author?: string;
    metadata?: Record<string, unknown>;
}

export class EntityVersioningService {
    private driver: Driver;
    private enabled: boolean = false;

    constructor(driver: Driver) {
        this.driver = driver;
        this.enabled = FeatureFlag.isEnabled(KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED, false);
    }

    /**
     * Check if versioning is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Create a new version of an entity
     * Stores the version as a separate node with :VERSION_OF relationship
     */
    async createVersion(
        entity: BaseEntity,
        metadata?: VersionMetadata
    ): Promise<EntityVersion> {
        if (!this.enabled) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }

        const session = this.driver.session();
        try {
            // Get current version number
            const currentVersionResult = await session.run(
                `
                MATCH (e:Entity {id: $entityId})
                OPTIONAL MATCH (v:EntityVersion)-[:VERSION_OF]->(e)
                WITH e, COALESCE(MAX(v.versionNumber), 0) as maxVersion
                RETURN maxVersion, e.currentVersion as currentVersion
                `,
                { entityId: entity.id }
            );

            const maxVersion = currentVersionResult.records[0]?.get('maxVersion') || 0;
            const currentVersion = currentVersionResult.records[0]?.get('currentVersion') || 0;
            const newVersionNumber = Math.max(maxVersion, currentVersion) + 1;

            const versionId = `${entity.id}_v${newVersionNumber}`;
            const timestamp = metadata?.timestamp || new Date().toISOString();

            // Create version node
            const versionProperties = {
                versionId,
                entityId: entity.id,
                versionNumber: newVersionNumber,
                timestamp,
                changeReason: metadata?.changeReason || null,
                author: metadata?.author || null,
                entityData: JSON.stringify(entity),
                metadata: metadata?.metadata ? JSON.stringify(metadata.metadata) : null
            };

            await session.run(
                `
                MATCH (e:Entity {id: $entityId})
                CREATE (v:EntityVersion $versionProperties)
                CREATE (v)-[:VERSION_OF]->(e)
                SET e.currentVersion = $newVersionNumber
                SET e.updatedAt = $timestamp
                RETURN v
                `,
                {
                    entityId: entity.id,
                    versionProperties,
                    newVersionNumber,
                    timestamp
                }
            );

            const version: EntityVersion = {
                versionId,
                entityId: entity.id,
                versionNumber: newVersionNumber,
                entity,
                timestamp,
                changeReason: metadata?.changeReason,
                author: metadata?.author,
                metadata: metadata?.metadata
            };

            logger.info(`Created version ${newVersionNumber} for entity ${entity.id}`);
            return version;
        } finally {
            await session.close();
        }
    }

    /**
     * Create new versions for multiple entities in bulk
     */
    async createVersions(
        entitiesWithMetadata: Array<{ entity: BaseEntity, metadata?: VersionMetadata }>
    ): Promise<EntityVersion[]> {
        if (!this.enabled) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }

        if (entitiesWithMetadata.length === 0) {
            return [];
        }

        // Check for duplicate entity IDs - if found, fall back to sequential
        // createVersion calls to preserve all intermediate versions (UNWIND can't
        // reliably handle same-entity rows due to Cypher visibility rules for mutations)
        const seenEntityIds = new Set<string>();
        let hasDuplicates = false;
        for (const item of entitiesWithMetadata) {
            if (seenEntityIds.has(item.entity.id)) {
                hasDuplicates = true;
                break;
            }
            seenEntityIds.add(item.entity.id);
        }

        if (hasDuplicates) {
            const results: EntityVersion[] = [];
            for (const { entity, metadata } of entitiesWithMetadata) {
                const version = await this.createVersion(entity, metadata);
                results.push(version);
            }
            return results;
        }

        const session = this.driver.session();
        try {
            const inputs = entitiesWithMetadata.map(({ entity, metadata }) => ({
                entityId: entity.id,
                entityData: JSON.stringify(entity),
                timestamp: metadata?.timestamp || new Date().toISOString(),
                changeReason: metadata?.changeReason || null,
                author: metadata?.author || null,
                metadata: metadata?.metadata ? JSON.stringify(metadata.metadata) : null
            }));

            // Use UNWIND to process in bulk
            const result = await session.run(
                `
                UNWIND $inputs as input
                MATCH (e:Entity {id: input.entityId})

                // Get current version number - specific to each entity
                OPTIONAL MATCH (v:EntityVersion)-[:VERSION_OF]->(e)
                WITH e, input, COALESCE(MAX(v.versionNumber), 0) as maxVersion

                // Calculate new version number
                WITH e, input, CASE
                    WHEN maxVersion > COALESCE(e.currentVersion, 0) THEN maxVersion
                    ELSE COALESCE(e.currentVersion, 0)
                END + 1 as newVersionNumber

                // Create version node
                CREATE (newV:EntityVersion {
                    versionId: input.entityId + '_v' + toString(newVersionNumber),
                    entityId: input.entityId,
                    versionNumber: newVersionNumber,
                    timestamp: input.timestamp,
                    changeReason: input.changeReason,
                    author: input.author,
                    entityData: input.entityData,
                    metadata: input.metadata
                })

                // Link to entity
                CREATE (newV)-[:VERSION_OF]->(e)

                // Update entity properties
                SET e.currentVersion = newVersionNumber,
                    e.updatedAt = input.timestamp

                RETURN newV
                `,
                { inputs }
            );

            if (result.records.length < inputs.length) {
                const createdIds = new Set(result.records.map(r => r.get('newV').properties.entityId));
                const missingIds = inputs.filter(i => !createdIds.has(i.entityId)).map(i => i.entityId);
                logger.warn(
                    { missingIds, expected: inputs.length, actual: result.records.length },
                    '[EntityVersioningService] Some entities were not found during bulk version creation; their versions were skipped'
                );
            }

            return result.records.map(record => {
                const v = record.get('newV').properties;
                const versionNumber = v.versionNumber.toNumber ? v.versionNumber.toNumber() : v.versionNumber;
                return {
                    versionId: v.versionId,
                    entityId: v.entityId,
                    versionNumber: Number(versionNumber),
                    entity: JSON.parse(v.entityData),
                    timestamp: v.timestamp,
                    changeReason: v.changeReason,
                    author: v.author,
                    metadata: v.metadata ? JSON.parse(v.metadata) : undefined
                };
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Get all versions for an entity
     */
    async getEntityVersions(entityId: string): Promise<EntityVersion[]> {
        if (!this.enabled) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }

        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (v:EntityVersion)-[:VERSION_OF]->(e:Entity {id: $entityId})
                RETURN v
                ORDER BY v.versionNumber ASC
                `,
                { entityId }
            );

            return result.records.map(record => {
                const v = record.get('v').properties;
                return {
                    versionId: v.versionId,
                    entityId: v.entityId,
                    versionNumber: v.versionNumber,
                    entity: JSON.parse(v.entityData),
                    timestamp: v.timestamp,
                    changeReason: v.changeReason,
                    author: v.author,
                    metadata: v.metadata ? JSON.parse(v.metadata) : undefined
                };
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Get a specific version of an entity
     */
    async getVersion(entityId: string, versionNumber: number): Promise<EntityVersion | null> {
        if (!this.enabled) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }

        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (v:EntityVersion)-[:VERSION_OF]->(e:Entity {id: $entityId})
                WHERE v.versionNumber = $versionNumber
                RETURN v
                LIMIT 1
                `,
                { entityId, versionNumber }
            );

            if (result.records.length === 0) {
                return null;
            }

            const v = result.records[0].get('v').properties;
            return {
                versionId: v.versionId,
                entityId: v.entityId,
                versionNumber: v.versionNumber,
                entity: JSON.parse(v.entityData),
                timestamp: v.timestamp,
                changeReason: v.changeReason,
                author: v.author,
                metadata: v.metadata ? JSON.parse(v.metadata) : undefined
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Rollback entity to a specific version
     */
    async rollbackToVersion(entityId: string, versionNumber: number): Promise<BaseEntity> {
        if (!this.enabled) {
            throw new Error('Entity versioning is disabled. Enable KG_ENTITY_VERSIONING_ENABLED feature flag.');
        }

        const version = await this.getVersion(entityId, versionNumber);
        if (!version) {
            throw new Error(`Version ${versionNumber} not found for entity ${entityId}`);
        }

        const session = this.driver.session();
        try {
            // Update entity with version data
            const entityProperties = {
                id: version.entity.id,
                type: version.entity.type,
                name: version.entity.name,
                description: version.entity.description || null,
                uri: version.entity.uri || null,
                schemaType: version.entity.schemaType || null,
                metadata: version.entity.metadata ? JSON.stringify(version.entity.metadata) : null,
                updatedAt: new Date().toISOString()
            };

            await session.run(
                `
                MATCH (e:Entity {id: $entityId})
                SET e = $entityProperties
                SET e.currentVersion = $versionNumber
                `,
                {
                    entityId,
                    entityProperties,
                    versionNumber
                }
            );

            // Create a new version for the rollback
            await this.createVersion(version.entity, {
                timestamp: new Date().toISOString(),
                changeReason: `Rollback to version ${versionNumber}`,
                author: 'system'
            });

            logger.info(`Rolled back entity ${entityId} to version ${versionNumber}`);
            return version.entity;
        } finally {
            await session.close();
        }
    }

    /**
     * Get version count for an entity
     */
    async getVersionCount(entityId: string): Promise<number> {
        if (!this.enabled) {
            return 0;
        }

        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (v:EntityVersion)-[:VERSION_OF]->(e:Entity {id: $entityId})
                RETURN COUNT(v) as count
                `,
                { entityId }
            );

            return result.records[0]?.get('count') || 0;
        } finally {
            await session.close();
        }
    }
}

