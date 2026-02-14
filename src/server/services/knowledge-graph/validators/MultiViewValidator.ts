import { BaseEntity, RelationType, EntityType, PolicyDocument, Regulation, Requirement } from '../../../domain/ontology.js';

export interface SemanticValidationResult {
    plausibility: number; // 0-1
    issues: string[];
}

export interface StructuralValidationResult {
    importance: number; // 0-1
    centrality: number; // 0-1
    connectivity: number; // number of connections
    issues: string[];
}

export interface TemporalValidationResult {
    isValid: boolean;
    issues: string[];
    effectiveDate?: string;
    expirationDate?: string;
}

export interface MultiViewValidationResult {
    entity: BaseEntity;
    semantic: SemanticValidationResult;
    structural: StructuralValidationResult;
    temporal: TemporalValidationResult;
    overallScore: number; // 0-1, weighted average
}

/**
 * Validates entities from multiple perspectives:
 * - Semantic: Does the entity make sense semantically?
 * - Structural: Is the entity properly connected in the graph?
 * - Temporal: Do dates and temporal relationships make sense?
 */
export class MultiViewValidator {
    constructor(
        private getRelationshipsForEntity: (id: string) => Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>,
        private getIncomingRelationships: (id: string) => Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>,
        private getAllNodes: () => Promise<BaseEntity[]>
    ) {}

    /**
     * Validate entity from all perspectives
     */
    async validateEntity(entity: BaseEntity): Promise<MultiViewValidationResult> {
        const [semantic, structural, temporal] = await Promise.all([
            this.validateSemanticPlausibility(entity),
            this.validateStructuralImportance(entity),
            this.validateTemporalConsistency(entity),
        ]);

        // Calculate overall score (weighted average)
        const overallScore =
            semantic.plausibility * 0.4 + structural.importance * 0.4 + (temporal.isValid ? 1.0 : 0.5) * 0.2;

        return {
            entity,
            semantic,
            structural,
            temporal,
            overallScore,
        };
    }

    /**
     * Semantic plausibility check
     * Checks if entity makes sense semantically based on its properties and relationships
     */
    async validateSemanticPlausibility(entity: BaseEntity): Promise<SemanticValidationResult> {
        const issues: string[] = [];
        let plausibility = 1.0;

        // Check if entity has required fields for its type
        if (!entity.name || entity.name.trim().length === 0) {
            issues.push('Entity missing name');
            plausibility -= 0.3;
        }

        // Type-specific semantic checks
        if (entity.type === 'PolicyDocument') {
            const pd = entity as PolicyDocument;
            if (!pd.jurisdiction) {
                issues.push('PolicyDocument missing jurisdiction');
                plausibility -= 0.2;
            }
            if (!pd.date) {
                issues.push('PolicyDocument missing date');
                plausibility -= 0.1;
            }
        }

        if (entity.type === 'Regulation') {
            const reg = entity as Regulation;
            if (!reg.category) {
                issues.push('Regulation missing category');
                plausibility -= 0.2;
            }
        }

        if (entity.type === 'Requirement') {
            const req = entity as Requirement;
            if (!req.metric || !req.operator || req.value === undefined) {
                issues.push('Requirement missing metric, operator, or value');
                plausibility -= 0.3;
            }
        }

        // Check relationships for semantic consistency
        const outgoing = await this.getRelationshipsForEntity(entity.id);
        const incoming = await this.getIncomingRelationships(entity.id);

        // Regulations should have APPLIES_TO relationships
        if (entity.type === 'Regulation' && outgoing.filter((r) => r.type === RelationType.APPLIES_TO).length === 0) {
            issues.push('Regulation has no APPLIES_TO relationships');
            plausibility -= 0.1;
        }

        // Requirements should be connected to Regulations
        if (
            entity.type === 'Requirement' &&
            incoming.filter((r) => r.type === RelationType.HAS_REQUIREMENT).length === 0
        ) {
            issues.push('Requirement is not connected to a Regulation');
            plausibility -= 0.2;
        }

        // PolicyDocuments should have relationships (they contain regulations/requirements)
        if (
            entity.type === 'PolicyDocument' &&
            outgoing.filter((r) => r.type === RelationType.DEFINED_IN).length === 0
        ) {
            issues.push('PolicyDocument has no DEFINED_IN relationships (no content defined in it)');
            plausibility -= 0.1;
        }

        plausibility = Math.max(0, Math.min(1, plausibility));

        return {
            plausibility,
            issues,
        };
    }

