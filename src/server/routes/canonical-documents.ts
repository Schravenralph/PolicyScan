/**
 * Canonical Documents API Routes
 *
 * Provides CRUD operations for canonical documents.
 * Returns canonical document format directly (no transformation).
 *
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 * @see WI-411: API Layer Migration
 */
import express, { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { validate } from '../middleware/validation.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { getCanonicalDocumentService } from '../services/canonical/CanonicalDocumentService.js';
import { Query } from '../models/Query.js';
import { logger } from '../utils/logger.js';
import { parsePaginationParams, createPaginatedResponse } from '../utils/pagination.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError } from '../types/errors.js';
import { SourcePerformanceService } from '../services/source/SourcePerformanceService.js';
import { getDB } from '../config/database.js';
import { canonicalDocumentSchemas } from '../validation/canonicalDocumentSchemas.js';
import { DocumentExtractionService } from '../services/ingestion/extraction/DocumentExtractionService.js';
import type { DocumentFilters, DocumentSource, DocumentReviewStatus, DocumentReviewMetadata, CanonicalDocumentDraft } from '../contracts/types.js';

const router: Router = express.Router();

/**
 * Get source performance service instance
 *
 * Used to track source performance when documents are accepted/rejected.
 */
function getSourcePerformanceService(): SourcePerformanceService | null {
    if (process.env.SOURCE_RANKING_ENABLED === 'false') {
        return null;
    }
    try {
        const db = getDB();
        return new SourcePerformanceService(db);
    } catch (error) {
        logger.warn({ error }, 'Could not initialize SourcePerformanceService');
        return null;
    }
}

/**
 * GET /api/canonical-documents
 * List all canonical documents with pagination
 * 
 * Query parameters:
 * - queryId (optional): Filter documents by query ID
 * - workflowRunId (optional): Filter documents by workflow run ID
 * - limit, skip, page: Pagination parameters
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    // Log request for debugging
    logger.debug({
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
            origin: req.headers.origin,
            host: req.headers.host,
            'user-agent': req.headers['user-agent'],
        },
        ip: req.ip || req.socket.remoteAddress,
    }, 'GET /api/canonical-documents - Request received');
    
    const { limit, skip, page } = parsePaginationParams(req.query, { maxLimit: 1000 });
    
    // Build filters from query parameters
    const filters: DocumentFilters = {};
    
    // Validate and add source filter
    if (req.query.source) {
        const source = req.query.source as string;
        const validSources: DocumentSource[] = ['DSO', 'Rechtspraak', 'Wetgeving', 'Gemeente', 'PDOK', 'Web'];
        if (!validSources.includes(source as DocumentSource)) {
            throw new BadRequestError(`Invalid source parameter: must be one of ${validSources.join(', ')}`);
        }
        filters.source = source as DocumentSource;
    }
    
    // Validate and add queryId filter
    if (req.query.queryId) {
        const queryId = req.query.queryId as string;
        if (!ObjectId.isValid(queryId)) {
            throw new BadRequestError('Invalid queryId parameter: must be a valid MongoDB ObjectId');
        }
        filters.queryId = queryId;
    }
    
    // Validate and add workflowRunId filter
    if (req.query.workflowRunId) {
        const workflowRunId = req.query.workflowRunId as string;
        if (!ObjectId.isValid(workflowRunId)) {
            throw new BadRequestError('Invalid workflowRunId parameter: must be a valid MongoDB ObjectId');
        }
        filters.workflowRunId = workflowRunId;
    }
    
    // Validate and add reviewStatus filter
    if (req.query.reviewStatus) {
        const reviewStatus = req.query.reviewStatus;
        const validStatuses: DocumentReviewStatus[] = ['pending_review', 'approved', 'rejected', 'needs_revision'];
        
        if (Array.isArray(reviewStatus)) {
            // Multiple statuses - validate each
            const invalidStatuses = reviewStatus.filter(s => !validStatuses.includes(s as DocumentReviewStatus));
            if (invalidStatuses.length > 0) {
                throw new BadRequestError(`Invalid reviewStatus values: ${invalidStatuses.join(', ')}. Must be one of ${validStatuses.join(', ')}`);
            }
            filters.reviewStatus = reviewStatus as DocumentReviewStatus[];
        } else {
            // Single status
            if (!validStatuses.includes(reviewStatus as DocumentReviewStatus)) {
                throw new BadRequestError(`Invalid reviewStatus parameter: must be one of ${validStatuses.join(', ')}`);
            }
            filters.reviewStatus = reviewStatus as DocumentReviewStatus;
        }
    }
    
    const documentService = getCanonicalDocumentService();
    const [documents, total] = await Promise.all([
        documentService.findByQuery(filters, { limit, skip, page }),
        documentService.countByQuery(filters),
    ]);
    const response = createPaginatedResponse(documents, total, limit, page, skip);
    
    logger.debug({
        method: req.method,
        path: req.path,
        documentCount: documents.length,
        total,
        limit,
        page,
        skip,
    }, 'GET /api/canonical-documents - Response sent');
    
    res.json(response);
}));

/**
 * GET /api/canonical-documents/query/:queryId
 * Get canonical documents by query ID
 * 
 * Note: maxLimit set to 20000 to support large document sets in the beleidsscan wizard.
 * Frontend should explicitly pass limit parameter for best performance.
 */
router.get('/query/:queryId', validate(canonicalDocumentSchemas.getByQuery), asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, { defaultLimit: 20000, maxLimit: 20000 });
    const queryId = req.params.queryId;

    // Check if query exists
    const query = await Query.findById(queryId);
    if (!query) {
        throw new NotFoundError('Query', queryId);
    }

    const documentService = getCanonicalDocumentService();
    const [documents, total] = await Promise.all([
        documentService.findByQueryId(queryId, { limit, skip, page }),
        documentService.countByQueryId(queryId),
    ]);
    const response = createPaginatedResponse(documents, total, limit, page, skip);
    res.json(response);
}));

