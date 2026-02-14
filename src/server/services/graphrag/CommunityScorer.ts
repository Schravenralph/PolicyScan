/**
 * Community Scorer
 * 
 * Scores communities (clusters) for query relevance.
 * Used by CommunityBasedRetrievalService to select relevant communities.
 */

import { VectorService } from '../query/VectorService.js';
import { ClusterNode, MetaGraph } from '../graphs/navigation/GraphClusteringService.js';
import { logger } from '../../utils/logger.js';

/**
 * Community relevance score
 */
export interface CommunityScore {
    clusterId: string;
    cluster: ClusterNode;
    relevanceScore: number;
    scoringMethod: 'semantic' | 'keyword' | 'hybrid';
    details?: {
        semanticScore?: number;
        keywordScore?: number;
        labelMatch?: boolean;
    };
}

/**
 * Community scoring options
 */
export interface CommunityScoringOptions {
    minRelevanceThreshold?: number; // Default: 0.3
    topK?: number; // Default: 10
    useSemanticScoring?: boolean; // Default: true
    useKeywordScoring?: boolean; // Default: true
}

/**
 * Community Scorer
 * 
 * Scores communities for query relevance using semantic similarity and keyword matching
 */
export class CommunityScorer {
    private vectorService: VectorService;

    constructor(vectorService: VectorService) {
        this.vectorService = vectorService;
    }

    /**
     * Score all communities for query relevance
     * 
     * @param query Natural language query
     * @param metaGraph Meta-graph with communities
     * @param options Scoring options
     * @returns Scored communities sorted by relevance
     */
    async scoreCommunities(
        query: string,
        metaGraph: MetaGraph,
        options: CommunityScoringOptions = {}
    ): Promise<CommunityScore[]> {
        const {
            minRelevanceThreshold = 0.3,
            topK = 10,
            useSemanticScoring = true,
            useKeywordScoring = true,
        } = options;

        const scores: CommunityScore[] = [];

        // Generate query embedding for semantic scoring
        let queryEmbedding: number[] | undefined;
        if (useSemanticScoring) {
            try {
                queryEmbedding = await this.vectorService.generateEmbedding(query);
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                logger.warn({
                    error: errorObj
                }, '[CommunityScorer] Failed to generate query embedding, falling back to keyword scoring:');
            }
        }

        // Score each community
        for (const [_clusterId, cluster] of Object.entries(metaGraph.clusters)) {
            const score = await this.scoreCommunity(
                query,
                cluster,
                queryEmbedding,
                { useSemanticScoring, useKeywordScoring }
            );

            if (score.relevanceScore >= minRelevanceThreshold) {
                scores.push(score);
            }
        }

        // Sort by relevance score (descending)
        scores.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Return top-k
        return scores.slice(0, topK);
    }

    /**
     * Score a single community for query relevance
     * 
     * @param query Natural language query
     * @param cluster Community cluster
     * @param queryEmbedding Optional query embedding (for semantic scoring)
     * @param options Scoring options
     * @returns Community score
     */
    private async scoreCommunity(
        query: string,
        cluster: ClusterNode,
        queryEmbedding: number[] | undefined,
        options: { useSemanticScoring: boolean; useKeywordScoring: boolean }
    ): Promise<CommunityScore> {
        const { useSemanticScoring, useKeywordScoring } = options;
        const details: CommunityScore['details'] = {};
        let relevanceScore = 0;
        let scoringMethod: 'semantic' | 'keyword' | 'hybrid' = 'keyword';

        // Semantic scoring (if embedding available)
        let semanticScore = 0;
        if (useSemanticScoring && queryEmbedding) {
            try {
                // Generate embedding for cluster label
                const clusterLabel = cluster.label || cluster.urlPattern;
                const clusterEmbedding = await this.vectorService.generateEmbedding(clusterLabel);

                // Calculate cosine similarity
                semanticScore = this.cosineSimilarity(queryEmbedding, clusterEmbedding);
                details.semanticScore = semanticScore;
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                logger.warn({ 
                    error: errorObj
                }, `[CommunityScorer] Failed to score cluster ${cluster.id} semantically:`);
            }
        }

        // Keyword scoring
        let keywordScore = 0;
        if (useKeywordScoring) {
            keywordScore = this.calculateKeywordScore(query, cluster);
            details.keywordScore = keywordScore;
            details.labelMatch = keywordScore > 0;
        }

        // Combine scores
        if (useSemanticScoring && useKeywordScoring && semanticScore > 0) {
            // Hybrid: weighted average (70% semantic, 30% keyword)
            relevanceScore = 0.7 * semanticScore + 0.3 * keywordScore;
            scoringMethod = 'hybrid';
        } else if (useSemanticScoring && semanticScore > 0) {
            // Semantic only
            relevanceScore = semanticScore;
            scoringMethod = 'semantic';
        } else {
            // Keyword only
            relevanceScore = keywordScore;
            scoringMethod = 'keyword';
        }

        return {
            clusterId: cluster.id,
            cluster,
            relevanceScore,
            scoringMethod,
            details,
        };
    }

    /**
     * Calculate keyword-based relevance score
     * 
     * @param query Query text
     * @param cluster Community cluster
     * @returns Keyword relevance score (0-1)
     */
    private calculateKeywordScore(query: string, cluster: ClusterNode): number {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        
        // Score based on cluster label
        const label = (cluster.label || '').toLowerCase();
        let score = 0;

        // Exact label match
        if (label.includes(queryLower) || queryLower.includes(label)) {
            score = 1.0;
        } else {
            // Word overlap
            const labelWords = label.split(/\s+/).filter(w => w.length > 2);
            const matchingWords = queryWords.filter(qw => 
                labelWords.some(lw => lw.includes(qw) || qw.includes(lw))
            );
            
            if (matchingWords.length > 0) {
                score = matchingWords.length / Math.max(queryWords.length, labelWords.length);
            }
        }

        // Boost score based on cluster size (larger clusters might be more relevant)
        const sizeBoost = Math.min(cluster.nodeCount / 100, 0.2); // Max 0.2 boost
        score = Math.min(score + sizeBoost, 1.0);

        return score;
    }

    /**
     * Calculate cosine similarity between two vectors
     * 
     * @param a First vector
     * @param b Second vector
     * @returns Cosine similarity (0-1)
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
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
            return 0;
        }

        return dotProduct / denominator;
    }
}

