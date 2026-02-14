/**
 * PatternMatcher - Interface and base class for pattern matching strategies
 * 
 * Implements the strategy pattern for different matching algorithms:
 * - SemanticPatternMatcher: Uses vector embeddings for semantic similarity
 * - StructuralPatternMatcher: Compares DOM structure, URL patterns, page layout
 * - HybridPatternMatcher: Combines semantic and structural matching
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import { LearnedPattern, NavigationContext, RankedPattern } from '../types.js';

/**
 * Interface for pattern matching strategies
 */
export interface PatternMatcher {
  /**
   * Rank patterns based on how well they match the given navigation context.
   * 
   * @param patterns - Array of learned patterns to rank
   * @param context - Navigation context to match against
   * @returns Array of ranked patterns, sorted by score (highest first)
   */
  rankPatterns(
    patterns: LearnedPattern[],
    context: NavigationContext
  ): Promise<RankedPattern[]>;
}

/**
 * Base abstract class for pattern matchers with common utility methods
 * 
 * Provides helper methods for:
 * - URL similarity calculation
 * - Error message similarity
 * - Structural similarity helpers
 * - Confidence calculation
 * - Common scoring utilities
 */
export abstract class BasePatternMatcher implements PatternMatcher {
  /**
   * Rank patterns based on context similarity.
   * Must be implemented by concrete matcher classes.
   */
  abstract rankPatterns(
    patterns: LearnedPattern[],
    context: NavigationContext
  ): Promise<RankedPattern[]>;

  /**
   * Calculate URL similarity between context URL and pattern's URL pattern.
   * 
   * @param contextUrl - Current navigation context URL
   * @param urlPattern - Regex pattern from learned pattern context
   * @returns Similarity score between 0 and 1
   */
  protected calculateUrlSimilarity(
    contextUrl: string,
    urlPattern?: string
  ): number {
    if (!urlPattern) {
      return 0;
    }

    try {
      // Test if URL matches the regex pattern
      const regex = new RegExp(urlPattern);
      if (regex.test(contextUrl)) {
        return 1.0;
      }

      // If no exact match, calculate partial similarity based on domain/path
      const contextDomain = this.extractDomain(contextUrl);
      const patternDomain = this.extractDomainFromPattern(urlPattern);
      
      if (contextDomain && patternDomain && contextDomain === patternDomain) {
        // Same domain, calculate path similarity
        return this.calculatePathSimilarity(contextUrl, urlPattern);
      }

      return 0;
    } catch {
      // Invalid regex pattern
      return 0;
    }
  }

  /**
   * Calculate error message similarity.
   * 
   * @param contextError - Error message from navigation context
   * @param patternError - Error message from learned pattern
   * @returns Similarity score between 0 and 1
   */
  protected calculateErrorSimilarity(
    contextError?: string,
    patternError?: string
  ): number {
    if (!contextError || !patternError) {
      return 0;
    }

    // Exact match
    if (contextError === patternError) {
      return 1.0;
    }

    // Case-insensitive match
    if (contextError.toLowerCase() === patternError.toLowerCase()) {
      return 0.9;
    }

    // Calculate word overlap
    const contextWords = this.tokenize(contextError);
    const patternWords = this.tokenize(patternError);
    
    if (contextWords.length === 0 || patternWords.length === 0) {
      return 0;
    }

    const intersection = contextWords.filter(word => 
      patternWords.includes(word)
    );
    const union = Array.from(new Set([...contextWords, ...patternWords]));

    // Jaccard similarity
    return intersection.length / union.length;
  }

  /**
   * Calculate structural similarity based on page structure hash.
   * 
   * @param contextHash - Structure hash from navigation context
   * @param patternHash - Structure hash from learned pattern
   * @returns Similarity score between 0 and 1
   */
  protected calculateStructuralSimilarity(
    contextHash?: string,
    patternHash?: string
  ): number {
    if (!contextHash || !patternHash) {
      return 0;
    }

    // Exact match
    if (contextHash === patternHash) {
      return 1.0;
    }

    // Calculate Hamming distance for hash similarity
    // (assuming hashes are same length)
    if (contextHash.length !== patternHash.length) {
      return 0;
    }

    let differences = 0;
    for (let i = 0; i < contextHash.length; i++) {
      if (contextHash[i] !== patternHash[i]) {
        differences++;
      }
    }

    return 1 - (differences / contextHash.length);
  }

