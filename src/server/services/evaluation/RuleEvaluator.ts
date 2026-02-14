/**
 * RuleEvaluator - Main rule evaluation orchestrator
 * 
 * Coordinates all evaluators and matchers to evaluate policy rules.
 * Implements IEvaluationService to provide a unified interface for rule evaluation.
 */

import type { IEvaluationService } from './interfaces/IEvaluationService.js';
import type { PolicyRule } from '../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from './types/EvaluationCriteria.js';
import type { EvaluationResult } from './types/EvaluationResult.js';
import type { RuleMatch } from './types/RuleMatch.js';
import type { IEvaluator } from './interfaces/IEvaluator.js';
import type { IRuleMatcher } from './interfaces/IRuleMatcher.js';
import { KeywordRuleMatcher } from './matchers/KeywordRuleMatcher.js';
import { SemanticRuleMatcher } from './matchers/SemanticRuleMatcher.js';
import { HybridRuleMatcher } from './matchers/HybridRuleMatcher.js';
import { QueryMatchEvaluator } from './evaluators/QueryMatchEvaluator.js';
import { ComplianceEvaluator } from './evaluators/ComplianceEvaluator.js';
import { RelevanceEvaluator } from './evaluators/RelevanceEvaluator.js';

export class RuleEvaluator implements IEvaluationService {
  private matchers: Map<string, IRuleMatcher> = new Map();
  private evaluators: Map<string, IEvaluator> = new Map();

  constructor() {
    // Register matchers
    const keywordMatcher = new KeywordRuleMatcher();
    const semanticMatcher = new SemanticRuleMatcher();
    const hybridMatcher = new HybridRuleMatcher(keywordMatcher, semanticMatcher);

    this.matchers.set('keyword', keywordMatcher);
    this.matchers.set('semantic', semanticMatcher);
    this.matchers.set('hybrid', hybridMatcher);

    // Register evaluators
    this.evaluators.set('query', new QueryMatchEvaluator(hybridMatcher));
    this.evaluators.set('compliance', new ComplianceEvaluator());
    this.evaluators.set('relevance', new RelevanceEvaluator());
  }

  /**
   * Evaluate rules against evaluation criteria
   * 
   * @param rules - Policy rules to evaluate
   * @param criteria - Evaluation criteria
   * @returns Evaluation result with matches and scores
   */
  async evaluateRules(
    rules: PolicyRule[],
    criteria: EvaluationCriteria
  ): Promise<EvaluationResult> {
    // Determine evaluator type from criteria
    // Check if a specific evaluator type is requested in options first
    const requestedEvaluator = criteria.options?.evaluatorType as string | undefined;
    let evaluatorType = 'query'; // Default to 'query' evaluator
    
    if (requestedEvaluator) {
      // If a specific evaluator is requested, use it (but validate it exists)
      if (this.evaluators.has(requestedEvaluator)) {
        evaluatorType = requestedEvaluator;
      } else {
        throw new Error(`No evaluator found for type: ${requestedEvaluator}`);
      }
    }

    const evaluator = this.evaluators.get(evaluatorType);
    
    if (!evaluator) {
      throw new Error(`No evaluator found for type: ${evaluatorType}`);
    }

    return evaluator.evaluate(rules, criteria);
  }

  /**
   * Match rules against a query string
   * 
   * @param rules - Policy rules to match
   * @param query - Query string to match against
   * @returns Array of rule matches
   */
  async matchRules(rules: PolicyRule[], query: string): Promise<RuleMatch[]> {
    const matcher = this.matchers.get('hybrid')!;
    const matches: RuleMatch[] = [];

    for (const rule of rules) {
      const match = await matcher.match(rule, query);
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Calculate a rule score for given rules and optional query
   * 
   * This method provides backward compatibility with DocumentScoringService.calculateRuleScore()
   * 
   * @param rules - Policy rules to score
   * @param query - Optional query string for matching
   * @returns Rule score in range [0, 1]
   */
  async calculateRuleScore(rules: PolicyRule[], query?: string): Promise<number> {
    if (!query) {
      // No query, give small boost for having rules (structured data is valuable)
      return Math.min(0.1, rules.length * 0.01);
    }

    const criteria: EvaluationCriteria = {
      query,
      matchType: 'hybrid',
    };

    const result = await this.evaluateRules(rules, criteria);
    return result.score;
  }

  /**
   * Get a specific matcher by type
   * 
   * @param type - Matcher type ('keyword', 'semantic', 'hybrid')
   * @returns Matcher instance or undefined
   */
  getMatcher(type: string): IRuleMatcher | undefined {
    return this.matchers.get(type);
  }

  /**
   * Get a specific evaluator by type
   * 
   * @param type - Evaluator type ('query', 'compliance', 'relevance')
   * @returns Evaluator instance or undefined
   */
  getEvaluator(type: string): IEvaluator | undefined {
    return this.evaluators.get(type);
  }
}
