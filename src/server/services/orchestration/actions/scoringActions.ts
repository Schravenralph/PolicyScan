/**
 * Scoring Actions
 * 
 * Workflow actions for the scoring layer.
 * These actions coordinate document scoring and ranking.
 */

import type { StepAction } from '../../../services/workflow/WorkflowActionRegistry.js';
import type { DocumentScorer } from '../../scoring/DocumentScorer.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { RankedDocument } from '../../scoring/types/RankedDocument.js';
import { logger } from '../../../utils/logger.js';

/**
 * Create a scoring action that scores documents
 * 
 * @param documentScorer - Document scorer instance
 * @returns Workflow action function
 */
export function createScoringAction(
  documentScorer: DocumentScorer
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const documents = params.documents as CanonicalDocument[];
      if (!documents || !Array.isArray(documents)) {
        throw new Error('documents array is required for scoring action');
      }

      const query = params.query as string | undefined;

      logger.debug({ documentCount: documents.length, query, runId }, '[ScoringAction] Starting scoring');

      const scored = await documentScorer.scoreDocuments(documents, query);

      logger.debug(
        { inputCount: documents.length, outputCount: scored.length, runId },
        '[ScoringAction] Scoring completed'
      );

      return {
        scoredDocuments: scored,
      };
    } catch (error) {
      logger.error({ error, runId }, '[ScoringAction] Scoring failed');
      throw error;
    }
  };
}

/**
 * Create a ranking action that ranks scored documents
 * 
 * @param documentScorer - Document scorer instance
 * @returns Workflow action function
 */
export function createRankingAction(
  documentScorer: DocumentScorer
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const scoredDocuments = params.scoredDocuments as ScoredDocument[];
      if (!scoredDocuments || !Array.isArray(scoredDocuments)) {
        throw new Error('scoredDocuments array is required for ranking action');
      }

      logger.debug({ documentCount: scoredDocuments.length, runId }, '[RankingAction] Starting ranking');

      const ranked = await documentScorer.rankDocuments(scoredDocuments);

      logger.debug(
        { inputCount: scoredDocuments.length, outputCount: ranked.length, runId },
        '[RankingAction] Ranking completed'
      );

      return {
        rankedDocuments: ranked,
      };
    } catch (error) {
      logger.error({ error, runId }, '[RankingAction] Ranking failed');
      throw error;
    }
  };
}

/**
 * Create a combined scoring and ranking action
 * 
 * @param documentScorer - Document scorer instance
 * @returns Workflow action function
 */
export function createScoreAndRankAction(
  documentScorer: DocumentScorer
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const documents = params.documents as CanonicalDocument[];
      if (!documents || !Array.isArray(documents)) {
        throw new Error('documents array is required for score and rank action');
      }

      const query = params.query as string | undefined;

      logger.debug({ documentCount: documents.length, query, runId }, '[ScoreAndRankAction] Starting scoring and ranking');

      // Score documents
      const scored = await documentScorer.scoreDocuments(documents, query);

      // Rank documents
      const ranked = await documentScorer.rankDocuments(scored);

      logger.debug(
        { inputCount: documents.length, outputCount: ranked.length, runId },
        '[ScoreAndRankAction] Scoring and ranking completed'
      );

      return {
        scoredDocuments: scored,
        rankedDocuments: ranked,
      };
    } catch (error) {
      logger.error({ error, runId }, '[ScoreAndRankAction] Scoring and ranking failed');
      throw error;
    }
  };
}
