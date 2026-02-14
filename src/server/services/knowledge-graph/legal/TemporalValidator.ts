/**
 * Temporal Validator
 * 
 * Validates temporal consistency for entities with effective dates and expiration dates.
 * Checks for overlapping effective periods, invalid date ranges, and temporal conflicts.
 */

import { BaseEntity } from '../../../domain/ontology.js';
import { EntityVersioningService, EntityVersion } from '../maintenance/EntityVersioningService.js';
import { logger } from '../../../utils/logger.js';

export interface TemporalValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    conflicts: Array<{
        entityId: string;
        version1?: number;
        version2?: number;
        reason: string;
    }>;
}

export interface TemporalEntity extends BaseEntity {
    effectiveDate?: string;
    expirationDate?: string;
}

export class TemporalValidator {
    private versioningService: EntityVersioningService;

    constructor(versioningService: EntityVersioningService) {
        this.versioningService = versioningService;
    }

    /**
     * Validate date range (effectiveDate <= expirationDate)
     */
    validateDateRange(entity: TemporalEntity): { isValid: boolean; error?: string } {
        if (!entity.effectiveDate) {
            return { isValid: true }; // effectiveDate is optional
        }

        if (entity.expirationDate) {
            const effective = new Date(entity.effectiveDate);
            const expiration = new Date(entity.expirationDate);

            if (isNaN(effective.getTime())) {
                return { isValid: false, error: `Invalid effectiveDate format: ${entity.effectiveDate}` };
            }

            if (isNaN(expiration.getTime())) {
                return { isValid: false, error: `Invalid expirationDate format: ${entity.expirationDate}` };
            }

            if (effective > expiration) {
                return {
                    isValid: false,
                    error: `effectiveDate (${entity.effectiveDate}) must be <= expirationDate (${entity.expirationDate})`
                };
            }
        }

        return { isValid: true };
    }

    /**
     * Check for overlapping effective periods between two entities
     */
    checkOverlappingPeriods(
        entity1: TemporalEntity,
        entity2: TemporalEntity
    ): { hasOverlap: boolean; reason?: string } {
        const e1Start = entity1.effectiveDate ? new Date(entity1.effectiveDate) : null;
        const e1End = entity1.expirationDate ? new Date(entity1.expirationDate) : null;
        const e2Start = entity2.effectiveDate ? new Date(entity2.effectiveDate) : null;
        const e2End = entity2.expirationDate ? new Date(entity2.expirationDate) : null;

        // If either entity has no effective date, no overlap check needed
        if (!e1Start && !e2Start) {
            return { hasOverlap: false };
        }

        // If one entity has no effective date, it's always active (overlaps with everything)
        if (!e1Start || !e2Start) {
            return { hasOverlap: true, reason: 'One entity has no effective date (always active)' };
        }

        // Check for overlap: periods overlap if start1 <= end2 && start2 <= end1
        const hasOverlap = e1Start <= (e2End || new Date('9999-12-31')) && e2Start <= (e1End || new Date('9999-12-31'));

        if (hasOverlap) {
            return {
                hasOverlap: true,
                reason: `Periods overlap: [${entity1.effectiveDate} - ${entity1.expirationDate || '∞'}] overlaps with [${entity2.effectiveDate} - ${entity2.expirationDate || '∞'}]`
            };
        }

        return { hasOverlap: false };
    }

    /**
     * Validate temporal consistency for an entity (check all versions)
     */
    async validateTemporalConsistency(entityId: string): Promise<TemporalValidationResult> {
        const result: TemporalValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            conflicts: []
        };

        try {
            const versions = await this.versioningService.getEntityVersions(entityId);

            if (versions.length === 0) {
                return result; // No versions to validate
            }

            // Validate each version's date range
            for (const version of versions) {
                const entity = version.entity as TemporalEntity;
                const dateRangeValidation = this.validateDateRange(entity);

                if (!dateRangeValidation.isValid) {
                    result.isValid = false;
                    result.errors.push(
                        `Version ${version.versionNumber}: ${dateRangeValidation.error}`
                    );
                    result.conflicts.push({
                        entityId,
                        version1: version.versionNumber,
                        reason: dateRangeValidation.error || 'Invalid date range'
                    });
                }
            }

            // Check for overlapping effective periods between versions
            for (let i = 0; i < versions.length; i++) {
                for (let j = i + 1; j < versions.length; j++) {
                    const v1 = versions[i];
                    const v2 = versions[j];
                    const e1 = v1.entity as TemporalEntity;
                    const e2 = v2.entity as TemporalEntity;

                    const overlapCheck = this.checkOverlappingPeriods(e1, e2);

                    if (overlapCheck.hasOverlap) {
                        result.isValid = false;
                        result.errors.push(
                            `Versions ${v1.versionNumber} and ${v2.versionNumber}: ${overlapCheck.reason}`
                        );
                        result.conflicts.push({
                            entityId,
                            version1: v1.versionNumber,
                            version2: v2.versionNumber,
                            reason: overlapCheck.reason || 'Overlapping effective periods'
                        });
                    }
                }
            }

            // Warn if entity has no effective date
            const currentVersion = versions[versions.length - 1];
            const currentEntity = currentVersion.entity as TemporalEntity;
            if (!currentEntity.effectiveDate) {
                result.warnings.push('Entity has no effective date (always active)');
            }

        } catch (error) {
            result.isValid = false;
            result.errors.push(`Failed to validate temporal consistency: ${error instanceof Error ? error.message : String(error)}`);
            logger.error({ error, entityId }, 'Failed to validate temporal consistency for entity');
        }

        return result;
    }

    /**
     * Validate a single entity's temporal fields
     */
    validateEntity(entity: TemporalEntity): TemporalValidationResult {
        const result: TemporalValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            conflicts: []
        };

        const dateRangeValidation = this.validateDateRange(entity);
        if (!dateRangeValidation.isValid) {
            result.isValid = false;
            result.errors.push(dateRangeValidation.error || 'Invalid date range');
            result.conflicts.push({
                entityId: entity.id,
                reason: dateRangeValidation.error || 'Invalid date range'
            });
        }

        if (!entity.effectiveDate) {
            result.warnings.push('Entity has no effective date (always active)');
        }

        return result;
    }

    /**
     * Detect temporal conflicts between multiple entities
     */
    detectTemporalConflicts(entities: TemporalEntity[]): TemporalValidationResult {
        const result: TemporalValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            conflicts: []
        };

        // Validate each entity
        for (const entity of entities) {
            const validation = this.validateEntity(entity);
            if (!validation.isValid) {
                result.isValid = false;
                result.errors.push(...validation.errors);
                result.conflicts.push(...validation.conflicts);
            }
            result.warnings.push(...validation.warnings);
        }

        // Check for overlaps between entities
        for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
                const overlapCheck = this.checkOverlappingPeriods(entities[i], entities[j]);

                if (overlapCheck.hasOverlap) {
                    // Overlap is not necessarily an error (entities can coexist)
                    // But we'll warn about it
                    result.warnings.push(
                        `Entities ${entities[i].id} and ${entities[j].id}: ${overlapCheck.reason}`
                    );
                }
            }
        }

        return result;
    }
}


