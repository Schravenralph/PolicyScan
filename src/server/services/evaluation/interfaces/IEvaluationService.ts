/**
 * IEvaluationService - Main evaluation service interface
 * 
 * This interface defines the contract for the evaluation layer.
 * Implemented by RuleEvaluator to provide unified rule evaluation functionality.
 */

import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from '../types/EvaluationCriteria.js';
import type { EvaluationResult } from '../types/EvaluationResult.js';
import type { RuleMatch } from '../types/RuleMatch.js';

export interface IEvaluationService {
  /**
   * Evaluate rules against evaluation criteria
   */
  evaluateRules(rules: PolicyRule[], criteria: EvaluationCriteria): Promise<EvaluationResult>;

  /**
   * Match rules against a query string
   */
  matchRules(rules: PolicyRule[], query: string): Promise<RuleMatch[]>;

  /**
   * Calculate a rule score for given rules and optional query
   */
  calculateRuleScore(rules: PolicyRule[], query?: string): Promise<number>;
}
