/**
 * RelevanceEvaluator - Evaluates relevance rules
 * 
 * Evaluates policy rules for relevance based on content quality, recency, and completeness.
 */

import type { IEvaluator } from '../interfaces/IEvaluator.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from '../types/EvaluationCriteria.js';
import type { EvaluationResult } from '../types/EvaluationResult.js';
import type { RuleMatch } from '../types/RuleMatch.js';

export class RelevanceEvaluator implements IEvaluator {
  /**
   * Evaluate rules for relevance
   * 
   * @param rules - Policy rules to evaluate
   * @param criteria - Evaluation criteria (may include relevance-specific options)
   * @returns Evaluation result with relevance scores
   */
  async evaluate(
    rules: PolicyRule[],
    criteria: EvaluationCriteria
  ): Promise<EvaluationResult> {
    const matches: RuleMatch[] = [];
    const minRelevanceScore = criteria.options?.minRelevanceScore as number | undefined;

    for (const rule of rules) {
      let matchScore = 0;
      let confidence = 0.5;
      const matchedTerms: string[] = [];

      // Score based on rule completeness
      let completenessScore = 0;
      if (rule.identificatie) completenessScore += 0.2;
      if (rule.titel) completenessScore += 0.3;
      if (rule.type) completenessScore += 0.2;
      if (rule.content && rule.content.length > 10) completenessScore += 0.3;

      // Score based on content quality (longer, more detailed content = higher score)
      let contentQualityScore = 0;
      if (rule.content) {
        const contentLength = rule.content.length;
        if (contentLength > 100) {
          contentQualityScore = 0.8;
        } else if (contentLength > 50) {
          contentQualityScore = 0.6;
        } else if (contentLength > 20) {
          contentQualityScore = 0.4;
        } else {
          contentQualityScore = 0.2;
        }
      }

      // Score based on recency (if extractedAt is available)
      let recencyScore = 0.5; // Default score
      if (rule.extractedAt) {
        const ageInDays = (Date.now() - rule.extractedAt.getTime()) / (1000 * 60 * 60 * 24);
        // Newer rules get higher scores (decay over 365 days)
        recencyScore = Math.max(0.3, 1 - (ageInDays / 365));
      }

      // Combine scores (weighted average)
      matchScore = (completenessScore * 0.4) + (contentQualityScore * 0.4) + (recencyScore * 0.2);
      confidence = matchScore; // Use match score as confidence

      // If query provided, check for keyword matches (boost relevance)
      if (criteria.query) {
        const queryLower = criteria.query.toLowerCase();
        const ruleText = `${rule.titel || ''} ${rule.content || ''}`.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 2);
        const matchingWords = queryWords.filter((word: string) => ruleText.includes(word));
        
        if (matchingWords.length > 0) {
          const queryBoost = Math.min(0.3, (matchingWords.length / queryWords.length) * 0.3);
          matchScore = Math.min(1, matchScore + queryBoost);
          matchedTerms.push(...matchingWords);
        }
      }

      // Check minimum relevance threshold
      const threshold = minRelevanceScore || criteria.minScore || 0.3;
      if (matchScore >= threshold) {
        matches.push({
          rule,
          query: criteria.query || 'relevance evaluation',
          matchScore,
          matchType: 'keyword',
          matchedTerms,
          confidence,
        });
      }
    }

    // Calculate overall score
    const score = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.matchScore, 0) / rules.length
      : 0;

    // Calculate average confidence
    const confidence = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
      : 0;

    return {
      matches,
      score,
      confidence,
      evaluationMethod: 'keyword',
      metadata: {
        totalRules: rules.length,
        matchedRules: matches.length,
        minRelevanceScore,
      },
    };
  }
}
