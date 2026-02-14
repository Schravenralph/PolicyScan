/**
 * RuleMatch - Result of matching a rule against a query
 * 
 * Represents a single rule that matched against a query string.
 * This is used within EvaluationResult to provide detailed match information.
 */

import type { PolicyRule } from '../../parsing/types/PolicyRule.js';

/**
 * Result of matching a rule against a query
 */
export interface RuleMatch {
  /** The policy rule that matched */
  rule: PolicyRule;
  /** The query string that was matched against */
  query: string;
  /** Match score (0-1) indicating how well the rule matches the query */
  matchScore: number;
  /** Type of match that occurred */
  matchType: 'semantic' | 'keyword' | 'exact';
  /** Terms from the query that matched in the rule */
  matchedTerms: string[];
  /** Confidence level of the match (0-1) */
  confidence: number;
}
