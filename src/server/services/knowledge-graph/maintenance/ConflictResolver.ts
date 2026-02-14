import { BaseEntity, Relation } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

/**
 * Conflict resolution strategies
 */
export enum ConflictResolutionStrategy {
  LAST_WRITE_WINS = 'last_write_wins',
  MANUAL_REVIEW = 'manual_review',
  MERGE = 'merge',
  REJECT = 'reject'
}

/**
 * Conflict resolution result
 */
export interface ConflictResolutionResult<T> {
  resolved: T;
  strategy: ConflictResolutionStrategy;
  conflictDetected: boolean;
  requiresManualReview: boolean;
  reason?: string;
}

/**
 * Service for resolving conflicts during incremental updates
 */
export class ConflictResolver {
  private defaultStrategy: ConflictResolutionStrategy;

  constructor(defaultStrategy: ConflictResolutionStrategy = ConflictResolutionStrategy.LAST_WRITE_WINS) {
    this.defaultStrategy = defaultStrategy;
  }

  /**
   * Resolve entity conflicts
   */
  resolveEntityConflict(
    existingEntity: BaseEntity,
    newEntity: BaseEntity,
    strategy?: ConflictResolutionStrategy
  ): ConflictResolutionResult<BaseEntity> {
    const resolutionStrategy = strategy || this.defaultStrategy;
    
    // Detect conflict by comparing entity content
    const conflictDetected = this.detectEntityConflict(existingEntity, newEntity);
    
    if (!conflictDetected) {
      // No conflict, merge non-conflicting changes
      return {
        resolved: this.mergeEntityChanges(existingEntity, newEntity),
        strategy: ConflictResolutionStrategy.MERGE,
        conflictDetected: false,
        requiresManualReview: false
      };
    }

    switch (resolutionStrategy) {
      case ConflictResolutionStrategy.LAST_WRITE_WINS:
        return {
          resolved: newEntity,
          strategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Last write wins - new entity takes precedence'
        };

      case ConflictResolutionStrategy.MANUAL_REVIEW:
        return {
          resolved: existingEntity, // Keep existing until manual review
          strategy: ConflictResolutionStrategy.MANUAL_REVIEW,
          conflictDetected: true,
          requiresManualReview: true,
          reason: 'Conflicts require manual review'
        };

      case ConflictResolutionStrategy.MERGE:
        return {
          resolved: this.mergeEntityChanges(existingEntity, newEntity),
          strategy: ConflictResolutionStrategy.MERGE,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Non-conflicting fields merged, conflicting fields from new entity'
        };

      case ConflictResolutionStrategy.REJECT:
        return {
          resolved: existingEntity, // Keep existing
          strategy: ConflictResolutionStrategy.REJECT,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Conflicting update rejected'
        };

      default:
        logger.warn(`Unknown conflict resolution strategy: ${resolutionStrategy}, using LAST_WRITE_WINS`);
        return {
          resolved: newEntity,
          strategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Unknown strategy, defaulting to last write wins'
        };
    }
  }

  /**
   * Resolve relationship conflicts
   */
  resolveRelationshipConflict(
    existingRelationship: Relation | null,
    newRelationship: Relation,
    strategy?: ConflictResolutionStrategy
  ): ConflictResolutionResult<Relation> {
    const resolutionStrategy = strategy || this.defaultStrategy;

    // If no existing relationship, no conflict
    if (!existingRelationship) {
      return {
        resolved: newRelationship,
        strategy: ConflictResolutionStrategy.MERGE,
        conflictDetected: false,
        requiresManualReview: false
      };
    }

    // Detect conflict by comparing relationship properties
    const conflictDetected = this.detectRelationshipConflict(existingRelationship, newRelationship);

    if (!conflictDetected) {
      // No conflict, merge non-conflicting changes
      return {
        resolved: this.mergeRelationshipChanges(existingRelationship, newRelationship),
        strategy: ConflictResolutionStrategy.MERGE,
        conflictDetected: false,
        requiresManualReview: false
      };
    }

    switch (resolutionStrategy) {
      case ConflictResolutionStrategy.LAST_WRITE_WINS:
        return {
          resolved: newRelationship,
          strategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Last write wins - new relationship takes precedence'
        };

      case ConflictResolutionStrategy.MANUAL_REVIEW:
        return {
          resolved: existingRelationship, // Keep existing until manual review
          strategy: ConflictResolutionStrategy.MANUAL_REVIEW,
          conflictDetected: true,
          requiresManualReview: true,
          reason: 'Conflicts require manual review'
        };

      case ConflictResolutionStrategy.MERGE:
        return {
          resolved: this.mergeRelationshipChanges(existingRelationship, newRelationship),
          strategy: ConflictResolutionStrategy.MERGE,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Non-conflicting fields merged, conflicting fields from new relationship'
        };

      case ConflictResolutionStrategy.REJECT:
        return {
          resolved: existingRelationship, // Keep existing
          strategy: ConflictResolutionStrategy.REJECT,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Conflicting update rejected'
        };

      default:
        logger.warn(`Unknown conflict resolution strategy: ${resolutionStrategy}, using LAST_WRITE_WINS`);
        return {
          resolved: newRelationship,
          strategy: ConflictResolutionStrategy.LAST_WRITE_WINS,
          conflictDetected: true,
          requiresManualReview: false,
          reason: 'Unknown strategy, defaulting to last write wins'
        };
    }
  }

  /**
   * Detect if there's a conflict between two entities
   */
  private detectEntityConflict(entity1: BaseEntity, entity2: BaseEntity): boolean {
    // Conflict if core fields differ
    if (entity1.name !== entity2.name) return true;
    if (entity1.description !== entity2.description) return true;
    
    // Compare metadata
    const metadata1 = JSON.stringify(entity1.metadata || {});
    const metadata2 = JSON.stringify(entity2.metadata || {});
    if (metadata1 !== metadata2) return true;

    return false;
  }

  /**
   * Detect if there's a conflict between two relationships
   */
  private detectRelationshipConflict(rel1: Relation, rel2: Relation): boolean {
    // Conflict if type differs
    if (rel1.type !== rel2.type) return true;

    // Compare metadata
    const metadata1 = JSON.stringify(rel1.metadata || {});
    const metadata2 = JSON.stringify(rel2.metadata || {});
    if (metadata1 !== metadata2) return true;

    return false;
  }

  /**
   * Merge non-conflicting changes between two entities
   */
  private mergeEntityChanges(existing: BaseEntity, incoming: BaseEntity): BaseEntity {
    return {
      ...existing,
      ...incoming,
      // Prefer incoming values for conflicting fields
      name: incoming.name || existing.name,
      description: incoming.description !== undefined ? incoming.description : existing.description,
      metadata: {
        ...existing.metadata,
        ...incoming.metadata
      }
    };
  }

  /**
   * Merge non-conflicting changes between two relationships
   */
  private mergeRelationshipChanges(existing: Relation, incoming: Relation): Relation {
    return {
      ...existing,
      ...incoming,
      metadata: {
        ...existing.metadata,
        ...incoming.metadata
      }
    };
  }
}

