import { Router, Request, Response } from 'express';
import { WorkflowModel, WorkflowStatus } from '../models/Workflow.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { parsePaginationParams, createPaginatedResponse } from '../utils/pagination.js';
import { getDB } from '../config/database.js';
import { handleDatabaseOperation } from '../utils/databaseErrorHandler.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError } from '../types/errors.js';

export function createWorkflowLifecycleRoutes(authService: AuthService): Router {
    const router = Router();

    // All routes require authentication and developer/admin role
    router.use(authenticate(authService));
    router.use(authorize(['developer', 'admin']));

    /**
     * GET /api/workflows/lifecycle
     * Get all workflows with lifecycle status (paginated)
     */
    router.get('/lifecycle', asyncHandler(async (req: Request, res: Response) => {
        const db = getDB();
        const { limit, skip, page } = parsePaginationParams(req.query, {
            defaultLimit: 20,
            maxLimit: 100
        });

        // Get paginated workflows and total count
        const workflowsCollection = db.collection('workflows');
        const [workflows, total] = await Promise.all([
            handleDatabaseOperation(
                async () => {
                    return await workflowsCollection
                        .find({})
                        .sort({ updatedAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .toArray();
                },
                'WorkflowLifecycleRoutes.getWorkflows'
            ),
            handleDatabaseOperation(
                async () => {
                    return await workflowsCollection.countDocuments({});
                },
                'WorkflowLifecycleRoutes.countWorkflows'
            ),
        ]);

        const response = createPaginatedResponse(
            workflows,
            total,
            limit,
            page,
            skip
        );

        res.json(response);
    }));

    /**
     * GET /api/workflows/lifecycle/:id
     * Get workflow by ID with full lifecycle info
     */
    router.get('/lifecycle/:id', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const workflow = await WorkflowModel.findById(id);
        
        if (!workflow) {
            throw new NotFoundError('Workflow', id);
        }

        // Check quality gates
        const qualityGates = await WorkflowModel.checkQualityGates(id);

        res.json({
            ...workflow,
            qualityGates
        });
    }));

    /**
     * POST /api/workflows/lifecycle
     * Create a new workflow (starts in Draft status)
     */
    router.post('/lifecycle', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id, name, description, steps } = req.body;

        if (!id || !name || !steps || !Array.isArray(steps)) {
            throw new BadRequestError('id, name, and steps array are required', {
                fields: ['id', 'name', 'steps'],
                received: {
                    id: req.body.id,
                    name: req.body.name,
                    steps: req.body.steps,
                },
            });
        }

        const workflow = await WorkflowModel.create({
            id,
            name,
            description,
            steps,
            createdBy: req.user?.userId
        });

        res.status(201).json(workflow);
    }));

    /**
     * PATCH /api/workflows/lifecycle/:id/status
     * Update workflow status (with transition validation)
     */
    router.patch('/lifecycle/:id/status', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { status, comment } = req.body;

        if (!status) {
            throw new BadRequestError('status is required', {
                field: 'status',
                received: status,
            });
        }

        // Check quality gates if publishing
        if (status === 'Published') {
            const qualityGates = await WorkflowModel.checkQualityGates(id);
            if (!qualityGates.passed) {
                throw new BadRequestError('Quality gates not met', {
                    reasons: qualityGates.reasons,
                    workflowId: id,
                });
            }
        }

        try {
            const workflow = await WorkflowModel.updateStatus(
                id,
                status as WorkflowStatus,
                req.user?.userId,
                comment
            );

            if (!workflow) {
                throw new NotFoundError('Workflow', id);
            }

            res.json(workflow);
        } catch (error) {
            if (error instanceof Error && error.message.includes('Invalid status transition')) {
                throw new BadRequestError(error.message, { workflowId: id, status });
            }
            throw error;
        }
    }));

    /**
     * PATCH /api/workflows/lifecycle/:id/metrics
     * Update workflow test metrics
     */
    router.patch('/lifecycle/:id/metrics', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { runCount, acceptanceRate, errorRate } = req.body;

        if (runCount === undefined || acceptanceRate === undefined || errorRate === undefined) {
            throw new BadRequestError('runCount, acceptanceRate, and errorRate are required', {
                fields: ['runCount', 'acceptanceRate', 'errorRate'],
                received: { runCount, acceptanceRate, errorRate },
            });
        }

        const workflow = await WorkflowModel.updateTestMetrics(id, {
            runCount,
            acceptanceRate,
            errorRate
        });

        if (!workflow) {
            throw new NotFoundError('Workflow', id);
        }

        res.json(workflow);
    }));

    /**
     * PATCH /api/workflows/lifecycle/:id
     * Update workflow configuration (name, description, steps)
     */
    router.patch('/lifecycle/:id', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, description, steps } = req.body;

        const workflow = await WorkflowModel.update(id, {
            name,
            description,
            steps
        });

        if (!workflow) {
            throw new NotFoundError('Workflow', id);
        }

        res.json(workflow);
    }));

    /**
     * GET /api/workflows/lifecycle/:id/quality-gates
     * Check quality gates for a workflow
     */
    router.get('/lifecycle/:id/quality-gates', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const qualityGates = await WorkflowModel.checkQualityGates(id);
        res.json(qualityGates);
    }));

    /**
     * GET /api/workflows/lifecycle/:id/versions
     * Get workflow version history with pagination
     * Query params: limit (default: 50, max: 100), offset (default: 0)
     */
    router.get('/lifecycle/:id/versions', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;
        
        const workflow = await WorkflowModel.findById(id);
        
        if (!workflow) {
            throw new NotFoundError('Workflow', id);
        }

        // Get all versions to calculate total, then paginate
        const allVersions = await WorkflowModel.getVersionHistory(id);
        const total = allVersions.length;
        const paginatedVersions = allVersions.slice(offset, offset + limit);

        res.json({
            id: workflow.id,
            name: workflow.name,
            version: workflow.version,
            versions: paginatedVersions,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            },
            statusHistory: workflow.statusHistory,
            publishedBy: workflow.publishedBy,
            publishedAt: workflow.publishedAt,
            testMetrics: workflow.testMetrics
        });
    }));

    /**
     * GET /api/workflows/lifecycle/:id/rollback/preview
     * Preview what a rollback would do without actually performing it
     * Query params: version (required)
     */
    router.get('/lifecycle/:id/rollback/preview', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const version = parseInt(req.query.version as string);
        
        if (isNaN(version)) {
            throw new BadRequestError('Version query parameter is required and must be a number', {
                field: 'version',
                received: req.query.version,
            });
        }

        try {
            const preview = await WorkflowModel.previewRollback(id, version);
            res.json(preview);
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('not found')) {
                    throw new NotFoundError('Workflow version', `${id}:${version}`, { workflowId: id, version });
                }
                if (error.message.includes('Cannot rollback')) {
                    throw new BadRequestError(error.message, { workflowId: id, version });
                }
            }
            throw error;
        }
    }));

    /**
     * POST /api/workflows/lifecycle/:id/rollback
     * Rollback workflow to a previous version
     * Body: { version: number, comment?: string }
     */
    router.post('/lifecycle/:id/rollback', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { version, comment } = req.body;
        
        if (version === undefined || typeof version !== 'number') {
            throw new BadRequestError('Version number is required', {
                field: 'version',
                received: version,
            });
        }

        try {
            const workflow = await WorkflowModel.rollbackToVersion(
                id,
                version,
                req.user?.userId,
                comment
            );

            if (!workflow) {
                throw new NotFoundError('Workflow', id);
            }

            res.json({
                message: `Workflow rolled back to version ${version}`,
                workflow
            });
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('not found')) {
                    throw new NotFoundError('Workflow', id, { version });
                }
                if (error.message.includes('Cannot rollback')) {
                    throw new BadRequestError(error.message, { workflowId: id, version });
                }
            }
            throw error;
        }
    }));

    /**
     * GET /api/workflows/lifecycle/:id/compare
     * Compare two workflow versions
     * Query params: version1, version2 (required)
     */
    router.get('/lifecycle/:id/compare', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const version1 = parseInt(req.query.version1 as string);
        const version2 = parseInt(req.query.version2 as string);
        
        if (isNaN(version1) || isNaN(version2)) {
            throw new BadRequestError('version1 and version2 query parameters are required and must be numbers', {
                fields: ['version1', 'version2'],
                received: {
                    version1: req.query.version1,
                    version2: req.query.version2,
                },
            });
        }

        try {
            const comparison = await WorkflowModel.compareVersions(id, version1, version2);
            res.json(comparison);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                throw new NotFoundError('Workflow version', `${id}:${version1} or ${version2}`, { 
                    workflowId: id, 
                    version1, 
                    version2 
                });
            }
            throw error;
        }
    }));

    return router;
}



















