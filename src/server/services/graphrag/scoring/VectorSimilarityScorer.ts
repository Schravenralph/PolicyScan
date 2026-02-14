import { VectorService } from '../../query/VectorService.js';

/**
 * Configuration for vector similarity scoring
 */
export interface VectorSimilarityConfig {
    normalizeToUnitRange: boolean;  // Normalize scores to [0, 1] range
    minScore: number;               // Minimum score threshold (default: 0)
    maxScore: number;               // Maximum score threshold (default: 1)
}

/**
 * Vector similarity scoring result
 */
export interface VectorSimilarityResult {
    rawScore: number;              // Raw cosine similarity [-1, 1]
    normalizedScore: number;       // Normalized score [0, 1]
    explanation?: string;           // Explanation of the score
}

/**
 * Service for calculating vector similarity scores
 * Handles cosine similarity normalization and scoring
 */
export class VectorSimilarityScorer {
    private config: VectorSimilarityConfig;
    private vectorService: VectorService;

    constructor(
        vectorService: VectorService,
        config: Partial<VectorSimilarityConfig> = {}
    ) {
        this.vectorService = vectorService;
        this.config = {
            normalizeToUnitRange: config.normalizeToUnitRange ?? true,
            minScore: config.minScore ?? 0,
            maxScore: config.maxScore ?? 1,
        };
    }

    /**
     * Calculate vector similarity score from pre-computed cosine similarity
     * @param cosineSimilarity Raw cosine similarity score [-1, 1]
     * @returns Normalized similarity result
     */
    calculateFromCosineSimilarity(cosineSimilarity: number): VectorSimilarityResult {
        // Cosine similarity is already in [-1, 1] range
        // Normalize to [0, 1] for scoring
        let normalizedScore: number;

        if (this.config.normalizeToUnitRange) {
            // Normalize: (cosine + 1) / 2 maps [-1, 1] to [0, 1]
            normalizedScore = (cosineSimilarity + 1) / 2;
        } else {
            // Use raw score, but clamp to [0, 1]
            normalizedScore = Math.max(0, Math.min(1, cosineSimilarity));
        }

        // Apply min/max thresholds
        if (normalizedScore < this.config.minScore) {
            normalizedScore = this.config.minScore;
        }
        if (normalizedScore > this.config.maxScore) {
            normalizedScore = this.config.maxScore;
        }

        // Generate explanation
        const explanation = this.generateExplanation(cosineSimilarity, normalizedScore);

        return {
            rawScore: cosineSimilarity,
            normalizedScore,
            explanation,
        };
    }

    /**
     * Calculate vector similarity by comparing query and document embeddings
     * @param queryEmbedding Query embedding vector
     * @param documentEmbedding Document embedding vector
     * @returns Normalized similarity result
     */
    async calculateFromEmbeddings(
        queryEmbedding: number[],
        documentEmbedding: number[]
    ): Promise<VectorSimilarityResult> {
        // Calculate cosine similarity
        const cosineSimilarity = this.cosineSimilarity(queryEmbedding, documentEmbedding);

        return this.calculateFromCosineSimilarity(cosineSimilarity);
    }

    /**
     * Calculate vector similarity from query text and document embedding
     * @param queryText Query text
     * @param documentEmbedding Document embedding vector
     * @returns Normalized similarity result
     */
    async calculateFromQueryText(
        queryText: string,
        documentEmbedding: number[]
    ): Promise<VectorSimilarityResult> {
        // Generate query embedding
        const queryEmbedding = await this.vectorService.generateEmbedding(queryText);

        return this.calculateFromEmbeddings(queryEmbedding, documentEmbedding);
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param a First vector
     * @param b Second vector
     * @returns Cosine similarity [-1, 1]
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0; // Avoid division by zero
        }

        return dotProduct / denominator;
    }

    /**
     * Generate human-readable explanation of the score
     */
    private generateExplanation(_rawScore: number, normalizedScore: number): string {
        if (normalizedScore >= 0.8) {
            return 'Very high semantic similarity';
        } else if (normalizedScore >= 0.6) {
            return 'High semantic similarity';
        } else if (normalizedScore >= 0.4) {
            return 'Moderate semantic similarity';
        } else if (normalizedScore >= 0.2) {
            return 'Low semantic similarity';
        } else {
            return 'Very low semantic similarity';
        }
    }

    /**
     * Batch calculate similarities for multiple documents
     * @param queryEmbedding Query embedding vector
     * @param documentEmbeddings Array of document embedding vectors
     * @returns Array of similarity results
     */
    async calculateBatch(
        queryEmbedding: number[],
        documentEmbeddings: number[][]
    ): Promise<VectorSimilarityResult[]> {
        return Promise.all(
            documentEmbeddings.map(embedding =>
                this.calculateFromEmbeddings(queryEmbedding, embedding)
            )
        );
    }
}

