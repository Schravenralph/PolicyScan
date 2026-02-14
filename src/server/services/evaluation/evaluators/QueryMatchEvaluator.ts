/**
 * QueryMatchEvaluator - Evaluates rules against queries
 * 
 * Evaluates policy rules by matching them against a query string using a rule matcher.
 * Extracted from DocumentScoringService.calculateRuleScore() logic.
 */

import type { IEvaluator } from '../interfaces/IEvaluator.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from '../types/EvaluationCriteria.js';
import type { EvaluationResult } from '../types/EvaluationResult.js';
import type { RuleMatch } from '../types/RuleMatch.js';
import type { IRuleMatcher } from '../interfaces/IRuleMatcher.js';
import { HybridRuleMatcher } from '../matchers/HybridRuleMatcher.js';

export class QueryMatchEvaluator implements IEvaluator {
  private matcher: IRuleMatcher;

  constructor(matcher?: IRuleMatcher) {
    // Default to HybridRuleMatcher if none provided
    this.matcher = matcher || new HybridRuleMatcher();
  }

  /**
   * Evaluate rules against evaluation criteria
   * 
   * @param rules - Policy rules to evaluate
   * @param criteria - Evaluation criteria (must include query)
   * @returns Evaluation result with matches and scores
   */
  async evaluate(
    rules: PolicyRule[],
    criteria: EvaluationCriteria
  ): Promise<EvaluationResult> {
    // If no query provided, return empty result
    if (!criteria.query || criteria.query.trim().length === 0) {
      // Give small boost for having rules (structured data is valuable)
      const baseScore = rules.length > 0 ? Math.min(0.1, rules.length * 0.01) : 0;
      
      return {
        matches: [],
        score: baseScore,
        confidence: 0,
        evaluationMethod: 'hybrid',
        metadata: {
          totalRules: rules.length,
          matchedRules: 0,
          reason: 'No query provided, base score for structured data',
        },
      };
    }

    // Match all rules against the query
    const matches: RuleMatch[] = [];
    const minScore = criteria.minScore || 0;
    const minConfidence = criteria.minConfidence || 0;

    for (const rule of rules) {
      const match = await this.matcher.match(rule, criteria.query);
      if (match && match.matchScore >= minScore && match.confidence >= minConfidence) {
        matches.push(match);
      }
    }

    // Calculate overall score based on ratio of matching rules
    const score = this.calculateScore(matches, rules.length);
    
    // Calculate average confidence from matches
    const confidence = this.calculateConfidence(matches);

    // Determine evaluation method from matcher type
    const evaluationMethod = matches.length > 0 
      ? (matches[0].matchType === 'semantic' ? 'semantic' : matches[0].matchType === 'keyword' ? 'keyword' : 'hybrid')
      : 'hybrid';

    return {
      matches,
      score,
      confidence,
      evaluationMethod: evaluationMethod as 'semantic' | 'keyword' | 'hybrid',
      metadata: {
        totalRules: rules.length,
        matchedRules: matches.length,
        query: criteria.query,
      },
    };
  }

  /**
   * Calculate score based on ratio of matching rules
   * Similar to DocumentScoringService.calculateRuleScore() logic
   */
  private calculateScore(matches: RuleMatch[], totalRules: number): number {
    if (totalRules === 0) {
      return 0;
    }

    // Calculate score: more matching rules = higher score
    // Cap at 0.2 (same as DocumentScoringService)
    return Math.min(0.2, (matches.length / totalRules) * 0.2);
  }

  /**
   * Calculate average confidence from matches
   */
  private calculateConfidence(matches: RuleMatch[]): number {
    if (matches.length === 0) {
      return 0;
    }

    const totalConfidence = matches.reduce((sum, match) => sum + match.confidence, 0);
    return totalConfidence / matches.length;
  }
}
