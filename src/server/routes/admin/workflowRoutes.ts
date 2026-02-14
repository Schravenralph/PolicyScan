/**
 * Workflow Management Admin Routes
 * 
 * Routes for managing workflows in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { getDB } from '../../config/database.js';
import { parsePaginationParams, createPaginatedResponse } from '../../utils/pagination.js';
import { asyncHandler } from './shared/middleware.js';
import { sendPaginatedOrArray } from './shared/responseHelpers.js';
import { mapWorkflowRunToAdminDto } from '../../utils/mappers.js';
import { handleDatabaseOperation } from '../../utils/databaseErrorHandler.js';
import { NotFoundError } from '../../types/errors.js';
import type { RunDocument } from './shared/types.js';

/**
 * Register workflow management routes
 * 
 * @param router - Express router instance
 */
export function registerWorkflowRoutes(router: Router): void {
    /**
     * GET /api/admin/workflows
     * Get all workflows with status and health info
     * Includes both database workflows and predefined workflows
     */
    router.get('/workflows', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const { limit, skip, page } = parsePaginationParams(req.query, {
            defaultLimit: 20,
            maxLimit: 100
        });

        // Import predefined workflows
        const { allPredefinedWorkflows } = await import('../../workflows/predefinedWorkflows.js');

        // Get workflows from database with pagination applied
        // Note: We fetch a bit more than needed to account for predefined workflows
        // Predefined workflows are a small fixed set, so we'll include them in all pages
        const workflowsCollection = db.collection('workflows');
        const [dbWorkflows, dbTotal] = await Promise.all([
            handleDatabaseOperation(
                async () => {
                    return await workflowsCollection
                        .find({})
                        .sort({ updatedAt: -1 })
                        .limit(limit + allPredefinedWorkflows.length) // Fetch extra to account for predefined
                        .skip(skip)
                        .toArray();
                },
                'WorkflowRoutes.getWorkflows'
            ),
            handleDatabaseOperation(
                async () => {
                    return await workflowsCollection.countDocuments({});
                },
                'WorkflowRoutes.countWorkflows'
            )
        ]);

        // Combine database workflows with predefined workflows
        // Predefined workflows are always included (they're a small fixed set)
        const allWorkflows = [
            ...dbWorkflows.map((w: Record<string, unknown>) => ({
                ...w,
                source: 'database' as const,
            })),
            ...allPredefinedWorkflows.map((w) => ({
                ...(w as unknown as Record<string, unknown>),
                source: 'predefined' as const,
            })),
        ];

        // Get run stats for all workflows
        const runsCollection = db.collection('runs');
        const stats = await handleDatabaseOperation(
            async () => {
                return await runsCollection.aggregate([
                    {
                        $group: {
                            _id: '$workflowId',
                            totalRuns: { $sum: 1 },
                            successfulRuns: {
                                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                            },
                            failedRuns: {
                                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                            },
                            lastRunTime: { $max: '$createdAt' }
                        }
                    }
                ]).toArray();
            },
            'WorkflowRoutes.getWorkflowStats'
        );

        const statsMap = new Map(stats.map((s: any) => [s._id, s]));

        const workflowsWithStats = allWorkflows.map((w: Record<string, unknown>) => {
            const workflowId = 'id' in w && typeof w.id === 'string' ? w.id : undefined;
            const s = workflowId ? statsMap.get(workflowId) || { totalRuns: 0, successfulRuns: 0, failedRuns: 0, lastRunTime: null } : { totalRuns: 0, successfulRuns: 0, failedRuns: 0, lastRunTime: null };
            return {
                ...w,
                stats: {
                    totalRuns: s.totalRuns,
                    successfulRuns: s.successfulRuns,
                    failedRuns: s.failedRuns,
                    successRate: s.totalRuns > 0 ? s.successfulRuns / s.totalRuns : 0,
                    lastRunTime: s.lastRunTime,
                    hasErrors: s.failedRuns > 0
                }
            };
        });

        // Return array directly for backward compatibility with tests
        if (req.query.includePagination === 'true') {
            const response = createPaginatedResponse(
                workflowsWithStats,
                dbTotal + allPredefinedWorkflows.length,
                limit,
                page,
                skip
            );
            res.json(response);
        } else {
            res.json(workflowsWithStats);
        }
    }));

    /**
     * GET /api/admin/workflows/:id/runs
     * Get workflow runs for a specific workflow
     */
    router.get('/workflows/:id/runs', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const db = getDB();
        const { limit, skip, page } = parsePaginationParams(req.query, {
            defaultLimit: 20,
            maxLimit: 100
        });

        const runsCollection = db.collection<RunDocument>('runs');
        const [runs, total] = await Promise.all([
            handleDatabaseOperation(
                async () => {
                    return await runsCollection
                        .find({ workflowId: id })
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .toArray();
                },
                'WorkflowRoutes.getWorkflowRuns'
            ),
            handleDatabaseOperation(
                async () => {
                    return await runsCollection.countDocuments({ workflowId: id });
                },
                'WorkflowRoutes.countWorkflowRuns'
            )
        ]);

        const runsList = runs.map((run) => mapWorkflowRunToAdminDto({
            _id: run._id,
            createdAt: run.createdAt,
            startTime: run.startTime,
            endTime: run.endTime,
            status: run.status,
            error: typeof run.error === 'string' ? run.error : undefined
        }));

        sendPaginatedOrArray(
            res,
            runsList,
            total,
            limit,
            page,
            skip,
            (req.query.includePagination as string) === 'true'
        );
    }));

    /**
     * POST /api/admin/workflows/:id/pause
     * Pause a workflow
     */
    router.post('/workflows/:id/pause', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const db = getDB();

        const result = await handleDatabaseOperation(
            async () => {
                return await db.collection('workflows').updateOne(
                    { id },
                    { $set: { paused: true, updatedAt: new Date() } }
                );
            },
            'WorkflowRoutes.pauseWorkflow'
        );

        if (result.matchedCount === 0) {
            throw new NotFoundError('Workflow', id);
        }

        res.json({ message: '[i18n:apiMessages.workflowPaused]' });
    }));

    /**
     * POST /api/admin/workflows/:id/resume
     * Resume a workflow
     */
    router.post('/workflows/:id/resume', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const db = getDB();

        const result = await handleDatabaseOperation(
            async () => {
                return await db.collection('workflows').updateOne(
                    { id },
                    { $set: { paused: false, updatedAt: new Date() } }
                );
            },
            'WorkflowRoutes.resumeWorkflow'
        );

        if (result.matchedCount === 0) {
            throw new NotFoundError('Workflow', id);
        }

        res.json({ message: '[i18n:apiMessages.workflowResumed]' });
    }));
}

