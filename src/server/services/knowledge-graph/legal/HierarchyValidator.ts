/**
 * Hierarchy Validator
 * 
 * Validates hierarchical structure integrity for policy documents and jurisdictions.
 * Prevents cycles, validates hierarchy levels, and ensures consistency.
 */

import { PolicyDocument, HierarchyLevel, HierarchyInfo } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

export interface HierarchyValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validates hierarchy information for a policy document.
 */
export class HierarchyValidator {
    /**
     * Valid hierarchy level order (from lowest to highest)
     */
    private static readonly HIERARCHY_ORDER: Record<HierarchyLevel, number> = {
        municipality: 1,
        province: 2,
        national: 3,
        european: 4,
    };

    /**
     * Validates hierarchy information for a single entity.
     * 
     * @param entity The policy document to validate
     * @param parentEntity Optional parent entity for validation
     * @returns Validation result
     */
    static validate(
        entity: PolicyDocument,
        parentEntity?: PolicyDocument
    ): HierarchyValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!entity.hierarchy) {
            // Hierarchy is optional, but if present should be valid
            return { isValid: true, errors: [], warnings: [] };
        }

        const hierarchy = entity.hierarchy;

        // Validate hierarchy level
        if (!this.isValidLevel(hierarchy.level)) {
            errors.push(`Invalid hierarchy level: ${hierarchy.level}`);
        }

        // Validate parent relationship
        if (hierarchy.parentId && parentEntity) {
            if (!this.isValidParentChild(parentEntity.hierarchy, hierarchy)) {
                errors.push(
                    `Invalid parent-child relationship: parent level (${parentEntity.hierarchy?.level}) must be higher than child level (${hierarchy.level})`
                );
            }
        }

        // Validate children IDs
        if (hierarchy.childrenIds && hierarchy.childrenIds.length > 0) {
            // Check for duplicate children
            const uniqueChildren = new Set(hierarchy.childrenIds);
            if (uniqueChildren.size !== hierarchy.childrenIds.length) {
                errors.push('Duplicate children IDs found in hierarchy');
            }

            // Check for self-reference
            if (hierarchy.childrenIds.includes(entity.id)) {
                errors.push('Entity cannot be its own child');
            }
        }

        // Check for self-reference in parent
        if (hierarchy.parentId === entity.id) {
            errors.push('Entity cannot be its own parent');
        }

        // Warn if hierarchy level doesn't match jurisdiction pattern
        if (entity.jurisdiction) {
            const expectedLevel = this.inferLevelFromJurisdiction(entity.jurisdiction);
            if (expectedLevel && expectedLevel !== hierarchy.level) {
                warnings.push(
                    `Jurisdiction "${entity.jurisdiction}" suggests level "${expectedLevel}" but hierarchy has "${hierarchy.level}"`
                );
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Validates a hierarchy graph for cycles.
     * Uses DFS to detect cycles in the parent-child relationships.
     * 
     * @param entities Map of entity ID to PolicyDocument
     * @returns Validation result with cycle detection
     */
    static validateGraph(
        entities: Map<string, PolicyDocument>
    ): HierarchyValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        // DFS to detect cycles
        const detectCycle = (entityId: string, path: string[]): boolean => {
            if (recursionStack.has(entityId)) {
                errors.push(`Cycle detected: ${path.join(' -> ')} -> ${entityId}`);
                return true;
            }

            if (visited.has(entityId)) {
                return false;
            }

            visited.add(entityId);
            recursionStack.add(entityId);

            const entity = entities.get(entityId);
            if (entity?.hierarchy?.childrenIds) {
                for (const childId of entity.hierarchy.childrenIds) {
                    if (detectCycle(childId, [...path, entityId])) {
                        return true;
                    }
                }
            }

            recursionStack.delete(entityId);
            return false;
        };

        // Check all entities for cycles
        for (const entityId of entities.keys()) {
            if (!visited.has(entityId)) {
                detectCycle(entityId, []);
            }
        }

        // Validate all parent-child relationships
        for (const [entityId, entity] of entities.entries()) {
            if (entity.hierarchy?.parentId) {
                const parent = entities.get(entity.hierarchy.parentId);
                if (!parent) {
                    errors.push(`Parent entity ${entity.hierarchy.parentId} not found for ${entityId}`);
                } else if (parent.hierarchy) {
                    // Check bidirectional consistency
                    if (!parent.hierarchy.childrenIds?.includes(entityId)) {
                        warnings.push(
                            `Bidirectional inconsistency: ${entityId} has parent ${entity.hierarchy.parentId}, but parent doesn't list ${entityId} as child`
                        );
                    }
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Checks if a hierarchy level is valid.
     */
    private static isValidLevel(level: string): level is HierarchyLevel {
        return level in this.HIERARCHY_ORDER;
    }

    /**
     * Validates parent-child relationship.
     * Parent must be at a higher level than child.
     */
    private static isValidParentChild(
        parentHierarchy: HierarchyInfo | undefined,
        childHierarchy: HierarchyInfo
    ): boolean {
        if (!parentHierarchy) {
            return false;
        }

        const parentLevel = this.HIERARCHY_ORDER[parentHierarchy.level];
        const childLevel = this.HIERARCHY_ORDER[childHierarchy.level];

        return parentLevel > childLevel;
    }

    /**
     * Infers hierarchy level from jurisdiction string.
     * Uses heuristics based on Dutch jurisdiction naming patterns.
     */
    private static inferLevelFromJurisdiction(jurisdiction: string): HierarchyLevel | null {
        const lower = jurisdiction.toLowerCase();

        if (lower.includes('gemeente') || lower.includes('municipality')) {
            return 'municipality';
        }
        if (lower.includes('provincie') || lower.includes('province')) {
            return 'province';
        }
        if (lower.includes('rijksoverheid') || lower.includes('national') || lower.includes('nederland')) {
            return 'national';
        }
        if (lower.includes('european') || lower.includes('eu') || lower.includes('europa')) {
            return 'european';
        }

        return null;
    }

    /**
     * Validates hierarchy level order.
     * Returns true if level1 is higher (more general) than level2.
     */
    static isHigherLevel(level1: HierarchyLevel, level2: HierarchyLevel): boolean {
        return this.HIERARCHY_ORDER[level1] > this.HIERARCHY_ORDER[level2];
    }

    /**
     * Gets the hierarchy order number for a level.
     */
    static getLevelOrder(level: HierarchyLevel): number {
        return this.HIERARCHY_ORDER[level];
    }
}

