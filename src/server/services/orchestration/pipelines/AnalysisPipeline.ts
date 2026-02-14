/**
 * Analysis Pipeline
 * 
 * Coordinates document analysis including rule evaluation and scoring.
 * This pipeline:
 * 1. Optionally evaluates rules from documents
 * 2. Scores documents using DocumentScorer
 * 3. Ranks documents by score
 * 4. Returns scored and ranked documents
 */

import type { IPipeline } from '../interfaces/IPipeline.js';
import type { PipelineInput } from '../types/PipelineInput.js';
import type { PipelineResult } from '../types/PipelineResult.js';
import type { RuleEvaluator } from '../../evaluation/RuleEvaluator.js';
import type { DocumentScorer } from '../../scoring/DocumentScorer.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { RankedDocument } from '../../scoring/types/RankedDocument.js';
import type { EvaluationCriteria } from '../../evaluation/types/EvaluationCriteria.js';
import type { PolicyRule } from '../../parsing/types/PolicyRule.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import type { ParsedDocument } from '../../parsing/types/ParsedDocument.js';
import { DocumentMapper } from '../mappers/DocumentMapper.js';
import { logger } from '../../../utils/logger.js';

/**
 * Configuration for AnalysisPipeline
 */
export interface AnalysisPipelineConfig {
  /** Whether to evaluate rules (default: false) */
  evaluateRules?: boolean;
  /** Evaluation criteria options */
  evaluationCriteria?: Partial<EvaluationCriteria>;
  /** Score threshold for filtering (optional) */
  scoreThreshold?: number;
}

/**
 * Analysis Pipeline
 * 
 * Coordinates rule evaluation and document scoring.
 *
 * Returns ScoredDocument[] in the documents field.
 */
export class AnalysisPipeline implements IPipeline<PipelineInput, ScoredDocument> {
  private evaluateRules: boolean;
  private evaluationCriteria: Partial<EvaluationCriteria>;
  private scoreThreshold?: number;

  constructor(
    private ruleEvaluator: RuleEvaluator,
    private documentScorer: DocumentScorer,
    config: AnalysisPipelineConfig = {}
  ) {
    this.evaluateRules = config.evaluateRules || false;
    this.evaluationCriteria = config.evaluationCriteria || {};
    this.scoreThreshold = config.scoreThreshold;
  }

  /**
   * Get the name of this pipeline
   *
   * @returns Pipeline name
   */
  getName(): string {
    return 'analysis';
  }

