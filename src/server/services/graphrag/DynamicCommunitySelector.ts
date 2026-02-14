import { KnowledgeClusterNode, KnowledgeMetaGraph } from '../knowledge-graph/clustering/KnowledgeGraphClusteringService.js';
import { HierarchicalCommunityDetector, HierarchicalStructure, HierarchicalCommunity } from './HierarchicalCommunityDetector.js';
import { LocalEmbeddingProvider } from '../query/VectorService.js';
import { logger } from '../../utils/logger.js';

/**
 * Scored community for query relevance
 */
export interface ScoredCommunity {
  community: HierarchicalCommunity | KnowledgeClusterNode;
  score: number;
  reasons: string[];
}

/**
 * Options for dynamic community selection
 */
export interface DynamicSelectionOptions {
  maxCommunities?: number;
  minScore?: number;
  useHierarchy?: boolean;
  pruneEarly?: boolean;
}

/**
 * Service for dynamically selecting relevant communities based on query
 * Scores communities by query relevance and prunes low-scoring ones
 */
export class DynamicCommunitySelector {
  private hierarchicalDetector?: HierarchicalCommunityDetector;
  private embeddingProvider: LocalEmbeddingProvider;

  constructor(
    embeddingProvider: LocalEmbeddingProvider,
    hierarchicalDetector?: HierarchicalCommunityDetector
  ) {
    this.embeddingProvider = embeddingProvider;
    this.hierarchicalDetector = hierarchicalDetector;
  }

  /**
   * Select relevant communities for a query
   */
  async selectCommunities(
    query: string,
    metaGraph: KnowledgeMetaGraph,
    options: DynamicSelectionOptions = {}
  ): Promise<ScoredCommunity[]> {
    const {
      maxCommunities = 10,
      minScore = 0.3,
      useHierarchy = false,
      pruneEarly = true,
    } = options;

    logger.info(`[DynamicSelector] Selecting communities for query: "${query}"`);

    // Generate query embedding for semantic similarity
    const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
    const queryKeywords = this.extractKeywords(query);

    let scoredCommunities: ScoredCommunity[] = [];

    if (useHierarchy && this.hierarchicalDetector) {
      // Use hierarchical structure
      const hierarchy = await this.hierarchicalDetector.detectHierarchy(metaGraph);
      scoredCommunities = await this.scoreHierarchicalCommunities(
        query,
        queryEmbedding,
        queryKeywords,
        hierarchy
      );
    } else {
      // Score flat clusters
      scoredCommunities = await this.scoreClusters(
        query,
        queryEmbedding,
        queryKeywords,
        metaGraph.clusters
      );
    }

    // Sort by score (descending)
    scoredCommunities.sort((a, b) => b.score - a.score);

    // Prune low-scoring communities
    if (pruneEarly) {
      scoredCommunities = scoredCommunities.filter(sc => sc.score >= minScore);
    }

    // Limit to max communities
    if (scoredCommunities.length > maxCommunities) {
      scoredCommunities = scoredCommunities.slice(0, maxCommunities);
    }

    logger.info(`[DynamicSelector] Selected ${scoredCommunities.length} communities (scores: ${scoredCommunities.map(sc => sc.score.toFixed(2)).join(', ')})`);

    return scoredCommunities;
  }

  /**
   * Score hierarchical communities
   */
  private async scoreHierarchicalCommunities(
    query: string,
    queryEmbedding: number[],
    queryKeywords: string[],
    hierarchy: HierarchicalStructure
  ): Promise<ScoredCommunity[]> {
    const scored: ScoredCommunity[] = [];

    for (const community of Object.values(hierarchy.communities)) {
      const score = await this.scoreCommunity(
        query,
        queryEmbedding,
        queryKeywords,
        community.label,
        community.entityCount
      );

      if (score.score > 0) {
        scored.push({
          community,
          score: score.score,
          reasons: score.reasons,
        });
      }
    }

    return scored;
  }

  /**
   * Score flat clusters
   */
  private async scoreClusters(
    query: string,
    queryEmbedding: number[],
    queryKeywords: string[],
    clusters: { [id: string]: KnowledgeClusterNode }
  ): Promise<ScoredCommunity[]> {
    const scored: ScoredCommunity[] = [];

    for (const cluster of Object.values(clusters)) {
      const score = await this.scoreCommunity(
        query,
        queryEmbedding,
        queryKeywords,
        cluster.label,
        cluster.nodeCount
      );

      if (score.score > 0) {
        scored.push({
          community: cluster,
          score: score.score,
          reasons: score.reasons,
        });
      }
    }

    return scored;
  }

  /**
   * Score a single community based on query
   */
  private async scoreCommunity(
    _query: string,
    queryEmbedding: number[],
    queryKeywords: string[],
    label: string,
    entityCount: number
  ): Promise<{ score: number; reasons: string[] }> {
    const reasons: string[] = [];
    let score = 0;

    // 1. Label keyword matching (0.4 weight)
    const labelLower = label.toLowerCase();
    const keywordMatches = queryKeywords.filter(kw => labelLower.includes(kw.toLowerCase()));
    if (keywordMatches.length > 0) {
      const keywordScore = Math.min(keywordMatches.length / queryKeywords.length, 1) * 0.4;
      score += keywordScore;
      reasons.push(`Keyword match: ${keywordMatches.join(', ')}`);
    }

    // 2. Semantic similarity (0.4 weight)
    try {
      const labelEmbedding = await this.embeddingProvider.generateEmbedding(label);
      const similarity = this.cosineSimilarity(queryEmbedding, labelEmbedding);
      const semanticScore = similarity * 0.4;
      score += semanticScore;
      if (similarity > 0.5) {
        reasons.push(`Semantic similarity: ${(similarity * 100).toFixed(1)}%`);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.warn({ 
        error: errorObj
      }, `[DynamicSelector] Failed to generate embedding for label: ${label}`);
    }

    // 3. Entity count boost (0.2 weight) - prefer larger communities
    const sizeScore = Math.min(entityCount / 100, 1) * 0.2;
    score += sizeScore;
    if (entityCount > 50) {
      reasons.push(`Large community: ${entityCount} entities`);
    }

    return { score: Math.min(score, 1), reasons };
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(query: string): string[] {
    // Simple keyword extraction - filter out stop words
    const stopWords = new Set(['de', 'het', 'een', 'en', 'van', 'in', 'op', 'voor', 'met', 'aan', 'is', 'zijn', 'was', 'waren']);
    
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Aggregate results across selected communities
   */
  aggregateResults<T>(
    communities: ScoredCommunity[],
    getResults: (community: HierarchicalCommunity | KnowledgeClusterNode) => Promise<T[]>
  ): Promise<T[]> {
    return Promise.all(
      communities.map(sc => getResults(sc.community))
    ).then(results => results.flat());
  }
}