/**
 * GET /api/canonical-documents/workflow-run/:runId
 * Get canonical documents by workflow run ID
 */
router.get('/workflow-run/:runId', validate(canonicalDocumentSchemas.getByWorkflowRun), asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, { maxLimit: 1000 });
    const runId = req.params.runId;

    // Validate runId is a valid ObjectId
    if (!ObjectId.isValid(runId)) {
        throw new BadRequestError('Invalid workflow run ID format');
    }

    const documentService = getCanonicalDocumentService();
    const [documents, total] = await Promise.all([
        documentService.findByWorkflowRunId(runId, { limit, skip, page }),
        documentService.countByWorkflowRunId(runId),
    ]);
    const response = createPaginatedResponse(documents, total, limit, page, skip);
    res.json(response);
}));

/**
 * GET /api/canonical-documents/website
 * Get canonical documents by website URL
 */
router.get('/website', validate(canonicalDocumentSchemas.getByWebsite), asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, { maxLimit: 1000 });
    const websiteUrl = req.query.url as string | undefined;

    if (!websiteUrl) {
        throw new BadRequestError('Website URL query parameter is required');
    }

    const documentService = getCanonicalDocumentService();
    const [documents, total] = await Promise.all([
        documentService.findByWebsiteUrl(websiteUrl, { limit, skip, page }),
        documentService.countByWebsiteUrl(websiteUrl),
    ]);
    const response = createPaginatedResponse(documents, total, limit, page, skip);
    res.json(response);
}));

/**
 * GET /api/canonical-documents/review-queue
 * Get documents pending review
 * 
 * NOTE: This route must come BEFORE /:id to avoid route matching conflicts
 */
router.get('/review-queue', validate(canonicalDocumentSchemas.getReviewQueue), asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, { maxLimit: 1000 });
    // Handle reviewStatus - default to 'pending_review' if not provided
    let reviewStatus: DocumentReviewStatus | DocumentReviewStatus[] | undefined = req.query.reviewStatus as DocumentReviewStatus | DocumentReviewStatus[] | undefined;
    if (!reviewStatus) {
        reviewStatus = 'pending_review';
    }
    const source = req.query.source as DocumentSource | undefined;
    const documentFamily = req.query.documentFamily as string | undefined;

    const filters: DocumentFilters = {
        reviewStatus,
        ...(source && { source }),
        ...(documentFamily && { documentFamily: documentFamily as any }),
    };

    const documentService = getCanonicalDocumentService();
    const [documents, total] = await Promise.all([
        documentService.findByQuery(filters, { limit, skip, page }),
        documentService.countByQuery(filters),
    ]);

    const response = createPaginatedResponse(documents, total, limit, page, skip);
    res.json(response);
}));

