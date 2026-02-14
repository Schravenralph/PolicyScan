/**
 * HybridRuleMatcher - Hybrid rule matching (keyword + semantic)
 * 
 * Combines keyword and semantic matching to provide the best of both approaches.
 * Uses weighted combination of keyword and semantic match scores.
 */

import type { IRuleMatcher } from '../interfaces/IRuleMatcher.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { RuleMatch } from '../types/RuleMatch.js';
import { KeywordRuleMatcher } from './KeywordRuleMatcher.js';
import { SemanticRuleMatcher } from './SemanticRuleMatcher.js';

export interface HybridMatcherOptions {
  /** Weight for keyword matching (0-1), default 0.4 */
  keywordWeight?: number;
  /** Weight for semantic matching (0-1), default 0.6 */
  semanticWeight?: number;
  /** Minimum combined score threshold, default 0.5 */
  minScore?: number;
}

export class HybridRuleMatcher implements IRuleMatcher {
  private keywordMatcher: KeywordRuleMatcher;
  private semanticMatcher: SemanticRuleMatcher;
  private keywordWeight: number;
  private semanticWeight: number;
  private minScore: number;

  constructor(
    keywordMatcher?: KeywordRuleMatcher,
    semanticMatcher?: SemanticRuleMatcher,
    options?: HybridMatcherOptions
  ) {
    this.keywordMatcher = keywordMatcher || new KeywordRuleMatcher();
    this.semanticMatcher = semanticMatcher || new SemanticRuleMatcher();
    
    const opts = options || {};
    this.keywordWeight = opts.keywordWeight ?? 0.4;
    this.semanticWeight = opts.semanticWeight ?? 0.6;
    this.minScore = opts.minScore ?? 0.5;

    // Normalize weights to sum to 1.0
    const totalWeight = this.keywordWeight + this.semanticWeight;
    if (totalWeight > 0) {
      this.keywordWeight /= totalWeight;
      this.semanticWeight /= totalWeight;
    }
  }

  /**
   * Match a rule against a query using hybrid matching
   * 
   * @param rule - Policy rule to match
   * @param query - Query string to match against
   * @returns RuleMatch if combined score >= minScore, null otherwise
   */
  async match(rule: PolicyRule, query: string): Promise<RuleMatch | null> {
    if (!query || query.trim().length === 0) {
      return null;
    }

    // Get matches from both matchers in parallel
    const [keywordMatch, semanticMatch] = await Promise.all([
      this.keywordMatcher.match(rule, query),
      this.semanticMatcher.match(rule, query),
    ]);

    // If neither matches, return null
    if (!keywordMatch && !semanticMatch) {
      return null;
    }

    // Calculate weighted combined score
    const keywordScore = keywordMatch?.matchScore || 0;
    const semanticScore = semanticMatch?.matchScore || 0;
    const combinedScore = (keywordScore * this.keywordWeight) + (semanticScore * this.semanticWeight);

    // Check threshold
    if (combinedScore < this.minScore) {
      return null;
    }

    // Combine matched terms from both matchers
    const matchedTerms = [
      ...(keywordMatch?.matchedTerms || []),
      // Semantic matches don't have matched terms, but we could add query terms if semantic score is high
      ...(semanticMatch && semanticMatch.matchScore > 0.7 ? [query] : []),
    ];

    // Calculate combined confidence (weighted average)
    const keywordConfidence = keywordMatch?.confidence || 0;
    const semanticConfidence = semanticMatch?.confidence || 0;
    const combinedConfidence = (keywordConfidence * this.keywordWeight) + (semanticConfidence * this.semanticWeight);

    // Determine match type based on which matcher contributed more
    const matchType = semanticScore > keywordScore ? 'semantic' : 'keyword';

    return {
      rule,
      query,
      matchScore: combinedScore,
      matchType,
      matchedTerms: [...new Set(matchedTerms)], // Remove duplicates
      confidence: combinedConfidence,
    };
  }
}
