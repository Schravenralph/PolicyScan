import { BaseEntity, RelationType } from '../../../domain/ontology.js';
import { KnowledgeGraphService } from '../../knowledge-graph/core/KnowledgeGraph.js';
import { FeatureFlag, KGFeatureFlag } from '../../../models/FeatureFlag.js';
import { logger } from '../../../utils/logger.js';
import { getNeo4jDriver } from '../../../config/neo4j.js';
import type { Driver } from '../../../config/neo4j.js';

/**
 * Configuration for HeteroGNN scoring
 */
export interface HeteroGNNConfig {
    enableCaching: boolean;        // Enable score caching (default: true)
    cacheTTL: number;              // Cache TTL in milliseconds (default: 1 hour)
    minTrainingData: number;       // Minimum relationships needed for training (default: 100)
    modelVersion: string;          // Model version identifier
}

/**
 * Relationship scoring result
 */
export interface RelationshipScore {
    sourceId: string;
    targetId: string;
    relationType: RelationType;
    score: number;                  // S_KG score [0, 1] - empirical probability of relationship
    confidence: number;             // Confidence in the score [0, 1]
    factors: {
        frequency: number;          // How often this relationship type appears
        entityTypeCompatibility: number; // Compatibility of entity types
        graphPattern: number;      // Pattern-based score from graph structure
        temporalConsistency: number; // Temporal consistency score
    };
}

/**
 * Training statistics for the model
 */
export interface ModelStatistics {
    totalRelationships: number;
    relationshipTypeCounts: Record<RelationType, number>;
    entityTypeCounts: Record<string, number>;
    averageScore: number;
    modelAccuracy?: number;        // If model has been evaluated
    lastTrained?: Date;
}

/**
 * Heterogeneous Graph Neural Network Scorer
 * 
 * Predicts the empirical probability of relationships existing in the knowledge graph.
 * Uses statistical and pattern-based methods to approximate HeteroGNN scoring.
 * 
 * Note: This is a simplified implementation that can be enhanced with actual ML models later.
 * For production use with full HeteroGNN, consider integrating with a Python ML service
 * using PyTorch Geometric or DGL.
 */
export class HeteroGNNScorer {
    private config: HeteroGNNConfig;
    private kgService: KnowledgeGraphService;
    private driver: Driver | null = null;
    private scoreCache: Map<string, { score: RelationshipScore; timestamp: number }>;
    private modelStats: ModelStatistics | null = null;
    private isEnabled: boolean = false;

    constructor(
        kgService: KnowledgeGraphService,
        config: Partial<HeteroGNNConfig> = {}
    ) {
        this.kgService = kgService;
        // Get driver directly to avoid circular dependency
        try {
            this.driver = getNeo4jDriver();
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.warn({ error: errorObj }, '[HeteroGNNScorer] Failed to get Neo4j driver:');
            this.driver = null;
        }
        this.config = {
            enableCaching: config.enableCaching ?? true,
            cacheTTL: config.cacheTTL ?? 60 * 60 * 1000, // 1 hour
            minTrainingData: config.minTrainingData ?? 100,
            modelVersion: config.modelVersion ?? '1.0.0-statistical',
        };
        this.scoreCache = new Map();
    }

    /**
     * Initialize the scorer and check if it's enabled
     */
    async init(): Promise<void> {
        try {
            const flag = await FeatureFlag.findByName(KGFeatureFlag.KG_HETEROGNN_SCORING_ENABLED);
            this.isEnabled = flag?.enabled ?? false;

            if (this.isEnabled) {
                logger.info('[HeteroGNNScorer] Initialized and enabled');
                // Load or compute model statistics
                await this.loadModelStatistics();
            } else {
                logger.info('[HeteroGNNScorer] Initialized but disabled (feature flag)');
            }
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.error({ error: errorObj }, '[HeteroGNNScorer] Failed to initialize');
            this.isEnabled = false;
        }
    }

