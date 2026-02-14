/**
 * Logs Admin Routes
 * 
 * Routes for system logs in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getDB } from '../../config/database.js';
import { asyncHandler } from './shared/middleware.js';
import { handleDatabaseOperation } from '../../utils/databaseErrorHandler.js';
import { logger } from '../../utils/logger.js';

/**
 * Register logs routes
 * 
 * @param router - Express router instance
 */
export function registerLogsRoutes(router: Router): void {
    /**
     * GET /api/admin/logs
     * Get system logs (recent runs with errors)
     */
    router.get('/logs', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const limit = parseInt(req.query.limit as string) || 50;
        const severity = req.query.severity as string; // 'error', 'warning', 'info'
        const component = req.query.component as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        interface RunDocument {
            _id?: { toString(): string };
            logs?: Array<{ timestamp?: Date; message?: string; level?: string } | string>;
            status?: string;
            createdAt?: Date;
            workflowId?: string;
        }

        const runsCollection = db.collection<RunDocument>('runs');
        
        // Build query filter
        const filter: Record<string, unknown> = {};
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                (filter.createdAt as Record<string, unknown>).$gte = startDate;
            }
            if (endDate) {
                (filter.createdAt as Record<string, unknown>).$lte = endDate;
            }
        }

        const runs = await handleDatabaseOperation(
            async () => {
                return await runsCollection
                    .find(filter)
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .toArray();
            },
            'LogsRoutes.getLogs'
        );

        // Filter and format logs
        const formattedLogs: Array<{
            runId: string;
            workflowId?: string;
            timestamp: Date | undefined;
            level: string;
            message: string;
            status?: string;
        }> = [];

        runs.forEach((run) => {
            if (!run.logs || !Array.isArray(run.logs)) {
                return;
            }

            run.logs.forEach((logEntry) => {
                let logLevel = 'info';
                let logMessage = '';
                let logTimestamp: Date | undefined = run.createdAt;

                if (typeof logEntry === 'string') {
                    logMessage = logEntry;
                } else if (typeof logEntry === 'object' && logEntry !== null) {
                    logLevel = logEntry.level || 'info';
                    logMessage = logEntry.message || '';
                    logTimestamp = logEntry.timestamp || run.createdAt;
                }

                // Filter by severity if specified
                if (severity && logLevel !== severity) {
                    return;
                }

                formattedLogs.push({
                    runId: run._id?.toString() || 'unknown',
                    workflowId: run.workflowId,
                    timestamp: logTimestamp,
                    level: logLevel,
                    message: logMessage,
                    status: run.status,
                });
            });
        });

        // Sort by timestamp (most recent first)
        formattedLogs.sort((a, b) => {
            const timeA = a.timestamp?.getTime() || 0;
            const timeB = b.timestamp?.getTime() || 0;
            return timeB - timeA;
        });

        // Filter by component if specified
        let filteredLogs = formattedLogs;
        if (component) {
            filteredLogs = formattedLogs.filter(log => log.level === component || log.status === component);
        }

        res.json({ logs: filteredLogs.slice(0, limit) });
    }));

    /**
     * GET /api/admin/logs/export
     * Export system logs as CSV
     */
    router.get('/logs/export', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const MAX_EXPORT_LIMIT = 50000;
        const requestedLimit = parseInt(req.query.limit as string) || 1000;
        const limit = Math.min(requestedLimit, MAX_EXPORT_LIMIT);
        const severity = req.query.severity as string;
        
        if (requestedLimit > MAX_EXPORT_LIMIT) {
            logger.warn(`[Log Export] Requested limit ${requestedLimit} exceeds maximum ${MAX_EXPORT_LIMIT}, using ${MAX_EXPORT_LIMIT}`);
        }

        interface Query {
            status?: string;
        }
        const query: Query = {};
        if (severity === 'error') {
            query.status = 'failed';
        }

        interface RunDocument {
            _id?: { toString(): string };
            logs?: Array<{ timestamp?: Date; message?: string; level?: string } | string>;
            status?: string;
            createdAt?: Date;
            workflowId?: string;
        }

        const runsCollection = db.collection<RunDocument>('runs');
        const runs = await handleDatabaseOperation(
            async () => {
                return await runsCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .toArray() as RunDocument[];
            },
            'LogsRoutes.exportLogsCSV'
        );

        // Use streaming for large exports to prevent memory issues
        const STREAMING_THRESHOLD = 10000;
        const useStreaming = limit > STREAMING_THRESHOLD;
        
        if (useStreaming) {
            // Stream large exports
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=logs-${new Date().toISOString().split('T')[0]}.csv`);
            
            // Write CSV header
            res.write('Timestamp,Severity,Component,Message,RunId,WorkflowId\n');
            
            // Stream logs in batches
            const batchSize = 100;
            let processed = 0;
            
            for (let i = 0; i < runs.length; i += batchSize) {
                const batch = runs.slice(i, i + batchSize);
                const batchLogs = batch.flatMap((run: RunDocument) => {
                    if (!run.logs || !Array.isArray(run.logs)) return [];
                    return run.logs.map((log: { timestamp?: Date; message?: string; level?: string } | string) => {
                        const safeMessage = typeof log === 'string' ? log : (log.message || '');
                        return {
                            timestamp: (typeof log === 'string' ? run.createdAt : log.timestamp) || run.createdAt,
                            severity: run.status === 'failed' ? 'error' : (typeof log === 'string' ? 'info' : (log.level || 'info')),
                            component: 'workflow',
                            message: safeMessage.replace(/"/g, '""'),
                            runId: run._id?.toString(),
                            workflowId: run.workflowId,
                        };
                    });
                });
                
                const csvRows = batchLogs.map(log => 
                    `"${log.timestamp}","${log.severity}","${log.component}","${log.message}","${log.runId}","${log.workflowId}"`
                ).join('\n');
                
                if (csvRows) {
                    res.write(csvRows + '\n');
                }
                processed += batchLogs.length;
            }
            
            res.end();
        } else {
            // For smaller exports, use standard approach
            const logs = runs.flatMap((run: RunDocument) => {
                if (!run.logs || !Array.isArray(run.logs)) return [];
                return run.logs.map((log: { timestamp?: Date; message?: string; level?: string } | string) => {
                    const safeMessage = typeof log === 'string' ? log : (log.message || '');
                    return {
                        timestamp: (typeof log === 'string' ? run.createdAt : log.timestamp) || run.createdAt,
                        severity: run.status === 'failed' ? 'error' : (typeof log === 'string' ? 'info' : (log.level || 'info')),
                        component: 'workflow',
                        message: safeMessage.replace(/"/g, '""'),
                        runId: run._id?.toString(),
                        workflowId: run.workflowId,
                    };
                });
            });

            const csvHeader = 'Timestamp,Severity,Component,Message,RunId,WorkflowId\n';
            const csvRows = logs.map(log => 
                `"${log.timestamp}","${log.severity}","${log.component}","${log.message}","${log.runId}","${log.workflowId}"`
            ).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=logs-${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csvHeader + csvRows);
        }
    }));
}

