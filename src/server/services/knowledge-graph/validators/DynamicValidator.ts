import { EventEmitter } from 'events';
import { BaseEntity, Relation } from '../../../domain/ontology.js';
import { EntitySchemaValidator, ValidationResult } from './EntitySchemaValidator.js';
import { RelationshipValidator, RelationshipValidationResult } from './RelationshipValidator.js';
import { DeduplicationService } from '../DeduplicationService.js';
import { ConsistencyChecker, ConsistencyViolation } from './ConsistencyChecker.js';
import { FactValidator, FactValidationResult } from './FactValidator.js';
import { logger } from '../../../utils/logger.js';

export interface ValidationEvent {
    type: 'entity-validation' | 'relationship-validation' | 'consistency-check' | 'fact-validation';
    timestamp: string;
    entityId?: string;
    relationshipId?: string;
    result?: ValidationResult | RelationshipValidationResult | FactValidationResult | { violations: ConsistencyViolation[] };
    errors?: string[];
    warnings?: string[];
}

/**
 * Provides dynamic, event-driven validation that runs continuously as the graph evolves.
 * Emits events for validation errors and warnings, enabling real-time monitoring.
 */
export class DynamicValidator extends EventEmitter {
    private entityValidator: EntitySchemaValidator;
    private relationshipValidator: RelationshipValidator;
    private factValidator: FactValidator;
    private consistencyChecker: ConsistencyChecker | null = null;
    private deduplicationService: DeduplicationService | null = null;

    constructor(
        entityValidator: EntitySchemaValidator,
        relationshipValidator: RelationshipValidator,
        factValidator: FactValidator,
        consistencyChecker?: ConsistencyChecker,
        deduplicationService?: DeduplicationService
    ) {
        super();
        this.entityValidator = entityValidator;
        this.relationshipValidator = relationshipValidator;
        this.factValidator = factValidator;
        this.consistencyChecker = consistencyChecker || null;
        this.deduplicationService = deduplicationService || null;
    }

    /**
     * Validate entity on creation/update
     * Emits events for validation results
     */
    async validateEntity(entity: BaseEntity): Promise<ValidationResult> {
        const result = this.entityValidator.validate(entity);

        // Emit validation event
        this.emit('validation', {
            type: 'entity-validation',
            timestamp: new Date().toISOString(),
            entityId: entity.id,
            result,
            errors: result.errors.map((e) => e.message),
            warnings: result.warnings.map((w) => w.message),
        } as ValidationEvent);

        if (!result.isValid) {
            this.emit('validation-error', {
                type: 'entity-validation',
                timestamp: new Date().toISOString(),
                entityId: entity.id,
                errors: result.errors.map((e) => e.message),
            } as ValidationEvent);
            throw new Error(`Entity validation failed: ${result.errors.map((e) => e.message).join(', ')}`);
        }

        if (result.warnings.length > 0) {
            this.emit('validation-warning', {
                type: 'entity-validation',
                timestamp: new Date().toISOString(),
                entityId: entity.id,
                warnings: result.warnings.map((w) => w.message),
            } as ValidationEvent);
        }

        // Check for duplicates if service is available
        if (this.deduplicationService) {
            try {
                const duplicates = await this.deduplicationService.findDuplicates(entity);
                if (duplicates.length > 0) {
                    this.emit('validation-warning', {
                        type: 'entity-validation',
                        timestamp: new Date().toISOString(),
                        entityId: entity.id,
                        warnings: [
                            `Potential duplicates found: ${duplicates.map((d) => `${d.entity.id} (${(d.similarity * 100).toFixed(1)}%)`).join(', ')}`,
                        ],
                    } as ValidationEvent);
                }
            } catch (error) {
                // Don't fail on deduplication check errors
                logger.warn({ error, entityId: entity.id }, 'Deduplication check failed');
            }
        }

        return result;
    }

    /**
     * Validate relationship on creation
     * Emits events for validation results
     */
    async validateRelationship(
        relation: Relation,
        sourceEntity: BaseEntity | null,
        targetEntity: BaseEntity | null
    ): Promise<RelationshipValidationResult> {
        const result = await this.relationshipValidator.validate(relation, sourceEntity, targetEntity);

        // Emit validation event
        this.emit('validation', {
            type: 'relationship-validation',
            timestamp: new Date().toISOString(),
            relationshipId: `${relation.sourceId}->${relation.targetId}:${relation.type}`,
            result,
            errors: result.errors,
            warnings: result.warnings,
        } as ValidationEvent);

        if (!result.isValid) {
            this.emit('validation-error', {
                type: 'relationship-validation',
                timestamp: new Date().toISOString(),
                relationshipId: `${relation.sourceId}->${relation.targetId}:${relation.type}`,
                errors: result.errors,
            } as ValidationEvent);
        }

        if (result.warnings.length > 0) {
            this.emit('validation-warning', {
                type: 'relationship-validation',
                timestamp: new Date().toISOString(),
                relationshipId: `${relation.sourceId}->${relation.targetId}:${relation.type}`,
                warnings: result.warnings,
            } as ValidationEvent);
        }

        return result;
    }

    /**
     * Validate fact (relationship) for plausibility
     */
    async validateFact(relation: Relation): Promise<void> {
        const result = await this.factValidator.validateFact(relation);

        this.emit('validation', {
            type: 'fact-validation',
            timestamp: new Date().toISOString(),
            relationshipId: `${relation.sourceId}->${relation.targetId}:${relation.type}`,
            result,
            warnings: result.issues,
        } as ValidationEvent);

        if (result.confidence < 0.7) {
            this.emit('validation-warning', {
                type: 'fact-validation',
                timestamp: new Date().toISOString(),
                relationshipId: `${relation.sourceId}->${relation.targetId}:${relation.type}`,
                warnings: [
                    `Low confidence fact (${(result.confidence * 100).toFixed(1)}%): ${result.issues.join(', ')}`,
                ],
            } as ValidationEvent);
        }
    }

    /**
     * Run consistency check and emit events for violations
     */
    async runConsistencyCheck(): Promise<void> {
        if (!this.consistencyChecker) {
            logger.warn('Consistency checker not available');
            return;
        }

        try {
            const violations = await this.consistencyChecker.checkConsistency();

            this.emit('validation', {
                type: 'consistency-check',
                timestamp: new Date().toISOString(),
                result: { violations },
            } as ValidationEvent);

            const errors = violations.filter((v) => v.severity === 'error');
            const warnings = violations.filter((v) => v.severity === 'warning');

            if (errors.length > 0) {
                this.emit('validation-error', {
                    type: 'consistency-check',
                    timestamp: new Date().toISOString(),
                    errors: errors.map((v) => v.description),
                } as ValidationEvent);
            }

            if (warnings.length > 0) {
                this.emit('validation-warning', {
                    type: 'consistency-check',
                    timestamp: new Date().toISOString(),
                    warnings: warnings.map((v) => v.description),
                } as ValidationEvent);
            }
        } catch (error) {
            logger.error({ error }, 'Consistency check failed');
            this.emit('validation-error', {
                type: 'consistency-check',
                timestamp: new Date().toISOString(),
                errors: [`Consistency check failed: ${error instanceof Error ? error.message : String(error)}`],
            } as ValidationEvent);
        }
    }

    /**
     * Periodic validation job
     * Can be scheduled to run at intervals
     */
    async runPeriodicValidation(): Promise<void> {
        logger.info('Running periodic validation');
        
        // Run consistency check
        await this.runConsistencyCheck();

        // Note: Fact validation would require access to all relationships
        // This can be done separately via PeriodicValidator

        logger.info('Periodic validation complete');
    }
}