    /**
     * Structural importance check
     * Checks if entity has appropriate number of relationships (centrality)
     */
    async validateStructuralImportance(entity: BaseEntity): Promise<StructuralValidationResult> {
        const issues: string[] = [];
        const outgoing = await this.getRelationshipsForEntity(entity.id);
        const incoming = await this.getIncomingRelationships(entity.id);
        const connectivity = outgoing.length + incoming.length;

        // Calculate centrality (normalized by average connectivity)
        // Get all nodes to calculate average
        const allNodes = await this.getAllNodes();
        const totalConnections = allNodes.reduce((sum, n) => {
            // Approximate: assume average of 3 connections per node
            return sum + 3;
        }, 0);
        const averageConnectivity = allNodes.length > 0 ? totalConnections / allNodes.length : 3;

        const centrality = Math.min(1.0, connectivity / Math.max(averageConnectivity, 1));

        // Calculate importance score
        let importance = centrality;

        // Entities that should have connections but don't
        const shouldHaveConnections: EntityType[] = ['Regulation', 'Requirement', 'PolicyDocument'];
        if (shouldHaveConnections.includes(entity.type) && connectivity === 0) {
            issues.push(`${entity.type} has no connections (orphaned)`);
            importance *= 0.3;
        }

        // Entities with too many connections (potential data quality issue)
        if (connectivity > 50) {
            issues.push(`Entity has unusually high number of connections (${connectivity})`);
            // Don't penalize too much, but flag it
        }

        // Entities with balanced in/out connections are more important
        const balance = outgoing.length > 0 && incoming.length > 0 ? 1.0 : 0.8;
        importance *= balance;

        importance = Math.max(0, Math.min(1, importance));

        return {
            importance,
            centrality,
            connectivity,
            issues,
        };
    }

    /**
     * Temporal consistency check
     * Validates temporal logic and date relationships
     */
    async validateTemporalConsistency(entity: BaseEntity): Promise<TemporalValidationResult> {
        const issues: string[] = [];
        let isValid = true;

        // Check if entity has date information
        let effectiveDate: string | undefined;
        let expirationDate: string | undefined;

        if (entity.type === 'PolicyDocument') {
            const pd = entity as PolicyDocument;
            effectiveDate = pd.date;
            expirationDate = pd.metadata?.expirationDate as string | undefined;
        }

        if (entity.metadata?.effectiveDate) {
            effectiveDate = entity.metadata.effectiveDate as string;
        }

        if (entity.metadata?.expirationDate) {
            expirationDate = entity.metadata.expirationDate as string;
        }

        // Validate date formats
        if (effectiveDate) {
            try {
                const date = new Date(effectiveDate);
                if (isNaN(date.getTime())) {
                    issues.push('Invalid effective date format');
                    isValid = false;
                }
            } catch (_error) {
                issues.push('Error parsing effective date');
                isValid = false;
            }
        }

        if (expirationDate) {
            try {
                const expDate = new Date(expirationDate);
                if (isNaN(expDate.getTime())) {
                    issues.push('Invalid expiration date format');
                    isValid = false;
                } else if (effectiveDate) {
                    const effDate = new Date(effectiveDate);
                    if (expDate < effDate) {
                        issues.push('Expiration date is before effective date');
                        isValid = false;
                    }
                }
            } catch (_error) {
                issues.push('Error parsing expiration date');
                isValid = false;
            }
        }

        // Check temporal relationships
        const outgoing = await this.getRelationshipsForEntity(entity.id);
        const temporalRels = outgoing.filter(
            (r) => r.type === RelationType.OVERRIDES || r.type === RelationType.REFINES
        );

        // If entity overrides another, check dates make sense
        for (const rel of temporalRels) {
            if (rel.type === RelationType.OVERRIDES) {
                // The overriding document should be newer
                // This would require fetching the target entity
                // For now, we just note that temporal relationship exists
            }
        }

        return {
            isValid,
            issues,
            effectiveDate,
            expirationDate,
        };
    }

    /**
     * Validate batch of entities
     */
    async validateEntities(entities: BaseEntity[]): Promise<MultiViewValidationResult[]> {
        return Promise.all(entities.map((entity) => this.validateEntity(entity)));
    }

    /**
     * Get entities with low overall scores (potential issues)
     */
    async getLowScoreEntities(threshold: number = 0.7): Promise<MultiViewValidationResult[]> {
        const allNodes = await this.getAllNodes();
        const results = await this.validateEntities(allNodes);
        return results.filter((r) => r.overallScore < threshold);
    }
}