    /**
     * Check if HeteroGNN scoring is enabled
     */
    isScoringEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Calculate S_KG score for a relationship (empirical probability)
     * @param sourceId Source entity ID
     * @param targetId Target entity ID
     * @param relationType Relationship type
     * @param sourceEntity Optional source entity (for type checking)
     * @param targetEntity Optional target entity (for type checking)
     * @returns Relationship score with S_KG probability
     */
    async calculateScore(
        sourceId: string,
        targetId: string,
        relationType: RelationType,
        sourceEntity?: BaseEntity,
        targetEntity?: BaseEntity
    ): Promise<RelationshipScore> {
        if (!this.isEnabled) {
            // Return default score if disabled
            return this.getDefaultScore(sourceId, targetId, relationType);
        }

        // Check cache
        const cacheKey = this.getCacheKey(sourceId, targetId, relationType);
        if (this.config.enableCaching) {
            const cached = this.scoreCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
                return cached.score;
            }
        }

        // Calculate score using statistical methods
        const score = await this.computeScore(
            sourceId,
            targetId,
            relationType,
            sourceEntity,
            targetEntity
        );

        // Cache the result
        if (this.config.enableCaching) {
            this.scoreCache.set(cacheKey, {
                score,
                timestamp: Date.now(),
            });
        }

