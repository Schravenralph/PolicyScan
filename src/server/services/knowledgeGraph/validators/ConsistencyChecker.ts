import { BaseEntity, RelationType, EntityType } from '../../../domain/ontology.js';

export interface ConsistencyViolation {
    type: 'contradiction' | 'orphan' | 'circular_dependency' | 'invalid_hierarchy';
    severity: 'error' | 'warning';
    description: string;
    entities: string[];
    relations?: string[];
}

/**
 * Checks the knowledge graph for consistency violations.
 * Detects orphaned entities, circular dependencies, invalid hierarchies, and contradictions.
 */
export class ConsistencyChecker {
    constructor(
        private getNode: (id: string) => Promise<BaseEntity | undefined>,
        private getAllNodes: () => Promise<BaseEntity[]>,
        private getRelationshipsForEntity: (id: string) => Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>,
        private getIncomingRelationships: (id: string) => Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>
    ) {}

    /**
     * Check graph for consistency violations
     */
    async checkConsistency(): Promise<ConsistencyViolation[]> {
        const violations: ConsistencyViolation[] = [];

        // Check for orphaned entities (no relationships)
        violations.push(...(await this.checkOrphanedEntities()));

        // Check for circular dependencies
        violations.push(...(await this.checkCircularDependencies()));

        // Check for invalid hierarchies
        violations.push(...(await this.checkInvalidHierarchies()));

        // Check for contradictory regulations
        violations.push(...(await this.checkContradictoryRegulations()));

        return violations;
    }

    /**
     * Find entities with no relationships (potential orphans)
     * Only warn for entities that should have relationships (e.g., Regulations, Requirements)
     */
    private async checkOrphanedEntities(): Promise<ConsistencyViolation[]> {
        const violations: ConsistencyViolation[] = [];
        const allNodes = await this.getAllNodes();

        for (const node of allNodes) {
            const outgoing = await this.getRelationshipsForEntity(node.id);
            const incoming = await this.getIncomingRelationships(node.id);

            // Entities that should have relationships
            const shouldHaveRelationships: EntityType[] = ['Regulation', 'Requirement', 'PolicyDocument'];

            if (shouldHaveRelationships.includes(node.type) && outgoing.length === 0 && incoming.length === 0) {
                violations.push({
                    type: 'orphan',
                    severity: 'warning',
                    description: `${node.type} entity "${node.name}" has no relationships`,
                    entities: [node.id],
                });
            }
        }

        return violations;
    }

