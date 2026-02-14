/**
 * Error Monitoring Admin Routes
 * 
 * Routes for error monitoring, statistics, and correlation in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getErrorMonitoringService } from '../../services/monitoring/ErrorMonitoringService.js';
import { getPerformanceMonitoringService } from '../../services/monitoring/PerformanceMonitoringService.js';
import { getResourceThresholdService } from '../../services/monitoring/ResourceThresholdService.js';
import { AuditLogService } from '../../services/AuditLogService.js';
import { ErrorComponent, type ErrorSeverity, type ErrorStatus, type ErrorLogDocument } from '../../models/ErrorLog.js';
import { asyncHandler } from './shared/middleware.js';
import { throwIfNotFound } from '../../utils/errorHandling.js';
import { logger } from '../../utils/logger.js';

/**
 * Register error monitoring routes
 * 
 * @param router - Express router instance
 */
export function registerErrorMonitoringRoutes(router: Router): void {
    /**
     * GET /api/admin/errors
     * Get errors with filtering and pagination (Phase 1.3)
     */
    router.get('/errors', asyncHandler(async (req: Request, res: Response) => {
        const errorMonitoringService = getErrorMonitoringService();
        const {
            severity,
            component,
            status,
            user_id,
            startDate,
            endDate,
            limit,
            skip,
        } = req.query;

        const filters: {
            severity?: ErrorSeverity;
            component?: ErrorComponent;
            status?: ErrorStatus;
            user_id?: string;
            startDate?: Date;
            endDate?: Date;
            limit: number;
            skip: number;
            sort: Record<string, 1 | -1>;
        } = {
            limit: limit ? parseInt(String(limit), 10) : 50,
            skip: skip ? parseInt(String(skip), 10) : 0,
            sort: { last_seen: -1 },
        };
        
        // Validate parsed values
        if (isNaN(filters.limit) || filters.limit < 1) {
            filters.limit = 50;
        }
        if (isNaN(filters.skip) || filters.skip < 0) {
            filters.skip = 0;
        }
        if (severity && typeof severity === 'string') {
            const validSeverities: ErrorSeverity[] = ['critical', 'error', 'warning'];
            if (validSeverities.includes(severity as ErrorSeverity)) {
                filters.severity = severity as ErrorSeverity;
            }
        }
        if (component && typeof component === 'string') {
            const validComponents: ErrorComponent[] = ['scraper', 'workflow', 'api', 'frontend', 'database', 'other'];
            if (validComponents.includes(component as ErrorComponent)) {
                filters.component = component as ErrorComponent;
            }
        }
        if (status && typeof status === 'string') {
            const validStatuses: ErrorStatus[] = ['open', 'resolved', 'ignored'];
            if (validStatuses.includes(status as ErrorStatus)) {
                filters.status = status as ErrorStatus;
            }
        }
        if (user_id) filters.user_id = user_id as string;
        if (startDate) filters.startDate = new Date(startDate as string);
        if (endDate) filters.endDate = new Date(endDate as string);

        const result = await errorMonitoringService.getErrors(filters);
        res.json({ errors: result || [] });
    }));

    /**
     * POST /api/admin/errors/resolve-test-errors
     * Bulk resolve test-related errors (errors containing "invalid-", "test-", "nonexistent-")
     */
    router.post('/errors/resolve-test-errors', asyncHandler(async (req: Request, res: Response) => {
        const errorMonitoringService = getErrorMonitoringService();
        const userId = req.user?.userId || 'system';
        
        // Get all open errors (with pagination to handle large datasets)
        const limit = 1000;
        let skip = 0;
        let allErrors: ErrorLogDocument[] = [];
        let hasMore = true;
        
        while (hasMore) {
            const batch = await errorMonitoringService.getErrors({
                status: 'open',
                limit,
                skip,
            });
            
            if (batch.length === 0) {
                hasMore = false;
            } else {
                allErrors = allErrors.concat(batch as ErrorLogDocument[]);
                skip += limit;
                // Safety check: don't process more than 10,000 errors at once
                if (allErrors.length >= 10000) {
                    logger.warn('Reached maximum error limit (10,000) for bulk resolve');
                    hasMore = false;
                }
            }
        }
        
        // Filter test-related errors
        const testErrorPatterns = ['invalid-', 'test-', 'nonexistent-', 'invalid-workflow-id'];
        const testErrors = allErrors.filter(error => {
            const message = error.message || '';
            return testErrorPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()));
        });
        
        if (testErrors.length === 0) {
            return res.json({
                message: 'No test-related errors found to resolve',
                resolvedCount: 0,
                totalTestErrors: 0,
            });
        }
        
        // Resolve all test errors in bulk
        const errorIds = testErrors
            .map(error => error._id?.toString())
            .filter((id): id is string => !!id);

        let resolvedCount = 0;
        let failedCount = 0;

        try {
            resolvedCount = await errorMonitoringService.markErrorsResolved(
                errorIds,
                userId,
                'Automatically resolved: test-related error'
            );
            failedCount = errorIds.length - resolvedCount;
        } catch (err) {
            logger.warn({ error: err }, 'Failed to bulk resolve test errors');
            failedCount = errorIds.length;
        }
        
        if (failedCount > 0) {
            logger.warn({ failedCount, totalTestErrors: testErrors.length }, 
                'Some test errors failed to resolve during bulk operation');
        }
        
        // Log audit entry
        await AuditLogService.logAction(req, 'bulk_error_resolve', 'other', 'test-errors', {
            resolvedCount,
            totalTestErrors: testErrors.length,
            failedCount,
        });
        
        res.json({
            message: `Resolved ${resolvedCount} of ${testErrors.length} test-related errors`,
            resolvedCount,
            totalTestErrors: testErrors.length,
            failedCount,
        });
    }));

    /**
     * GET /api/admin/errors/statistics
     * Get error statistics (Phase 1.3)
     */
    router.get('/errors/statistics', asyncHandler(async (req: Request, res: Response) => {
        const errorMonitoringService = getErrorMonitoringService();
        const { startDate, endDate, component } = req.query;

        const options: {
            startDate?: Date;
            endDate?: Date;
            component?: ErrorComponent;
        } = {};
        if (startDate) {
            const parsed = new Date(startDate as string);
            if (!isNaN(parsed.getTime())) {
                options.startDate = parsed;
            }
        }
        if (endDate) {
            const parsed = new Date(endDate as string);
            if (!isNaN(parsed.getTime())) {
                options.endDate = parsed;
            }
        }
        if (component) {
            // Validate component is a valid ErrorComponent
            const validComponents: ErrorComponent[] = ['scraper', 'workflow', 'api', 'frontend', 'database', 'other'];
            if (validComponents.includes(component as ErrorComponent)) {
                options.component = component as ErrorComponent;
            }
        }

        try {
            const stats = await errorMonitoringService.getStatistics(options);
            res.status(200).json(stats);
        } catch (error) {
            logger.error({ error }, 'Error fetching error statistics');
            // Return empty stats if there's an error (e.g., collection doesn't exist yet)
            res.status(200).json({
                total_errors: 0,
                by_severity: { critical: 0, error: 0, warning: 0 },
                by_component: { scraper: 0, workflow: 0, api: 0, frontend: 0, database: 0, other: 0 },
                by_status: { open: 0, resolved: 0, ignored: 0 },
                error_rate_per_hour: 0,
            });
        }
    }));

    /**
     * GET /api/admin/errors/performance/stats
     * Get performance statistics (Phase 1.3)
     */
    router.get('/errors/performance/stats', asyncHandler(async (_req: Request, res: Response) => {
        const performanceService = getPerformanceMonitoringService();
        const stats = await performanceService.getStats();
        res.json(stats);
    }));

    /**
     * GET /api/admin/errors/correlated-with-thresholds
     * Get errors correlated with threshold violations (Phase 1.3)
     */
    router.get('/errors/correlated-with-thresholds', asyncHandler(async (req: Request, res: Response) => {
        const errorMonitoringService = getErrorMonitoringService();
        const thresholdService = getResourceThresholdService();
        const { startDate, endDate } = req.query;

        // Get recent threshold alerts
        const thresholdAlerts = await thresholdService.getRecentAlerts(100);
        
        // Get errors in the same time range
        const errorFilters: {
            startDate?: Date;
            endDate?: Date;
            limit: number;
            skip: number;
            sort: Record<string, 1 | -1>;
        } = {
            limit: 100,
            skip: 0,
            sort: { last_seen: -1 },
        };
        
        if (startDate) errorFilters.startDate = new Date(startDate as string);
        if (endDate) errorFilters.endDate = new Date(endDate as string);
        
        // If no date range provided, use threshold alert time range
        if (!startDate && !endDate && thresholdAlerts.length > 0) {
            const oldestAlert = thresholdAlerts[thresholdAlerts.length - 1];
            errorFilters.startDate = new Date(oldestAlert.timestamp.getTime() - 24 * 60 * 60 * 1000); // 24h before oldest alert
        }

        const errors = await errorMonitoringService.getErrors(errorFilters);

        // Correlate errors with threshold violations
        const correlations: Array<{
            error: unknown;
            thresholdAlert: unknown;
            correlationScore: number;
            reason: string;
        }> = [];

        for (const error of errors || []) {
            for (const alert of thresholdAlerts) {
                let correlationScore = 0;
                const reasons: string[] = [];

                // Check if error occurred around the same time as threshold violation
                const errorRecord = error as { last_seen: Date | string; component?: string; severity?: string };
                const errorTime = new Date(errorRecord.last_seen).getTime();
                const alertTime = alert.timestamp.getTime();
                const timeDiff = Math.abs(errorTime - alertTime);
                
                // If error occurred within 1 hour of threshold violation, add correlation
                if (timeDiff < 60 * 60 * 1000) {
                    correlationScore += 0.5;
                    reasons.push('Temporal correlation (within 1 hour)');
                }

                // Check if error component matches threshold metric
                const errorComponent = errorRecord.component;
                if (alert.metric === 'error_rate_24h' && errorComponent) {
                    correlationScore += 0.3;
                    reasons.push('Error rate threshold violation');
                }

                // Check if error is critical and threshold is critical
                if (errorRecord.severity === 'critical' && alert.severity === 'critical') {
                    correlationScore += 0.2;
                    reasons.push('Both are critical');
                }

                if (correlationScore > 0) {
                    correlations.push({
                        error,
                        thresholdAlert: alert,
                        correlationScore,
                        reason: reasons.join('; '),
                    });
                }
            }
        }

        // Sort by correlation score (highest first)
        correlations.sort((a, b) => b.correlationScore - a.correlationScore);

        res.json({
            correlations,
            totalCorrelations: correlations.length,
            thresholdAlertsCount: thresholdAlerts.length,
            errorsCount: errors.length,
        });
    }));

    /**
     * GET /api/admin/errors/:id
     * Get error by ID (Phase 1.3)
     */
    router.get('/errors/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const errorMonitoringService = getErrorMonitoringService();
        const error = await errorMonitoringService.getErrorById(id);

        throwIfNotFound(error, 'Error', id);

        res.json({ error });
    }));

    /**
     * POST /api/admin/errors/:id/resolve
     * Mark error as resolved (Phase 1.3)
     */
    router.post('/errors/:id/resolve', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const errorMonitoringService = getErrorMonitoringService();

        await errorMonitoringService.markErrorResolved(id, req.user?.userId || 'system');

        // Log audit entry
        await AuditLogService.logAction(req, 'error_resolved', 'other', id, {
            errorId: id,
        });

        res.json({ message: '[i18n:apiMessages.errorMarkedAsResolved]' });
    }));
}

