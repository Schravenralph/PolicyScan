/**
 * Rule Factor - Calculates rule-based score for documents
 * 
 * Calculates rule-based score using RuleEvaluator from evaluation layer.
 * Extracts rules from enrichmentMetadata.linkedXmlData.rules.
 */

import type { IScoringFactor } from '../interfaces/IScoringFactor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';
import type { IEvaluationService } from '../../evaluation/interfaces/IEvaluationService.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';

/**
 * Rule-based scoring factor
 * 
 * Calculates rule-based score using IEvaluationService from evaluation layer.
 * Uses dependency inversion - depends on interface, not concrete implementation.
 */
export class RuleFactor implements IScoringFactor {
  private weight: number;
  private ruleEvaluator: IEvaluationService;

  constructor(weight: number = 0.1, ruleEvaluator: IEvaluationService) {
    this.weight = weight;
    this.ruleEvaluator = ruleEvaluator; // ✅ Interface dependency - required, no default
  }

  async calculate(document: CanonicalDocument, query?: string): Promise<FactorResult> {
    const linkedXmlData = document.enrichmentMetadata?.linkedXmlData as {
      rules?: Array<{ identificatie: string; titel?: string; type?: string; content?: string }>;
      ruleCount?: number;
    } | undefined;

    if (!linkedXmlData || !linkedXmlData.rules || linkedXmlData.rules.length === 0) {
      return {
        factor: this.getName(),
        score: 0,
        weight: this.weight,
        metadata: { source: 'none', reason: 'no rules' },
      };
    }

    // Convert linkedXmlData rules to PolicyRule format
    const policyRules: PolicyRule[] = linkedXmlData.rules.map((rule, index) => ({
      id: rule.identificatie || `rule-${index}`,
      identificatie: rule.identificatie,
      titel: rule.titel,
      type: rule.type,
      content: rule.content,
      sourceDocument: document.sourceId,
      extractedAt: new Date(), // Use current date as fallback
    }));

    // Use RuleEvaluator to calculate score
    const ruleScore = await this.ruleEvaluator.calculateRuleScore(policyRules, query);

    return {
      factor: this.getName(),
      score: ruleScore,
      weight: this.weight,
      metadata: {
        source: 'linkedXmlData',
        ruleCount: policyRules.length,
        hasQuery: !!query,
      },
    };
  }

  getWeight(): number {
    return this.weight;
  }

  getName(): string {
    return 'rule';
  }
}
