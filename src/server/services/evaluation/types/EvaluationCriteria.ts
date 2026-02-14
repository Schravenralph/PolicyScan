/**
 * EvaluationCriteria - Criteria for evaluating rules
 * 
 * Defines the criteria and options for evaluating policy rules.
 * This is the input type for the evaluation layer.
 */

/**
 * Criteria for evaluating rules
 */
export interface EvaluationCriteria {
  /** Query string to match rules against */
  query?: string;
  /** Minimum score threshold for matches (0-1) */
  minScore?: number;
  /** Minimum confidence threshold for matches (0-1) */
  minConfidence?: number;
  /** Type of matching to use */
  matchType?: 'semantic' | 'keyword' | 'hybrid';
  /** Additional options for evaluation */
  options?: Record<string, unknown>;
}