/**
 * GET /api/canonical-documents/:id/with-extensions
 * Get a canonical document by ID with extensions loaded
 * 
 * Query parameters:
 * - extensionTypes (optional): Comma-separated list of extension types to load (geo,legal,web)
 *   If not provided, loads all available extensions
 */
router.get('/:id/with-extensions', validate(canonicalDocumentSchemas.getWithExtensions), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    // Parse extension types from query parameter
    let extensionTypes: string[] | undefined;
    if (req.query.extensionTypes) {
        const typesParam = req.query.extensionTypes as string;
        extensionTypes = typesParam.split(',').map(t => t.trim()).filter(t => t.length > 0);
        const validTypes = ['geo', 'legal', 'web'];
        const invalidTypes = extensionTypes.filter(t => !validTypes.includes(t));
        if (invalidTypes.length > 0) {
            throw new BadRequestError(`Invalid extension types: ${invalidTypes.join(', ')}. Must be one of: ${validTypes.join(', ')}`);
        }
    }

    const documentService = getCanonicalDocumentService();
    const document = await documentService.getDocumentWithExtensions(
        id,
        extensionTypes as ('geo' | 'legal' | 'web')[] | undefined
    );
    if (!document) {
        throw new NotFoundError('CanonicalDocument', id);
    }
    res.json(document);
}));

/**
 * POST /api/canonical-documents/with-extensions
 * Batch load canonical documents with extensions
 * 
 * Request body:
 * {
 *   "documentIds": ["id1", "id2", ...],
 *   "extensionTypes": ["geo", "legal"] // optional
 * }
 */
router.post('/with-extensions', sanitizeInput, validate(canonicalDocumentSchemas.batchWithExtensions), asyncHandler(async (req: Request, res: Response) => {
    const { documentIds, extensionTypes } = req.body as {
        documentIds: string[];
        extensionTypes?: string[];
    };

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw new BadRequestError('documentIds must be a non-empty array');
    }

    // Validate all document IDs
    const invalidIds = documentIds.filter(id => !ObjectId.isValid(id));
    if (invalidIds.length > 0) {
        throw new BadRequestError(`Invalid document IDs: ${invalidIds.join(', ')}`);
    }

    // Validate extension types if provided
    if (extensionTypes) {
        const validTypes = ['geo', 'legal', 'web'];
        const invalidTypes = extensionTypes.filter(t => !validTypes.includes(t));
        if (invalidTypes.length > 0) {
            throw new BadRequestError(`Invalid extension types: ${invalidTypes.join(', ')}. Must be one of: ${validTypes.join(', ')}`);
        }
    }

    const documentService = getCanonicalDocumentService();
    const documents = await documentService.getDocumentsWithExtensions(
        documentIds,
        extensionTypes as ('geo' | 'legal' | 'web')[] | undefined
    );
    res.json(documents);
}));

/**
 * GET /api/canonical-documents/:id/artifacts
 * Get all artifact references for a document
 */
router.get('/:id/artifacts', validate(canonicalDocumentSchemas.getArtifacts), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const artifactRefs = await documentService.getArtifactRefs(id);
    res.json(artifactRefs);
}));

/**
 * GET /api/canonical-documents/:id/artifacts/:mimeType
 * Get artifact reference by MIME type
 */
router.get('/:id/artifacts/:mimeType', validate(canonicalDocumentSchemas.getArtifactByMimeType), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const mimeType = req.params.mimeType;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const artifactRef = await documentService.getArtifactRefByMimeType(id, mimeType);
    if (!artifactRef) {
        throw new NotFoundError('ArtifactRef', `Document ${id} with MIME type ${mimeType}`);
    }
    res.json(artifactRef);
}));

/**
 * GET /api/canonical-documents/:id/artifact-content
 * Get artifact content as binary
 * 
 * Query parameters:
 * - mimeType (optional): Filter by MIME type
 */
router.get('/:id/artifact-content', validate(canonicalDocumentSchemas.getArtifactContent), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const mimeType = req.query.mimeType as string | undefined;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const content = await documentService.getArtifactContent(id, mimeType);
    if (!content) {
        throw new NotFoundError('Artifact', `Document ${id}${mimeType ? ` with MIME type ${mimeType}` : ''}`);
    }

    // Set appropriate content type
    const artifactRef = mimeType 
        ? await documentService.getArtifactRefByMimeType(id, mimeType)
        : (await documentService.getArtifactRefs(id))[0];
    
    res.setHeader('Content-Type', artifactRef?.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', content.length.toString());
    res.send(content);
}));