        return score;
    }

    /**
     * Compute score using statistical and pattern-based methods
     */
    private async computeScore(
        sourceId: string,
        targetId: string,
        relationType: RelationType,
        sourceEntity?: BaseEntity,
        targetEntity?: BaseEntity
    ): Promise<RelationshipScore> {
        // Load model statistics if not loaded
        if (!this.modelStats) {
            await this.loadModelStatistics();
        }

        // Calculate factors
        const frequency = this.calculateFrequencyScore(relationType);
        const entityTypeCompatibility = this.calculateEntityTypeCompatibility(
            sourceEntity,
            targetEntity,
            relationType
        );
        const graphPattern = await this.calculateGraphPatternScore(
            sourceId,
            targetId,
            relationType
        );
        const temporalConsistency = this.calculateTemporalConsistency(
            sourceEntity,
            targetEntity
        );

        // Combine factors (weighted average)
        // These weights approximate what a HeteroGNN would learn
        const weights = {
            frequency: 0.25,
            entityTypeCompatibility: 0.30,
            graphPattern: 0.30,
            temporalConsistency: 0.15,
        };

        const score =
            frequency * weights.frequency +
            entityTypeCompatibility * weights.entityTypeCompatibility +
            graphPattern * weights.graphPattern +
            temporalConsistency * weights.temporalConsistency;

        // Calculate confidence based on data availability
        const confidence = this.calculateConfidence(
            frequency,
            entityTypeCompatibility,
            graphPattern
        );

        return {
            sourceId,
            targetId,
            relationType,
            score: Math.max(0, Math.min(1, score)), // Clamp to [0, 1]
            confidence,
            factors: {
                frequency,
                entityTypeCompatibility,
                graphPattern,
                temporalConsistency,
            },
        };
    }

    /**
     * Calculate frequency-based score (how common is this relationship type)
     */
    private calculateFrequencyScore(relationType: RelationType): number {
        if (!this.modelStats) return 0.5;

        const typeCount = this.modelStats.relationshipTypeCounts[relationType] || 0;
        const total = this.modelStats.totalRelationships;

        if (total === 0) return 0.5;

        // Normalize: more frequent = higher score (up to a point)
        // Very rare relationships get lower scores, common ones get higher
        const frequency = typeCount / total;
        // Apply sigmoid-like function to normalize
        return Math.min(1.0, frequency * 2); // Scale so 50% frequency = 1.0
    }

    /**
     * Calculate entity type compatibility score
     */
    private calculateEntityTypeCompatibility(
        sourceEntity?: BaseEntity,
        targetEntity?: BaseEntity,
        relationType?: RelationType
    ): number {
        if (!sourceEntity || !targetEntity) return 0.5;

        // Define compatibility rules based on relationship types
        const compatibilityRules: Record<
            RelationType,
            Array<[string, string]>
        > = {
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
                // RELATED_TO is general, so all combinations are valid
                ['PolicyDocument', 'PolicyDocument'],
                ['Regulation', 'Regulation'],
                ['SpatialUnit', 'SpatialUnit'],
            ],
        };

        if (!relationType) return 0.5;

        const validPairs = compatibilityRules[relationType] || [];
        const isValid = validPairs.some(
            ([sourceType, targetType]) =>
                sourceEntity.type === sourceType && targetEntity.type === targetType
        );

        return isValid ? 1.0 : 0.3; // High score for valid, low for invalid
    }

    /**
     * Calculate graph pattern-based score
     * Looks at similar relationships in the graph
     */
    private async calculateGraphPatternScore(
        sourceId: string,
        targetId: string,
        relationType: RelationType
    ): Promise<number> {
        try {
            // Check if similar relationships exist (same type, different entities)
            // This approximates what a GNN would learn from graph structure
            if (!this.driver) return 0.5;
            const session = this.driver.session();

            try {
                // Count similar relationships (same type)
                const result = await session.run(
                    `
                    MATCH (s)-[r]->(t)
                    WHERE type(r) = $relationType
                    RETURN count(*) as count
                    `,
                    { relationType }
                );

                const count = result.records[0]?.get('count')?.toNumber() || 0;

                // Check if source has outgoing relationships of this type
                const sourceResult = await session.run(
                    `
                    MATCH (s {id: $sourceId})-[r]->()
                    WHERE type(r) = $relationType
                    RETURN count(*) as count
                    `,
                    { sourceId, relationType }
                );

                const sourceCount = sourceResult.records[0]?.get('count')?.toNumber() || 0;

                // Check if target has incoming relationships of this type
                const targetResult = await session.run(
                    `
                    MATCH ()-[r]->(t {id: $targetId})
                    WHERE type(r) = $relationType
                    RETURN count(*) as count
                    `,
                    { targetId, relationType }
                );

                const targetCount = targetResult.records[0]?.get('count')?.toNumber() || 0;

                // Pattern score: higher if source/target commonly participate in this relationship type
                const patternScore =
                    (sourceCount > 0 ? 0.5 : 0) + (targetCount > 0 ? 0.5 : 0);

                return patternScore;
            } finally {
                await session.close();
            }
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.warn({ error: errorObj }, '[HeteroGNNScorer] Failed to calculate graph pattern score:');
            return 0.5; // Default score on error
        }
    }

    /**
     * Calculate temporal consistency score
     */
    private calculateTemporalConsistency(
        sourceEntity?: BaseEntity,
        targetEntity?: BaseEntity
    ): number {
        if (!sourceEntity || !targetEntity) return 0.5;

        // Check if entities have compatible temporal information
        const sourceDate = sourceEntity.effectiveDate || sourceEntity.createdAt;
        const targetDate = targetEntity.effectiveDate || targetEntity.createdAt;

        if (!sourceDate || !targetDate) return 0.5;

        // Entities with similar dates are more likely to be related
        const sourceTime = new Date(sourceDate).getTime();
        const targetTime = new Date(targetDate).getTime();
        const timeDiff = Math.abs(sourceTime - targetTime);
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

        // Score decreases with time difference (entities from same period are more related)
        if (daysDiff < 30) return 1.0; // Same month
        if (daysDiff < 365) return 0.7; // Same year
        if (daysDiff < 1825) return 0.4; // Within 5 years
        return 0.2; // Very different times
    }

    /**
     * Calculate confidence in the score
     */
    private calculateConfidence(
        frequency: number,
        entityTypeCompatibility: number,
        graphPattern: number
    ): number {
        // Higher confidence when we have more data and better matches
        const dataConfidence = frequency > 0.1 ? 0.8 : 0.5; // More data = higher confidence
        const compatibilityConfidence = entityTypeCompatibility > 0.7 ? 0.9 : 0.6;
        const patternConfidence = graphPattern > 0.5 ? 0.8 : 0.5;

        return (dataConfidence + compatibilityConfidence + patternConfidence) / 3;
    }

    /**
     * Load model statistics from the knowledge graph
     */
    private async loadModelStatistics(): Promise<void> {
        try {
            if (!this.driver) {
                this.modelStats = this.getDefaultStats();
                return;
            }
            const session = this.driver.session();

            try {
                // Count total relationships
                const totalResult = await session.run(`
                    MATCH ()-[r]->()
                    RETURN count(*) as total
                `);

                const total = totalResult.records[0]?.get('total')?.toNumber() || 0;

                // Count by relationship type
                const typeResult = await session.run(`
                    MATCH ()-[r]->()
                    WITH type(r) as relType, count(*) as count
                    RETURN relType, count
                `);

                const relationshipTypeCounts: Record<RelationType, number> = {
                    [RelationType.APPLIES_TO]: 0,
                    [RelationType.CONSTRAINS]: 0,
                    [RelationType.DEFINED_IN]: 0,
                    [RelationType.OVERRIDES]: 0,
                    [RelationType.REFINES]: 0,
                    [RelationType.LOCATED_IN]: 0,
                    [RelationType.HAS_REQUIREMENT]: 0,
                    [RelationType.RELATED_TO]: 0,
                };

                for (const record of typeResult.records) {
                    const relType = record.get('relType') as string;
                    const count = record.get('count')?.toNumber() || 0;
                    if (relType in relationshipTypeCounts) {
                        relationshipTypeCounts[relType as RelationType] = count;
                    }
                }

                // Count by entity type
                const entityResult = await session.run(`
                    MATCH (e)
                    WITH labels(e)[0] as entityType, count(*) as count
                    RETURN entityType, count
                `);

                const entityTypeCounts: Record<string, number> = {};
                for (const record of entityResult.records) {
                    const entityType = record.get('entityType') as string;
                    const count = record.get('count')?.toNumber() || 0;
                    entityTypeCounts[entityType] = count;
                }

                this.modelStats = {
                    totalRelationships: total,
                    relationshipTypeCounts,
                    entityTypeCounts,
                    averageScore: 0.5, // Will be calculated during evaluation
                    lastTrained: new Date(),
                };
            } finally {
                await session.close();
            }
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.warn({ error: errorObj }, '[HeteroGNNScorer] Failed to load model statistics:');
            this.modelStats = this.getDefaultStats();
        }
    }

    /**
     * Get default statistics when data is unavailable
     */
    private getDefaultStats(): ModelStatistics {
        return {
            totalRelationships: 0,
            relationshipTypeCounts: {
                [RelationType.APPLIES_TO]: 0,
                [RelationType.CONSTRAINS]: 0,
                [RelationType.DEFINED_IN]: 0,
                [RelationType.OVERRIDES]: 0,
                [RelationType.REFINES]: 0,
                [RelationType.LOCATED_IN]: 0,
                [RelationType.HAS_REQUIREMENT]: 0,
                [RelationType.RELATED_TO]: 0,
            },
            entityTypeCounts: {},
            averageScore: 0.5,
        };
    }

    /**
     * Get default score when scoring is disabled
     */
    private getDefaultScore(
        sourceId: string,
        targetId: string,
        relationType: RelationType
    ): RelationshipScore {
        return {
            sourceId,
            targetId,
            relationType,
            score: 0.5, // Default neutral score
            confidence: 0.0,
            factors: {
                frequency: 0.5,
                entityTypeCompatibility: 0.5,
                graphPattern: 0.5,
                temporalConsistency: 0.5,
            },
        };
    }

    /**
     * Get cache key for a relationship
     */
    private getCacheKey(
        sourceId: string,
        targetId: string,
        relationType: RelationType
    ): string {
        return `${sourceId}:${targetId}:${relationType}`;
    }

    /**
     * Clear the score cache
     */
    clearCache(): void {
        this.scoreCache.clear();
    }

    /**
     * Get model statistics
     */
    getModelStatistics(): ModelStatistics | null {
        return this.modelStats;
    }

    /**
     * Get configuration
     */
    getConfig(): HeteroGNNConfig {
        return { ...this.config };
    }
}
