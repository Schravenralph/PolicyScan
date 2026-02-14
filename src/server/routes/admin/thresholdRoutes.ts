/**
 * Threshold Management Admin Routes
 * 
 * Routes for resource threshold management, scheduling, and monitoring in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getDB } from '../../config/database.js';
import { getResourceThresholdService, ResourceMetrics } from '../../services/monitoring/ResourceThresholdService.js';
import { AuditLogService } from '../../services/AuditLogService.js';
import { asyncHandler, sanitizeInput, auditMiddleware } from './shared/middleware.js';
import { BadRequestError } from '../../types/errors.js';
import { throwIfNotFound } from '../../utils/errorHandling.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Register threshold management routes
 * 
 * @param router - Express router instance
 */
export function registerThresholdRoutes(router: Router): void {
    /**
     * GET /api/admin/thresholds
     * Get configured resource thresholds
     */
    router.get('/thresholds', asyncHandler(async (_req: Request, res: Response) => {
        const thresholdService = getResourceThresholdService();
        const thresholds = await thresholdService.getThresholds();
        // Convert thresholds object to array format for test compatibility
        const thresholdsArray = Object.entries(thresholds).map(([key, value]) => ({
            metric: key,
            value: value,
        }));
        res.json(thresholdsArray);
    }));

    /**
     * PUT /api/admin/thresholds
     * Update resource thresholds (Iteration 2: with history tracking)
     */
    router.put('/thresholds', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { thresholds, reason } = req.body;
        
        if (!thresholds || typeof thresholds !== 'object') {
            throw new BadRequestError('Invalid thresholds object');
        }

        const thresholdService = getResourceThresholdService();
        const oldThresholds = await thresholdService.getThresholds();
        await thresholdService.updateThresholds(thresholds, req.user?.userId, reason);
        
        // Log audit entry for each threshold change
        const updates = [];
        for (const [key, value] of Object.entries(thresholds)) {
            if (oldThresholds[key as keyof typeof oldThresholds] !== value) {
                updates.push({
                    thresholdId: key,
                    changes: {
                        oldValue: oldThresholds[key as keyof typeof oldThresholds],
                        newValue: value,
                        reason,
                    }
                });
            }
        }

        if (updates.length > 0) {
            await AuditLogService.logThresholdUpdates(req, updates);
        }

        res.json({ 
            success: true,
            message: '[i18n:apiMessages.thresholdsUpdated]', 
            thresholds: await thresholdService.getThresholds() 
        });
    }));

    /**
     * GET /api/admin/thresholds/alerts
     * Get recent threshold alerts
     */
    router.get('/thresholds/alerts', asyncHandler(async (req: Request, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const thresholdService = getResourceThresholdService();
        const alerts = await thresholdService.getRecentAlerts(limit);
        res.json({ alerts });
    }));

    /**
     * GET /api/admin/thresholds/templates
     * Get available threshold templates (Iteration 1)
     */
    router.get('/thresholds/templates', asyncHandler(async (_req: Request, res: Response) => {
        const thresholdService = getResourceThresholdService();
        const templates = thresholdService.getTemplates();
        res.json({ templates });
    }));

    /**
     * POST /api/admin/thresholds/templates/:name/apply
     * Apply a threshold template (Iteration 1)
     */
    router.post('/thresholds/templates/:name/apply',
        sanitizeInput,
        auditMiddleware({
            action: 'threshold_template_applied',
            targetType: 'threshold',
            getTargetId: (req) => req.params.name,
            getDetails: (req) => ({ templateName: req.params.name })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { name } = req.params;
            const thresholdService = getResourceThresholdService();
            await thresholdService.applyTemplate(name, req.user?.userId);
            res.json({ message: `[i18n:apiMessages.templateAppliedSuccessfullyWithName]|${name}` });
        })
    );

    /**
     * GET /api/admin/thresholds/history
     * Get threshold change history (Iteration 2)
     */
    router.get('/thresholds/history', asyncHandler(async (req: Request, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const thresholdService = getResourceThresholdService();
        const history = await thresholdService.getThresholdHistory(limit);
        res.json({ history });
    }));

    /**
     * GET /api/admin/thresholds/recommendations
     * Get threshold recommendations based on usage (Iteration 3)
     */
    router.get('/thresholds/recommendations', asyncHandler(async (req: Request, res: Response) => {
        const daysOfHistory = parseInt(req.query.days as string) || 30;
        const thresholdService = getResourceThresholdService();
        const db = getDB();
        
        // Get current metrics directly from database
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const errorsLast24h = await db.collection('runs').countDocuments({
            status: 'failed',
            createdAt: { $gte: last24h }
        });

        const dbStats = await db.stats();
        const databaseSize = dbStats.dataSize || 0;

        const knowledgeBasePath = path.join(process.cwd(), 'data', 'knowledge_base');
        let knowledgeBaseSize = 0;
        try {
            const stats = await fs.stat(knowledgeBasePath);
            if (stats.isDirectory()) {
                knowledgeBaseSize = stats.size;
            }
        } catch {
            // Knowledge base directory might not exist
        }

        const metrics: ResourceMetrics = {
            database_size_mb: Math.round(databaseSize / 1024 / 1024),
            knowledge_base_size_mb: Math.round(knowledgeBaseSize / 1024 / 1024),
            error_rate_24h: errorsLast24h,
        };

        const recommendations = await thresholdService.getRecommendations(metrics, daysOfHistory);
        res.json({ recommendations });
    }));

    /**
     * GET /api/admin/thresholds/groups
     * Get threshold groups (Iteration 4)
     */
    router.get('/thresholds/groups', asyncHandler(async (_req: Request, res: Response) => {
        const thresholdService = getResourceThresholdService();
        const groups = await thresholdService.getThresholdGroups();
        res.json({ groups });
    }));

    /**
     * POST /api/admin/thresholds/groups
     * Create a threshold group (Iteration 4)
     */
    router.post('/thresholds/groups',
        sanitizeInput,
        auditMiddleware({
            action: 'threshold_updated',
            targetType: 'threshold',
            getDetails: (req) => ({ groupName: req.body.name, category: req.body.category })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { name, category, thresholds, enabled } = req.body;
            if (!name || !category || !thresholds) {
                throw new BadRequestError('Missing required fields: name, category, thresholds');
            }

            const thresholdService = getResourceThresholdService();
            const id = await thresholdService.createThresholdGroup({
                name,
                category,
                thresholds,
                enabled: enabled !== false,
            });
            res.json({ id, message: '[i18n:apiMessages.thresholdGroupCreated]' });
        })
    );

    /**
     * GET /api/admin/thresholds/notifications
     * Get notification preferences (Iteration 7)
     */
    router.get('/thresholds/notifications', asyncHandler(async (req: Request, res: Response) => {
        const metric = req.query.metric as string;
        const thresholdService = getResourceThresholdService();
        const preferences = await thresholdService.getNotificationPreferences(metric);
        res.json({ preferences });
    }));

    /**
     * POST /api/admin/thresholds/auto-adjust
     * Auto-adjust thresholds based on trends (Iteration 9)
     */
    router.post('/thresholds/auto-adjust',
        sanitizeInput,
        auditMiddleware({
            action: 'threshold_updated',
            targetType: 'threshold',
            getDetails: (req) => ({ enabled: req.body.enabled, method: 'auto-adjust' })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { enabled = true } = req.body;
            const thresholdService = getResourceThresholdService();
            const db = getDB();
            
            // Get current metrics directly from database
            const now = new Date();
            const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const errorsLast24h = await db.collection('runs').countDocuments({
                status: 'failed',
                createdAt: { $gte: last24h }
            });

            const dbStats = await db.stats();
            const databaseSize = dbStats.dataSize || 0;

            const knowledgeBasePath = path.join(process.cwd(), 'data', 'knowledge_base');
            let knowledgeBaseSize = 0;
            try {
                const stats = await fs.stat(knowledgeBasePath);
                if (stats.isDirectory()) {
                    knowledgeBaseSize = stats.size;
                }
            } catch {
                // Knowledge base directory might not exist
            }

            const metrics: ResourceMetrics = {
                database_size_mb: Math.round(databaseSize / 1024 / 1024),
                knowledge_base_size_mb: Math.round(knowledgeBaseSize / 1024 / 1024),
                error_rate_24h: errorsLast24h,
            };

            const adjusted = await thresholdService.autoAdjustThresholds(metrics, enabled);
            if (adjusted) {
                res.json({ message: '[i18n:apiMessages.thresholdsAutoAdjusted]', thresholds: adjusted });
            } else {
                res.json({ message: '[i18n:apiMessages.noAdjustmentsNeeded]', thresholds: await thresholdService.getThresholds() });
            }
        })
    );

    /**
     * GET /api/admin/thresholds/export
     * Export thresholds configuration (Iteration 10)
     */
    router.get('/thresholds/export', asyncHandler(async (_req: Request, res: Response) => {
        const thresholdService = getResourceThresholdService();
        const exportData = await thresholdService.exportThresholds();
        res.json(exportData);
    }));

    /**
     * POST /api/admin/thresholds/import
     * Import thresholds configuration (Iteration 10)
     */
    router.post('/thresholds/import',
        sanitizeInput,
        auditMiddleware({
            action: 'threshold_updated',
            targetType: 'threshold',
            getDetails: (req) => ({ 
                importSource: req.body.metadata?.source || 'manual',
                thresholdCount: Object.keys(req.body.thresholds || {}).length
            })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { thresholds, metadata } = req.body;
            if (!thresholds) {
                throw new BadRequestError('Missing thresholds in request body');
            }

            const thresholdService = getResourceThresholdService();
            await thresholdService.importThresholds({ thresholds, metadata }, req.user?.userId);
            res.json({ message: '[i18n:apiMessages.thresholdsImported]' });
        })
    );

    /**
     * GET /api/admin/thresholds/dashboard
     * Get threshold dashboard data for visualization (Iteration 8)
     */
    router.get('/thresholds/dashboard', asyncHandler(async (_req: Request, res: Response) => {
        const thresholdService = getResourceThresholdService();
        const db = getDB();
        
        // Get current metrics
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const errorsLast24h = await db.collection('runs').countDocuments({
            status: 'failed',
            createdAt: { $gte: last24h }
        });
        const dbStats = await db.stats();
        const databaseSize = dbStats.dataSize || 0;
        const knowledgeBasePath = path.join(process.cwd(), 'data', 'knowledge_base');
        let knowledgeBaseSize = 0;
        try {
            const stats = await fs.stat(knowledgeBasePath);
            if (stats.isDirectory()) {
                knowledgeBaseSize = stats.size;
            }
        } catch {
            // Knowledge base directory might not exist
        }

        const metrics: ResourceMetrics = {
            database_size_mb: Math.round(databaseSize / 1024 / 1024),
            knowledge_base_size_mb: Math.round(knowledgeBaseSize / 1024 / 1024),
            error_rate_24h: errorsLast24h,
        };

        const thresholds = await thresholdService.getThresholds();
        const alerts = await thresholdService.getRecentAlerts(10);
        const history = await thresholdService.getThresholdHistory(10);
        const recommendations = await thresholdService.getRecommendations(metrics, 7);

        // Format for dashboard visualization
        const dashboardData = {
            currentMetrics: metrics,
            thresholds,
            alerts: alerts.map((a: { current_value: number; threshold: number; severity: string }) => ({
                ...a,
                percentage: (a.current_value / a.threshold) * 100,
                status: a.current_value > a.threshold * 1.5 ? 'critical' : 'warning',
            })),
            history: history.slice(0, 5), // Last 5 changes
            recommendations: recommendations.slice(0, 5), // Top 5 recommendations
            summary: {
                totalAlerts: alerts.length,
                criticalAlerts: alerts.filter((a: { severity: string }) => a.severity === 'critical').length,
                warningAlerts: alerts.filter((a: { severity: string }) => a.severity === 'warning').length,
                metricsAtRisk: alerts.length,
            },
        };

        res.json(dashboardData);
    }));

    /**
     * POST /api/admin/thresholds/schedules
     * Create a new threshold schedule (Phase 1.1)
     */
    router.post('/thresholds/schedules', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { name, timeRange, daysOfWeek, thresholds, enabled } = req.body;
        
        if (!name || !timeRange || !thresholds) {
            throw new BadRequestError('Missing required fields: name, timeRange, thresholds');
        }

        const thresholdService = getResourceThresholdService();
        const scheduleId = await thresholdService.createSchedule({
            name,
            timeRange,
            daysOfWeek: daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
            thresholds,
            enabled: enabled !== false,
        });

        // Log audit entry
        await AuditLogService.logAction(req, 'threshold_schedule_created', 'threshold', scheduleId, {
            name,
            timeRange,
            daysOfWeek,
        });

        res.json({ id: scheduleId, message: '[i18n:apiMessages.scheduleCreated]' });
    }));

    /**
     * GET /api/admin/thresholds/schedules
     * List all threshold schedules (Phase 1.1)
     */
    router.get('/thresholds/schedules', asyncHandler(async (req: Request, res: Response) => {
        const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
        const thresholdService = getResourceThresholdService();
        const schedules = await thresholdService.listSchedules(enabled);
        res.json({ schedules });
    }));

    /**
     * GET /api/admin/thresholds/schedules/:id
     * Get a specific schedule by ID (Phase 1.1)
     */
    router.get('/thresholds/schedules/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const thresholdService = getResourceThresholdService();
        const schedule = await thresholdService.getSchedule(id);
        
        throwIfNotFound(schedule, 'Schedule', id);
        
        res.json({ schedule });
    }));

    /**
     * PUT /api/admin/thresholds/schedules/:id
     * Update a threshold schedule (Phase 1.1)
     */
    router.put('/thresholds/schedules/:id', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, timeRange, daysOfWeek, thresholds, enabled } = req.body;
        
        const thresholdService = getResourceThresholdService();
        await thresholdService.updateSchedule(id, {
            name,
            timeRange,
            daysOfWeek,
            thresholds,
            enabled,
        });

        // Log audit entry
        await AuditLogService.logAction(req, 'threshold_schedule_updated', 'threshold', id, {
            name,
            timeRange,
            daysOfWeek,
            enabled,
        });

        res.json({ message: '[i18n:apiMessages.scheduleUpdated]' });
    }));

    /**
     * GET /api/admin/thresholds/schedules/active
     * Get currently active threshold schedule (Phase 1.1)
     */
    router.get('/thresholds/schedules/active', asyncHandler(async (_req: Request, res: Response) => {
        const thresholdService = getResourceThresholdService();
        const activeSchedule = await thresholdService.getActiveSchedule();
        
        throwIfNotFound(activeSchedule, 'Active schedule');
        
        res.json({ schedule: activeSchedule });
    }));

    /**
     * DELETE /api/admin/thresholds/schedules/:id
     * Delete a threshold schedule (Phase 1.1)
     */
    router.delete('/thresholds/schedules/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const thresholdService = getResourceThresholdService();
        await thresholdService.deleteSchedule(id);

        // Log audit entry
        await AuditLogService.logAction(req, 'threshold_schedule_deleted', 'threshold', id);

        res.json({ message: '[i18n:apiMessages.scheduleDeleted]' });
    }));
}



