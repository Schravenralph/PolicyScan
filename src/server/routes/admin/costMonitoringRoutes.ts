/**
 * Cost Monitoring Admin Routes
 * 
 * Routes for monitoring and managing costs in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from './shared/index.js';
import { getDB } from '../../config/database.js';

/**
 * Register cost monitoring routes
 * 
 * @param router - Express router instance
 */
export function registerCostMonitoringRoutes(router: Router): void {
    /**
     * GET /api/admin/cost-monitoring/status
     * Get cost monitoring status and alerts
     */
    router.get('/cost-monitoring/status', asyncHandler(async (_req: Request, res: Response) => {
        const { getCostMonitoringService } = await import('../../services/monitoring/CostMonitoringService.js');
        const costService = getCostMonitoringService();
        const status = await costService.getCostStatus();
        
        res.json({
            success: true,
            ...status,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * POST /api/admin/cost-monitoring/check
     * Manually trigger cost monitoring check and send alerts
     */
    router.post('/cost-monitoring/check', asyncHandler(async (_req: Request, res: Response) => {
        const { getCostMonitoringService } = await import('../../services/monitoring/CostMonitoringService.js');
        const costService = getCostMonitoringService();
        await costService.runCostMonitoring();
        
        res.json({
            success: true,
            message: 'Cost monitoring check completed',
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * GET /api/admin/cost-monitoring/alerts
     * Get recent cost alerts
     */
    router.get('/cost-monitoring/alerts', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = parseInt(req.query.skip as string) || 0;
        
        const alerts = await db.collection('cost_alerts')
            .find({})
            .sort({ timestamp: -1 })
            .limit(limit)
            .skip(skip)
            .toArray();
        
        const total = await db.collection('cost_alerts').countDocuments();
        
        res.json({
            success: true,
            alerts,
            pagination: {
                total,
                limit,
                skip,
                pages: Math.ceil(total / limit),
            },
            timestamp: new Date().toISOString(),
        });
    }));
}

