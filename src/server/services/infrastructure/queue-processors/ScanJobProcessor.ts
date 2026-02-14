/**
 * Scan Job Processor
 * 
 * ✅ **MIGRATED** - This processor now uses CanonicalDocumentService internally.
 * 
 * **Migration Status:**
 * - ✅ Documents are persisted using `CanonicalDocumentService.upsertBySourceId()`
 * - ✅ Documents are saved to `canonical_documents` collection
 * - ✅ Maintains backward compatibility (same API, different implementation)
 * 
 * **Migration Reference:**
 * - WI-414: Backend Write Operations Migration
 * - See `docs/70-sprint-backlog/WI-414-backend-write-operations-migration.md`
 * 
 * @see WI-414: Backend Write Operations Migration
 */

import Bull from 'bull';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { ScraperOrchestrator } from '../../scraping/scraperOrchestrator.js';
import { Query } from '../../../models/Query.js';
import { logger } from '../../../utils/logger.js';
import { getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import type { ScanJobData, ScanJobResult } from '../../../types/job-data.js';
import { NotFoundError } from '../../../types/errors.js';
import type {
  ScanJobProcessor,
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './BaseJobProcessor.js';

/**
 * Processor for scan jobs
 * Handles website/document scanning operations
 */
export class ScanJobProcessorImpl implements ScanJobProcessor {
  constructor(
    private progressEmitter: ProgressEventEmitter,
    private metricsUpdater: PerformanceMetricsUpdater
  ) {}

  async process(job: Bull.Job<ScanJobData>): Promise<ScanJobResult> {
    const { queryId, onderwerp, thema, overheidslaag } = job.data;
    const jobId = String(job.id);
    const startTime = Date.now();

    logger.info({ jobId, queryId }, 'Processing scan job');

    try {
      // Emit job started event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_started',
        jobId,
        jobType: 'scan',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'active',
          message: 'Scan job started',
        },
      });

      const db = getDB();
      const query = await Query.findById(queryId);

      if (!query) {
        throw new NotFoundError('Query', queryId, {
          reason: 'query_not_found',
          operation: 'processScanJob',
          jobId: String(job.id)
        });
      }

      // Update job progress and emit event
      await job.progress(10);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scan',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 10,
          message: 'Initializing scan...',
        },
      });

      // Initialize ScraperOrchestrator
      // Note: LearningService might not be available in queue context, but that's okay - boosts will just be disabled
      const orchestrator = new ScraperOrchestrator(db, undefined);

      await job.progress(30);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scan',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 30,
          message: 'Orchestrator initialized, starting scan...',
        },
      });

      // Perform the scan
      const scanResult = await orchestrator.scan({
        queryId: new ObjectId(queryId),
        onderwerp: onderwerp || query.onderwerp,
        thema: thema || query.onderwerp,
        overheidslaag: overheidslaag || query.overheidstype || query.overheidsinstantie || 'onbekend',
        selectedWebsites: query.websiteUrls || [],
      });

      await job.progress(60);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scan',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 60,
          message: `Scan completed. Found ${scanResult.documents.length} documents and ${scanResult.suggestedSources.length} sources. Saving to database...`,
          metadata: {
            documentsFound: scanResult.documents.length,
            sourcesFound: scanResult.suggestedSources.length,
          },
        },
      });

      // Track failed documents for status reporting
      let documentsSaved = 0;
      let documentsFailed = 0;

      // Save documents to database using canonical service
      // Note: scanResult.documents is now CanonicalDocumentDraft[] (no conversion needed)
      if (scanResult.documents.length > 0) {
        const canonicalService = getCanonicalDocumentService();

        for (const canonicalDraft of scanResult.documents) {
          try {
            // Ensure queryId is set in enrichmentMetadata if not already present
            if (!canonicalDraft.enrichmentMetadata?.queryId) {
              canonicalDraft.enrichmentMetadata = {
                ...canonicalDraft.enrichmentMetadata,
                queryId,
              };
            }

            // Persist using canonical service (documents are already in canonical format)
            await canonicalService.upsertBySourceId(canonicalDraft, {});
            documentsSaved++;
          } catch (error) {
            documentsFailed++;
            logger.warn(
              { error, url: canonicalDraft.canonicalUrl || canonicalDraft.sourceId, queryId },
              'Failed to persist scan document to canonical_documents collection'
            );
          }
        }

        if (documentsFailed > 0) {
          logger.warn(
            { queryId, saved: documentsSaved, failed: documentsFailed },
            'Some documents failed to persist during scan job'
          );
        }
      }

      await job.progress(80);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'scan',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 80,
          message: 'Documents saved. Saving suggested sources...',
        },
      });

      // Save suggested sources to database
      if (scanResult.suggestedSources.length > 0) {
        const websitesCollection = db.collection('bronwebsites');
        for (const source of scanResult.suggestedSources) {
          await websitesCollection.updateOne(
            { url: source.url, queryId: new ObjectId(queryId) },
            { $set: source },
            { upsert: true }
          );
        }
      }

      await job.progress(100);

      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('scanJobs', processingTime);

      logger.info(
        {
          jobId,
          documentsFound: scanResult.documents.length,
          sourcesFound: scanResult.suggestedSources.length,
          processingTimeMs: processingTime,
        },
        'Scan job completed'
      );

      const result: ScanJobResult = {
        success: true,
        documents: scanResult.documents,
        suggestedSources: scanResult.suggestedSources,
        progress: scanResult.progress,
      };

      // Determine final status
      const finalStatus = documentsFailed > 0 ? 'completed_with_errors' : 'completed';
      const message = documentsFailed > 0
        ? `Scan completed with ${documentsFailed} errors. Found ${scanResult.documents.length} documents (${documentsSaved} saved), ${scanResult.suggestedSources.length} sources.`
        : `Scan completed successfully. Found ${scanResult.documents.length} documents and ${scanResult.suggestedSources.length} sources.`;

      // Emit job completed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_completed',
        jobId,
        jobType: 'scan',
        queryId,
        timestamp: new Date(),
        data: {
          status: finalStatus,
          message,
          result,
          metadata: {
            documentsFound: scanResult.documents.length,
            documentsSaved,
            documentsFailed,
            sourcesFound: scanResult.suggestedSources.length,
          },
          error: documentsFailed > 0 ? `${documentsFailed} documents failed to save` : undefined,
        },
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('scanJobs', processingTime);
      logger.error({ jobId, error, processingTimeMs: processingTime }, 'Error processing scan job');

      // Emit job failed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_failed',
        jobId,
        jobType: 'scan',
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