  /**
   * Get pattern's confidence score (historical effectiveness).
   * 
   * @param pattern - Learned pattern
   * @returns Confidence score between 0 and 1
   */
  protected getPatternConfidence(pattern: LearnedPattern): number {
    return pattern.effectiveness.confidence;
  }

  /**
   * Combine multiple similarity scores into a final match score.
   * 
   * @param scores - Object with similarity scores
   * @param weights - Optional weights for each score (defaults to equal weights)
   * @returns Combined score between 0 and 1
   */
  protected combineScores(
    scores: {
      urlSimilarity: number;
      errorSimilarity: number;
      structuralSimilarity?: number;
      semanticSimilarity?: number;
    },
    weights?: {
      url?: number;
      error?: number;
      structural?: number;
      semantic?: number;
    }
  ): number {
    // Default weights (equal weighting)
    const defaultWeights = {
      url: 0.3,
      error: 0.3,
      structural: 0.2,
      semantic: 0.2,
    };

    const w = weights || defaultWeights;
    const totalWeight = (w.url || 0) + (w.error || 0) + 
                       (w.structural || 0) + (w.semantic || 0);

    if (totalWeight === 0) {
      return 0;
    }

    let weightedSum = 0;
    weightedSum += (scores.urlSimilarity || 0) * (w.url || 0);
    weightedSum += (scores.errorSimilarity || 0) * (w.error || 0);
    weightedSum += (scores.structuralSimilarity || 0) * (w.structural || 0);
    weightedSum += (scores.semanticSimilarity || 0) * (w.semantic || 0);

    return weightedSum / totalWeight;
  }

  /**
   * Sort ranked patterns by score (highest first).
   * 
   * @param rankedPatterns - Array of ranked patterns
   * @returns Sorted array
   */
  protected sortByScore(rankedPatterns: RankedPattern[]): RankedPattern[] {
    return rankedPatterns.sort((a, b) => {
      // Primary sort by score
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Secondary sort by confidence
      return b.confidence - a.confidence;
    });
  }

  /**
   * Filter patterns by minimum score threshold.
   * 
   * @param rankedPatterns - Array of ranked patterns
   * @param minScore - Minimum score threshold (default: 0)
   * @returns Filtered array
   */
  protected filterByMinScore(
    rankedPatterns: RankedPattern[],
    minScore: number = 0
  ): RankedPattern[] {
    return rankedPatterns.filter(rp => rp.score >= minScore);
  }

  /**
   * Extract domain from URL.
   * 
   * @param url - Full URL
   * @returns Domain string or null
   */
  protected extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Extract domain from regex pattern (if possible).
   * 
   * @param pattern - Regex pattern string
   * @returns Domain string or null
   */
  protected extractDomainFromPattern(pattern: string): string | null {
    try {
      // Try to extract domain from common URL patterns
      const domainMatch = pattern.match(/https?:\/\/([^/?]+)/);
      if (domainMatch) {
        return domainMatch[1];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate path similarity between URL and pattern.
   * 
   * @param url - Full URL
   * @param pattern - Regex pattern
   * @returns Similarity score between 0 and 1
   */
  protected calculatePathSimilarity(url: string, pattern: string): number {
    try {
      const urlObj = new URL(url);
      const urlPath = urlObj.pathname;

      // Try to extract path from pattern
      const pathMatch = pattern.match(/https?:\/\/[^/]+(\/[^?]*)/);
      if (pathMatch) {
        const patternPath = pathMatch[1];
        // Simple path segment matching
        const urlSegments = urlPath.split('/').filter(s => s);
        const patternSegments = patternPath.split('/').filter(s => s);
        
        if (urlSegments.length === 0 && patternSegments.length === 0) {
          return 1.0;
        }

        const matchingSegments = urlSegments.filter((seg, idx) => 
          patternSegments[idx] && (
            seg === patternSegments[idx] || 
            patternSegments[idx].includes('*') ||
            patternSegments[idx].includes('+')
          )
        );

        return matchingSegments.length / Math.max(urlSegments.length, patternSegments.length);
      }

      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Tokenize text into words for similarity calculation.
   * 
   * @param text - Text to tokenize
   * @returns Array of lowercase words
   */
  protected tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }
}