/**
 * GET /api/canonical-documents/:id/artifact-content/text
 * Get artifact content as text string
 * 
 * Query parameters:
 * - mimeType (optional): Filter by MIME type
 * - encoding (optional): Text encoding (default: utf-8)
 */
router.get('/:id/artifact-content/text', validate(canonicalDocumentSchemas.getArtifactContentText), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const mimeType = req.query.mimeType as string | undefined;
    const encoding = (req.query.encoding as BufferEncoding) || 'utf-8';

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const content = await documentService.getArtifactAsString(id, mimeType, encoding);
    if (!content) {
        throw new NotFoundError('Artifact', `Document ${id}${mimeType ? ` with MIME type ${mimeType}` : ''}`);
    }

    res.setHeader('Content-Type', 'text/plain; charset=' + encoding);
    res.send(content);
}));

/**
 * GET /api/canonical-documents/:id/bundle/files
 * List all files in a bundle
 * 
 * Query parameters:
 * - bundleMimeType (optional): MIME type of the bundle (default: application/zip)
 */
router.get('/:id/bundle/files', validate(canonicalDocumentSchemas.listBundleFiles), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const bundleMimeType = (req.query.bundleMimeType as string) || 'application/zip';

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const files = await documentService.listBundleFiles(id, bundleMimeType);
    res.json(files);
}));

/**
 * GET /api/canonical-documents/:id/bundle/files/:format
 * Get files in bundle by format
 * 
 * Query parameters:
 * - bundleMimeType (optional): MIME type of the bundle (default: application/zip)
 */
router.get('/:id/bundle/files/:format', validate(canonicalDocumentSchemas.getBundleFilesByFormat), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const format = req.params.format;
    const bundleMimeType = (req.query.bundleMimeType as string) || 'application/zip';

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const files = await documentService.getBundleFilesByFormat(id, format, bundleMimeType);
    res.json(files);
}));

/**
 * GET /api/canonical-documents/:id/bundle/file-content
 * Extract file from bundle as binary
 * 
 * Query parameters:
 * - filename: Filename within the bundle (required)
 * - bundleMimeType (optional): MIME type of the bundle (default: application/zip)
 */
router.get('/:id/bundle/file-content', validate(canonicalDocumentSchemas.getBundleFileContent), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const filename = req.query.filename as string | undefined;
    const bundleMimeType = (req.query.bundleMimeType as string) || 'application/zip';

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    if (!filename) {
        throw new BadRequestError('filename query parameter is required');
    }

    const documentService = getCanonicalDocumentService();
    const content = await documentService.extractFileFromBundle(id, filename, bundleMimeType);
    if (!content) {
        throw new NotFoundError('BundleFile', `File ${filename} in document ${id}`);
    }

    // Try to determine content type from filename
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
        'xml': 'application/xml',
        'json': 'application/json',
        'txt': 'text/plain',
        'geojson': 'application/geo+json',
    };
    const contentType = mimeMap[ext || ''] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', content.length.toString());
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(content);
}));

/**
 * GET /api/canonical-documents/:id/bundle/file-content/text
 * Extract file from bundle as text string
 * 
 * Query parameters:
 * - filename: Filename within the bundle (required)
 * - bundleMimeType (optional): MIME type of the bundle (default: application/zip)
 * - encoding (optional): Text encoding (default: utf-8)
 */
router.get('/:id/bundle/file-content/text', validate(canonicalDocumentSchemas.getBundleFileContentText), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const filename = req.query.filename as string | undefined;
    const bundleMimeType = (req.query.bundleMimeType as string) || 'application/zip';
    const encoding = (req.query.encoding as BufferEncoding) || 'utf-8';

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    if (!filename) {
        throw new BadRequestError('filename query parameter is required');
    }

    const documentService = getCanonicalDocumentService();
    const content = await documentService.extractFileFromBundleAsString(id, filename, bundleMimeType, encoding);
    if (!content) {
        throw new NotFoundError('BundleFile', `File ${filename} in document ${id}`);
    }

    res.setHeader('Content-Type', 'text/plain; charset=' + encoding);
    res.send(content);
}));

