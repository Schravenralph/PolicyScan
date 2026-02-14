/**
 * Relationship Semantic Validator
 * 
 * Provides domain-specific semantic validation for relationships:
 * - Jurisdiction matching
 * - Temporal validation
 * - Hierarchy validation
 * - Spatial validation
 */

import type {
  BaseEntity,
  Relation,
  RelationType,
  PolicyDocument,
  Regulation,
  SpatialUnit,
  LandUse,
  Requirement,
  HierarchyLevel,
} from '../../../domain/ontology.js';
import { RelationType as RelationTypeEnum } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

export interface SemanticValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    jurisdictionMatch?: boolean;
    temporalValid?: boolean;
    hierarchyValid?: boolean;
    spatialValid?: boolean;
  };
}

/**
 * Hierarchy level ordering (higher number = higher level)
 */
const HIERARCHY_LEVEL_ORDER: Record<HierarchyLevel, number> = {
  municipality: 1,
  province: 2,
  national: 3,
  european: 4,
};

export class RelationshipSemanticValidator {
  /**
   * Validate relationship semantically based on domain rules
   */
  async validate(
    relation: Relation,
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity
  ): Promise<SemanticValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: SemanticValidationResult['details'] = {};

    // Jurisdiction matching
    const jurisdictionResult = this.validateJurisdiction(sourceEntity, targetEntity, relation.type);
    if (!jurisdictionResult.isValid) {
      if (jurisdictionResult.isRequired) {
        errors.push(...jurisdictionResult.errors);
      } else {
        warnings.push(...jurisdictionResult.errors);
      }
    }
    details.jurisdictionMatch = jurisdictionResult.isValid;

    // Temporal validation
    const temporalResult = this.validateTemporal(sourceEntity, targetEntity, relation.type);
    if (!temporalResult.isValid) {
      if (temporalResult.isRequired) {
        errors.push(...temporalResult.errors);
      } else {
        warnings.push(...temporalResult.errors);
      }
    }
    details.temporalValid = temporalResult.isValid;

    // Hierarchy validation (for PolicyDocument relationships)
    if (relation.type === RelationTypeEnum.OVERRIDES || relation.type === RelationTypeEnum.REFINES) {
      const hierarchyResult = this.validateHierarchy(
        sourceEntity as PolicyDocument,
        targetEntity as PolicyDocument,
        relation.type
      );
      if (!hierarchyResult.isValid) {
        errors.push(...hierarchyResult.errors);
      }
      details.hierarchyValid = hierarchyResult.isValid;
    }

    // Spatial validation (for LOCATED_IN)
    if (relation.type === RelationTypeEnum.LOCATED_IN) {
      const spatialResult = this.validateSpatial(
        sourceEntity as SpatialUnit,
        targetEntity as SpatialUnit
      );
      if (!spatialResult.isValid) {
        if (spatialResult.isRequired) {
          errors.push(...spatialResult.errors);
        } else {
          warnings.push(...spatialResult.errors);
        }
      }
      details.spatialValid = spatialResult.isValid;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }

  /**
   * Validate jurisdiction matching
   */
  private validateJurisdiction(
    source: BaseEntity,
    target: BaseEntity,
    relationType: RelationType
  ): { isValid: boolean; isRequired: boolean; errors: string[] } {
    const errors: string[] = [];
    const sourceJurisdiction = this.extractJurisdiction(source);
    const targetJurisdiction = this.extractJurisdiction(target);

    // Some relationship types require jurisdiction matching
    const requiresJurisdiction = [
      RelationTypeEnum.APPLIES_TO,
      RelationTypeEnum.CONSTRAINS,
      RelationTypeEnum.DEFINED_IN,
    ].includes(relationType);

    if (requiresJurisdiction && (!sourceJurisdiction || !targetJurisdiction)) {
      if (requiresJurisdiction) {
        errors.push('Jurisdiction information missing for one or both entities');
      }
      return { isValid: false, isRequired: requiresJurisdiction, errors };
    }

    if (sourceJurisdiction && targetJurisdiction) {
      if (!this.jurisdictionsMatch(sourceJurisdiction, targetJurisdiction)) {
        errors.push(
          `Jurisdiction mismatch: ${sourceJurisdiction} vs ${targetJurisdiction}`
        );
        return { isValid: false, isRequired: requiresJurisdiction, errors };
      }
    }

    return { isValid: true, isRequired: requiresJurisdiction, errors: [] };
  }

