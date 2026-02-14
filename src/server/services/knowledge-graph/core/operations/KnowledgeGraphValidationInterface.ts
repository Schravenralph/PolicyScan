/**
 * Interface for Knowledge Graph Validation operations
 * Defines the contract for validation operations
 */

import type { BaseEntity, Relation } from '../../../../domain/ontology.js';
import type { ConsistencyViolation } from '../../validators/ConsistencyChecker.js';
import type { FactValidationResult } from '../../validators/FactValidator.js';
import type { ValidationTask } from '../../validators/HumanValidationService.js';
import type { MultiViewValidationResult } from '../../validators/MultiViewValidator.js';

/**
 * Dependencies required by Validation operations
 */
export interface KnowledgeGraphValidationDependencies {
  consistencyChecker: {
    checkConsistency: () => Promise<ConsistencyViolation[]>;
    getConsistencySummary: () => Promise<{
      totalViolations: number;
      errors: number;
      warnings: number;
      byType: Record<string, number>;
    }>;
  };
  factValidator: {
    validateFact: (relation: Relation) => Promise<FactValidationResult>;
    validateBatch: (relations: Relation[]) => Promise<FactValidationResult[]>;
  };
  humanValidationService: {
    getPendingTasks: (limit: number) => Promise<ValidationTask[]>;
    submitValidation: (taskId: string, action: 'approve' | 'reject' | 'modify', modifiedEntity?: BaseEntity, modifiedRelation?: Relation) => Promise<void>;
    createValidationTasks: (entities: BaseEntity[], relations: Relation[]) => Promise<ValidationTask[]>;
    getTaskStatistics: () => Promise<{
      total: number;
      pending: number;
      inProgress: number;
      approved: number;
      rejected: number;
      modified: number;
      byPriority: Record<string, number>;
    }>;
  };
  dynamicValidator: {
    runPeriodicValidation: () => Promise<void>;
  };
  multiViewValidator: {
    validateEntity: (entity: BaseEntity) => Promise<MultiViewValidationResult>;
    validateEntities: (entities: BaseEntity[]) => Promise<MultiViewValidationResult[]>;
  };
}

/**
 * Interface for Knowledge Graph Validation operations
 */
export interface KnowledgeGraphValidationOperations {
  /**
   * Check consistency of the knowledge graph
   */
  checkConsistency(): Promise<ConsistencyViolation[]>;

  /**
   * Get consistency summary statistics
   */
  getConsistencySummary(): Promise<{
    totalViolations: number;
    errors: number;
    warnings: number;
    byType: Record<string, number>;
  }>;

  /**
   * Validate a fact (relationship) for plausibility
   */
  validateFact(relation: Relation): Promise<FactValidationResult>;

  /**
   * Validate batch of facts
   */
  validateFacts(relations: Relation[]): Promise<FactValidationResult[]>;

  /**
   * Get human validation tasks
   */
  getValidationTasks(limit?: number): Promise<ValidationTask[]>;

  /**
   * Submit human validation result
   */
  submitValidation(
    taskId: string,
    action: 'approve' | 'reject' | 'modify',
    modifiedEntity?: BaseEntity,
    modifiedRelation?: Relation
  ): Promise<void>;

  /**
   * Create validation tasks for entities/relationships that need review
   */
  createValidationTasks(
    entities: BaseEntity[],
    relations: Relation[]
  ): Promise<ValidationTask[]>;

  /**
   * Get validation task statistics
   */
  getValidationTaskStatistics(): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    approved: number;
    rejected: number;
    modified: number;
    byPriority: Record<string, number>;
  }>;

  /**
   * Run periodic validation (consistency checks, fact validation)
   * Emits validation events automatically
   */
  runPeriodicValidation(): Promise<void>;

  /**
   * Validate entity from multiple perspectives (semantic, structural, temporal)
   */
  validateEntityMultiView(entity: BaseEntity): Promise<MultiViewValidationResult>;
}

