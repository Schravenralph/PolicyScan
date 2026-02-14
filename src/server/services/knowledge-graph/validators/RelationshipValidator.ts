import {
    BaseEntity,
    Relation,
    RelationType,
    EntityType,
    PolicyDocument,
    Regulation,
    SpatialUnit,
    Requirement,
} from '../../../domain/ontology.js';
import { RelationshipSemanticValidator } from './RelationshipSemanticValidator.js';

export interface RelationshipValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    patternMatch?: PatternValidationResult;
}

export interface PatternValidationResult {
    matchesPattern: boolean;
    anomalyScore: number; // 0-1, higher = more anomalous
    frequency: number; // How often this relationship type appears
    patternDeviation?: string; // Description of how it deviates from patterns
}

/**
 * Validates relationships for semantic correctness and graph integrity.
 * Ensures entity types are compatible with relationship types.
 * 
 * Enhanced with pattern-based validation and anomaly detection for Phase 1.
 */
export class RelationshipValidator {
    // Track relationship frequency for pattern analysis
    private relationshipFrequency: Map<RelationType, number> = new Map();
    private relationshipPatterns: Map<string, number> = new Map(); // "sourceType->targetType:relationType" -> count
    private semanticValidator: RelationshipSemanticValidator;

    constructor() {
        this.semanticValidator = new RelationshipSemanticValidator();
    }
    
    // Define valid relationship patterns by entity type
    private readonly validRelationships: Record<RelationType, Array<[EntityType, EntityType]>> = {
        [RelationType.APPLIES_TO]: [
            ['Regulation', 'SpatialUnit'],
            ['Regulation', 'LandUse'],
        ],
        [RelationType.CONSTRAINS]: [
            ['Requirement', 'SpatialUnit'],
        ],
        [RelationType.DEFINED_IN]: [
            ['Regulation', 'PolicyDocument'],
            ['Requirement', 'PolicyDocument'],
        ],
        [RelationType.OVERRIDES]: [
            ['PolicyDocument', 'PolicyDocument'],
        ],
        [RelationType.REFINES]: [
            ['PolicyDocument', 'PolicyDocument'],
        ],
        [RelationType.LOCATED_IN]: [
            ['SpatialUnit', 'SpatialUnit'],
        ],
        [RelationType.HAS_REQUIREMENT]: [
            ['Regulation', 'Requirement'],
        ],
        [RelationType.RELATED_TO]: [
            // All combinations allowed for general relations
        ],
    };

    /**
     * Validate a relationship between two entities
     */
    async validate(
        relation: Relation,
        sourceEntity: BaseEntity | null,
        targetEntity: BaseEntity | null
    ): Promise<RelationshipValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if entities exist
        if (!sourceEntity) {
            errors.push(`[i18n:workflowLogs.sourceEntityNotFound]|${relation.sourceId}`);
        }
        if (!targetEntity) {
            errors.push(`[i18n:workflowLogs.targetEntityNotFound]|${relation.targetId}`);
        }

        if (!sourceEntity || !targetEntity) {
            return { isValid: false, errors, warnings };
        }

        // Check self-loops (warn for some types, error for others)
        if (relation.sourceId === relation.targetId) {
            if (
                relation.type === RelationType.LOCATED_IN ||
                relation.type === RelationType.OVERRIDES ||
                relation.type === RelationType.REFINES
            ) {
                errors.push('[i18n:workflowLogs.selfLoopsNotAllowed]');
            } else {
                warnings.push('[i18n:workflowLogs.selfLoopDetected]');
            }
        }

        // Check relationship type validity
        const validPatterns = this.validRelationships[relation.type];
        if (validPatterns && validPatterns.length > 0) {
            const isValidPattern = validPatterns.some(
                ([sourceType, targetType]) =>
                    sourceEntity.type === sourceType && targetEntity.type === targetType
            );
            if (!isValidPattern) {
                errors.push(
                    `[i18n:workflowLogs.invalidRelationship]|${relation.type}|${sourceEntity.type}|${targetEntity.type}`
                );
            }
        }

        // Property completeness check
        const completenessResult = this.validatePropertyCompleteness(relation, sourceEntity, targetEntity);
        if (!completenessResult.isValid) {
            if (completenessResult.isRequired) {
                errors.push(...completenessResult.errors);
            } else {
                warnings.push(...completenessResult.errors);
            }
        }

        // Pattern-based validation (Phase 1 enhancement)
        const patternResult = await this.validatePattern(relation, sourceEntity, targetEntity);
        
        // Add warnings for anomalous patterns
        if (patternResult.anomalyScore > 0.7) {
            warnings.push(
                `Anomalous relationship pattern detected (score: ${patternResult.anomalyScore.toFixed(2)})`
            );
            if (patternResult.patternDeviation) {
                warnings.push(patternResult.patternDeviation);
            }
        }

