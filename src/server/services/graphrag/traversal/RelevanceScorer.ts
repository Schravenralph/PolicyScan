import { BaseEntity } from '../../../domain/ontology.js';
import { WeightedNeighbor } from './WeightedTraversal.js';
import { VectorService } from '../../query/VectorService.js';

/**
 * Configuration for relevance scoring
 */
export interface RelevanceScoringConfig {
    queryEmbedding?: number[]; // Query embedding vector for similarity calculation
    threshold?: number; // Minimum relevance score threshold (default: 0.0)
    earlyTerminationThreshold?: number; // Stop traversal if relevance drops below this (default: 0.3)
    vectorWeight?: number; // Weight for vector similarity in relevance calculation (default: 0.7)
    graphWeight?: number; // Weight for graph structure in relevance calculation (default: 0.3)
}

/**
 * Relevance score result
 */
export interface RelevanceScore {
    score: number; // Overall relevance score [0, 1]
    vectorSimilarity?: number; // Vector similarity score [0, 1]
    graphRelevance?: number; // Graph structure relevance [0, 1]
    cumulativeRelevance?: number; // Cumulative relevance along path
}

/**
 * Service for calculating relevance scores during graph traversal
 * Combines vector similarity with graph structure for relevance-based path prioritization
 */
export class RelevanceScorer {
    private config: Required<Omit<RelevanceScoringConfig, 'queryEmbedding'>> & { queryEmbedding?: number[] };
    private vectorService?: VectorService; // Optional vector service for embedding similarity

    constructor(
        config: RelevanceScoringConfig = {},
        vectorService?: VectorService // Optional: inject VectorService for similarity calculation
    ) {
        this.config = {
            queryEmbedding: config.queryEmbedding,
            threshold: config.threshold ?? 0.0,
            earlyTerminationThreshold: config.earlyTerminationThreshold ?? 0.3,
            vectorWeight: config.vectorWeight ?? 0.7,
            graphWeight: config.graphWeight ?? 0.3,
        };

        // Validate weights sum to 1.0
        const sum = this.config.vectorWeight + this.config.graphWeight;
        if (Math.abs(sum - 1.0) > 0.001) {
            console.warn(`Relevance scorer weights sum to ${sum}, not 1.0. Normalizing...`);
            const factor = 1.0 / sum;
            this.config.vectorWeight *= factor;
            this.config.graphWeight *= factor;
        }

        this.vectorService = vectorService;
    }

    /**
     * Calculate relevance score for a node
     * @param nodeId The node ID
     * @param nodeEntity Optional entity object (if available)
     * @param pathRelevance Optional cumulative relevance along the path
     * @returns Relevance score
     */
    async calculateRelevance(
        nodeId: string,
        nodeEntity?: BaseEntity,
        pathRelevance?: number
    ): Promise<RelevanceScore> {
        let vectorSimilarity: number | undefined;

        // Calculate vector similarity if query embedding and vector service are available
        if (this.config.queryEmbedding && this.vectorService && nodeEntity) {
            try {
                vectorSimilarity = await this.calculateVectorSimilarity(nodeEntity);
            } catch (error) {
                console.warn(`[RelevanceScorer] Failed to calculate vector similarity for ${nodeId}:`, error);
            }
        }

        // Calculate graph structure relevance
        const graphRelevance = this.calculateGraphRelevance(nodeEntity);

        // Calculate overall relevance score
        let score = 0;
        if (vectorSimilarity !== undefined) {
            score += vectorSimilarity * this.config.vectorWeight;
        }
        if (graphRelevance !== undefined) {
            score += graphRelevance * this.config.graphWeight;
        }

        // If we only have one component, use it directly
        if (vectorSimilarity !== undefined && graphRelevance === undefined) {
            score = vectorSimilarity;
        } else if (graphRelevance !== undefined && vectorSimilarity === undefined) {
            score = graphRelevance;
        }

        // Apply path relevance decay if provided
        let cumulativeRelevance = score;
        if (pathRelevance !== undefined) {
            // Cumulative relevance decays slightly along the path
            cumulativeRelevance = pathRelevance * 0.9 + score * 0.1;
        }

        return {
            score: Math.max(0, Math.min(1, score)),
            vectorSimilarity,
            graphRelevance,
            cumulativeRelevance: Math.max(0, Math.min(1, cumulativeRelevance)),
        };
    }

