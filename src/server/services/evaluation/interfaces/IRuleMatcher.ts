/**
 * IRuleMatcher - Rule matching interface
 * 
 * This interface defines the contract for rule matching strategies.
 * Implemented by KeywordRuleMatcher, SemanticRuleMatcher, and HybridRuleMatcher
 * to provide different matching approaches.
 */

import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { RuleMatch } from '../types/RuleMatch.js';

export interface IRuleMatcher {
  /**
   * Match a rule against a query string
   * Returns null if no match found
   */
  match(rule: PolicyRule, query: string): Promise<RuleMatch | null>;
}