/**
 * GET /api/canonical-documents/health
 * Health check endpoint for canonical documents route
 * Verifies the route is accessible and database connection is working
 * 
 * NOTE: This route must come BEFORE /:id to avoid route matching conflicts
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
    logger.info({
        method: req.method,
        path: req.path,
        headers: {
            origin: req.headers.origin,
            host: req.headers.host,
        },
        ip: req.ip || req.socket.remoteAddress,
    }, 'GET /api/canonical-documents/health - Health check requested');
    
    try {
        const documentService = getCanonicalDocumentService();
        // Simple database connectivity test
        const count = await documentService.countByQuery({});
        
        res.json({
            status: 'ok',
            route: '/api/canonical-documents',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                documentCount: count,
            },
            server: {
                port: process.env.PORT || 4000,
                nodeEnv: process.env.NODE_ENV,
            },
        });
    } catch (error) {
        logger.error({ error }, 'GET /api/canonical-documents/health - Health check failed');
        res.status(503).json({
            status: 'error',
            route: '/api/canonical-documents',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
            database: {
                connected: false,
            },
        });
    }
}));

/**
 * GET /api/canonical-documents/:id
 * Get a canonical document by ID
 */
router.get('/:id', validate(canonicalDocumentSchemas.getById), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const document = await documentService.findById(id);
    if (!document) {
        throw new NotFoundError('CanonicalDocument', id);
    }
    res.json(document);
}));

/**
 * POST /api/canonical-documents
 * Create a new canonical document
 *
 * Note: Most documents are created via workflow services.
 * This endpoint is provided for direct creation if needed.
 */
router.post('/', sanitizeInput, validate(canonicalDocumentSchemas.create), asyncHandler(async (req: Request, res: Response) => {
    const draft = req.body;
    
    // Transform date strings to Date objects if present
    if (draft.dates) {
        if (typeof draft.dates.publishedAt === 'string') {
            draft.dates.publishedAt = new Date(draft.dates.publishedAt);
        }
        if (typeof draft.dates.validFrom === 'string') {
            draft.dates.validFrom = new Date(draft.dates.validFrom);
        }
        if (typeof draft.dates.validTo === 'string') {
            draft.dates.validTo = new Date(draft.dates.validTo);
        }
    }
    
    const documentService = getCanonicalDocumentService();
    const document = await documentService.upsertBySourceId(draft, {});
    res.status(201).json(document);
}));

/**
 * POST /api/canonical-documents/extract-url
 * Extract content from a URL
 * 
 * Request body: { url: string }
 * Returns: { text: string, title?: string, metadata: {...} }
 */
router.post('/extract-url', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
        throw new BadRequestError('URL is required and must be a non-empty string');
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (error) {
        throw new BadRequestError('Invalid URL format');
    }

    try {
        const extractionService = new DocumentExtractionService();
        const result = await extractionService.extractFromUrl(url);

        // Try to extract title from HTML if it's an HTML page
        let title: string | undefined;
        if (result.metadata.format === 'html') {
            try {
                // For HTML, we can try to fetch and extract title
                const axios = (await import('axios')).default;
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Beleidsscan/1.0)'
                    }
                });
                const html = typeof response.data === 'string' ? response.data : '';
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                } else {
                    // Try h1 as fallback
                    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                    if (h1Match && h1Match[1]) {
                        title = h1Match[1].trim();
                    }
                }
            } catch (error) {
                // If title extraction fails, just continue without title
                logger.debug({ error, url }, 'Failed to extract title from HTML');
            }
        }

        res.json({
            text: result.text,
            title: title,
            metadata: result.metadata
        });
    } catch (error) {
        logger.error({ error, url }, 'Failed to extract content from URL');
        throw new BadRequestError(
            'Failed to extract content from URL',
            { message: error instanceof Error ? error.message : 'Unknown error' }
        );
    }
}));

/**
 * PATCH /api/canonical-documents/:id
 * Update a canonical document
 */
router.patch('/:id', sanitizeInput, validate(canonicalDocumentSchemas.update), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const updates = req.body as Record<string, unknown>;
    const documentService = getCanonicalDocumentService();

    // Get existing document
    const existing = await documentService.findById(id);
    if (!existing) {
        throw new NotFoundError('CanonicalDocument', id);
    }

    // Create updated draft - exclude fields that shouldn't be in draft (_id, createdAt, updatedAt, schemaVersion)
    // and merge with updates, ensuring source and sourceId are preserved
    const { _id, createdAt, updatedAt, schemaVersion, ...existingDraftFields } = existing;
    const updatedDraft: CanonicalDocumentDraft = {
        ...existingDraftFields,
        ...updates,
        source: existing.source, // Ensure source cannot be changed
        sourceId: existing.sourceId, // Ensure sourceId cannot be changed
    };

    // Upsert to update
    const document = await documentService.upsertBySourceId(updatedDraft, {});
    res.json(document);
}));