    /**
     * Calculate relevance score for a weighted neighbor (edge + target node)
     * @param neighbor The weighted neighbor
     * @param targetEntity Optional target entity
     * @param pathRelevance Optional cumulative relevance along the path
     * @returns Relevance score
     */
    async calculateNeighborRelevance(
        neighbor: WeightedNeighbor,
        targetEntity?: BaseEntity,
        pathRelevance?: number
    ): Promise<RelevanceScore> {
        // Base relevance from the target node
        const nodeRelevance = await this.calculateRelevance(
            neighbor.targetId,
            targetEntity,
            pathRelevance
        );

        // Boost relevance by edge weight if available
        if (neighbor.weight > 0) {
            const edgeBoost = neighbor.weight * 0.2; // Edge weight contributes up to 20% boost
            nodeRelevance.score = Math.min(1.0, nodeRelevance.score + edgeBoost);
            if (nodeRelevance.cumulativeRelevance !== undefined) {
                nodeRelevance.cumulativeRelevance = Math.min(
                    1.0,
                    nodeRelevance.cumulativeRelevance + edgeBoost
                );
            }
        }

        return nodeRelevance;
    }

    /**
     * Calculate vector similarity between query embedding and entity
     */
    private async calculateVectorSimilarity(entity: BaseEntity): Promise<number> {
        if (!this.config.queryEmbedding || !this.vectorService) {
            return 0.5; // Default if no vector service
        }

        try {
            // Get entity embedding
            const entityText = entity.description || entity.name || '';
            if (!entityText) {
                return 0.3; // Low similarity if no text content
            }

            // Generate embedding for entity text
            const entityEmbedding = await this.vectorService.generateEmbedding(entityText);

            // Calculate cosine similarity
            return this.cosineSimilarity(this.config.queryEmbedding, entityEmbedding);
        } catch (error) {
            console.warn('[RelevanceScorer] Error calculating vector similarity:', error);
            return 0.5; // Default on error
        }
    }

    /**
     * Calculate graph structure relevance
     * Based on entity properties like name, description completeness, relationships
     */
    private calculateGraphRelevance(entity?: BaseEntity): number {
        if (!entity) {
            return 0.5; // Default if no entity
        }

        let score = 0;
        let factors = 0;

        // Name completeness
        if (entity.name && entity.name.trim().length > 0) {
            score += 0.3;
            factors++;
        }

        // Description completeness
        if (entity.description && entity.description.trim().length > 10) {
            score += 0.4;
            factors++;
        }

        // Type information
        if (entity.type) {
            score += 0.1;
            factors++;
        }

        // URI/Schema.org information
        if (entity.uri || entity.schemaType) {
            score += 0.2;
            factors++;
        }

        // Normalize by factors
        return factors > 0 ? score / factors : 0.5;
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Check if relevance score meets threshold for traversal
     */
    meetsThreshold(relevance: RelevanceScore): boolean {
        return relevance.score >= this.config.threshold;
    }

    /**
     * Check if relevance score indicates early termination
     */
    shouldTerminateEarly(relevance: RelevanceScore): boolean {
        if (relevance.cumulativeRelevance !== undefined) {
            return relevance.cumulativeRelevance < this.config.earlyTerminationThreshold;
        }
        return relevance.score < this.config.earlyTerminationThreshold;
    }

    /**
     * Rank paths by cumulative relevance
     */
    rankPathsByRelevance(paths: Array<{ path: string[]; relevance: RelevanceScore }>): Array<{ path: string[]; relevance: RelevanceScore }> {
        return paths.sort((a, b) => {
            const scoreA = a.relevance.cumulativeRelevance ?? a.relevance.score;
            const scoreB = b.relevance.cumulativeRelevance ?? b.relevance.score;
            return scoreB - scoreA; // Descending order (highest relevance first)
        });
    }
}

