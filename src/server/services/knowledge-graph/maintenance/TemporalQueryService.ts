/**
 * Temporal Query Service
 * 
 * Supports querying entities by effective dates, comparing versions, and finding entities active in date ranges.
 */

import { Driver } from 'neo4j-driver';
import { BaseEntity } from '../../../domain/ontology.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { EntityVersioningService, EntityVersion } from './EntityVersioningService.js';
import { TemporalValidator } from '../legal/TemporalValidator.js';
import { logger } from '../../../utils/logger.js';

export interface TemporalQueryOptions {
    effectiveDate?: string; // ISO date string
    expirationDate?: string; // ISO date string
    dateRange?: {
        start: string;
        end: string;
    };
}

export interface TemporalEntity extends BaseEntity {
    effectiveDate?: string;
    expirationDate?: string;
    versionNumber?: number;
}

export class TemporalQueryService {
    private driver: Driver;
    private versioningService: EntityVersioningService;
    private temporalValidator: TemporalValidator;
    private enabled: boolean = false;

    constructor(driver: Driver, versioningService: EntityVersioningService) {
        this.driver = driver;
        this.versioningService = versioningService;
        this.temporalValidator = new TemporalValidator(versioningService);
        this.enabled = FeatureFlag.isEnabled(KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED, false);
    }

    /**
     * Check if temporal queries are enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Query entities active on a specific date
     */
    async getEntitiesActiveOnDate(date: string): Promise<TemporalEntity[]> {
        if (!this.enabled) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }

        const session = this.driver.session();
        try {
            // Find entities where the date falls within effectiveDate and expirationDate range
            const result = await session.run(
                `
                MATCH (e:Entity)
                WHERE (
                    (e.effectiveDate IS NULL OR e.effectiveDate <= $date)
                    AND (e.expirationDate IS NULL OR e.expirationDate >= $date)
                )
                RETURN e
                ORDER BY e.name
                `,
                { date }
            );

            return result.records.map(record => {
                const e = record.get('e').properties;
                return this.mapToTemporalEntity(e);
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Query entity history (all versions)
     */
    async getEntityHistory(entityId: string): Promise<EntityVersion[]> {
        if (!this.enabled) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }

        return await this.versioningService.getEntityVersions(entityId);
    }

    /**
     * Query entities effective in a date range
     */
    async getEntitiesInDateRange(startDate: string, endDate: string): Promise<TemporalEntity[]> {
        if (!this.enabled) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }

        const session = this.driver.session();
        try {
            // Find entities that overlap with the date range
            const result = await session.run(
                `
                MATCH (e:Entity)
                WHERE (
                    (e.effectiveDate IS NULL OR e.effectiveDate <= $endDate)
                    AND (e.expirationDate IS NULL OR e.expirationDate >= $startDate)
                )
                RETURN e
                ORDER BY e.name
                `,
                { startDate, endDate }
            );

            return result.records.map(record => {
                const e = record.get('e').properties;
                return this.mapToTemporalEntity(e);
            });
        } finally {
            await session.close();
        }
    }

    /**
     * Get entity state at a specific date (using version history)
     */
    async getEntityStateAtDate(entityId: string, date: string): Promise<BaseEntity | null> {
        if (!this.enabled) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }

        const versions = await this.versioningService.getEntityVersions(entityId);
        
        // Find the version that was active at the given date
        // Use the most recent version before or on the date
        const activeVersion = versions
            .filter(v => v.timestamp <= date)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

        return activeVersion ? activeVersion.entity : null;
    }

    /**
     * Validate temporal consistency (no overlapping effective periods)
     */
    async validateTemporalConsistency(entityId: string): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
        conflicts: Array<{ entityId: string; version1?: number; version2?: number; reason: string }>;
    }> {
        if (!this.enabled) {
            return { isValid: true, errors: [], warnings: [], conflicts: [] };
        }

        return await this.temporalValidator.validateTemporalConsistency(entityId);
    }

    /**
     * Compare two versions of an entity
     */
    async compareVersions(
        entityId: string,
        version1: number,
        version2: number
    ): Promise<{
        version1: EntityVersion;
        version2: EntityVersion;
        differences: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    }> {
        if (!this.enabled) {
            throw new Error('Temporal queries are disabled. Enable KG_TEMPORAL_QUERIES_ENABLED feature flag.');
        }

        const v1 = await this.versioningService.getVersion(entityId, version1);
        const v2 = await this.versioningService.getVersion(entityId, version2);

        if (!v1 || !v2) {
            throw new Error(`One or both versions not found: v${version1}, v${version2}`);
        }

        const differences: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

        // Compare entity properties
        const compareObject = (obj1: Record<string, unknown>, obj2: Record<string, unknown>, prefix: string = '') => {
            const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
            
            for (const key of keys) {
                const val1 = obj1?.[key];
                const val2 = obj2?.[key];
                const fieldName = prefix ? `${prefix}.${key}` : key;

                if (val1 !== val2) {
                    if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
                        compareObject(val1 as Record<string, unknown>, val2 as Record<string, unknown>, fieldName);
                    } else {
                        differences.push({
                            field: fieldName,
                            oldValue: val1,
                            newValue: val2
                        });
                    }
                }
            }
        };

        compareObject(v1.entity as unknown as Record<string, unknown>, v2.entity as unknown as Record<string, unknown>);

        return {
            version1: v1,
            version2: v2,
            differences
        };
    }

    /**
     * Map Neo4j node properties to TemporalEntity
     */
    private mapToTemporalEntity(properties: Record<string, unknown>): TemporalEntity {
        return {
            id: properties.id as string,
            type: properties.type as TemporalEntity['type'],
            name: properties.name as string,
            description: properties.description as string | undefined,
            metadata: properties.metadata ? JSON.parse(properties.metadata as string) : undefined,
            uri: properties.uri as string | undefined,
            schemaType: properties.schemaType as string | undefined,
            effectiveDate: properties.effectiveDate as string | undefined,
            expirationDate: properties.expirationDate as string | undefined,
            versionNumber: properties.currentVersion as number | undefined
        };
    }
}

