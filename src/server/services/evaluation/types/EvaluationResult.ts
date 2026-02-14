/**
 * EvaluationResult - Result of rule evaluation
 * 
 * Represents the result of evaluating one or more policy rules against evaluation criteria.
 * This is the output type from the evaluation layer.
 */

import type { RuleMatch } from './RuleMatch.js';

/**
 * Result of evaluating rules against criteria
 */
export interface EvaluationResult {
  /** Array of rule matches found during evaluation */
  matches: RuleMatch[];
  /** Overall score for the evaluation (0-1) */
  score: number;
  /** Confidence level of the evaluation (0-1) */
  confidence: number;
  /** Method used for evaluation */
  evaluationMethod: 'semantic' | 'keyword' | 'hybrid';
  /** Additional metadata about the evaluation */
  metadata: Record<string, unknown>;
}
