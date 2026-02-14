/**
 * StructuralPatternMatcher - Structural pattern matching implementation
 * 
 * Focuses on exact structural matches using:
 * - URL similarity and path patterns
 * - DOM structure comparison
 * - Error message matching
 * 
 * This matcher prioritizes structural similarity over semantic similarity.
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import { BasePatternMatcher } from './PatternMatcher.js';
import { LearnedPattern, NavigationContext, RankedPattern } from '../types.js';

/**
 * Structural pattern matcher for navigation patterns
 * 
 * Uses structural features (URL patterns, DOM structure, error messages)
 * to match navigation contexts with learned patterns.
 */
export class StructuralPatternMatcher extends BasePatternMatcher {
  /**
   * Default weights for structural matching
   * Higher weight on URL and structural similarity
   */
  private readonly defaultWeights = {
    url: 0.5,
    error: 0.2,
    structural: 0.3,
  };

  /**
   * Minimum score threshold for considering a pattern match
   */
  private readonly minScoreThreshold = 0.3;

  /**
   * Rank patterns based on structural similarity to the navigation context.
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

    // Calculate similarity scores for each pattern
    const rankedPatterns: RankedPattern[] = patterns.map(pattern => {
      // Calculate URL similarity
      const urlSimilarity = this.calculateUrlSimilarity(
        context.url,
        pattern.context.urlPattern
      );

      // Calculate error similarity
      const errorSimilarity = this.calculateErrorSimilarity(
        context.errorMessage,
        pattern.context.errorMessage
      );

      // Calculate structural similarity (DOM structure hash)
      const structuralSimilarity = this.calculateStructuralSimilarity(
        context.pageStructure?.structureHash,
        pattern.context.pageStructureHash
      );

      // Combine scores with structural weights
      const score = this.combineScores(
        {
          urlSimilarity,
          errorSimilarity,
          structuralSimilarity,
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
          structuralSimilarity,
        },
        confidence,
      };
    });

    // Filter by minimum score threshold
    const filtered = this.filterByMinScore(rankedPatterns, this.minScoreThreshold);

    // Sort by score (highest first)
    return this.sortByScore(filtered);
  }
}