/**
 * PATCH /api/canonical-documents/:id/acceptance
 * Update document acceptance status
 */
router.patch('/:id/acceptance', sanitizeInput, validate(canonicalDocumentSchemas.updateAcceptance), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const { accepted } = req.body as { accepted?: boolean | null };

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    if (typeof accepted !== 'boolean' && accepted !== null) {
        throw new BadRequestError('Accepted must be boolean or null');
    }

    const documentService = getCanonicalDocumentService();
    const document = await documentService.findById(id);
    if (!document) {
        throw new NotFoundError('CanonicalDocument', id);
    }

    // Update acceptance in enrichmentMetadata
    // Explicitly destructure to remove _id and other internal fields that shouldn't be in a draft

    const { _id, ...documentData } = document;

    const updatedDraft = {
        ...documentData,
        enrichmentMetadata: {
            ...documentData.enrichmentMetadata,
            accepted,
        },
    };

    const updated = await documentService.upsertBySourceId(updatedDraft, {});

    // Track source performance if enabled
    const sourcePerformanceService = getSourcePerformanceService();
    if (sourcePerformanceService && document.sourceMetadata?.source) {
        try {
            // Get previous acceptance status for tracking changes
            const previousAccepted = (typeof document.enrichmentMetadata?.accepted === 'boolean' || document.enrichmentMetadata?.accepted === null)
                ? document.enrichmentMetadata.accepted
                : null;
            const sourceUrl = typeof document.sourceMetadata.source === 'string' 
                ? document.sourceMetadata.source 
                : (document.sourceMetadata.source as { url?: string })?.url;
            if (sourceUrl) {
                await sourcePerformanceService.updateSourcePerformance(sourceUrl, accepted ?? null, previousAccepted);
            }
        } catch (error) {
            logger.warn({ error, documentId: id }, 'Failed to record source performance');
        }
    }

    res.json(updated);
}));

/**
 * PATCH /api/canonical-documents/:id/review-status
 * Update document review status
 */
router.patch('/:id/review-status', sanitizeInput, validate(canonicalDocumentSchemas.updateReviewStatus), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const { reviewStatus, reviewNotes } = req.body as { reviewStatus: DocumentReviewStatus; reviewNotes?: string };

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const document = await documentService.findById(id);
    if (!document) {
        throw new NotFoundError('CanonicalDocument', id);
    }

    // Build review metadata
    const reviewMetadata: DocumentReviewMetadata = {
        reviewedAt: new Date(),
        reviewedBy: (req as any).user?.id || (req as any).user?.userId || undefined,
        reviewNotes,
        previousStatus: document.reviewStatus,
    };

    // Update document with new review status
     
    const { _id, ...documentData } = document;
    const updatedDraft = {
        ...documentData,
        reviewStatus,
        reviewMetadata,
    };

    const updated = await documentService.upsertBySourceId(updatedDraft, {});
    res.json(updated);
}));

/**
 * POST /api/canonical-documents/bulk-review-status
 * Bulk update review status for multiple documents
 * 
 * NOTE: This route must come BEFORE /:id to avoid route matching conflicts
 */
router.post('/bulk-review-status', sanitizeInput, validate(canonicalDocumentSchemas.bulkUpdateReviewStatus), asyncHandler(async (req: Request, res: Response) => {
    const { documentIds, reviewStatus, reviewNotes } = req.body as {
        documentIds: string[];
        reviewStatus: DocumentReviewStatus;
        reviewNotes?: string;
    };

    const documentService = getCanonicalDocumentService();
    const userId = (req as any).user?.id || (req as any).user?.userId || undefined;

    const result = await documentService.bulkUpdateReviewStatus({
        documentIds,
        reviewStatus,
        reviewNotes,
        userId,
    });

    res.json({
        success: result.success,
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        results: result.results.map(r => ({
            documentId: r.documentId,
            status: r.status,
            error: r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : undefined,
        })),
    });
}));

/**
 * DELETE /api/canonical-documents/:id
 * Delete a canonical document
 */
router.delete('/:id', validate(canonicalDocumentSchemas.delete), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid document ID format');
    }

    const documentService = getCanonicalDocumentService();
    const deleted = await documentService.deleteById(id, {});
    if (!deleted) {
        throw new NotFoundError('CanonicalDocument', id);
    }

    res.status(204).send();
}));

