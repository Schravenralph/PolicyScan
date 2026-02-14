/**
 * Ingestion Actions
 * 
 * Workflow actions for the ingestion layer.
 * These actions coordinate ingestion, normalization, and deduplication.
 */

import type { StepAction } from '../../../services/workflow/WorkflowActionRegistry.js';
import type { IngestionOrchestrator } from '../../ingestion/IngestionOrchestrator.js';
import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../../ingestion/types/IngestionOptions.js';
import { logger } from '../../../utils/logger.js';

/**
 * Create an ingestion action that ingests documents from a source
 * 
 * @param ingestionOrchestrator - Ingestion orchestrator instance
 * @returns Workflow action function
 */
export function createIngestionAction(
  ingestionOrchestrator: IngestionOrchestrator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const source = params.source as DocumentSource;
      if (!source) {
        throw new Error('Source is required for ingestion action');
      }

      const options: IngestionOptions = {
        query: params.query as string | undefined,
        limit: params.limit as number | undefined,
        offset: params.offset as number | undefined,
        skipNormalization: params.skipNormalization as boolean | undefined,
        skipDeduplication: params.skipDeduplication as boolean | undefined,
        ...(params.options as Record<string, unknown> | undefined),
      };

      logger.debug({ source, options, runId }, '[IngestionAction] Starting ingestion');

      const result = await ingestionOrchestrator.ingest(source, options);

      logger.debug(
        { source, documentCount: result.documents.length, runId },
        '[IngestionAction] Ingestion completed'
      );

      return {
        documents: result.documents,
        source: result.source,
        ingestedAt: result.ingestedAt,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error({ error, runId }, '[IngestionAction] Ingestion failed');
      throw error;
    }
  };
}

/**
 * Create a normalization action that normalizes raw documents
 * 
 * @param ingestionOrchestrator - Ingestion orchestrator instance
 * @returns Workflow action function
 */
export function createNormalizationAction(
  ingestionOrchestrator: IngestionOrchestrator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const rawDocuments = params.rawDocuments as Array<Record<string, unknown>>;
      if (!rawDocuments || !Array.isArray(rawDocuments)) {
        throw new Error('rawDocuments array is required for normalization action');
      }

      logger.debug({ documentCount: rawDocuments.length, runId }, '[NormalizationAction] Starting normalization');

      // Convert raw documents to RawDocument format
      const rawDocs = rawDocuments.map((doc) => ({
        id: doc.id as string || doc._id as string || String(doc.sourceId || ''),
        url: doc.url as string || doc.sourceUrl as string || '',
        title: doc.title as string | undefined,
        content: doc.content as string | undefined,
        metadata: (doc.metadata as Record<string, unknown>) || {},
      }));

      const normalized = await ingestionOrchestrator.normalize(rawDocs);

      logger.debug(
        { inputCount: rawDocuments.length, outputCount: normalized.length, runId },
        '[NormalizationAction] Normalization completed'
      );

      return {
        normalizedDocuments: normalized,
      };
    } catch (error) {
      logger.error({ error, runId }, '[NormalizationAction] Normalization failed');
      throw error;
    }
  };
}

/**
 * Create a deduplication action that deduplicates normalized documents
 * 
 * @param ingestionOrchestrator - Ingestion orchestrator instance
 * @returns Workflow action function
 */
export function createDeduplicationAction(
  ingestionOrchestrator: IngestionOrchestrator
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const normalizedDocuments = params.normalizedDocuments as Array<Record<string, unknown>>;
      if (!normalizedDocuments || !Array.isArray(normalizedDocuments)) {
        throw new Error('normalizedDocuments array is required for deduplication action');
      }

      logger.debug(
        { documentCount: normalizedDocuments.length, runId },
        '[DeduplicationAction] Starting deduplication'
      );

      // Convert to NormalizedDocument format
      const normalizedDocs = normalizedDocuments.map((doc) => ({
        sourceId: doc.sourceId as string || '',
        sourceUrl: doc.sourceUrl as string || '',
        source: doc.source as DocumentSource,
        title: doc.title as string || '',
        content: doc.content as string || '',
        mimeType: doc.mimeType as string || 'application/octet-stream',
        rawData: doc.rawData,
        metadata: (doc.metadata as Record<string, unknown>) || {},
      }));

      const result = await ingestionOrchestrator.deduplicate(normalizedDocs);

      logger.debug(
        {
          inputCount: normalizedDocuments.length,
          outputCount: result.documents.length,
          duplicatesRemoved: result.duplicatesRemoved,
          runId,
        },
        '[DeduplicationAction] Deduplication completed'
      );

      return {
        documents: result.documents,
        duplicatesRemoved: result.duplicatesRemoved,
        duplicateInfo: result.duplicateInfo,
      };
    } catch (error) {
      logger.error({ error, runId }, '[DeduplicationAction] Deduplication failed');
      throw error;
    }
  };
}
