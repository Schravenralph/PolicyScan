import { BaseEntity } from '../../domain/ontology.js';
import { KGConfidenceScorer, KGConfidenceFactors, EntityScoringMetadata } from './scoring/KGConfidenceScorer.js';
import { VectorSimilarityScorer, VectorSimilarityResult } from './scoring/VectorSimilarityScorer.js';
import { VectorService } from '../query/VectorService.js';
import { KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';

/**
 * Configuration for hybrid scoring
 */
export interface HybridScoringConfig {
    kgWeight: number;        // Weight for KG confidence score (default: 0.6)
    vectorWeight: number;    // Weight for vector similarity score (default: 0.4)
    enableExplainability: boolean; // Include score breakdowns (default: true)
}

/**
 * Hybrid scoring result with breakdown
 */
export interface HybridScoreResult {
    kgScore: number;                    // KG confidence score [0, 1]
    vectorScore: number;                // Vector similarity score [0, 1]
    finalScore: number;                 // Weighted hybrid score [0, 1]
    kgFactors?: KGConfidenceFactors;    // KG confidence breakdown
    vectorResult?: VectorSimilarityResult; // Vector similarity details
    explanation?: string;                // Human-readable explanation
}

/**
 * Input for hybrid scoring
 */
export interface HybridScoringInput {
    entity?: BaseEntity;                 // Knowledge graph entity
    entityMetadata?: EntityScoringMetadata; // Entity metadata for KG scoring
    vectorSimilarity?: number;           // Pre-computed vector similarity (cosine)
    queryEmbedding?: number[];          // Query embedding (if vector similarity not provided)
    documentEmbedding?: number[];       // Document embedding (if vector similarity not provided)
    queryText?: string;                 // Query text (alternative to embeddings)
}

/**
 * Service for hybrid scoring that combines KG confidence with vector similarity
 * Implements the GraphRAG pattern: combines structured facts with contextual information
 */
export class HybridScorer {
    private config: HybridScoringConfig;
    private kgScorer: KGConfidenceScorer;
    private vectorScorer: VectorSimilarityScorer;

    constructor(
        vectorService: VectorService,
        config: Partial<HybridScoringConfig> = {},
        kgService?: KnowledgeGraphService
    ) {
        this.config = {
            kgWeight: config.kgWeight ?? 0.6,
            vectorWeight: config.vectorWeight ?? 0.4,
            enableExplainability: config.enableExplainability ?? true,
        };

        // Validate weights sum to 1.0
        const sum = this.config.kgWeight + this.config.vectorWeight;
        if (Math.abs(sum - 1.0) > 0.001) {
            console.warn(`Hybrid scoring weights sum to ${sum}, not 1.0. Normalizing...`);
            const factor = 1.0 / sum;
            this.config.kgWeight *= factor;
            this.config.vectorWeight *= factor;
        }

        // Initialize scorers (pass KG service for HeteroGNN integration)
        this.kgScorer = new KGConfidenceScorer({}, kgService);
        this.vectorScorer = new VectorSimilarityScorer(vectorService);
    }

    /**
     * Calculate hybrid score for a result
     * @param input Scoring input with entity and/or vector information
     * @returns Hybrid score result with breakdown
     */
    async calculateScore(input: HybridScoringInput): Promise<HybridScoreResult> {
        // Calculate KG confidence score
        let kgScore = 0;
        let kgFactors: KGConfidenceFactors | undefined;

        if (input.entity) {
            kgFactors = await this.kgScorer.calculateConfidence(
                input.entity,
                input.entityMetadata
            );
            kgScore = kgFactors.finalScore;
        }

        // Calculate vector similarity score
        let vectorScore = 0;
        let vectorResult: VectorSimilarityResult | undefined;

        if (input.vectorSimilarity !== undefined) {
            // Use pre-computed similarity
            vectorResult = this.vectorScorer.calculateFromCosineSimilarity(input.vectorSimilarity);
            vectorScore = vectorResult.normalizedScore;
        } else if (input.queryEmbedding && input.documentEmbedding) {
            // Calculate from embeddings
            vectorResult = await this.vectorScorer.calculateFromEmbeddings(
                input.queryEmbedding,
                input.documentEmbedding
            );
            vectorScore = vectorResult.normalizedScore;
        } else if (input.queryText && input.documentEmbedding) {
            // Calculate from query text and document embedding
            vectorResult = await this.vectorScorer.calculateFromQueryText(
                input.queryText,
                input.documentEmbedding
            );
            vectorScore = vectorResult.normalizedScore;
        }

        // Calculate weighted hybrid score
        const finalScore =
            kgScore * this.config.kgWeight +
            vectorScore * this.config.vectorWeight;

        // Generate explanation if enabled
        const explanation = this.config.enableExplainability
            ? this.generateExplanation(kgScore, vectorScore, finalScore, input.entity !== undefined)
            : undefined;

        return {
            kgScore,
            vectorScore,
            finalScore: Math.max(0, Math.min(1, finalScore)), // Clamp to [0, 1]
            kgFactors: this.config.enableExplainability ? kgFactors : undefined,
            vectorResult: this.config.enableExplainability ? vectorResult : undefined,
            explanation,
        };
    }

    /**
     * Score and rank multiple results
     * @param inputs Array of scoring inputs
     * @returns Array of scored results, sorted by final score (descending)
     */
    async scoreAndRank(inputs: HybridScoringInput[]): Promise<Array<HybridScoreResult & { input: HybridScoringInput }>> {
        // Calculate scores for all inputs
        const scoredResults = await Promise.all(
            inputs.map(async (input) => {
                const score = await this.calculateScore(input);
                return { ...score, input };
            })
        );

        // Sort by final score (descending)
        scoredResults.sort((a, b) => b.finalScore - a.finalScore);

        return scoredResults;
    }

    /**
     * Generate human-readable explanation of the score
     */
    private generateExplanation(
        kgScore: number,
        vectorScore: number,
        finalScore: number,
        hasEntity: boolean
    ): string {
        const parts: string[] = [];

        if (hasEntity) {
            if (kgScore >= 0.7) {
                parts.push('High KG confidence');
            } else if (kgScore >= 0.4) {
                parts.push('Moderate KG confidence');
            } else {
                parts.push('Low KG confidence');
            }
        } else {
            parts.push('No KG entity');
        }

        if (vectorScore >= 0.7) {
            parts.push('high semantic similarity');
        } else if (vectorScore >= 0.4) {
            parts.push('moderate semantic similarity');
        } else {
            parts.push('low semantic similarity');
        }

        if (finalScore >= 0.7) {
            parts.push('Overall: highly relevant');
        } else if (finalScore >= 0.4) {
            parts.push('Overall: moderately relevant');
        } else {
            parts.push('Overall: low relevance');
        }

        return parts.join('. ') + '.';
    }

    /**
     * Update scoring configuration
     */
    updateConfig(config: Partial<HybridScoringConfig>): void {
        if (config.kgWeight !== undefined) {
            this.config.kgWeight = config.kgWeight;
        }
        if (config.vectorWeight !== undefined) {
            this.config.vectorWeight = config.vectorWeight;
        }
        if (config.enableExplainability !== undefined) {
            this.config.enableExplainability = config.enableExplainability;
        }

        // Re-normalize weights
        const sum = this.config.kgWeight + this.config.vectorWeight;
        if (Math.abs(sum - 1.0) > 0.001) {
            const factor = 1.0 / sum;
            this.config.kgWeight *= factor;
            this.config.vectorWeight *= factor;
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): HybridScoringConfig {
        return { ...this.config };
    }
}