  /**
   * Validate temporal constraints
   */
  private validateTemporal(
    source: BaseEntity,
    target: BaseEntity,
    relationType: RelationType
  ): { isValid: boolean; isRequired: boolean; errors: string[] } {
    const errors: string[] = [];
    const isRequired = [
      RelationTypeEnum.OVERRIDES,
      RelationTypeEnum.REFINES,
      RelationTypeEnum.DEFINED_IN,
    ].includes(relationType);

    // OVERRIDES: Source date must be later than target date
    if (relationType === RelationTypeEnum.OVERRIDES) {
      const sourceDate = this.getDate(source);
      const targetDate = this.getDate(target);

      if (sourceDate && targetDate) {
        if (sourceDate <= targetDate) {
          errors.push(
            `OVERRIDES requires source date (${sourceDate.toISOString()}) to be later than target (${targetDate.toISOString()})`
          );
        }
      } else {
        errors.push('Date information missing for temporal validation');
      }
    }

    // REFINES: Source date should be later than target date
    if (relationType === RelationTypeEnum.REFINES) {
      const sourceDate = this.getDate(source);
      const targetDate = this.getDate(target);

      if (sourceDate && targetDate) {
        if (sourceDate <= targetDate) {
          errors.push(
            `REFINES typically requires source date (${sourceDate.toISOString()}) to be later than target (${targetDate.toISOString()})`
          );
        }
      }
    }

    // DEFINED_IN: Regulation/Requirement effective date should align with document date
    if (relationType === RelationTypeEnum.DEFINED_IN) {
      const sourceEffectiveDate = source.effectiveDate ? new Date(source.effectiveDate) : null;
      const targetDate = this.getDate(target);

      if (sourceEffectiveDate && targetDate) {
        if (sourceEffectiveDate < targetDate) {
          errors.push(
            `DEFINED_IN: Effective date (${sourceEffectiveDate.toISOString()}) should not be before document date (${targetDate.toISOString()})`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      isRequired,
      errors,
    };
  }

  /**
   * Validate hierarchy constraints for PolicyDocument relationships
   */
  private validateHierarchy(
    source: PolicyDocument,
    target: PolicyDocument,
    relationType: RelationType
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    const sourceLevel = source.hierarchy?.level;
    const targetLevel = target.hierarchy?.level;

    if (!sourceLevel || !targetLevel) {
      errors.push('Hierarchy level information missing for one or both documents');
      return { isValid: false, errors };
    }

    const sourceLevelOrder = HIERARCHY_LEVEL_ORDER[sourceLevel];
    const targetLevelOrder = HIERARCHY_LEVEL_ORDER[targetLevel];

    // OVERRIDES: Source hierarchy level must be higher than target
    if (relationType === RelationTypeEnum.OVERRIDES) {
      if (sourceLevelOrder <= targetLevelOrder) {
        errors.push(
          `OVERRIDES requires source hierarchy level (${sourceLevel}) to be higher than target (${targetLevel})`
        );
      }
    }

    // REFINES: Source hierarchy level should be lower than or equal to target
    if (relationType === RelationTypeEnum.REFINES) {
      if (sourceLevelOrder > targetLevelOrder) {
        errors.push(
          `REFINES typically requires source hierarchy level (${sourceLevel}) to be lower than or equal to target (${targetLevel})`
        );
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate spatial constraints for LOCATED_IN
   */
  private validateSpatial(
    source: SpatialUnit,
    target: SpatialUnit
  ): { isValid: boolean; isRequired: boolean; errors: string[] } {
    const errors: string[] = [];

    // If geometry is available, should check containment
    if (source.geometry && target.geometry) {
      // In a real implementation, would use a geometry library
      // For now, we'll use name-based heuristics as a fallback
      const nameCheck = this.checkNameContainment(source.name, target.name);
      if (!nameCheck.isContained) {
        errors.push(
          `Spatial containment not verified: "${source.name}" may not be located in "${target.name}"`
        );
      }
    } else {
      // Without geometry, use name-based heuristics
      const nameCheck = this.checkNameContainment(source.name, target.name);
      if (!nameCheck.isContained) {
        errors.push(
          `Spatial containment not verified (no geometry available): "${source.name}" may not be located in "${target.name}"`
        );
      }
    }

    return { isValid: errors.length === 0, isRequired: false, errors };
  }

  /**
   * Extract jurisdiction from entity
   */
  private extractJurisdiction(entity: BaseEntity): string | null {
    if (entity.type === 'PolicyDocument') {
      return (entity as PolicyDocument).jurisdiction || null;
    }
    return (entity.metadata?.jurisdiction as string) || null;
  }

  /**
   * Check if two jurisdictions match or are compatible
   */
  private jurisdictionsMatch(jurisdiction1: string, jurisdiction2: string): boolean {
    const j1 = jurisdiction1.toLowerCase().trim();
    const j2 = jurisdiction2.toLowerCase().trim();

    // Exact match
    if (j1 === j2) {
      return true;
    }

    // Check if one contains the other
    if (j1.includes(j2) || j2.includes(j1)) {
      return true;
    }

    // Check for common patterns
    const normalize = (j: string) => j.replace(/^(gemeente|provincie|rijksoverheid)\s+/i, '').trim();
    const n1 = normalize(j1);
    const n2 = normalize(j2);

    return n1 === n2;
  }

  /**
   * Get date from entity (prefer effectiveDate, then date, then createdAt)
   */
  private getDate(entity: BaseEntity): Date | null {
    if (entity.type === 'PolicyDocument') {
      const doc = entity as PolicyDocument;
      if (doc.date) {
        return new Date(doc.date);
      }
    }

    if (entity.effectiveDate) {
      return new Date(entity.effectiveDate);
    }

    if (entity.createdAt) {
      return new Date(entity.createdAt);
    }

    return null;
  }

  /**
   * Check if source name suggests containment in target name
   */
  private checkNameContainment(sourceName: string, targetName: string): { isContained: boolean; method: string } {
    const sourceLower = sourceName.toLowerCase();
    const targetLower = targetName.toLowerCase();

    // Check if source name contains target name
    if (sourceLower.includes(targetLower) && sourceLower !== targetLower) {
      return { isContained: true, method: 'name_contains' };
    }

    // Check if target name contains source name
    if (targetLower.includes(sourceLower) && sourceLower !== targetLower) {
      return { isContained: true, method: 'name_contained_in' };
    }

    return { isContained: false, method: 'name' };
  }
}
