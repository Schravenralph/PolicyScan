import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getErrorMonitoringService } from '../services/monitoring/ErrorMonitoringService.js';
import { getPerformanceMonitoringService } from '../services/monitoring/PerformanceMonitoringService.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, AuthenticationError, BadRequestError } from '../types/errors.js';
import { getDB } from '../config/database.js';
import { handleDatabaseOperation } from '../utils/databaseErrorHandler.js';
import type { AuthService } from '../services/auth/AuthService.js';

const ERROR_LOGS_COLLECTION = 'error_logs';

export function createErrorMonitoringRoutes(authService: AuthService): Router {
    const router = Router();

    // All error monitoring routes require authentication and admin role
    router.use(authenticate(authService));
    router.use(authorize(['admin']));

    /**
     * GET /api/errors
     * Get error logs with filtering and pagination
     */
    router.get('/', validate({
        query: z.object({
            severity: z.enum(['critical', 'error', 'warning']).optional(),
            component: z.enum(['scraper', 'workflow', 'api', 'frontend', 'database', 'other']).optional(),
            status: z.enum(['open', 'resolved', 'ignored']).optional(),
            user_id: z.string().optional(),
            testRunId: z.string().optional(),
            startDate: z.string().datetime().optional(),
            endDate: z.string().datetime().optional(),
            limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
            skip: z.coerce.number().int().min(0).optional().default(0),
            sort: z.enum(['last_seen', 'first_seen', 'occurrence_count', 'severity']).optional().default('last_seen'),
            sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        }),
    }), asyncHandler(async (req: Request, res: Response) => {
        // Use validated query parameters (already parsed and validated by middleware)
        const { severity, component, status, user_id, testRunId, startDate, endDate, limit = 100, skip = 0, sort = 'last_seen', sortOrder = 'desc' } = req.query as {
            severity?: 'critical' | 'error' | 'warning';
            component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
            status?: 'open' | 'resolved' | 'ignored';
            user_id?: string;
            testRunId?: string;
            startDate?: string;
            endDate?: string;
            limit?: number;
            skip?: number;
            sort?: 'last_seen' | 'first_seen' | 'occurrence_count' | 'severity';
            sortOrder?: 'asc' | 'desc';
        };

        // Build MongoDB query filter (same logic as ErrorLog.find)
        const query: Record<string, unknown> = {};
        if (severity) {
            query.severity = severity;
        }
        if (component) {
            query.component = component;
        }
        if (status) {
            query.status = status;
        }
        if (user_id) {
            // Validate ObjectId format before creating ObjectId instance
            if (!ObjectId.isValid(user_id)) {
                throw new BadRequestError('Invalid user_id format', { user_id });
            }
            query.user_id = new ObjectId(user_id);
        }
        if (startDate || endDate) {
            query.timestamp = {
                ...(startDate ? { $gte: new Date(startDate) } : {}),
                ...(endDate ? { $lte: new Date(endDate) } : {}),
            };
        }

        // Filter by test run ID (check both dedicated field and metadata for backward compatibility)
        if (testRunId) {
            query.$or = [
                { test_run_id: testRunId },
                { 'metadata.testRunId': testRunId },
            ];
        }

        // Build sort object
        const sortObj: Record<string, 1 | -1> = { [sort]: sortOrder === 'asc' ? 1 : -1 };

        // Get total count and errors in parallel
        const db = getDB();
        const [errors, total] = await Promise.all([
            handleDatabaseOperation(
                async () => {
                    return await db
                        .collection(ERROR_LOGS_COLLECTION)
                        .find(query)
                        .sort(sortObj)
                        .skip(skip)
                        .limit(limit)
                        .toArray();
                },
                'ErrorMonitoringRoutes.getErrors'
            ),
            handleDatabaseOperation(
                async () => {
                    return await db.collection(ERROR_LOGS_COLLECTION).countDocuments(query);
                },
                'ErrorMonitoringRoutes.countErrors'
            ),
        ]);

        // Transform errors to include testRunId (from dedicated field or metadata for backward compatibility)
        const transformedErrors = errors.map((error: { test_run_id?: string; metadata?: { testRunId?: string }; [key: string]: unknown }) => {
            const errorTestRunId = error.test_run_id || error.metadata?.testRunId;
            return {
                ...error,
                testRunId: errorTestRunId, // Include testRunId for easier access
            };
        });

        res.json({
            errors: transformedErrors,
            pagination: {
                limit,
                skip,
                total,
            },
        });
    }));

    /**
     * GET /api/errors/stats
     * Get error statistics
     */
    router.get('/stats', validate({
        query: z.object({
            startDate: z.string().datetime().optional(),
            endDate: z.string().datetime().optional(),
            component: z.enum(['scraper', 'workflow', 'api', 'frontend', 'database', 'other']).optional(),
        }),
    }), asyncHandler(async (req: Request, res: Response) => {
        const { startDate, endDate, component } = req.query as {
            startDate?: string;
            endDate?: string;
            component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
        };

        const options: {
            startDate?: Date;
            endDate?: Date;
            component?: 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
        } = {};

        if (startDate) {
            options.startDate = new Date(startDate);
        }
        if (endDate) {
            options.endDate = new Date(endDate);
        }
        if (component) {
            options.component = component as 'scraper' | 'workflow' | 'api' | 'frontend' | 'database' | 'other';
        }

        const errorMonitoringService = getErrorMonitoringService();
        const stats = await errorMonitoringService.getStatistics(options);
        res.json(stats);
    }));

    /**
     * GET /api/errors/:id
     * Get error by ID
     */
    router.get('/:id', validate({
        params: z.object({
            id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid error ID format'),
        }),
    }), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const errorMonitoringService = getErrorMonitoringService();
        const error = await errorMonitoringService.getErrorById(id);
        if (!error) {
            throw new NotFoundError('Error', id);
        }

        // Extract testRunId from dedicated field or metadata for backward compatibility
        const testRunId = (error as { test_run_id?: string; metadata?: { testRunId?: string } }).test_run_id || (error as { metadata?: { testRunId?: string } }).metadata?.testRunId;

        res.json({
            ...error,
            testRunId, // Include testRunId for easier access
        });
    }));

    /**
     * PATCH /api/errors/:id/resolve
     * Mark error as resolved
     */
    router.patch('/:id/resolve', validate({
        params: z.object({
            id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid error ID format'),
        }),
    }), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('Authentication required');
        }

        const errorMonitoringService = getErrorMonitoringService();
        const resolvedError = await errorMonitoringService.markErrorResolved(id, userId);
        if (!resolvedError) {
            throw new NotFoundError('Error', id);
        }

        res.json({
            message: 'Error marked as resolved',
            error: resolvedError,
        });
    }));

    /**
     * GET /api/errors/performance/stats
     * Get performance statistics
     */
    router.get('/performance/stats', validate({
        query: z.object({
            startDate: z.string().datetime().optional(),
            endDate: z.string().datetime().optional(),
            endpoint: z.string().optional(),
            method: z.string().optional(),
        }),
    }), asyncHandler(async (req: Request, res: Response) => {
        const { startDate, endDate, endpoint, method } = req.query as {
            startDate?: string;
            endDate?: string;
            endpoint?: string;
            method?: string;
        };

        const options: {
            startDate?: Date;
            endDate?: Date;
            endpoint?: string;
            method?: string;
        } = {};

        if (startDate) {
            options.startDate = new Date(startDate);
        }
        if (endDate) {
            options.endDate = new Date(endDate);
        }
        if (endpoint) {
            options.endpoint = endpoint;
        }
        if (method) {
            options.method = method;
        }

        const performanceService = getPerformanceMonitoringService();
        const stats = await performanceService.getStatistics(options);
        res.json(stats);
    }));

    /**
     * GET /api/errors/performance/thresholds
     * Check performance thresholds and get alerts
     */
    router.get('/performance/thresholds', validate({
        query: z.object({
            startDate: z.string().datetime().optional(),
            endDate: z.string().datetime().optional(),
            endpoint: z.string().optional(),
        }),
    }), asyncHandler(async (req: Request, res: Response) => {
        const { startDate, endDate, endpoint } = req.query as {
            startDate?: string;
            endDate?: string;
            endpoint?: string;
        };

        const options: {
            startDate?: Date;
            endDate?: Date;
            endpoint?: string;
        } = {};

        if (startDate) {
            options.startDate = new Date(startDate);
        }
        if (endDate) {
            options.endDate = new Date(endDate);
        }
        if (endpoint) {
            options.endpoint = endpoint;
        }

        const performanceService = getPerformanceMonitoringService();
        const alerts = await performanceService.checkThresholds(options);

        res.json({
            alerts,
            thresholds: {
                p50: parseInt(process.env.PERF_THRESHOLD_P50 || '500', 10),
                p95: parseInt(process.env.PERF_THRESHOLD_P95 || '2000', 10),
                p99: parseInt(process.env.PERF_THRESHOLD_P99 || '5000', 10),
                error_rate_warning: 5,
                error_rate_critical: 10,
            },
        });
    }));

    return router;
}
