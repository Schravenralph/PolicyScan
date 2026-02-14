/**
 * HybridPatternMatcher - Hybrid pattern matching implementation
 * 
 * Combines structural and semantic matching approaches:
 * - Uses both StructuralPatternMatcher and SemanticPatternMatcher
 * - Combines results with weighted scoring
 * - Weights patterns by effectiveness history
 * - Configurable weights for structural vs semantic matching
 * 
 * This matcher provides balanced accuracy by leveraging both exact structural
 * matches and semantic understanding.
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import { BasePatternMatcher } from './PatternMatcher.js';
import { StructuralPatternMatcher } from './StructuralPatternMatcher.js';
import { SemanticPatternMatcher } from './SemanticPatternMatcher.js';
import { LearnedPattern, NavigationContext, RankedPattern } from '../types.js';
import { EmbeddingProvider } from '../../query/VectorService.js';

/**
 * Configuration for hybrid pattern matcher weights
 */
export interface HybridMatcherWeights {
  /**
   * Weight for structural matcher results (0-1)
   * Higher values prioritize structural matching
   */
  structural: number;
  
  /**
   * Weight for semantic matcher results (0-1)
   * Higher values prioritize semantic matching
   */
  semantic: number;
  
  /**
   * Weight for pattern effectiveness (confidence) in final scoring
   * Higher values prioritize historically successful patterns
   */
  effectiveness: number;
}

/**
 * Default weights for hybrid matching
 * Balanced approach: 40% structural, 40% semantic, 20% effectiveness
 */
const DEFAULT_WEIGHTS: HybridMatcherWeights = {
  structural: 0.4,
  semantic: 0.4,
  effectiveness: 0.2,
};

/**
 * Hybrid pattern matcher for navigation patterns
 * 
 * Combines structural and semantic matching to provide balanced accuracy.
 * Uses both matchers in parallel and merges results with weighted scoring.
 */
export class HybridPatternMatcher extends BasePatternMatcher {
  /**
   * Structural pattern matcher instance
   */
  private structuralMatcher: StructuralPatternMatcher;
  
  /**
   * Semantic pattern matcher instance
   */
  private semanticMatcher: SemanticPatternMatcher;
  
  /**
   * Weights for combining matcher results
   */
  private weights: HybridMatcherWeights;
  
  /**
   * Minimum score threshold for considering a pattern match
   */
  private readonly minScoreThreshold = 0.3;

  /**
   * Constructor
   * 
   * @param embeddingProvider - Optional embedding provider for semantic matcher
   * @param weights - Optional custom weights (defaults to balanced weights)
   */
  constructor(
    embeddingProvider?: EmbeddingProvider,
    weights?: Partial<HybridMatcherWeights>
  ) {
    super();
    this.structuralMatcher = new StructuralPatternMatcher();
    this.semanticMatcher = new SemanticPatternMatcher(embeddingProvider);
    
    // Merge custom weights with defaults
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...weights,
    };
    
    // Normalize weights to ensure they sum to 1.0
    this.normalizeWeights();
  }

  /**
   * Normalize weights to ensure structural and semantic sum to 1.0
   * (effectiveness weight is separate and doesn't need normalization)
   */
  private normalizeWeights(): void {
    const total = this.weights.structural + this.weights.semantic;
    if (total > 0 && Math.abs(total - 1.0) > 0.001) {
      // Only normalize if they don't already sum to 1.0
      const scale = 1.0 / total;
      this.weights.structural *= scale;
      this.weights.semantic *= scale;
    } else if (total === 0) {
      // Fallback to equal weights if both are 0
      this.weights.structural = 0.5;
      this.weights.semantic = 0.5;
    }
    // If total is already 1.0, no normalization needed
  }

  /**
   * Rank patterns based on hybrid similarity to the navigation context.
   * 
   * Combines results from both structural and semantic matchers with
   * weighted scoring based on pattern effectiveness history.
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

    // Run both matchers in parallel
    const [structuralResults, semanticResults] = await Promise.all([
      this.structuralMatcher.rankPatterns(patterns, context),
      this.semanticMatcher.rankPatterns(patterns, context),
    ]);

    // Create maps for quick lookup of scores by pattern ID
    const structuralScores = new Map<string, RankedPattern>();
    const semanticScores = new Map<string, RankedPattern>();

    structuralResults.forEach(result => {
      structuralScores.set(result.pattern.id, result);
    });

    semanticResults.forEach(result => {
      semanticScores.set(result.pattern.id, result);
    });

    // Combine results for all patterns
    const combinedResults: RankedPattern[] = patterns.map(pattern => {
      const structuralResult = structuralScores.get(pattern.id);
      const semanticResult = semanticScores.get(pattern.id);

      // Get scores from each matcher (default to 0 if not found)
      const structuralScore = structuralResult?.score || 0;
      const semanticScore = semanticResult?.score || 0;

      // Get pattern effectiveness (confidence)
      const effectiveness = this.getPatternConfidence(pattern);

      // Combine scores with weights
      // Base score: weighted combination of structural and semantic scores
      const baseScore = 
        (structuralScore * this.weights.structural) +
        (semanticScore * this.weights.semantic);

      // Final score: combine base score with effectiveness
      // Effectiveness acts as a multiplier/booster for historically successful patterns
      const finalScore = 
        (baseScore * (1 - this.weights.effectiveness)) +
        (effectiveness * this.weights.effectiveness);

      // Combine match details from both matchers
      const matchDetails = {
        urlSimilarity: 
          structuralResult?.matchDetails.urlSimilarity || 
          semanticResult?.matchDetails.urlSimilarity || 
          0,
        errorSimilarity:
          structuralResult?.matchDetails.errorSimilarity ||
          semanticResult?.matchDetails.errorSimilarity ||
          0,
        structuralSimilarity: structuralResult?.matchDetails.structuralSimilarity,
        semanticSimilarity: semanticResult?.matchDetails.semanticSimilarity,
      };

      return {
        pattern,
        score: finalScore,
        matchDetails,
        confidence: effectiveness,
      };
    });

    // Filter by minimum score threshold
    const filtered = this.filterByMinScore(combinedResults, this.minScoreThreshold);

    // Sort by score (highest first)
    return this.sortByScore(filtered);
  }

  /**
   * Update matcher weights
   * 
   * @param weights - Partial weights to update
   */
  setWeights(weights: Partial<HybridMatcherWeights>): void {
    this.weights = {
      ...this.weights,
      ...weights,
    };
    this.normalizeWeights();
  }

  /**
   * Get current matcher weights
   * 
   * @returns Current weights configuration
   */
  getWeights(): HybridMatcherWeights {
    return { ...this.weights };
  }

  /**
   * Clear semantic matcher's embedding cache
   * Useful for testing or memory management
   */
  clearCache(): void {
    this.semanticMatcher.clearCache();
  }

  /**
   * Get semantic matcher's cache size
   * 
   * @returns Number of cached embeddings
   */
  getCacheSize(): number {
    return this.semanticMatcher.getCacheSize();
  }
}

