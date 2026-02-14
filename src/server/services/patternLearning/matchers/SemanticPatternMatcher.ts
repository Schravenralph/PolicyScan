/**
 * SemanticPatternMatcher - Semantic pattern matching implementation
 * 
 * Focuses on semantic similarity using vector embeddings:
 * - Error message semantic similarity
 * - Context embedding for intent understanding
 * - URL pattern matching (fallback to structural)
 * 
 * This matcher prioritizes semantic understanding over exact structural matches.
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import { BasePatternMatcher } from './PatternMatcher.js';
import { LearnedPattern, NavigationContext, RankedPattern } from '../types.js';
import { LocalEmbeddingProvider, EmbeddingProvider } from '../../query/VectorService.js';

/**
 * Semantic pattern matcher for navigation patterns
 * 
 * Uses vector embeddings to understand semantic similarity between
 * navigation contexts and learned patterns, enabling intent-based matching.
 */
export class SemanticPatternMatcher extends BasePatternMatcher {
  /**
   * Embedding provider for generating vector embeddings
   */
  private embeddingProvider: EmbeddingProvider;

  /**
   * Default weights for semantic matching
   * Higher weight on semantic similarity
   */
  private readonly defaultWeights = {
    url: 0.2,
    error: 0.1,
    semantic: 0.7,
  };

  /**
   * Minimum score threshold for considering a pattern match
   */
  private readonly minScoreThreshold = 0.3;

  /**
   * Cache for embeddings to avoid recomputing
   */
  private embeddingCache: Map<string, number[]> = new Map();

  /**
   * Maximum cache size to prevent memory issues
   */
  private readonly maxCacheSize = 1000;

  /**
   * Constructor
   * 
   * @param embeddingProvider - Optional embedding provider (defaults to LocalEmbeddingProvider)
   */
  constructor(embeddingProvider?: EmbeddingProvider) {
    super();
    this.embeddingProvider = embeddingProvider || new LocalEmbeddingProvider();
  }

  /**
   * Rank patterns based on semantic similarity to the navigation context.
   * 
   * @param patterns - Array of learned patterns to rank
   * @param context - Navigation context to match against
   * @returns Array of ranked patterns, sorted by score (highest first)
   */
  async rankPatterns(
    patterns: LearnedPattern[],
    context: NavigationContext
  ): Promise<RankedPattern[]> {
    if (patterns.length === 0) {
      return [];
    }

    // Build context text for embedding
    const contextText = this.buildContextText(context);

    // Generate embedding for context (with caching)
    const contextEmbedding = await this.getEmbedding(contextText);

    // Calculate similarity scores for each pattern
    const rankedPatterns: RankedPattern[] = await Promise.all(
      patterns.map(async (pattern) => {
        // Calculate URL similarity (structural fallback)
        const urlSimilarity = this.calculateUrlSimilarity(
          context.url,
          pattern.context.urlPattern
        );

        // Calculate error similarity (structural fallback)
        const errorSimilarity = this.calculateErrorSimilarity(
          context.errorMessage,
          pattern.context.errorMessage
        );

        // Calculate semantic similarity using embeddings
        const semanticSimilarity = await this.calculateSemanticSimilarity(
          contextEmbedding,
          contextText,
          pattern
        );

        // Combine scores with semantic weights
        const score = this.combineScores(
          {
            urlSimilarity,
            errorSimilarity,
            semanticSimilarity,
          },
          this.defaultWeights
        );

        // Get pattern confidence
        const confidence = this.getPatternConfidence(pattern);

        return {
          pattern,
          score,
          matchDetails: {
            urlSimilarity,
            errorSimilarity,
            semanticSimilarity,
          },
          confidence,
        };
      })
    );

    // Filter by minimum score threshold
    const filtered = this.filterByMinScore(rankedPatterns, this.minScoreThreshold);

    // Sort by score (highest first)
    return this.sortByScore(filtered);
  }

