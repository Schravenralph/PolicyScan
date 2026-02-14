/**
 * Statistics & Metrics Admin Routes
 * 
 * Routes for system statistics and metrics in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getDB, ensureDBConnection } from '../../config/database.js';
import { asyncHandler } from './shared/middleware.js';
import { WorkflowModel } from '../../models/Workflow.js';
import { getErrorMonitoringService } from '../../services/monitoring/ErrorMonitoringService.js';
import { getPerformanceMonitoringService } from '../../services/monitoring/PerformanceMonitoringService.js';
import { getResourceThresholdService, ResourceMetrics } from '../../services/monitoring/ResourceThresholdService.js';
import {
    calculateDirectorySize,
    getStorageBreakdown,
    generateCleanupRecommendations,
    type StorageBreakdown,
    type CleanupRecommendation,
} from '../../utils/storageUtils.js';
import { logger } from '../../utils/logger.js';
import path from 'path';
import type { UserDocument, RunDocument } from './shared/types.js';

/**
 * Register statistics and metrics routes
 * 
 * @param router - Express router instance
 */
export function registerStatisticsRoutes(router: Router): void {
    /**
     * GET /api/admin/metrics
     * Get system overview metrics
     */
    router.get('/metrics', asyncHandler(async (_req: Request, res: Response) => {
        // Ensure database connection is active before operations
        const db = await ensureDBConnection();
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // User metrics
        const usersCollection = db.collection<UserDocument>('users');
        const totalUsers = await usersCollection.countDocuments({});
        const activeToday = await usersCollection.countDocuments({
            lastLogin: { $gte: todayStart }
        });

        // Workflow metrics
        const workflows = await WorkflowModel.findAll();
        const totalWorkflows = workflows.length;
        const automatedWorkflows = workflows.filter(w => w.status === 'Published').length;
        const runsCollection = db.collection<RunDocument>('runs');
        const runningRuns = await runsCollection.countDocuments({
            status: 'running'
        });

        // Run metrics
        const runsToday = await runsCollection.countDocuments({
            createdAt: { $gte: todayStart }
        });
        const completedRuns = await runsCollection.countDocuments({
            status: 'completed',
            createdAt: { $gte: todayStart }
        });
        const successRate = runsToday > 0 ? completedRuns / runsToday : 0;

        // Error metrics - use ErrorMonitoringService for accurate error tracking
        const errorMonitoringService = getErrorMonitoringService();
        const errorStats = await errorMonitoringService.getStatistics({
            startDate: last24h,
        });
        
        // Get recent errors for details
        const recentErrors = await errorMonitoringService.getErrors({
            startDate: last24h,
            limit: 10,
            skip: 0,
            sort: { last_seen: -1 },
        });

        // Aggregate errors by severity
        const errorsBySeverity: Record<string, number> = {};
        const errorsByComponent: Record<string, number> = {};
        
        if (recentErrors && Array.isArray(recentErrors)) {
            recentErrors.forEach((error: { severity?: string; component?: string; occurrence_count?: number }) => {
                const severity = error.severity || 'error';
                const component = error.component || 'other';
                errorsBySeverity[severity] = (errorsBySeverity[severity] || 0) + (error.occurrence_count || 1);
                errorsByComponent[component] = (errorsByComponent[component] || 0) + (error.occurrence_count || 1);
            });
        }

        const errorsLast24h = errorStats?.total_errors || 0;
        const criticalErrors = errorStats?.by_severity?.critical || 0;

        // Storage metrics with recursive directory size calculation
        const knowledgeBasePath = path.join(process.cwd(), 'data', 'knowledge_base');
        const logsPath = path.join(process.cwd(), 'data', 'logs');
        let knowledgeBaseSize = 0;
        try {
            knowledgeBaseSize = await calculateDirectorySize(knowledgeBasePath);
        } catch {
            // Knowledge base directory might not exist
        }

        // Database size (approximate - MongoDB doesn't provide exact size easily)
        const dbStats = await db.stats();
        const databaseSize = dbStats.dataSize || 0;

        const knowledgeBaseSizeMb = Math.round(knowledgeBaseSize / 1024 / 1024);
        const databaseSizeMb = Math.round(databaseSize / 1024 / 1024);

        // Get storage breakdown and cleanup recommendations
        let storageBreakdown: StorageBreakdown;
        let cleanupRecommendations: CleanupRecommendation[] = [];
        try {
            storageBreakdown = await getStorageBreakdown(
                knowledgeBasePath,
                logsPath,
                databaseSizeMb
            );
            cleanupRecommendations = await generateCleanupRecommendations(storageBreakdown);
        } catch (error) {
            logger.debug({ error }, '[StatisticsRoutes] Error calculating storage breakdown');
            storageBreakdown = {
                knowledge_base: { size_mb: knowledgeBaseSizeMb, path: knowledgeBasePath },
                logs: { size_mb: 0, path: logsPath },
                database: { size_mb: databaseSizeMb, type: 'MongoDB' },
                total_mb: knowledgeBaseSizeMb + databaseSizeMb,
            };
        }

        // Get API response time metrics (p95)
        let apiResponseTimeP95: number | undefined;
        try {
            const performanceService = getPerformanceMonitoringService();
            const perfStats = await performanceService.getStats();
            apiResponseTimeP95 = perfStats.p95;
        } catch (error) {
            // Performance monitoring might not be available
            logger.debug({ error }, '[StatisticsRoutes] Performance stats not available');
        }

        // Prepare resource metrics for threshold checking
        const resourceMetrics: ResourceMetrics = {
            database_size_mb: databaseSizeMb,
            knowledge_base_size_mb: knowledgeBaseSizeMb,
            error_rate_24h: errorsLast24h,
            api_response_time_p95_ms: apiResponseTimeP95,
        };

        // Check thresholds and get alerts
        const thresholdService = getResourceThresholdService();
        const thresholdAlerts = await thresholdService.checkThresholds(resourceMetrics);

        res.json({
            users: {
                total: totalUsers,
                active_today: activeToday
            },
            workflows: {
                total: totalWorkflows,
                automated: automatedWorkflows,
                running: runningRuns
            },
            runs: {
                today: runsToday,
                success_rate: successRate
            },
            storage: {
                knowledge_base_size_mb: knowledgeBaseSizeMb,
                database_size_mb: databaseSizeMb,
                breakdown: storageBreakdown,
                cleanup_recommendations: cleanupRecommendations,
            },
            errors: {
                last_24h: errorsLast24h,
                critical: criticalErrors,
                details: {
                    recent: recentErrors || [],
                    bySeverity: errorsBySeverity,
                    byComponent: errorsByComponent,
                }
            },
            threshold_alerts: thresholdAlerts // New: threshold violations
        });
    }));

    /**
     * GET /api/admin/metrics/trends
     * Get metrics trends over time
     */
    router.get('/metrics/trends', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const period = (req.query.period as string) || 'daily'; // daily, weekly, monthly
        const days = period === 'daily' ? 7 : period === 'weekly' ? 30 : 90;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const runsCollection = db.collection<RunDocument>('runs');
        const runs = await runsCollection
            .find({
                createdAt: { $gte: startDate }
            })
            .sort({ createdAt: 1 })
            .toArray();

        // Group runs by time period
        const trends: Array<{
            period: string;
            total: number;
            completed: number;
            failed: number;
            averageExecutionTime: number | null;
        }> = [];

        const groupedRuns = new Map<string, typeof runs>();
        runs.forEach((run) => {
            const date = new Date(run.createdAt || run.startTime || new Date());
            let periodKey: string;
            
            if (period === 'daily') {
                periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            } else if (period === 'weekly') {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay()); // Start of week
                periodKey = weekStart.toISOString().split('T')[0];
            } else {
                periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
            }

            if (!groupedRuns.has(periodKey)) {
                groupedRuns.set(periodKey, []);
            }
            groupedRuns.get(periodKey)!.push(run);
        });

        groupedRuns.forEach((periodRuns, periodKey) => {
            const completed = periodRuns.filter(r => r.status === 'completed');
            const failed = periodRuns.filter(r => r.status === 'failed');
            
            const executionTimes = completed
                .filter(r => r.startTime && r.endTime)
                .map(r => r.endTime!.getTime() - r.startTime!.getTime());
            
            const averageExecutionTime = executionTimes.length > 0
                ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
                : null;

            trends.push({
                period: periodKey,
                total: periodRuns.length,
                completed: completed.length,
                failed: failed.length,
                averageExecutionTime,
            });
        });

        res.json({
            period,
            days,
            trends: trends.sort((a, b) => a.period.localeCompare(b.period)),
        });
    }));
}