    /**
     * Detect circular dependencies in hierarchical relationships
     * Checks OVERRIDES, REFINES, and LOCATED_IN relationships
     */
    private async checkCircularDependencies(): Promise<ConsistencyViolation[]> {
        const violations: ConsistencyViolation[] = [];
        const allNodes = await this.getAllNodes();

        // Track visited nodes for cycle detection
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const checkCycle = async (nodeId: string, path: string[]): Promise<boolean> => {
            if (recursionStack.has(nodeId)) {
                // Cycle detected
                const cycleStart = path.indexOf(nodeId);
                const cycle = path.slice(cycleStart).concat(nodeId);
                violations.push({
                    type: 'circular_dependency',
                    severity: 'error',
                    description: `Circular dependency detected: ${cycle.join(' -> ')}`,
                    entities: cycle,
                });
                return true;
            }

            if (visited.has(nodeId)) {
                return false;
            }

            visited.add(nodeId);
            recursionStack.add(nodeId);

            // Get hierarchical relationships
            const relationships = await this.getRelationshipsForEntity(nodeId);
            const hierarchicalTypes: RelationType[] = [
                RelationType.OVERRIDES,
                RelationType.REFINES,
                RelationType.LOCATED_IN,
            ];

            const hierarchicalRels = relationships.filter((r) => hierarchicalTypes.includes(r.type));

            for (const rel of hierarchicalRels) {
                const hasCycle = await checkCycle(rel.targetId, [...path, nodeId]);
                if (hasCycle) {
                    recursionStack.delete(nodeId);
                    return true;
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        // Check all nodes for cycles
        for (const node of allNodes) {
            if (!visited.has(node.id)) {
                await checkCycle(node.id, []);
            }
        }

        return violations;
    }

    /**
     * Check for invalid hierarchy patterns
     * Example: SpatialUnit should not contain itself, PolicyDocument should not override itself
     */
    private async checkInvalidHierarchies(): Promise<ConsistencyViolation[]> {
        const violations: ConsistencyViolation[] = [];
        const allNodes = await this.getAllNodes();

        for (const node of allNodes) {
            const relationships = await this.getRelationshipsForEntity(node.id);

            // Check for self-loops in hierarchical relationships
            const hierarchicalTypes: RelationType[] = [
                RelationType.OVERRIDES,
                RelationType.REFINES,
                RelationType.LOCATED_IN,
            ];

            for (const rel of relationships) {
                if (hierarchicalTypes.includes(rel.type) && rel.sourceId === rel.targetId) {
                    violations.push({
                        type: 'invalid_hierarchy',
                        severity: 'error',
                        description: `Invalid self-loop in ${rel.type} relationship for entity "${node.name}"`,
                        entities: [node.id],
                        relations: [`${rel.sourceId} -> ${rel.targetId}: ${rel.type}`],
                    });
                }
            }
        }

        return violations;
    }

    /**
     * Check for contradictory regulations
     * This is a simplified check - can be enhanced with more sophisticated logic
     */
    private async checkContradictoryRegulations(): Promise<ConsistencyViolation[]> {
        const violations: ConsistencyViolation[] = [];
        const allNodes = await this.getAllNodes();

        // Find all Regulation entities
        const regulations = allNodes.filter((n) => n.type === 'Regulation');

        // Group regulations by spatial unit or land use they apply to
        const regulationsByTarget = new Map<string, BaseEntity[]>();

        for (const regulation of regulations) {
            const relationships = await this.getRelationshipsForEntity(regulation.id);
            const appliesToRels = relationships.filter((r) => r.type === RelationType.APPLIES_TO);

            for (const rel of appliesToRels) {
                const targetId = rel.targetId;
                if (!regulationsByTarget.has(targetId)) {
                    regulationsByTarget.set(targetId, []);
                }
                regulationsByTarget.get(targetId)!.push(regulation);
            }
        }

        // Check for potential contradictions
        // Simplified: if multiple regulations of same category apply to same target,
        // and they have conflicting requirements, flag as potential contradiction
        for (const [targetId, regs] of regulationsByTarget.entries()) {
            if (regs.length > 1) {
                // Group by category
                const byCategory = new Map<string, BaseEntity[]>();
                for (const reg of regs) {
                    const category = (reg as any).category || 'unknown';
                    if (!byCategory.has(category)) {
                        byCategory.set(category, []);
                    }
                    byCategory.get(category)!.push(reg);
                }

                // If multiple regulations of same category apply to same target, warn
                for (const [category, categoryRegs] of byCategory.entries()) {
                    if (categoryRegs.length > 1) {
                        violations.push({
                            type: 'contradiction',
                            severity: 'warning',
                            description: `Multiple ${category} regulations apply to the same target (potential contradiction)`,
                            entities: [targetId, ...categoryRegs.map((r) => r.id)],
                        });
                    }
                }
            }
        }

        return violations;
    }

    /**
     * Get summary of consistency check results
     */
    async getConsistencySummary(): Promise<{
        totalViolations: number;
        errors: number;
        warnings: number;
        byType: Record<string, number>;
    }> {
        const violations = await this.checkConsistency();

        const byType: Record<string, number> = {};
        let errors = 0;
        let warnings = 0;

        for (const violation of violations) {
            byType[violation.type] = (byType[violation.type] || 0) + 1;
            if (violation.severity === 'error') {
                errors++;
            } else {
                warnings++;
            }
        }

        return {
            totalViolations: violations.length,
            errors,
            warnings,
            byType,
        };
    }
}
