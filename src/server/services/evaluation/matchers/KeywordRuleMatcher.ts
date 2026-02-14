/**
 * KeywordRuleMatcher - Keyword-based rule matching
 * 
 * Matches rules against queries using keyword-based text matching.
 * Extracts keywords from the query and checks if they appear in rule titles and types.
 */

import type { IRuleMatcher } from '../interfaces/IRuleMatcher.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { RuleMatch } from '../types/RuleMatch.js';

export class KeywordRuleMatcher implements IRuleMatcher {
  /**
   * Match a rule against a query using keyword matching
   * 
   * @param rule - Policy rule to match
   * @param query - Query string to match against
   * @returns RuleMatch if match found, null otherwise
   */
  async match(rule: PolicyRule, query: string): Promise<RuleMatch | null> {
    if (!query || query.trim().length === 0) {
      return null;
    }

    // Extract keywords from query (words longer than 2 characters)
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    if (queryWords.length === 0) {
      return null;
    }

    // Build rule text from title, type, and content
    const ruleText = `${rule.titel || ''} ${rule.type || ''} ${rule.content || ''}`.toLowerCase();

    // Find matching keywords
    const matchedTerms = queryWords.filter(word => ruleText.includes(word));

    if (matchedTerms.length === 0) {
      return null;
    }

    // Calculate match score based on ratio of matched keywords
    const matchScore = matchedTerms.length / queryWords.length;

    // Calculate confidence (higher for more matches and longer rule text)
    const confidence = Math.min(0.9, 0.5 + (matchedTerms.length * 0.1) + (ruleText.length > 50 ? 0.1 : 0));

    return {
      rule,
      query,
      matchScore,
      matchType: 'keyword',
      matchedTerms,
      confidence,
    };
  }
}
