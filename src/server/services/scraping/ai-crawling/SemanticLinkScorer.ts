/**
 * Semantic Link Scorer
 * Scores links based on semantic relevance to query/topic using embeddings
 */

import { LocalEmbeddingProvider } from '../../../services/query/VectorService.js';
import { logger } from '../../../utils/logger.js';

export interface LinkContext {
  url: string;
  linkText?: string;
  anchorText?: string;
  surroundingText?: string;
  sourceUrl?: string;
  pageTitle?: string;
}

export interface SemanticScore {
  relevanceScore: number; // 0-1, semantic similarity to query
  policyDocumentScore: number; // 0-1, likelihood of being a policy document
  entityMatchScore: number; // 0-1, match with KG entities
  combinedScore: number; // Weighted combination of all scores
}

export interface ScoringOptions {
  queryText?: string;
  queryEmbedding?: number[];
  entityNames?: string[];
  policyKeywords?: string[];
  weights?: {
    relevance?: number;
    policyDocument?: number;
    entityMatch?: number;
  };
}

/**
 * Service for scoring links based on semantic relevance
 */
export class SemanticLinkScorer {
  private embeddingProvider: LocalEmbeddingProvider;
  private defaultWeights = {
    relevance: 0.5,
    policyDocument: 0.3,
    entityMatch: 0.2,
  };

  // Keywords that indicate policy documents
  private policyKeywords = [
    'beleid',
    'regeling',
    'verordening',
    'besluit',
    'wet',
    'nota',
    'plan',
    'richtlijn',
    'protocol',
    'handreiking',
    'kader',
    'strategie',
    'visie',
  ];

  constructor(embeddingProvider?: LocalEmbeddingProvider) {
    this.embeddingProvider = embeddingProvider || new LocalEmbeddingProvider();
  }

  /**
   * Score a link based on semantic relevance
   */
  async scoreLink(
    link: LinkContext,
    options: ScoringOptions = {}
  ): Promise<SemanticScore> {
    const {
      queryText,
      queryEmbedding,
      entityNames = [],
      policyKeywords: customPolicyKeywords = [],
      weights = {},
    } = options;

    const finalWeights = { ...this.defaultWeights, ...weights };

    // 1. Semantic relevance score (query similarity)
    const relevanceScore = await this.calculateRelevanceScore(
      link,
      queryText,
      queryEmbedding
    );

    // 2. Policy document score (keyword-based)
    const policyDocumentScore = this.calculatePolicyDocumentScore(
      link,
      [...this.policyKeywords, ...customPolicyKeywords]
    );

    // 3. Entity match score (KG entity matching)
    const entityMatchScore = this.calculateEntityMatchScore(link, entityNames);

    // 4. Combined weighted score
    const combinedScore =
      relevanceScore * finalWeights.relevance +
      policyDocumentScore * finalWeights.policyDocument +
      entityMatchScore * finalWeights.entityMatch;

    return {
      relevanceScore,
      policyDocumentScore,
      entityMatchScore,
      combinedScore,
    };
  }

  /**
   * Calculate semantic relevance score using embeddings
   */
  private async calculateRelevanceScore(
    link: LinkContext,
    queryText?: string,
    queryEmbedding?: number[]
  ): Promise<number> {
    if (!queryText && !queryEmbedding) {
      return 0.5; // Default neutral score if no query
    }

    try {
      // Build text representation of link
      const linkText = [
        link.linkText,
        link.anchorText,
        link.pageTitle,
        link.url,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!linkText) {
        return 0.3; // Low score if no text available
      }

      // Get query embedding if not provided
      let queryVec = queryEmbedding;
      if (!queryVec && queryText) {
        queryVec = await this.embeddingProvider.generateEmbedding(queryText);
      }

      if (!queryVec) {
        return 0.5;
      }

      // Get link embedding
      const linkVec = await this.embeddingProvider.generateEmbedding(linkText);

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(queryVec, linkVec);

      // Normalize to 0-1 range (cosine similarity is already -1 to 1)
      return (similarity + 1) / 2;
    } catch (error) {
      logger.warn(`[SemanticLinkScorer] Error calculating relevance: ${error}`);
      return 0.3; // Default low score on error
    }
  }

  /**
   * Calculate policy document score based on keywords
   */
  private calculatePolicyDocumentScore(
    link: LinkContext,
    keywords: string[]
  ): number {
    const text = [
      link.url,
      link.linkText,
      link.anchorText,
      link.pageTitle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!text) {
      return 0.2;
    }

    // Count keyword matches
    let matches = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    // Score based on number of matches (normalized)
    const maxPossibleMatches = Math.min(keywords.length, 5); // Cap at 5 for normalization
    return Math.min(matches / maxPossibleMatches, 1.0);
  }

  /**
   * Calculate entity match score based on KG entities
   */
  private calculateEntityMatchScore(
    link: LinkContext,
    entityNames: string[]
  ): number {
    if (entityNames.length === 0) {
      return 0.3; // Neutral score if no entities
    }

    const text = [
      link.url,
      link.linkText,
      link.anchorText,
      link.pageTitle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!text) {
      return 0.2;
    }

    // Check for entity name matches
    let matches = 0;
    for (const entityName of entityNames) {
      const normalizedEntity = entityName.toLowerCase();
      if (text.includes(normalizedEntity)) {
        matches++;
      }
    }

    // Score based on entity matches
    return Math.min(matches / entityNames.length, 1.0);
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Batch score multiple links
   */
  async scoreLinks(
    links: LinkContext[],
    options: ScoringOptions = {}
  ): Promise<Map<string, SemanticScore>> {
    const scores = new Map<string, SemanticScore>();

    // Score links in parallel (with concurrency limit)
    const batchSize = 10;
    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize);
      const batchScores = await Promise.all(
        batch.map(link => this.scoreLink(link, options))
      );

      batch.forEach((link, index) => {
        scores.set(link.url, batchScores[index]);
      });
    }

    return scores;
  }
}

