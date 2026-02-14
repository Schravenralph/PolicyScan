import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { MetadataQualityService } from '../services/ingestion/metadata/MetadataQualityService.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, AuthenticationError } from '../types/errors.js';
import type { AuthService } from '../services/auth/AuthService.js';

export function createMetadataQualityRoutes(authService: AuthService): Router {
    const router = Router();
    const qualityService = new MetadataQualityService();

    // All routes require authentication
    router.use(authenticate(authService));

    /**
     * GET /api/metadata-quality/metrics
     * Get quality metrics for a date range
     * Query params: startDate, endDate (ISO date strings)
     */
    router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
        const endDate = req.query.endDate
            ? new Date(req.query.endDate as string)
            : new Date();

        const metrics = await qualityService.getMetrics(startDate, endDate);
        res.json({ metrics });
    }));

    /**
     * GET /api/metadata-quality/metrics/latest
     * Get latest quality metrics
     */
    router.get('/metrics/latest', asyncHandler(async (_req: Request, res: Response) => {
        const metrics = await qualityService.getLatestMetrics();
        if (!metrics) {
            throw new NotFoundError('Metrics', 'latest');
        }
        res.json({ metrics });
    }));

    /**
     * POST /api/metadata-quality/metrics/calculate
     * Calculate and store daily metrics for a specific date (admin only)
     * Body: { date?: string } (ISO date string, defaults to today)
     */
    router.post('/metrics/calculate', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
        const date = req.body.date ? new Date(req.body.date as string) : new Date();
        const metrics = await qualityService.calculateDailyMetrics(date);
        res.json({ metrics });
    }));

    /**
     * GET /api/metadata-quality/report
     * Generate quality report for a date range
     * Query params: startDate, endDate (ISO date strings)
     */
    router.get('/report', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = req.query.endDate
            ? new Date(req.query.endDate as string)
            : new Date();

        const report = await qualityService.generateReport(startDate, endDate);
        res.json({ report });
    }));

    /**
     * GET /api/metadata-quality/alerts
     * Check quality thresholds and return alerts
     */
    router.get('/alerts', authorize(['admin']), asyncHandler(async (_req: Request, res: Response) => {
        const alerts = await qualityService.checkQualityThresholds();
        res.json({ alerts });
    }));

    /**
     * GET /api/metadata-quality/low-confidence
     * Get documents with low confidence metadata
     * Query params: limit (default: 50), startDate, endDate (ISO date strings)
     */
    router.get('/low-confidence', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const documents = await qualityService.getLowConfidenceDocuments(limit, startDate, endDate);
        res.json({ documents });
    }));

    /**
     * POST /api/metadata-quality/validate
     * Validate a metadata field manually
     * Body: { documentId, field, isValid, correctValue?, notes? }
     */
    router.post('/validate', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
        const { documentId, field, isValid, correctValue, notes } = req.body as {
            documentId?: string;
            field?: string;
            isValid?: boolean;
            correctValue?: unknown;
            notes?: string;
        };

        if (!documentId || !field || isValid === undefined) {
            throw new BadRequestError('Missing required fields: documentId, field, isValid');
        }

        const userId = req.user?.userId || '';
        const correctedValue: import('../services/ingestion/metadata/MetadataQualityService.js').MetadataFieldValue | null = correctValue 
            ? (correctValue as import('../services/ingestion/metadata/MetadataQualityService.js').MetadataFieldValue)
            : null;
        const validation = await qualityService.validateField(documentId, field as 'documentType' | 'publicationDate' | 'themes' | 'issuingAuthority' | 'documentStatus', isValid, correctedValue, userId, notes);
        res.json({ validation });
    }));

    /**
     * POST /api/metadata-quality/correct
     * Correct a metadata field
     * Body: { documentId, field, correctedValue, reason? }
     */
    router.post('/correct', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
        const { documentId, field, correctedValue, reason } = req.body as {
            documentId?: string;
            field?: string;
            correctedValue?: unknown;
            reason?: string;
        };

        if (!documentId || !field || correctedValue === undefined) {
            throw new BadRequestError('Missing required fields: documentId, field, correctedValue');
        }

        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('User authentication required');
        }

        // Get original value from document using canonical service
        const { getCanonicalDocumentService } = await import('../services/canonical/CanonicalDocumentService.js');
        const documentService = getCanonicalDocumentService();
        const canonicalDoc = await documentService.findById(documentId);
        if (!canonicalDoc) {
            throw new NotFoundError('Document', documentId);
        }

        // Access canonical document fields directly (no legacy transformation)
        let originalValue: unknown;
        switch (field) {
            case 'documentType':
                originalValue = canonicalDoc.documentType;
                break;
            case 'publicationDate':
                originalValue = canonicalDoc.dates?.publishedAt?.toISOString() || null;
                break;
            case 'themes':
                originalValue = canonicalDoc.sourceMetadata?.legacyThemes || [];
                break;
            case 'issuingAuthority':
                originalValue = canonicalDoc.publisherAuthority || null;
                break;
            case 'documentStatus':
                originalValue = canonicalDoc.enrichmentMetadata?.legacyDocumentStatus || null;
                break;
            default:
                throw new BadRequestError('Invalid field');
        }

        const correction = await qualityService.correctField(
            documentId, 
            field as 'documentType' | 'publicationDate' | 'themes' | 'issuingAuthority' | 'documentStatus', 
            originalValue as import('../services/ingestion/metadata/MetadataQualityService.js').MetadataFieldValue, 
            correctedValue as import('../services/ingestion/metadata/MetadataQualityService.js').MetadataFieldValue, 
            userId, 
            reason
        );
        res.json({ correction });
    }));

    /**
     * GET /api/metadata-quality/accuracy
     * Get accuracy metrics calculated from validations
     * Query params: startDate, endDate (ISO date strings)
     */
    router.get('/accuracy', authorize(['admin']), asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const accuracy = await qualityService.calculateAccuracy(startDate, endDate);
        res.json({ accuracy });
    }));

    return router;
}
