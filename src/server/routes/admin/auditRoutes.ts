/**
 * Audit Log Admin Routes
 * 
 * Routes for audit log management, retention, integrity, and statistics in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { AuditLogService } from '../../services/AuditLogService.js';
import { AuditLog, AuditActionType, AuditTargetType } from '../../models/AuditLog.js';
import { asyncHandler, sanitizeInput } from './shared/middleware.js';
import { BadRequestError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Register audit log routes
 * 
 * @param router - Express router instance
 */
export function registerAuditRoutes(router: Router): void {
    /**
     * GET /api/admin/audit-logs/retention
     * Get audit log retention statistics and configuration
     */
    router.get('/audit-logs/retention', asyncHandler(async (_req: Request, res: Response) => {
        const { getAuditLogRetentionService } = await import('../../services/monitoring/AuditLogRetentionService.js');
        const retentionService = getAuditLogRetentionService();
        
        const [stats, config] = await Promise.all([
            retentionService.getRetentionStats(),
            Promise.resolve(retentionService.getConfig()),
        ]);
        
        res.json({
            ...stats,
            config,
            cutoffDate: stats.cutoffDate.toISOString(),
            oldestLogDate: stats.oldestLogDate?.toISOString() || null,
            newestLogDate: stats.newestLogDate?.toISOString() || null,
        });
    }));

    /**
     * POST /api/admin/audit-logs/retention/cleanup
     * Manually trigger audit log cleanup
     */
    router.post('/audit-logs/retention/cleanup', asyncHandler(async (req: Request, res: Response) => {
        const { getAuditLogRetentionService } = await import('../../services/monitoring/AuditLogRetentionService.js');
        const retentionService = getAuditLogRetentionService();
        
        const result = await retentionService.cleanupOldLogs();
        
        // Log the manual cleanup for audit
        await AuditLogService.logAction(
            req,
            'system_config_changed',
            'system',
            'audit_log_retention',
            {
                action: 'manual_cleanup',
                deletedCount: result.deletedCount,
                cutoffDate: result.cutoffDate.toISOString(),
                retentionDays: result.retentionDays,
            }
        ).catch((error) => {
            logger.error({ error }, 'Failed to log audit log cleanup audit event');
        });
        
        res.json({
            message: 'Audit log cleanup completed',
            ...result,
            cutoffDate: result.cutoffDate.toISOString(),
        });
    }));

    /**
     * PUT /api/admin/audit-logs/retention/config
     * Update audit log retention configuration
     */
    router.put('/audit-logs/retention/config', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { retentionDays, enabled, cronExpression, timezone } = req.body;
        
        const { getAuditLogRetentionService } = await import('../../services/monitoring/AuditLogRetentionService.js');
        const retentionService = getAuditLogRetentionService();
        
        const updates: {
            retentionDays?: number;
            enabled?: boolean;
            cronExpression?: string;
            timezone?: string;
        } = {};
        
        if (typeof retentionDays === 'number' && retentionDays > 0) {
            updates.retentionDays = retentionDays;
        }
        if (typeof enabled === 'boolean') {
            updates.enabled = enabled;
        }
        if (typeof cronExpression === 'string') {
            updates.cronExpression = cronExpression;
        }
        if (typeof timezone === 'string') {
            updates.timezone = timezone;
        }
        
        if (Object.keys(updates).length === 0) {
            throw new BadRequestError('No valid configuration updates provided');
        }
        
        const oldConfig = retentionService.getConfig();
        retentionService.updateConfig(updates);
        const newConfig = retentionService.getConfig();
        
        // Log the configuration change for audit
        await AuditLogService.logAction(
            req,
            'system_config_changed',
            'system',
            'audit_log_retention',
            {
                oldConfig,
                newConfig,
                updates,
            }
        ).catch((error) => {
            logger.error({ error }, 'Failed to log audit log retention config change audit event');
        });
        
        res.json({
            message: 'Audit log retention configuration updated',
            config: newConfig,
        });
    }));

    /**
     * GET /api/admin/audit-logs/integrity
     * Get audit log integrity statistics
     */
    router.get('/audit-logs/integrity', asyncHandler(async (_req: Request, res: Response) => {
        const { AuditLog } = await import('../../models/AuditLog.js');
        const stats = await AuditLog.getIntegrityStats();
        
        res.json({
            ...stats,
            integrityStatus: stats.entriesWithHash > 0 ? 'enabled' : 'disabled',
            coverage: stats.totalEntries > 0 
                ? ((stats.entriesWithHash / stats.totalEntries) * 100).toFixed(2) + '%'
                : '0%',
        });
    }));

    /**
     * POST /api/admin/audit-logs/integrity/verify
     * Verify audit log integrity
     * 
     * Checks that all audit log entries have valid hashes and form a valid chain.
     * Returns entries that fail verification.
     */
    router.post('/audit-logs/integrity/verify', asyncHandler(async (req: Request, res: Response) => {
        const limit = parseInt(req.body.limit as string) || 1000;
        
        const { AuditLog } = await import('../../models/AuditLog.js');
        const result = await AuditLog.verifyIntegrity(limit);
        
        // Log the verification for audit
        await AuditLogService.logAction(
            req,
            'system_config_changed',
            'system',
            'audit_log_integrity',
            {
                action: 'integrity_verification',
                verified: result.verified,
                tampered: result.tampered.length,
                errors: result.errors.length,
                limit,
            }
        ).catch((error) => {
            logger.error({ error }, 'Failed to log audit log integrity verification audit event');
        });
        
        res.json({
            message: 'Audit log integrity verification completed',
            ...result,
            tamperedCount: result.tampered.length,
            errorCount: result.errors.length,
        });
    }));

    /**
     * GET /api/admin/audit-logs
     * Get audit logs with filtering and pagination
     */
    router.get('/audit-logs', asyncHandler(async (req: Request, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;
        const userId = req.query.userId as string;
        const action = req.query.action as string;
        const targetType = req.query.targetType as string;
        const targetId = req.query.targetId as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const search = req.query.search as string;
        const sortField = (req.query.sortField as string) || 'timestamp';
        const sortOrder = (req.query.sortOrder as string) === 'asc' ? 1 : -1;

        const { logs, total } = await AuditLog.find({
            userId,
            action: action as AuditActionType | undefined,
            targetType: targetType as AuditTargetType | undefined,
            targetId,
            startDate,
            endDate,
            search,
            limit,
            skip,
            sort: { [sortField]: sortOrder },
        });

        res.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    }));

    /**
     * GET /api/admin/audit-logs/export
     * Export audit logs as CSV
     */
    router.get('/audit-logs/export', asyncHandler(async (req: Request, res: Response) => {
        const userId = req.query.userId as string;
        const action = req.query.action as string;
        const targetType = req.query.targetType as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const search = req.query.search as string;
        const limit = parseInt(req.query.limit as string) || 10000;

        const { logs } = await AuditLog.find({
            userId,
            action: action ? (action as AuditActionType) : undefined,
            targetType: targetType ? (targetType as AuditTargetType) : undefined,
            startDate,
            endDate,
            search,
            limit,
            skip: 0,
            sort: { timestamp: -1 },
        });

        // Generate CSV
        const csvHeader = 'Timestamp,User Email,Action,Target Type,Target ID,IP Address,User Agent,Details\n';
        const csvRows = logs.map((log) => {
            const details = JSON.stringify(log.details || {}).replace(/"/g, '""');
            const userAgent = (log.userAgent || '').replace(/"/g, '""');
            return `"${log.timestamp.toISOString()}","${log.userEmail}","${log.action}","${log.targetType}","${log.targetId || ''}","${log.ipAddress || ''}","${userAgent}","${details}"`;
        }).join('\n');

        // Log the export action
        await AuditLogService.logAuditLogExport(req, {
            userId,
            action,
            targetType,
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            search,
            limit,
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvHeader + csvRows);
    }));

    /**
     * GET /api/admin/audit-logs/statistics
     * Get audit log statistics
     */
    router.get('/audit-logs/statistics', asyncHandler(async (req: Request, res: Response) => {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const action = req.query.action as string;
        const targetType = req.query.targetType as string;

        const stats = await AuditLog.getStatistics({
            startDate,
            endDate,
            action: action ? (action as AuditActionType) : undefined,
            targetType: targetType ? (targetType as AuditTargetType) : undefined,
        });

        res.json(stats);
    }));
}