  /**
   * Execute the analysis pipeline
   *
   * @param input - Pipeline input
   * @returns Pipeline result with scored and ranked documents
   */
  async execute(input: PipelineInput): Promise<PipelineResult<ScoredDocument>> {
    const startTime = Date.now();
    const errors: Array<{ message: string; stack?: string; timestamp: Date }> = [];

    // Extract documents from input
    // Documents can come from:
    // 1. input.documents (direct CanonicalDocument[] or ScoredDocument[])
    // 2. input.metadata.normalizedDocuments (from DiscoveryPipeline - NormalizedDocument[])
    // 3. input.metadata.parsedDocuments (from DiscoveryPipeline - ParsedDocument[])
    let documents: CanonicalDocument[] = [];

    if (input.documents && Array.isArray(input.documents)) {
      // Direct documents - assume they're already CanonicalDocument or ScoredDocument
      documents = input.documents as CanonicalDocument[];
    } else {
      // Extract from metadata (backward compatibility during migration)
      const metadata = input.metadata;
      if (metadata && typeof metadata === 'object') {
        if ('normalizedDocuments' in metadata) {
          const normalizedDocs = metadata.normalizedDocuments;
          if (Array.isArray(normalizedDocs)) {
            // ✅ Use DocumentMapper for conversion (single conversion point, no ad-hoc conversions)
            documents = (normalizedDocs as NormalizedDocument[]).map((doc) =>
              DocumentMapper.normalizedToCanonical(doc)
            );
          }
        } else if ('parsedDocuments' in metadata) {
          const parsedDocs = metadata.parsedDocuments;
          if (Array.isArray(parsedDocs)) {
            // ✅ Use DocumentMapper for conversion
            documents = (parsedDocs as ParsedDocument[]).map((doc) =>
              DocumentMapper.parsedToCanonical(doc)
            );
          }
        }
      }
    }

    if (documents.length === 0) {
      logger.warn('[AnalysisPipeline] No documents provided for analysis');
      return {
        success: false,
        documents: [],
        metadata: {
          pipelineName: this.getName(),
          startedAt: new Date(startTime),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          documentsProcessed: 0,
        },
        errors: [
          {
            message: 'No documents provided for analysis',
            timestamp: new Date(),
          },
        ],
      };
    }

    const query = input.query || input.onderwerp || '';
    logger.debug({ documentCount: documents.length, query, evaluateRules: this.evaluateRules }, '[AnalysisPipeline] Starting analysis');

    // Optionally evaluate rules
    const evaluationResults: Array<{ documentId: string; result: unknown }> = [];
    if (this.evaluateRules) {
      try {
        logger.debug({ documentCount: documents.length }, '[AnalysisPipeline] Starting rule evaluation');

        // Extract rules from documents and evaluate them
        // Note: Rules are typically in document.enrichmentMetadata.rules for CanonicalDocument
        const evaluationPromises = documents.map(async (doc) => {
          const rules = (doc.enrichmentMetadata?.rules as Array<Record<string, unknown>>) || 
                        (doc.sourceMetadata?.rules as Array<Record<string, unknown>>) || [];
          if (rules.length > 0) {
            try {
              const criteria: EvaluationCriteria = {
                query,
                matchType: 'hybrid',
                ...this.evaluationCriteria,
              };

              // Convert rules to PolicyRule format
              // Rules from documents may have different structure, so we map them
              const policyRules = rules.map((rule): PolicyRule => ({
                id: (rule.id as string) || String(Math.random()),
                identificatie: rule.identificatie as string | undefined,
                titel: rule.titel as string | undefined,
                type: rule.type as string | undefined,
                content: (rule.content as string) || (rule.text as string) || '',
                sourceDocument: doc._id || doc.canonicalUrl || '',
                extractedAt: new Date(),
              }));
              
              const result = await this.ruleEvaluator.evaluateRules(policyRules, criteria);

              return {
                documentId: doc._id || doc.canonicalUrl,
                result,
              };
            } catch (error) {
              logger.warn({ error, documentId: doc._id }, '[AnalysisPipeline] Failed to evaluate rules for document');
              return null;
            }
          }
          return null;
        });

        const results = await Promise.all(evaluationPromises);
        // Filter out null results and ensure documentId is defined
        for (const r of results) {
          if (r !== null && r.documentId !== undefined) {
            evaluationResults.push({ documentId: r.documentId, result: r.result });
          }
        }

        logger.debug(
          { documentCount: documents.length, evaluatedCount: evaluationResults.length },
          '[AnalysisPipeline] Rule evaluation completed'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        errors.push({
          message: `Failed to evaluate rules: ${errorMessage}`,
          stack: errorStack,
          timestamp: new Date(),
        });
        logger.error({ error }, '[AnalysisPipeline] Failed to evaluate rules');
      }
    }

    // Score documents
    let scored: ScoredDocument[] = [];
    try {
      logger.debug({ documentCount: documents.length, query }, '[AnalysisPipeline] Starting scoring');

      scored = await this.documentScorer.scoreDocuments(documents, query);

      logger.debug(
        { inputCount: documents.length, outputCount: scored.length },
        '[AnalysisPipeline] Scoring completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      errors.push({
        message: `Failed to score documents: ${errorMessage}`,
        stack: errorStack,
        timestamp: new Date(),
      });
      logger.error({ error }, '[AnalysisPipeline] Failed to score documents');
      // If scoring fails, we can't continue
      return {
        success: false,
        documents: [],
        metadata: {
          pipelineName: this.getName(),
          startedAt: new Date(startTime),
          completedAt: new Date(),
          duration: Date.now() - startTime,
          documentsProcessed: 0,
        },
        errors,
      };
    }

    // Rank documents
    let ranked: RankedDocument[] = [];
    try {
      logger.debug({ documentCount: scored.length }, '[AnalysisPipeline] Starting ranking');

      ranked = await this.documentScorer.rankDocuments(scored);

      logger.debug(
        { inputCount: scored.length, outputCount: ranked.length },
        '[AnalysisPipeline] Ranking completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      errors.push({
        message: `Failed to rank documents: ${errorMessage}`,
        stack: errorStack,
        timestamp: new Date(),
      });
      logger.error({ error }, '[AnalysisPipeline] Failed to rank documents');
      // If ranking fails, use scored documents without ranking
      ranked = scored.map((doc, index) => ({
        ...doc,
        rank: index + 1,
      }));
    }

    // Filter by score threshold if specified
    if (this.scoreThreshold !== undefined) {
      const beforeFilter = ranked.length;
      ranked = ranked.filter((doc) => doc.finalScore >= this.scoreThreshold!);
      logger.debug(
        { beforeFilter, afterFilter: ranked.length, threshold: this.scoreThreshold },
        '[AnalysisPipeline] Filtered documents by score threshold'
      );
    }

    // Calculate statistics
    const averageScore = ranked.length > 0
      ? ranked.reduce((sum, doc) => sum + doc.finalScore, 0) / ranked.length
      : 0;
    const minScore = ranked.length > 0
      ? Math.min(...ranked.map((doc) => doc.finalScore))
      : 0;
    const maxScore = ranked.length > 0
      ? Math.max(...ranked.map((doc) => doc.finalScore))
      : 0;

    const completedAt = Date.now();
    const duration = completedAt - startTime;

    // Build result with honest types - return ScoredDocument[] in documents field
    const result: PipelineResult<ScoredDocument> = {
      success: errors.length === 0 || ranked.length > 0,
      documents: ranked, // ✅ Ranked documents are ScoredDocument[] with rank
      metadata: {
        pipelineName: this.getName(),
        startedAt: new Date(startTime),
        completedAt: new Date(completedAt),
        duration,
        documentsProcessed: ranked.length,
        totalDocuments: documents.length,
        averageScore,
        minScore,
        maxScore,
        evaluationResults: evaluationResults.length > 0 ? evaluationResults : undefined,
        scoreThreshold: this.scoreThreshold,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.debug(
      {
        success: result.success,
        documentCount: ranked.length,
        averageScore,
        errorCount: errors.length,
        duration,
      },
      '[AnalysisPipeline] Analysis completed'
    );

    return result;
  }
}
