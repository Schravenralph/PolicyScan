/**
 * Knowledge Graph Validation Operations
 * Handles validation operations for the knowledge graph
 */

import type { BaseEntity, Relation } from '../../../../domain/ontology.js';
import type { ConsistencyViolation } from '../../validators/ConsistencyChecker.js';
import type { FactValidationResult } from '../../validators/FactValidator.js';
import type { ValidationTask } from '../../validators/HumanValidationService.js';
import type { MultiViewValidationResult } from '../../validators/MultiViewValidator.js';
import type { KnowledgeGraphValidationOperations, KnowledgeGraphValidationDependencies } from './KnowledgeGraphValidationInterface.js';

/**
 * Implementation of Knowledge Graph Validation operations
 */
export class KnowledgeGraphValidation implements KnowledgeGraphValidationOperations {
    constructor(private dependencies: KnowledgeGraphValidationDependencies) {}

    /**
     * Check consistency of the knowledge graph
     */
    async checkConsistency(): Promise<ConsistencyViolation[]> {
        return this.dependencies.consistencyChecker.checkConsistency();
    }

    /**
     * Get consistency summary statistics
     */
    async getConsistencySummary(): Promise<{
        totalViolations: number;
        errors: number;
        warnings: number;
        byType: Record<string, number>;
    }> {
        return this.dependencies.consistencyChecker.getConsistencySummary();
    }

    /**
     * Validate a fact (relationship) for plausibility
     */
    async validateFact(relation: Relation): Promise<FactValidationResult> {
        return this.dependencies.factValidator.validateFact(relation);
    }

    /**
     * Validate batch of facts
     */
    async validateFacts(relations: Relation[]): Promise<FactValidationResult[]> {
        return this.dependencies.factValidator.validateBatch(relations);
    }

    /**
     * Get human validation tasks
     */
    async getValidationTasks(limit: number = 100): Promise<ValidationTask[]> {
        return this.dependencies.humanValidationService.getPendingTasks(limit);
    }

    /**
     * Submit human validation result
     */
    async submitValidation(
        taskId: string,
        action: 'approve' | 'reject' | 'modify',
        modifiedEntity?: BaseEntity,
        modifiedRelation?: Relation
    ): Promise<void> {
        return this.dependencies.humanValidationService.submitValidation(taskId, action, modifiedEntity, modifiedRelation);
    }

    /**
     * Create validation tasks for entities/relationships that need review
     */
    async createValidationTasks(
        entities: BaseEntity[],
        relations: Relation[]
    ): Promise<ValidationTask[]> {
        return this.dependencies.humanValidationService.createValidationTasks(entities, relations);
    }

    /**
     * Get validation task statistics
     */
    async getValidationTaskStatistics(): Promise<{
        total: number;
        pending: number;
        inProgress: number;
        approved: number;
        rejected: number;
        modified: number;
        byPriority: Record<string, number>;
    }> {
        return this.dependencies.humanValidationService.getTaskStatistics();
    }

    /**
     * Run periodic validation (consistency checks, fact validation)
     * Emits validation events automatically
     */
    async runPeriodicValidation(): Promise<void> {
        return this.dependencies.dynamicValidator.runPeriodicValidation();
    }

    /**
     * Validate entity from multiple perspectives (semantic, structural, temporal)
     */
    async validateEntityMultiView(entity: BaseEntity): Promise<MultiViewValidationResult> {
        return this.dependencies.multiViewValidator.validateEntity(entity);
    }

    /**
     * Validate multiple entities from multiple perspectives
     */
    async validateEntitiesMultiView(entities: BaseEntity[]): Promise<MultiViewValidationResult[]> {
        return this.dependencies.multiViewValidator.validateEntities(entities);
    }
}

