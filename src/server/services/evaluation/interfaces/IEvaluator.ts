/**
 * IEvaluator - Evaluation strategy interface
 * 
 * This interface defines the contract for evaluation strategies.
 * Implemented by QueryMatchEvaluator, ComplianceEvaluator, and RelevanceEvaluator
 * to provide different evaluation approaches.
 */

import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from '../types/EvaluationCriteria.js';
import type { EvaluationResult } from '../types/EvaluationResult.js';

export interface IEvaluator {
  /**
   * Evaluate rules against evaluation criteria
   */
  evaluate(rules: PolicyRule[], criteria: EvaluationCriteria): Promise<EvaluationResult>;
}
