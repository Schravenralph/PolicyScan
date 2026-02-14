import { Router, Request, Response } from 'express';
import { aiUsageMonitoringService } from '../services/monitoring/AIUsageMonitoringService.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { ObjectId } from 'mongodb';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError } from '../types/errors.js';
import type { AuthService } from '../services/auth/AuthService.js';

export function createAIUsageMonitoringRoutes(authService: AuthService): Router {
    const router = Router();

    // All AI usage monitoring routes require authentication and admin role
    router.use(authenticate(authService));
    router.use(authorize(['admin']));

    /**
     * GET /api/ai-usage/stats
     * Get aggregated statistics for a time range
     */
    router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

        const filters: {
            provider?: string;
            model?: string;
            operation?: string;
            userId?: ObjectId;
        } = {};

        if (req.query.provider) {
            filters.provider = req.query.provider as string;
        }
        if (req.query.model) {
            filters.model = req.query.model as string;
        }
        if (req.query.operation) {
            filters.operation = req.query.operation as string;
        }
        if (req.query.userId) {
            const userId = req.query.userId as string;
            // Validate ObjectId format before creating ObjectId instance
            if (!ObjectId.isValid(userId)) {
                throw new BadRequestError('Invalid userId format', { userId });
            }
            filters.userId = new ObjectId(userId);
        }

        const stats = await aiUsageMonitoringService.getStats(startDate, endDate, filters);
        res.json(stats);
    }));

    /**
     * GET /api/ai-usage/daily
     * Get daily metrics for a time range
     */
    router.get('/daily', asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

        const filters: {
            provider?: string;
            model?: string;
            operation?: string;
        } = {};

        if (req.query.provider) {
            filters.provider = req.query.provider as string;
        }
        if (req.query.model) {
            filters.model = req.query.model as string;
        }
        if (req.query.operation) {
            filters.operation = req.query.operation as string;
        }

        const dailyMetrics = await aiUsageMonitoringService.getDailyMetrics(startDate, endDate, filters);
        res.json(dailyMetrics);
    }));

    /**
     * GET /api/ai-usage/cache-stats
     * Get cache hit/miss statistics
     */
    router.get('/cache-stats', asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

        const filters: {
            provider?: string;
            model?: string;
            operation?: string;
        } = {};

        if (req.query.provider) {
            filters.provider = req.query.provider as string;
        }
        if (req.query.model) {
            filters.model = req.query.model as string;
        }
        if (req.query.operation) {
            filters.operation = req.query.operation as string;
        }

        const cacheStats = await aiUsageMonitoringService.getCacheStats(startDate, endDate, filters);
        res.json(cacheStats);
    }));

    /**
     * GET /api/ai-usage/carbon-footprint
     * Get carbon footprint estimate
     */
    router.get('/carbon-footprint', asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

        const filters: {
            provider?: string;
            model?: string;
            operation?: string;
        } = {};

        if (req.query.provider) {
            filters.provider = req.query.provider as string;
        }
        if (req.query.model) {
            filters.model = req.query.model as string;
        }
        if (req.query.operation) {
            filters.operation = req.query.operation as string;
        }

        const carbonFootprint = await aiUsageMonitoringService.getCarbonFootprint(startDate, endDate, filters);
        res.json(carbonFootprint);
    }));

    /**
     * POST /api/ai-usage/cleanup
     * Clean up old metrics (admin only)
     */
    router.post('/cleanup', asyncHandler(async (req: Request, res: Response) => {
        const retentionDays = (req.body.retentionDays as number) || 90;
        const deletedCount = await aiUsageMonitoringService.cleanupOldMetrics(retentionDays);
        res.json({ deletedCount, retentionDays });
    }));

    return router;
}
