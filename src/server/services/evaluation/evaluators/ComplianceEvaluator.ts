/**
 * ComplianceEvaluator - Evaluates compliance rules
 * 
 * Evaluates policy rules for compliance-related criteria.
 * Can evaluate based on rule types, patterns, and compliance indicators.
 */

import type { IEvaluator } from '../interfaces/IEvaluator.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from '../types/EvaluationCriteria.js';
import type { EvaluationResult } from '../types/EvaluationResult.js';
import type { RuleMatch } from '../types/RuleMatch.js';

export class ComplianceEvaluator implements IEvaluator {
  /**
   * Evaluate rules for compliance
   * 
   * @param rules - Policy rules to evaluate
   * @param criteria - Evaluation criteria (may include compliance-specific options)
   * @returns Evaluation result with compliance matches
   */
  async evaluate(
    rules: PolicyRule[],
    criteria: EvaluationCriteria
  ): Promise<EvaluationResult> {
    const matches: RuleMatch[] = [];
    const complianceTypes = criteria.options?.complianceTypes as string[] | undefined;
    const requiredPatterns = criteria.options?.requiredPatterns as string[] | undefined;

    for (const rule of rules) {
      let matchScore = 0;
      let confidence = 0.5; // Base confidence for compliance rules
      const matchedTerms: string[] = [];

      // Check rule type against compliance types
      if (complianceTypes && rule.type) {
        const ruleTypeLower = rule.type.toLowerCase();
        for (const complianceType of complianceTypes) {
          if (ruleTypeLower.includes(complianceType.toLowerCase())) {
            matchScore = 0.8;
            confidence = 0.7;
            matchedTerms.push(rule.type);
            break;
          }
        }
      }

      // Check for required patterns in rule content
      if (requiredPatterns && rule.content) {
        const contentLower = rule.content.toLowerCase();
        for (const pattern of requiredPatterns) {
          if (contentLower.includes(pattern.toLowerCase())) {
            matchScore = Math.max(matchScore, 0.9);
            confidence = Math.max(confidence, 0.8);
            matchedTerms.push(pattern);
          }
        }
      }

      // If no specific criteria, check for compliance-related keywords
      if (!complianceTypes && !requiredPatterns) {
        const complianceKeywords = ['verplicht', 'verordening', 'regel', 'norm', 'voorschrift', 'eisen'];
        const ruleText = `${rule.titel || ''} ${rule.content || ''}`.toLowerCase();
        
        for (const keyword of complianceKeywords) {
          if (ruleText.includes(keyword)) {
            matchScore = 0.6;
            confidence = 0.6;
            matchedTerms.push(keyword);
            break;
          }
        }
      }

      // Only add match if score meets minimum threshold
      const minScore = criteria.minScore || 0.5;
      if (matchScore >= minScore) {
        matches.push({
          rule,
          query: criteria.query || 'compliance evaluation',
          matchScore,
          matchType: 'keyword',
          matchedTerms,
          confidence,
        });
      }
    }

    // Calculate overall score
    const score = matches.length > 0 
      ? Math.min(1, matches.reduce((sum, m) => sum + m.matchScore, 0) / rules.length)
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
        complianceTypes,
        requiredPatterns,
      },
    };
  }
}
