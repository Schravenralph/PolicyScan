import Bull from 'bull';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { getWorkflowOutputService } from '../../workflow/WorkflowOutputService.js';
import { ExportService, ExportOptions, ExportFormat } from '../../export/ExportService.js';
import { Readable } from 'stream';
import { logger } from '../../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import type { ExportJobData, ExportJobResult } from '../../../types/job-data.js';
import type {
  ExportJobProcessor,
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './BaseJobProcessor.js';
import { BadRequestError } from '../../../types/errors.js';

/**
 * Processor for export jobs
 * Handles exporting documents/workflows in various formats
 */
export class ExportJobProcessorImpl implements ExportJobProcessor {
  constructor(
    private progressEmitter: ProgressEventEmitter,
    private metricsUpdater: PerformanceMetricsUpdater
  ) {}

  async process(job: Bull.Job<ExportJobData>): Promise<ExportJobResult> {
    const { queryId, runId, documentIds, documents, format, options } = job.data;
    const jobId = String(job.id);
    const startTime = Date.now();

    logger.info({ jobId, format, queryId, runId }, 'Processing export job');

    try {
      // Emit job started event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_started',
        jobId,
        jobType: 'export',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'active',
          message: `Starting export to ${format} format`,
        },
      });

      const db = getDB();
      const _outputService = getWorkflowOutputService();
      let filePath: string | undefined;
      let documentsExported = 0;

      await job.progress(10);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'export',
        queryId,
        timestamp: new Date(),
        data: {
          progress: 10,
          message: 'Preparing export...',
        },
      });

      if (runId) {
        // Export workflow output
        // This would use WorkflowOutputService to export the run
        // For now, this is a placeholder - actual export logic would need to be implemented
        await job.progress(50);
        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            progress: 50,
            message: 'Exporting workflow output...',
          },
        });
        logger.warn({ runId }, 'Workflow export not yet fully implemented');
      } else if (documents && documents.length > 0) {
        // Export documents provided directly (async export with documents array)
        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            progress: 20,
            message: `Processing ${documents.length} documents...`,
          },
        });

        await job.progress(50);
        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            progress: 50,
            message: `Converting ${documents.length} documents to ${format} format...`,
            metadata: {
              documentCount: documents.length,
              format,
            },
          },
        });

        // Convert documents to export format using ExportService
        const exportService = new ExportService();
        const exportDocuments = exportService.convertToExportDocuments(
          documents.map((doc) => ({
            id: doc._id || doc.url || String(Math.random()),
            content: doc.content || '',
            sourceUrl: doc.url || '',
            metadata: doc.metadata || {},
          }))
        );

        const exportOptions: ExportOptions = {
          format: format as ExportFormat,
          includeCitations: options?.includeCitations || false,
          citationFormat: options?.citationFormat || 'apa',
          searchParams: options?.searchParams,
          templateId: options?.templateId,
        };

        // Generate export content
        const exportContent: string | Readable = await exportService.generate(exportDocuments, exportOptions);
        const filename = exportService.formatFilename(
          options?.searchParams?.topic || 'export',
          format as ExportFormat
        );

        // Create export directory if it doesn't exist
        const exportDir = path.join(process.cwd(), 'data', 'exports');
        await fs.mkdir(exportDir, { recursive: true });

        // Generate unique file path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        filePath = path.join(exportDir, `${jobId}_${timestamp}_${filename}`);

        // Write export file
        if (exportContent instanceof Readable) {
          // Stream-based formats (PDF, XLSX)
          const fsModule = await import('fs');
          const writeStream = fsModule.createWriteStream(filePath);
          await new Promise<void>((resolve, reject) => {
            exportContent.pipe(writeStream);
            exportContent.on('end', () => {
              writeStream.end();
              resolve();
            });
            exportContent.on('error', (error) => {
              writeStream.destroy();
              reject(error);
            });
            writeStream.on('error', (error) => {
              exportContent.destroy();
              reject(error);
            });
            writeStream.on('close', () => {
              // Stream fully closed
            });
          });
        } else {
          // String-based formats (CSV, JSON, Markdown, TSV, HTML, XML)
          await fs.writeFile(filePath, exportContent, 'utf-8');
        }

        // Get file size
        const stats = await fs.stat(filePath);
        documentsExported = documents?.length || 0;

        await job.progress(100);
        await this.progressEmitter.emitProgressEvent({
          type: 'job_completed',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            status: 'completed',
            message: `Export completed: ${documentsExported} documents exported`,
            metadata: {
              filePath,
              fileSize: stats.size,
              format,
              documentsExported,
            },
          },
        });

        const result: ExportJobResult = {
          success: true,
          filePath,
          fileSize: stats.size,
          format,
          documentsExported,
        };

        const duration = Date.now() - startTime;
        logger.info(
          { jobId, format, documentsExported, duration, fileSize: stats.size },
          'Export job completed successfully'
        );

        return result;
      } else if (queryId || documentIds) {
        // Export documents from queryId or documentIds
        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            progress: 20,
            message: 'Fetching documents...',
          },
        });

        // Use canonical document service
        const documentService = getCanonicalDocumentService();
        let canonicalDocs;

        // Limit maximum documents to prevent memory exhaustion
        // Default limit: 10000 documents, configurable via env
        const maxExportDocuments = parseInt(
          process.env.MAX_EXPORT_DOCUMENTS || '10000',
          10
        );

        if (documentIds && documentIds.length > 0) {
          // Limit documentIds to prevent loading too many documents
          const limitedDocumentIds = documentIds.slice(0, maxExportDocuments);
          if (documentIds.length > maxExportDocuments) {
            logger.warn(
              { total: documentIds.length, limited: maxExportDocuments },
              '[ExportJobProcessor] Export job: Document IDs list truncated to prevent memory exhaustion'
            );
          }
          canonicalDocs = await documentService.findByIds(limitedDocumentIds);
        } else if (queryId) {
          // Add limit to query-based export to prevent loading all documents
          canonicalDocs = await documentService.findByQueryId(queryId, {
            limit: maxExportDocuments,
            skip: 0,
          });
          // Check if there are more documents than the limit
          const totalCount = await documentService.countByQueryId(queryId);
          if (totalCount > maxExportDocuments) {
            logger.warn(
              { queryId, total: totalCount, exported: maxExportDocuments },
              '[ExportJobProcessor] Export job: Query result truncated to prevent memory exhaustion'
            );
          }
        } else {
          throw new BadRequestError('Either queryId or documentIds must be provided', {
            reason: 'missing_export_parameters',
            operation: 'processExportJob',
            jobData: Object.keys(job.data)
          });
        }

        await job.progress(50);
        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            progress: 50,
            message: `Converting ${canonicalDocs.length} documents to ${format} format...`,
            metadata: {
              documentCount: canonicalDocs.length,
              format,
            },
          },
        });

        // Convert canonical documents to export format using ExportService
        // Note: ExportService accepts generic document format, no legacy conversion needed
        const exportService = new ExportService();
        const exportDocuments = exportService.convertToExportDocuments(
          canonicalDocs.map((canonicalDoc) => {
            // Get URL from canonical document (canonicalUrl or sourceId) or fallback to legacy URL in sourceMetadata
            const sourceUrl = canonicalDoc.canonicalUrl || 
              canonicalDoc.sourceId || 
              (typeof canonicalDoc.sourceMetadata?.legacyUrl === 'string' ? canonicalDoc.sourceMetadata.legacyUrl : '');
            
            // Get summary from fullText (first paragraph) or sourceMetadata
            const summaryText = typeof canonicalDoc.sourceMetadata?.samenvatting === 'string'
              ? canonicalDoc.sourceMetadata.samenvatting
              : '';
            const content = canonicalDoc.fullText || summaryText || '';
            
            return {
              id: canonicalDoc._id?.toString() || '',
              content,
              sourceUrl,
              metadata: {
                title: canonicalDoc.title,
                name: canonicalDoc.title, // Alternative field name
                titel: canonicalDoc.title, // Legacy field name for compatibility
                source: canonicalDoc.source,
                url: sourceUrl,
                sourceUrl: sourceUrl,
                website_url: typeof canonicalDoc.sourceMetadata?.legacyWebsiteUrl === 'string' 
                  ? canonicalDoc.sourceMetadata.legacyWebsiteUrl 
                  : sourceUrl,
                website_titel: typeof canonicalDoc.sourceMetadata?.legacyWebsiteTitel === 'string'
                  ? canonicalDoc.sourceMetadata.legacyWebsiteTitel
                  : undefined,
                documentType: canonicalDoc.documentType,
                type_document: canonicalDoc.documentType, // Legacy field name
                publicationDate: canonicalDoc.dates?.publishedAt?.toISOString(),
                publicatiedatum: canonicalDoc.dates?.publishedAt?.toISOString(), // Legacy field name
                date: canonicalDoc.dates?.publishedAt?.toISOString(),
                summary: content.substring(0, 500), // First 500 chars as summary
                samenvatting: summaryText || content.substring(0, 500), // Legacy field name
                jurisdiction: canonicalDoc.publisherAuthority,
                ...canonicalDoc.sourceMetadata,
                ...canonicalDoc.enrichmentMetadata,
              },
            };
          })
        );

        // Get search params from query if available
        let searchParams: { topic?: string; location?: string; jurisdiction?: string } | undefined;
        if (queryId) {
          const query = await db.collection('queries').findOne({ _id: new ObjectId(queryId) });
          if (query) {
            searchParams = {
              topic: query.onderwerp || query.thema,
              location: query.location,
              jurisdiction: query.overheidslaag,
            };
          }
        }

        const exportOptions: ExportOptions = {
          format: format as ExportFormat,
          includeCitations: options?.includeCitations || false,
          citationFormat: 'apa',
          searchParams,
        };

        // Generate export content
        const exportContent: string | Readable = await exportService.generate(exportDocuments, exportOptions);
        const filename = exportService.formatFilename(
          searchParams?.topic || 'export',
          format as ExportFormat
        );

        // Create export directory if it doesn't exist
        const exportDir = path.join(process.cwd(), 'data', 'exports');
        await fs.mkdir(exportDir, { recursive: true });

        // Generate unique file path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        filePath = path.join(exportDir, `${jobId}_${timestamp}_${filename}`);

        // Write export file
        if (exportContent instanceof Readable) {
          // Stream-based formats (PDF, XLSX)
          const fsModule = await import('fs');
          const writeStream = fsModule.createWriteStream(filePath);
          await new Promise<void>((resolve, reject) => {
            exportContent.pipe(writeStream);
            exportContent.on('end', () => {
              writeStream.end();
              resolve();
            });
            exportContent.on('error', (error) => {
              writeStream.destroy();
              reject(error);
            });
            writeStream.on('error', (error) => {
              exportContent.destroy();
              reject(error);
            });
            writeStream.on('close', () => {
              // Stream fully closed
            });
          });
        } else {
          // String-based formats (CSV, JSON, Markdown, TSV, HTML, XML)
          await fs.writeFile(filePath, exportContent, 'utf-8');
        }

        // Get file size (unused - file size is retrieved later)
        const _stats = await fs.stat(filePath);
        documentsExported = canonicalDocs.length;

        await job.progress(90);
        await this.progressEmitter.emitProgressEvent({
          type: 'job_progress',
          jobId,
          jobType: 'export',
          queryId,
          timestamp: new Date(),
          data: {
            progress: 90,
            message: 'Finalizing export...',
          },
        });
      } else {
        throw new BadRequestError('Either runId, queryId, or documentIds must be provided', {
          reason: 'missing_export_parameters',
          operation: 'processExportJob',
          jobData: Object.keys(job.data)
        });
      }

      await job.progress(100);

      // Get file size if file was created
      let fileSize: number | undefined;
      if (filePath) {
        try {
          const stats = await fs.stat(filePath);
          fileSize = stats.size;
        } catch (error) {
          logger.warn({ filePath, error }, 'Failed to get file size');
        }
      }

      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('exportJobs', processingTime);
      logger.info({ jobId, format, documentsExported, filePath, processingTimeMs: processingTime }, 'Export job completed');

      const result: ExportJobResult = {
        success: true,
        filePath,
        fileSize,
        format,
        documentsExported,
        emailSent: options?.emailRecipient ? false : undefined, // Email sending would be implemented here
      };

      // Emit job completed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_completed',
        jobId,
        jobType: 'export',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'completed',
          message: `Export completed successfully. Exported ${documentsExported} documents to ${format} format.`,
          result,
          metadata: {
            format,
            documentsExported,
          },
        },
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('exportJobs', processingTime);
      logger.error({ jobId, error, processingTimeMs: processingTime }, 'Error processing export job');

      // Emit job failed event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_failed',
        jobId,
        jobType: 'export',
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

