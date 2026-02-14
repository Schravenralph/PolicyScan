import Bull from 'bull';
import { logger } from '../../../utils/logger.js';
import { getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import type { ProcessingJobData, ProcessingJobResult } from '../../../types/job-data.js';
import type {
  ProcessingJobProcessor,
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './BaseJobProcessor.js';
import { NotFoundError } from '../../../types/errors.js';

/**
 * Processor for processing jobs
 * Handles document processing operations (metadata extraction, content analysis, chunking)
 */
export class ProcessingJobProcessorImpl implements ProcessingJobProcessor {
  constructor(
    private progressEmitter: ProgressEventEmitter,
    private metricsUpdater: PerformanceMetricsUpdater
  ) {}

  async process(job: Bull.Job<ProcessingJobData>): Promise<ProcessingJobResult> {
    const { documentIds, processingType, queryId } = job.data;
    const jobId = String(job.id);
    const startTime = Date.now();

    logger.info({ jobId, processingType, documentCount: documentIds.length }, 'Processing processing job');

    try {
      // Emit job started event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_started',
        jobId,
        jobType: 'processing',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'active',
          message: `Starting ${processingType} processing for ${documentIds.length} documents`,
        },
      });

      // Use canonical document service
      const documentService = getCanonicalDocumentService();
      const errors: Array<{ documentId: string; error: string }> = [];
      const results: unknown[] = [];

      // Process documents
      for (let i = 0; i < documentIds.length; i++) {
        const progress = Math.floor((i / documentIds.length) * 100);
        await job.progress(progress);

        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'processing',
          queryId,
          timestamp: new Date(),
          data: {
            progress,
            message: `Verwerken document ${i + 1}/${documentIds.length}: `,
            metadata: {
              documentNumber: i + 1,
              totalDocuments: documentIds.length,
              processingType,
            },
          },
        });

        try {
          const canonicalDoc = await documentService.findById(documentIds[i]);
          if (!canonicalDoc) {
            throw new NotFoundError(`Document ${documentIds[i]} not found`, documentIds[i], {
              reason: 'document_not_found',
              operation: 'processProcessingJob',
              jobId
            });
          }
          // Basic processing - this can be expanded based on processingType
          // Note: Processing uses canonical document directly (no legacy conversion needed)
          const processed: { documentId: string; metadata?: Record<string, unknown>; contentLength?: number; chunks?: unknown[] } = { documentId: documentIds[i] };

          if (processingType === 'metadata' || processingType === 'full') {
            // Metadata extraction would go here
            // For now, just include existing metadata from canonical document
            processed.metadata = {
              title: canonicalDoc.title,
              source: canonicalDoc.source,
              documentType: canonicalDoc.documentType,
              ...canonicalDoc.sourceMetadata,
              ...canonicalDoc.enrichmentMetadata,
            };
          }

          if (processingType === 'content-analysis' || processingType === 'full') {
            // Content analysis would go here
            // Use canonical document's fullText for content length
            // Fallback to summary from sourceMetadata if fullText is not available
            const summaryText = typeof canonicalDoc.sourceMetadata?.samenvatting === 'string' 
              ? canonicalDoc.sourceMetadata.samenvatting 
              : '';
            processed.contentLength = canonicalDoc.fullText?.length || summaryText.length || 0;
          }

          if (processingType === 'chunking' || processingType === 'full') {
            // Document chunking would go here
            // This is a placeholder - actual chunking logic would need to be implemented
            processed.chunks = [];
          }

          results.push(processed);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({ documentId: documentIds[i], error: errorMessage });
          logger.error({ documentId: documentIds[i], error }, 'Failed to process document');
        }
      }

      await job.progress(100);

      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('processingJobs', processingTime);

      logger.info({ jobId, documentsProcessed: results.length, errors: errors.length, processingTimeMs: processingTime }, 'Processing job completed');

      const result: ProcessingJobResult = {
        success: true,
        documentsProcessed: results.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      };

      // Emit job completed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_completed',
        jobId,
        jobType: 'processing',
        queryId,
        timestamp: new Date(),
        data: {
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          message: errors.length > 0 
            ? `Verwerking voltooid. ${results.length} documenten verwerkt met ${errors.length} fouten.`
            : `Verwerking voltooid. ${results.length} documenten verwerkt.`,
          result,
          metadata: {
            documentsProcessed: results.length,
            errors: errors.length,
            processingType,
          },
          error: errors.length > 0 ? `Completed with ${errors.length} errors` : undefined,
          errorDetails: errors.length > 0 ? errors : undefined,
        },
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('processingJobs', processingTime);
      logger.error({ jobId, error, processingTimeMs: processingTime }, 'Error processing processing job');

      // Emit job failed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_failed',
        jobId,
        jobType: 'processing',
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

