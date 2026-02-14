import { Router, Request, Response } from 'express';
import { ExportService, ExportOptions, ExportFormat } from '../services/export/ExportService.js';
import { AuthService } from '../services/auth/AuthService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../types/errors.js';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { Readable } from 'stream';
import { getQueueService } from '../services/infrastructure/QueueService.js';
import type { ExportJobData } from '../types/job-data.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createExportTemplateRoutes } from './exportTemplateRoutes.js';
import { isTest } from '../config/env.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { logger } from '../utils/logger.js';

export function createExportRoutes(authService: AuthService): Router {
    const router = Router();
    const exportService = new ExportService();
    
    // Mount export template routes
    router.use('/', createExportTemplateRoutes(authService));

    // Rate limiter for export endpoints (10 exports per 15 minutes per user)
    const exportLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // 10 exports per window
        message: 'Too many export requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            // Skip rate limiting in test/CI environment
            if (isTest() || process.env.CI === 'true' || process.env.PLAYWRIGHT === 'true') {
                return true;
            }
            // Skip rate limiting for developers/admins
            return req.user?.role === 'developer' || req.user?.role === 'admin';
        },
    });

    /**
     * POST /api/export
     * Export search results to various formats (CSV, PDF, JSON, Markdown, TSV, HTML, XML, XLSX)
     * Note: This is the root route of the export router (mounted at /api/export)
     */
    router.post(
        '/',
        authenticate(authService),
        exportLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            const { documents, format, includeCitations, citationFormat, searchParams, templateId } = req.body;

            // Validate required fields
            if (!documents || !Array.isArray(documents) || documents.length === 0) {
                throw new BadRequestError('Documents array is required', {
                    field: 'documents',
                    received: documents,
                });
            }

            // Validate format
            const supportedFormats: ExportFormat[] = ['csv', 'pdf', 'json', 'xlsx', 'markdown', 'tsv', 'html', 'xml'];
            if (!format || !supportedFormats.includes(format)) {
                throw new BadRequestError(`Format must be one of: ${supportedFormats.join(', ')}`, {
                    field: 'format',
                    received: format,
                    supportedFormats,
                });
            }

                // Limit exports to 500 results max
                const documentsToExport = documents.slice(0, 500);

                // Convert to export format
                const exportDocuments = exportService.convertToExportDocuments(documentsToExport);

                const options: ExportOptions = {
                    format,
                    includeCitations: includeCitations === true,
                    citationFormat: citationFormat === 'custom' ? 'custom' : 'apa',
                    searchParams,
                    templateId, // Optional custom template ID
                };

                // Generate export content using format abstraction
                const exportContent = await exportService.generate(exportDocuments, options);
                const filename = exportService.formatFilename(
                    searchParams?.topic || 'export',
                    format
                );
                const mimeType = exportService.getMimeType(format);

                // Log export creation for audit
                AuditLogService.logDataAccess(
                    req,
                    'query',
                    searchParams?.queryId || 'unknown',
                    'export',
                    {
                        format,
                        documentCount: documentsToExport.length,
                        includeCitations,
                        citationFormat,
                        templateId,
                    }
                ).catch((error) => {
                    // Don't fail request if audit logging fails
                    logger.error({ error }, 'Failed to log export creation audit event');
                });

                // Set response headers
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                // Handle stream-based formats (PDF, XLSX)
                if (exportContent instanceof Readable) {
                    let responseEnded = false;

                    // Handle client disconnection
                    req.on('close', () => {
                        responseEnded = true;
                        if (!exportContent.destroyed) {
                            exportContent.destroy();
                        }
                    });

                    req.on('aborted', () => {
                        responseEnded = true;
                        if (!exportContent.destroyed) {
                            exportContent.destroy();
                        }
                    });

                    exportContent.on('data', (chunk) => {
                        if (!responseEnded && !res.closed && !req.aborted && 
                            res.socket?.writable !== false && !res.socket?.destroyed) {
                            try {
                                res.write(chunk);
                            } catch (error) {
                                // Handle EPIPE and connection errors gracefully
                                const errorMessage = error instanceof Error ? error.message : String(error);
                                const isConnectionError = 
                                    errorMessage.includes('EPIPE') ||
                                    errorMessage.includes('ECONNRESET') ||
                                    errorMessage.includes('socket hang up') ||
                                    errorMessage.includes('write after end');
                                
                                // Connection errors are expected when client disconnects
                                if (!isConnectionError) {
                                    console.error(`Export write error (${format}):`, error);
                                }
                                
                                responseEnded = true;
                                if (!exportContent.destroyed) {
                                    exportContent.destroy();
                                }
                            }
                        } else {
                            if (!exportContent.destroyed) {
                                exportContent.destroy();
                            }
                        }
                    });

                    exportContent.on('end', () => {
                        if (!responseEnded && !res.closed) {
                            res.end();
                        }
                    });

                    exportContent.on('error', async (error) => {
                        logger.error({ error, format }, `Export generation error (${format})`);
                        if (!responseEnded && !res.headersSent) {
                            // Stream errors need special handling - use consistent error format
                            // Use ServiceUnavailableError for proper error handling
                            const serviceError = new ServiceUnavailableError(
                                `Failed to generate ${format.toUpperCase()} export`,
                                { originalError: error instanceof Error ? error.message : String(error) }
                            );
                            // Transform error to response format
                            const { transformErrorToResponse } = await import('../utils/errorTransformation.js');
                            const errorResponse = transformErrorToResponse(serviceError, req);
                            res.status(errorResponse.statusCode).json(errorResponse);
                        } else if (!responseEnded && !res.closed) {
                            res.end();
                        }
                        responseEnded = true;
                    });
            } else {
                // Handle string-based formats (CSV, JSON, Markdown)
                res.send(exportContent);
            }
        })
    );

    /**
     * POST /api/export/email
     * Email search results as attachment
     */
    router.post(
        '/export/email',
        authenticate(authService),
        exportLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            const { documents, recipients, searchParams, includeCitations: _includeCitations, citationFormat: _citationFormat } = req.body;

            // Validate required fields
            if (!documents || !Array.isArray(documents) || documents.length === 0) {
                throw new BadRequestError('Documents array is required', {
                    field: 'documents',
                    received: documents,
                });
            }

            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                throw new BadRequestError('Recipients array is required', {
                    field: 'recipients',
                    received: recipients,
                });
            }

            // Validate email addresses
            // Security: Limit email length and use bounded pattern to prevent ReDoS
            const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
            const invalidEmails = recipients.filter((email: string) => {
                // Check length first to prevent ReDoS
                if (email.length > 254) return true; // RFC 5321 limit
                return !emailRegex.test(email);
            });
            if (invalidEmails.length > 0) {
                throw new BadRequestError(`Invalid email addresses: ${invalidEmails.join(', ')}`, {
                    field: 'recipients',
                    invalidEmails,
                });
            }

                // Limit exports to 500 results max
                const documentsToExport = documents.slice(0, 500);

                // Convert to export format
                const exportDocuments = exportService.convertToExportDocuments(documentsToExport);

                // Generate CSV attachment (email exports use CSV by default)
                const exportOptions: ExportOptions = {
                    format: 'csv',
                    searchParams,
                };
                const csvContent = await exportService.generate(exportDocuments, exportOptions) as string;
                const filename = exportService.formatFilename(
                    searchParams?.topic || 'export',
                    'csv'
                );

                // Configure email transporter (check for SMTP config, otherwise return error)
                const smtpHost = process.env.SMTP_HOST;
                const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
                const smtpUser = process.env.SMTP_USER;
                const smtpPass = process.env.SMTP_PASSWORD;

            if (!smtpHost || !smtpUser || !smtpPass) {
                throw new ServiceUnavailableError('Email service not configured. Please configure SMTP settings.', {
                    missingConfig: {
                        smtpHost: !smtpHost,
                        smtpUser: !smtpUser,
                        smtpPass: !smtpPass,
                    },
                });
            }

                const transporter = nodemailer.createTransport({
                    host: smtpHost,
                    port: smtpPort,
                    secure: smtpPort === 465,
                    auth: {
                        user: smtpUser,
                        pass: smtpPass,
                    },
                });

                // Build email summary
                const searchSummary = [
                    `Topic: ${searchParams?.topic || 'N/A'}`,
                    searchParams?.location ? `Location: ${searchParams.location}` : null,
                    searchParams?.jurisdiction ? `Jurisdiction: ${searchParams.jurisdiction}` : null,
                    `Results: ${exportDocuments.length}`,
                ]
                    .filter(Boolean)
                    .join('\n');

                // Send email
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || smtpUser,
                    to: recipients.join(', '),
                    subject: `Beleidsscan Search Results: ${searchParams?.topic || 'Export'}`,
                    text: `Search Results Summary\n\n${searchSummary}\n\nPlease see the attached CSV file for full details.`,
                    html: `<h2>Search Results Summary</h2><pre>${searchSummary}</pre><p>Please see the attached CSV file for full details.</p>`,
                    attachments: [
                        {
                            filename,
                            content: csvContent,
                            contentType: 'text/csv',
                        },
                    ],
                });

            res.json({
                message: 'Email sent successfully',
                recipients: recipients.length,
            });
        })
    );

    /**
     * POST /api/export/queue
     * Queue an export job for asynchronous processing
     * Supports documents array directly (like synchronous export) or queryId/documentIds
     */
    router.post(
        '/export/queue',
        authenticate(authService),
        exportLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            const { queryId, documentIds, documents, format, includeCitations, citationFormat, searchParams, templateId } = req.body;

            // Validate format
            const supportedFormats: ExportFormat[] = ['csv', 'pdf', 'json', 'xlsx', 'markdown', 'tsv', 'html', 'xml'];
            if (!format || !supportedFormats.includes(format)) {
                throw new BadRequestError(`Format must be one of: ${supportedFormats.join(', ')}`, {
                    field: 'format',
                    received: format,
                    supportedFormats,
                });
            }

            // Validate that at least one source is provided
            const hasDocuments = documents && Array.isArray(documents) && documents.length > 0;
            const hasDocumentIds = documentIds && Array.isArray(documentIds) && documentIds.length > 0;
            const hasQueryId = !!queryId;

            if (!hasDocuments && !hasDocumentIds && !hasQueryId) {
                throw new BadRequestError('Either documents array, documentIds array, or queryId is required', {
                    received: { documents, documentIds, queryId },
                });
            }

                // Limit documents array to 500 results max (same as synchronous export)
                const documentsToExport = hasDocuments ? documents.slice(0, 500) : undefined;

                // Create export job data
                const jobData: ExportJobData = {
                    queryId,
                    documentIds: hasDocumentIds ? documentIds : undefined,
                    documents: documentsToExport,
                    format: format as ExportJobData['format'],
                    options: {
                        includeCitations: includeCitations === true,
                        includeMetadata: true,
                        includeContent: false,
                        citationFormat: citationFormat === 'custom' ? 'custom' : 'apa',
                        searchParams,
                        templateId,
                    },
                };

                // Queue the export job
                const queueService = getQueueService();
                const job = await queueService.queueExport(jobData);

            res.json({
                jobId: String(job.id),
                status: 'queued',
                message: 'Export job queued successfully',
            });
        })
    );

    /**
     * GET /api/export/job/:jobId
     * Get export job status
     */
    router.get(
        '/export/job/:jobId',
        authenticate(authService),
        asyncHandler(async (req: Request, res: Response) => {
            const { jobId } = req.params;
            const queueService = getQueueService();

            // Get job from queue
            const job = await queueService.getJobStatus(jobId, 'export');
            if (!job) {
                throw new NotFoundError('Export job', jobId);
            }

                // Get job state
                const state = await job.getState();
                const progressValue = job.progress();
                const progress = typeof progressValue === 'number' ? progressValue : 0;

                // Get result if completed
                let result = null;
                if (state === 'completed') {
                    result = await job.finished();
                }

                // Get error if failed
                let error = null;
                if (state === 'failed') {
                    error = job.failedReason || 'Unknown error';
                }

            res.json({
                jobId: String(job.id),
                status: state,
                progress,
                result,
                error,
                createdAt: new Date(job.timestamp).toISOString(),
                processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
                finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
            });
        })
    );

    /**
     * GET /api/export/job/:jobId/download
     * Download completed export file
     */
    router.get(
        '/export/job/:jobId/download',
        authenticate(authService),
        asyncHandler(async (req: Request, res: Response) => {
            const { jobId } = req.params;
            const queueService = getQueueService();

            // Get job from queue
            const job = await queueService.getJobStatus(jobId, 'export');
            if (!job) {
                throw new NotFoundError('Export job', jobId);
            }

            // Check if job is completed
            const state = await job.getState();
            if (state !== 'completed') {
                throw new BadRequestError(`Export job is not completed. Current status: ${state}`, {
                    jobId,
                    currentStatus: state,
                });
            }

            // Get result with file path
            const result = await job.finished();
            if (!result || !result.filePath) {
                throw new NotFoundError('Export file', undefined, { jobId });
            }

            // Check if file exists
            try {
                await fs.access(result.filePath);
            } catch {
                throw new NotFoundError('Export file', undefined, { 
                    jobId, 
                    filePath: result.filePath,
                    reason: 'File no longer exists',
                });
            }

                // Get file stats
                const stats = await fs.stat(result.filePath);
                const filename = path.basename(result.filePath);

                // Determine content type based on format
                const exportService = new ExportService();
                const mimeType = exportService.getMimeType(result.format as ExportFormat);

                // Log export download for audit
                AuditLogService.logDataAccess(
                    req,
                    'query',
                    jobId,
                    'download',
                    {
                        format: result.format,
                        filePath: result.filePath,
                        fileSize: stats.size,
                        filename,
                    }
                ).catch((error) => {
                    // Don't fail request if audit logging fails
                    logger.error({ error, jobId }, 'Failed to log export download audit event');
                });

                // Set response headers
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.setHeader('Content-Length', stats.size.toString());

                // Stream file to response with proper cleanup
                const fsModule = await import('fs');
                const fileStream = fsModule.createReadStream(result.filePath);
                
                // Ensure stream is closed on errors
                fileStream.on('error', async (error) => {
                    logger.error({ error, jobId }, 'File stream error');
                    if (!res.headersSent) {
                        // Stream errors need special handling - use consistent error format
                        // Use ServiceUnavailableError for proper error handling
                        const serviceError = new ServiceUnavailableError(
                            'Failed to stream export file',
                            { originalError: error instanceof Error ? error.message : String(error) }
                        );
                        // Transform error to response format
                        const { transformErrorToResponse } = await import('../utils/errorTransformation.js');
                        const errorResponse = transformErrorToResponse(serviceError, req);
                        res.status(errorResponse.statusCode).json(errorResponse);
                    }
                    fileStream.destroy();
                });
                
                res.on('close', () => {
                    // Close stream if client disconnects
                    if (!fileStream.destroyed) {
                        fileStream.destroy();
                    }
                });
            
            fileStream.pipe(res);
        })
    );

    return router;
}