  /**
   * Build context text for embedding generation.
   * Combines URL, error message, and error type into a single text.
   * 
   * @param context - Navigation context
   * @returns Combined context text
   */
  private buildContextText(context: NavigationContext): string {
    const parts: string[] = [];

    // Add URL (domain and path)
    if (context.url) {
      try {
        const urlObj = new URL(context.url);
        parts.push(`URL: ${urlObj.hostname}${urlObj.pathname}`);
      } catch {
        parts.push(`URL: ${context.url}`);
      }
    }

    // Add error type
    if (context.errorType) {
      parts.push(`Error type: ${context.errorType}`);
    }

    // Add error message (most important for semantic matching)
    if (context.errorMessage) {
      parts.push(`Error: ${context.errorMessage}`);
    }

    // Add page title if available
    if (context.pageStructure?.title) {
      parts.push(`Page: ${context.pageStructure.title}`);
    }

    return parts.join('. ');
  }

  /**
   * Get embedding for text, using cache if available.
   * 
   * @param text - Text to embed
   * @returns Embedding vector
   */
  private async getEmbedding(text: string): Promise<number[]> {
    // Check cache first
    if (this.embeddingCache.has(text)) {
      return this.embeddingCache.get(text)!;
    }

    // Generate embedding
    const embedding = await this.embeddingProvider.generateEmbedding(text);

    // Cache the embedding (with size limit)
    if (this.embeddingCache.size >= this.maxCacheSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(text, embedding);

    return embedding;
  }

  /**
   * Calculate semantic similarity between context and pattern using embeddings.
   * 
   * @param contextEmbedding - Embedding vector for context
   * @param contextText - Original context text (for pattern embedding)
   * @param pattern - Learned pattern to compare against
   * @returns Semantic similarity score between 0 and 1
   */
  private async calculateSemanticSimilarity(
    contextEmbedding: number[],
    contextText: string,
    pattern: LearnedPattern
  ): Promise<number> {
    // Build pattern context text
    const patternText = this.buildPatternText(pattern);

    // Get pattern embedding
    const patternEmbedding = await this.getEmbedding(patternText);

    // Calculate cosine similarity
    return this.cosineSimilarity(contextEmbedding, patternEmbedding);
  }

  /**
   * Build pattern text for embedding generation.
   * 
   * @param pattern - Learned pattern
   * @returns Pattern context text
   */
  private buildPatternText(pattern: LearnedPattern): string {
    const parts: string[] = [];

    // Add domain
    if (pattern.context.domain) {
      parts.push(`Domain: ${pattern.context.domain}`);
    }

    // Add URL pattern
    if (pattern.context.urlPattern) {
      parts.push(`URL pattern: ${pattern.context.urlPattern}`);
    }

    // Add error type
    if (pattern.context.errorType) {
      parts.push(`Error type: ${pattern.context.errorType}`);
    }

    // Add error message (most important for semantic matching)
    if (pattern.context.errorMessage) {
      parts.push(`Error: ${pattern.context.errorMessage}`);
    }

    // Add pattern type and pattern itself
    parts.push(`Pattern (${pattern.patternType}): ${pattern.pattern}`);

    return parts.join('. ');
  }

  /**
   * Calculate cosine similarity between two embedding vectors.
   * 
   * @param vec1 - First embedding vector
   * @param vec2 - Second embedding vector
   * @returns Cosine similarity score between -1 and 1 (normalized to 0-1)
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      // Vectors must have same length
      return 0;
    }

    if (vec1.length === 0) {
      return 0;
    }

    // Calculate dot product
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    // Calculate cosine similarity
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) {
      return 0;
    }

    const similarity = dotProduct / denominator;

    // Normalize from [-1, 1] to [0, 1]
    return (similarity + 1) / 2;
  }

  /**
   * Clear the embedding cache.
   * Useful for testing or memory management.
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Get current cache size.
   * 
   * @returns Number of cached embeddings
   */
  getCacheSize(): number {
    return this.embeddingCache.size;
  }
}