/**
 * GET /api/canonical-documents/monitoring/performance
 * Get performance statistics for canonical document operations
 * 
 * Query parameters:
 * - startDate (optional): Start date for statistics (ISO date-time)
 * - endDate (optional): End date for statistics (ISO date-time)
 * - operation (optional): Filter by operation type
 * - source (optional): Filter by document source
 */
/**
 * GET /api/canonical-documents/monitoring/performance
 * Get performance statistics for canonical document operations
 * 
 * Query parameters:
 * - startDate (optional): Start date for statistics (ISO date-time)
 * - endDate (optional): End date for statistics (ISO date-time)
 * - operation (optional): Filter by operation type
 * - source (optional): Filter by document source
 * 
 * Note: Authentication is handled at the router level in index.ts
 */
router.get('/monitoring/performance', asyncHandler(async (req: Request, res: Response) => {
    const { getCanonicalDocumentMonitoringService } = await import('../services/monitoring/CanonicalDocumentMonitoringService.js');
    const monitoringService = getCanonicalDocumentMonitoringService();
    
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const operation = req.query.operation as string | undefined;
    const source = req.query.source as string | undefined;
    
    const stats = await monitoringService.getPerformanceStats({
        startDate,
        endDate,
        operation,
        source: source as DocumentSource | undefined,
    });
    
    res.json({
        success: true,
        stats,
        timestamp: new Date().toISOString(),
    });
}));

/**
 * GET /api/canonical-documents/monitoring/identifier-matching
 * Get metrics for document identifier matching service
 * 
 * Returns performance metrics including cache hit rate, success rate, and lookup statistics.
 * 
 * Note: Authentication is handled at the router level in index.ts
 */
router.get('/monitoring/identifier-matching', asyncHandler(async (_req: Request, res: Response) => {
    const { DocumentIdentifierMatchingService } = await import('../services/identity/DocumentIdentifierMatchingService.js');
    const { getCanonicalDocumentService } = await import('../services/canonical/CanonicalDocumentService.js');
    
    const documentService = getCanonicalDocumentService();
    const matchingService = new DocumentIdentifierMatchingService(documentService);
    const metrics = matchingService.getMetrics();
    
    res.json({
        success: true,
        metrics: {
            ...metrics,
            cacheHitRatePercent: (metrics.cacheHitRate * 100).toFixed(2),
            successRatePercent: (metrics.successRate * 100).toFixed(2),
        },
        timestamp: new Date().toISOString(),
    });
}));

/**
 * GET /api/canonical-documents/monitoring/errors
 * Get error statistics for canonical document operations
 * 
 * Query parameters:
 * - startDate (optional): Start date for statistics (ISO date-time)
 * - endDate (optional): End date for statistics (ISO date-time)
 * 
 * Note: Authentication is handled at the router level in index.ts
 */
router.get('/monitoring/errors', asyncHandler(async (req: Request, res: Response) => {
    const { getCanonicalDocumentMonitoringService } = await import('../services/monitoring/CanonicalDocumentMonitoringService.js');
    const monitoringService = getCanonicalDocumentMonitoringService();
    
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    
    const errorStats = await monitoringService.getErrorStats({
        startDate,
        endDate,
    });
    
    res.json({
        success: true,
        ...errorStats,
        timestamp: new Date().toISOString(),
    });
}));

/**
 * GET /api/canonical-documents/monitoring/queryid-linkage
 * Get queryId linkage statistics for canonical documents
 * 
 * Query parameters:
 * - startDate (optional): Start date for statistics (ISO date-time)
 * - endDate (optional): End date for statistics (ISO date-time)
 * 
 * Returns statistics about documents with/without queryId and linkage issues.
 * 
 * Note: Authentication is handled at the router level in index.ts
 */
router.get('/monitoring/queryid-linkage', asyncHandler(async (req: Request, res: Response) => {
    const { getCanonicalDocumentMonitoringService } = await import('../services/monitoring/CanonicalDocumentMonitoringService.js');
    const monitoringService = getCanonicalDocumentMonitoringService();
    
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    
    const linkageStats = await monitoringService.getQueryIdLinkageStats({
        startDate,
        endDate,
    });
    
    res.json({
        success: true,
        ...linkageStats,
        timestamp: new Date().toISOString(),
    });
}));

export default router;