        // Semantic validation
        const semanticResult = await this.semanticValidator.validate(relation, sourceEntity, targetEntity);
        if (!semanticResult.isValid) {
            errors.push(...semanticResult.errors);
        }
        if (semanticResult.warnings.length > 0) {
            warnings.push(...semanticResult.warnings);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            patternMatch: patternResult,
        };
    }

    /**
     * Validate relationship against frequent patterns
     * Phase 1 enhancement: Pattern-based validation and anomaly detection
     */
    private async validatePattern(
        relation: Relation,
        sourceEntity: BaseEntity,
        targetEntity: BaseEntity
    ): Promise<PatternValidationResult> {
        const patternKey = `${sourceEntity.type}->${targetEntity.type}:${relation.type}`;
        
        // Get relationship frequency
        const frequency = this.relationshipFrequency.get(relation.type) || 0;
        const patternCount = this.relationshipPatterns.get(patternKey) || 0;
        
        // Calculate anomaly score
        // Higher score = more anomalous
        let anomalyScore = 0;
        
        // Calculate pattern ratio (used later for deviation message)
        const patternRatio = patternCount > 0 ? patternCount / Math.max(frequency, 1) : 0;
        
        // If this pattern has never been seen before, it's more anomalous
        if (patternCount === 0) {
            anomalyScore += 0.3;
        } else {
            // If pattern is rare compared to other patterns of this type, it's anomalous
            if (patternRatio < 0.1) {
                anomalyScore += 0.2;
            }
        }
        
        // If relationship type is rare overall, it's more anomalous
        if (frequency < 10) {
            anomalyScore += 0.2;
        }
        
        // Check if pattern matches expected patterns
        const validPatterns = this.validRelationships[relation.type];
        const matchesPattern = validPatterns && validPatterns.length > 0
            ? validPatterns.some(
                ([sourceType, targetType]) =>
                    sourceEntity.type === sourceType && targetEntity.type === targetType
            )
            : true; // RELATED_TO allows all patterns
        
        // Update frequency tracking
        this.relationshipFrequency.set(
            relation.type,
            (this.relationshipFrequency.get(relation.type) || 0) + 1
        );
        this.relationshipPatterns.set(
            patternKey,
            (this.relationshipPatterns.get(patternKey) || 0) + 1
        );
        
        let patternDeviation: string | undefined;
        if (anomalyScore > 0.5) {
            if (patternCount === 0) {
                patternDeviation = `This relationship pattern (${patternKey}) has never been seen before`;
            } else if (patternRatio < 0.1) {
                patternDeviation = `This relationship pattern is rare (appears in ${(patternRatio * 100).toFixed(1)}% of ${relation.type} relationships)`;
            }
        }
        
        return {
            matchesPattern,
            anomalyScore: Math.min(1.0, anomalyScore),
            frequency,
            patternDeviation,
        };
    }

    /**
     * Validate batch of relationships
     */
    async validateBatch(
        relations: Relation[],
        entityGetter: (id: string) => Promise<BaseEntity | null>
    ): Promise<Map<string, RelationshipValidationResult>> {
        const results = new Map<string, RelationshipValidationResult>();

        for (const relation of relations) {
            const source = await entityGetter(relation.sourceId);
            const target = await entityGetter(relation.targetId);
            const result = await this.validate(relation, source, target);
            results.set(`${relation.sourceId}->${relation.targetId}:${relation.type}`, result);
        }

        return results;
    }

    /**
     * Validate property completeness for relationship
     */
    private validatePropertyCompleteness(
        relation: Relation,
        sourceEntity: BaseEntity,
        targetEntity: BaseEntity
    ): { isValid: boolean; isRequired: boolean; errors: string[] } {
        const errors: string[] = [];
        const isRequired = true; // Property completeness is always required

        // Check required properties based on relationship type
        switch (relation.type) {
            case RelationType.OVERRIDES:
            case RelationType.REFINES:
                // PolicyDocument relationships require hierarchy and date
                if (sourceEntity.type === 'PolicyDocument') {
                    const sourceDoc = sourceEntity as PolicyDocument;
                    if (!sourceDoc.hierarchy?.level) {
                        errors.push('Source PolicyDocument missing hierarchy level');
                    }
                    if (!sourceDoc.date) {
                        errors.push('Source PolicyDocument missing date');
                    }
                }
                if (targetEntity.type === 'PolicyDocument') {
                    const targetDoc = targetEntity as PolicyDocument;
                    if (!targetDoc.hierarchy?.level) {
                        errors.push('Target PolicyDocument missing hierarchy level');
                    }
                    if (!targetDoc.date) {
                        errors.push('Target PolicyDocument missing date');
                    }
                }
                break;

            case RelationType.APPLIES_TO:
                // Regulation-Spatial relationships require jurisdiction
                if (sourceEntity.type === 'Regulation') {
                    const sourceReg = sourceEntity as Regulation;
                    if (!sourceReg.category) {
                        errors.push('Source Regulation missing category');
                    }
                }
                break;

            case RelationType.DEFINED_IN:
                // Document-Regulation relationships require document status
                if (targetEntity.type === 'PolicyDocument') {
                    const targetDoc = targetEntity as PolicyDocument;
                    if (!targetDoc.status) {
                        errors.push('Target PolicyDocument missing status');
                    }
                }
                break;

            case RelationType.LOCATED_IN:
                // Spatial relationships benefit from geometry
                if (sourceEntity.type === 'SpatialUnit') {
                    const sourceSpatial = sourceEntity as SpatialUnit;
                    if (!sourceSpatial.spatialType) {
                        errors.push('Source SpatialUnit missing spatialType');
                    }
                }
                if (targetEntity.type === 'SpatialUnit') {
                    const targetSpatial = targetEntity as SpatialUnit;
                    if (!targetSpatial.spatialType) {
                        errors.push('Target SpatialUnit missing spatialType');
                    }
                }
                break;

            case RelationType.HAS_REQUIREMENT:
                // Regulation-Requirement relationships require category and metric
                if (sourceEntity.type === 'Regulation') {
                    const sourceReg = sourceEntity as Regulation;
                    if (!sourceReg.category) {
                        errors.push('Source Regulation missing category');
                    }
                }
                if (targetEntity.type === 'Requirement') {
                    const targetReq = targetEntity as Requirement;
                    if (!targetReq.metric) {
                        errors.push('Target Requirement missing metric');
                    }
                }
                break;
        }

        return { isValid: errors.length === 0, isRequired, errors };
    }
}
