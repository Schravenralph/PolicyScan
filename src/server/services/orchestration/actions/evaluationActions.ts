/**
 * Evaluation Actions
 * 
 * Workflow actions for the evaluation layer.
 * These actions coordinate rule evaluation and matching.
 */

import type { StepAction } from '../../../services/workflow/WorkflowActionRegistry.js';
import type { RuleEvaluator } from '../../evaluation/RuleEvaluator.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { EvaluationCriteria } from '../../evaluation/types/EvaluationCriteria.js';
import { logger } from '../../../utils/logger.js';

/**
 * Create an evaluation action that evaluates rules against criteria
 * 
 * @param ruleEvaluator - Rule evaluator instance
 * @returns Workflow action function
 */
export function createEvaluationAction(
  ruleEvaluator: RuleEvaluator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const rules = params.rules as PolicyRule[];
      if (!rules || !Array.isArray(rules)) {
        throw new Error('rules array is required for evaluation action');
      }

      const criteria: EvaluationCriteria = {
        query: params.query as string | undefined,
        minScore: params.minRelevanceScore as number | undefined,
        options: {
          ...(params.minRelevanceScore ? { minRelevanceScore: params.minRelevanceScore as number } : {}),
          ...(params.requiredKeywords ? { requiredKeywords: params.requiredKeywords as string[] } : {}),
        },
        ...(params.criteria as Partial<EvaluationCriteria> | undefined),
      };

      logger.debug({ ruleCount: rules.length, criteria, runId }, '[EvaluationAction] Starting evaluation');

      const result = await ruleEvaluator.evaluateRules(rules, criteria);

      logger.debug(
        { ruleCount: rules.length, matchCount: result.matches.length, runId },
        '[EvaluationAction] Evaluation completed'
      );

      return {
        evaluationResult: result,
        matches: result.matches,
        averageScore: result.score,
      };
    } catch (error) {
      logger.error({ error, runId }, '[EvaluationAction] Evaluation failed');
      throw error;
    }
  };
}

/**
 * Create a rule matching action that matches rules against a query
 * 
 * @param ruleEvaluator - Rule evaluator instance
 * @returns Workflow action function
 */
export function createRuleMatchingAction(
  ruleEvaluator: RuleEvaluator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const rules = params.rules as PolicyRule[];
      if (!rules || !Array.isArray(rules)) {
        throw new Error('rules array is required for rule matching action');
      }

      const query = params.query as string;
      if (!query) {
        throw new Error('query is required for rule matching action');
      }

      logger.debug({ ruleCount: rules.length, query, runId }, '[RuleMatchingAction] Starting rule matching');

      const matches = await ruleEvaluator.matchRules(rules, query);

      logger.debug(
        { ruleCount: rules.length, matchCount: matches.length, runId },
        '[RuleMatchingAction] Rule matching completed'
      );

      return {
        matches,
      };
    } catch (error) {
      logger.error({ error, runId }, '[RuleMatchingAction] Rule matching failed');
      throw error;
    }
  };
}
