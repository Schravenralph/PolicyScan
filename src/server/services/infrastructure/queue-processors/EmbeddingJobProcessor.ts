import Bull from 'bull';
import { LocalEmbeddingProvider } from '../../query/VectorService.js';
import { logger } from '../../../utils/logger.js';
import { getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import type { EmbeddingJobData, EmbeddingJobResult } from '../../../types/job-data.js';
import type {
  EmbeddingJobProcessor,
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './BaseJobProcessor.js';
import { NotFoundError, BadRequestError } from '../../../types/errors.js';

/**
 * Processor for embedding jobs
 * Handles vector embedding generation for documents
 */
export class EmbeddingJobProcessorImpl implements EmbeddingJobProcessor {
  constructor(
    private progressEmitter: ProgressEventEmitter,
    private metricsUpdater: PerformanceMetricsUpdater
  ) {}

  async process(job: Bull.Job<EmbeddingJobData>): Promise<EmbeddingJobResult> {
    const { documentIds, options, queryId } = job.data;
    const jobId = String(job.id);
    const startTime = Date.now();
    const model = options?.model || process.env.VECTOR_SERVICE_MODEL || 'Xenova/all-MiniLM-L6-v2';
    // Optimize batch size based on document count: larger batches for many documents, smaller for few
    const defaultBatchSize = documentIds.length > 100 ? 20 : documentIds.length > 50 ? 15 : 10;
    const batchSize = options?.batchSize || defaultBatchSize;

    logger.info({ jobId, documentCount: documentIds.length, model }, 'Processing embedding job');

    try {
      // Emit job started event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_started',
        jobId,
        jobType: 'embedding',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'active',
          message: `Starting embedding generation for ${documentIds.length} documents`,
        },
      });

      // Use canonical document service for reads and writes
      const documentService = getCanonicalDocumentService();
      const embeddingProvider = new LocalEmbeddingProvider(model);
      const errors: Array<{ documentId: string; error: string }> = [];
      let embeddingsGenerated = 0;

      // Process documents in batches
      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);
        const progress = Math.floor((i / documentIds.length) * 100);
        await job.progress(progress);

        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'embedding',
          queryId,
          timestamp: new Date(),
          data: {
            progress,
            message: `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(documentIds.length / batchSize)} (${i + batch.length}/${documentIds.length} documents)`,
            metadata: {
              batchNumber: Math.floor(i / batchSize) + 1,
              totalBatches: Math.ceil(documentIds.length / batchSize),
              documentsProcessed: i,
              totalDocuments: documentIds.length,
            },
          },
        });

        for (const documentId of batch) {
          try {
            const canonicalDoc = await documentService.findById(documentId);
            if (!canonicalDoc) {
              throw new NotFoundError(`Document ${documentId} not found`, documentId, {
                reason: 'document_not_found',
                operation: 'processEmbeddingJob',
              });
            }

            // Check if embedding already exists in canonical document
            if (!options?.forceRegenerate) {
              if (
                canonicalDoc.enrichmentMetadata?.embedding &&
                Array.isArray(canonicalDoc.enrichmentMetadata.embedding) &&
                canonicalDoc.enrichmentMetadata.embedding.length > 0
              ) {
                logger.debug({ documentId }, 'Embedding already exists, skipping');
                continue;
              }
            }

            // Generate embedding from canonical document's fullText (preferred) or summary from sourceMetadata
            const summaryText = typeof canonicalDoc.sourceMetadata?.samenvatting === 'string'
              ? canonicalDoc.sourceMetadata.samenvatting
              : '';
            const content = canonicalDoc.fullText || summaryText || '';
            if (!content) {
              throw new BadRequestError(`Document ${documentId} has no content`, {
                reason: 'document_has_no_content',
                operation: 'processEmbeddingJob',
                documentId,
                hasFullText: !!canonicalDoc.fullText,
                hasSummary: !!summaryText
              });
            }

            const embedding = await embeddingProvider.generateEmbedding(content);

            // Update document with embedding
            await documentService.updateEnrichmentMetadata(documentId, {
              embedding,
              embeddingModel: model,
              embeddingGeneratedAt: new Date().toISOString()
            });

            embeddingsGenerated++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({ documentId, error: errorMessage });
            logger.error({ documentId, error }, 'Failed to generate embedding for document');
          }
        }
      }

      await job.progress(100);

      logger.info({ jobId, embeddingsGenerated, errors: errors.length }, 'Embedding job completed');

      const result: EmbeddingJobResult = {
        success: true,
        documentsProcessed: documentIds.length,
        embeddingsGenerated,
        errors: errors.length > 0 ? errors : undefined,
      };

      // Emit job completed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_completed',
        jobId,
        jobType: 'embedding',
        queryId,
        timestamp: new Date(),
        data: {
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          message: `Embedding generation completed. Generated ${embeddingsGenerated} embeddings${errors.length > 0 ? ` with ${errors.length} errors` : ''}.`,
          result,
          metadata: {
            documentsProcessed: documentIds.length,
            embeddingsGenerated,
            errors: errors.length,
          },
          error: errors.length > 0 ? `Completed with ${errors.length} errors` : undefined,
          errorDetails: errors.length > 0 ? errors : undefined,
        },
      });

      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('embeddingJobs', processingTime);
      logger.info({ jobId, processingTimeMs: processingTime }, 'Embedding job completed');

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('embeddingJobs', processingTime);
      logger.error({ jobId, error, processingTimeMs: processingTime }, 'Error processing embedding job');

      // Emit job failed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_failed',
        jobId,
        jobType: 'embedding',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          errorDetails: error,
        },
      });

      throw error; // Bull will handle retries
    }
  }
}

