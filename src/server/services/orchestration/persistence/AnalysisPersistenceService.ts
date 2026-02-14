/**
 * Analysis Persistence Service
 *
 * Handles persistence of analysis results (scores, categories, ranks) to the canonical library.
 * This service separates persistence concerns from workflow orchestration.
 *
 * All persistence operations for analysis results should go through this service.
 */

import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Options for persisting analysis results
 */
export interface PersistAnalysisResultsOptions {
  /** Query ID to link documents to */
  queryId: string;
  /** Workflow run ID */
  workflowRunId: string;
  /** Step ID for tracking */
  stepId?: string;
}

/**
 * Service for persisting analysis results
 *
 * Handles persistence of scores, categories, and ranks to the canonical library.
 */
export class AnalysisPersistenceService {
  /**
   * Persist analysis results (scores, categories, ranks) to the canonical library
   *
   * @param documents - Scored documents with categories
   * @param categorized - Documents grouped by category
   * @param options - Persistence options
   * @returns Number of documents updated
   */
  async persistAnalysisResults(
    documents: ScoredDocument[],
    categorized: Record<string, CanonicalDocument[]>,
    options: PersistAnalysisResultsOptions
  ): Promise<number> {
    if (documents.length === 0) {
      logger.debug({ queryId: options.queryId }, '[AnalysisPersistenceService] No documents to persist');
      return 0;
    }

    try {
      const { getCanonicalDocumentService } = await import('../../canonical/CanonicalDocumentService.js');
      const documentService = getCanonicalDocumentService();

      // Build updates array with scores, categories, and ranks
      const updates = documents.map((doc, index) => {
        // Determine category from categorized documents
        let category: string | undefined;
        for (const [cat, docs] of Object.entries(categorized)) {
          if (docs.some((d) =>
            (d.canonicalUrl || d.sourceId) === (doc.canonicalUrl || doc.sourceId) ||
            d.sourceId === doc.sourceId
          )) {
            category = cat;
            break;
          }
        }

        return {
          url: doc.canonicalUrl || doc.sourceId || '', // Ensure valid URL
          enrichmentMetadata: {
            relevanceScore: doc.finalScore || 0,
            category: category,
            rank: index + 1,
            scoredAt: new Date().toISOString(),
            // Preserve existing metadata
            queryId: options.queryId,
            workflowRunId: options.workflowRunId,
            stepId: options.stepId || 'analysis',
          },
        };
      }).filter(u => !!u.url); // Filter out any with missing URLs

      const updatedCount = await documentService.bulkUpdateEnrichmentMetadata(updates);

      logger.debug(
        { queryId: options.queryId, updatedCount, totalDocuments: documents.length },
        '[AnalysisPersistenceService] Persisted analysis results'
      );

      return updatedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error, queryId: options.queryId, documentCount: documents.length },
        '[AnalysisPersistenceService] Failed to persist analysis results'
      );
      throw new Error(`Failed to persist analysis results: ${errorMessage}`);
    }
  }
}
