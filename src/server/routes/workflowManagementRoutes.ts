import { Router, Request, Response } from 'express';
import { WorkflowModel, WorkflowCreateInput, WorkflowUpdateInput, WorkflowStatus } from '../models/Workflow.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { requireWorkflowViewer, requireWorkflowEditor, requireWorkflowOwner, attachWorkflowPermission } from '../middleware/workflowPermissionMiddleware.js';
import { WorkflowPermissionModel, WorkflowActivityModel } from '../models/WorkflowPermission.js';
import { moduleRegistry } from '../services/workflow/WorkflowModuleRegistry.js';
import { WorkflowStep } from '../services/infrastructure/types.js';
import { logger } from '../utils/logger.js';
import { RunManager } from '../services/workflow/RunManager.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, AuthorizationError } from '../types/errors.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { convertPredefinedWorkflowToDocument, convertDatabaseWorkflowToDocument } from '../utils/workflowConversion.js';

/**
 * Validate workflow steps reference valid modules and have valid parameters
 * @param steps Workflow steps to validate
 * @returns Validation result with errors if any
 */
function validateWorkflowSteps(steps: WorkflowStep[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(steps) || steps.length === 0) {
        return { valid: false, errors: ['Workflow must have at least one step'] };
    }

    for (const step of steps) {
        // Check if step has required fields
        if (!step.id || !step.name || !step.action) {
            errors.push(`Step ${step.id || 'unknown'} is missing required fields: id, name, or action`);
            continue;
        }

        // Check if action references a valid module
        const moduleEntry = moduleRegistry.get(step.action);
        if (!moduleEntry) {
            // Action might be a legacy action (not a module), which is allowed
            // But log a warning for modules that should exist
            logger.debug({ action: step.action, stepId: step.id }, 'Step action not found in module registry (may be legacy action)');
            continue;
        }

        // Ensure module instance exists
        if (!moduleEntry.module) {
            errors.push(`Step ${step.id} (${step.name}): Module entry exists but module instance is missing`);
            continue;
        }

        // Validate module parameters if params are provided
        if (step.params) {
            try {
                const validation = moduleEntry.module.validate(step.params);
                if (!validation.valid) {
                    errors.push(`Step ${step.id} (${step.name}): ${validation.error || 'Invalid parameters'}`);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`Step ${step.id} (${step.name}): Error validating parameters: ${errorMsg}`);
            }
        } else {
            // Check if module has required parameters
            try {
                const schema = moduleEntry.module.getParameterSchema();
                if (schema && typeof schema === 'object') {
                    const requiredParams = Object.entries(schema)
                        .filter(([_, def]: [string, unknown]) => def && typeof def === 'object' && (def as { required?: boolean }).required)
                        .map(([key]) => key);
                    
                    if (requiredParams.length > 0) {
                        errors.push(`Step ${step.id} (${step.name}): Missing required parameters: ${requiredParams.join(', ')}`);
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`Step ${step.id} (${step.name}): Error getting parameter schema: ${errorMsg}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

export function createWorkflowManagementRouter(authService: AuthService, runManager: RunManager): Router {
    const router = Router();

    // All routes require authentication
    router.use(authenticate(authService));

    /**
     * GET /api/workflows/manage
     * List all workflows (with lifecycle information) - filtered by user permissions
     * Includes both database workflows and predefined workflows
     */
    router.get('/manage', asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) {
            throw new AuthorizationError('Authentication required');
        }

        const status = req.query.status as WorkflowStatus | undefined;
        
        // Get database workflows
        const dbWorkflows = status
            ? await WorkflowModel.findByStatus(status)
            : await WorkflowModel.findAll();
        
        // Get predefined workflows and convert to document format
        const { allPredefinedWorkflows } = await import('../workflows/predefinedWorkflows.js');
        const predefinedAsDocuments = allPredefinedWorkflows.map((wf) => {
            try {
                return convertPredefinedWorkflowToDocument(wf);
            } catch (error) {
                logger.error({ error, workflowId: wf.id }, 'Failed to convert predefined workflow to document format');
                return null;
            }
        }).filter((wf): wf is ReturnType<typeof convertPredefinedWorkflowToDocument> => wf !== null);
        
        // Convert database workflows to document format
        const dbWorkflowsAsDocuments = dbWorkflows.map((wf) => convertDatabaseWorkflowToDocument(wf));
        
        // Merge workflows: database workflows take precedence over predefined ones (by ID)
        const workflowMap = new Map<string, ReturnType<typeof convertDatabaseWorkflowToDocument>>();
        
        // Add predefined workflows first (lower priority)
        predefinedAsDocuments.forEach(wf => {
            if (wf.id && !workflowMap.has(wf.id)) {
                workflowMap.set(wf.id, wf);
            }
        });
        
        // Add database workflows (higher priority - will overwrite predefined if same ID exists)
        dbWorkflowsAsDocuments.forEach(wf => {
            if (wf.id) {
                workflowMap.set(wf.id, wf);
            }
        });
        
        // Apply status filter if specified (for predefined workflows, they're always "Published")
        let allWorkflows = Array.from(workflowMap.values());
        if (status) {
            allWorkflows = allWorkflows.filter(w => {
                const workflowStatus = w.status || 'Published';
                return workflowStatus === status;
            });
        }
        
        // Filter workflows by user permissions
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const accessibleWorkflowIds = await WorkflowPermissionModel.getSharedWorkflows(req.user.userId);
        const accessibleWorkflowIdsSet = new Set(accessibleWorkflowIds);
        
        // Check which workflows have permission documents
        const workflowIds = allWorkflows.map(w => w.id);
        const permissionDocs = await WorkflowPermissionModel.findByWorkflowIds(workflowIds);
        const permissionDocsMap = new Map(permissionDocs.map(doc => [doc.workflowId, doc]));
        
        // Include workflows that are:
        // 1. In the shared workflows list (via permissions)
        // 2. Created by the user (fallback for workflows that might not have permission documents)
        // 3. Workflows without permission documents (legacy workflows and predefined workflows - treat as accessible to all)
        const accessibleWorkflows = allWorkflows.filter(workflow => {
            const permissionDoc = permissionDocsMap.get(workflow.id);
            const hasPermissionDoc = !!permissionDoc;

            if (!hasPermissionDoc) {
                // Legacy workflow or predefined workflow without permission doc - make it accessible
                return true;
            }
            // Has permission doc - check if user has access
            return accessibleWorkflowIdsSet.has(workflow.id) || workflow.createdBy === req.user?.userId;
        });
        
        if (!req.user?.userId) {
            return res.json([]);
        }

        // Attach permission level for each workflow
        // Optimization: Use in-memory map instead of DB queries for each workflow
        const userId = req.user.userId; // Already checked above
        const workflowsWithPermissionLevels = accessibleWorkflows.map(workflow => {
            const permissionDoc = permissionDocsMap.get(workflow.id);
            const permission = WorkflowPermissionModel.calculateUserPermission(
                permissionDoc,
                userId
            );

            // If no permission found but user is creator, set as owner
            // For predefined workflows without permission docs, set as null (accessible but not owned)
            const finalPermission = permission || (workflow.createdBy === userId ? 'owner' : null);
            return {
                ...workflow,
                myPermission: finalPermission,
            };
        });
        
        res.json(workflowsWithPermissionLevels);
    }));

    /**
     * GET /api/workflows/manage/:id
     * Get a specific workflow by ID
     */
    router.get('/manage/:id', attachWorkflowPermission, requireWorkflowViewer(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const workflow = await WorkflowModel.findById(id);
        
        throwIfNotFound(workflow, 'Workflow', id);
        
        res.json(workflow);
    }));

    /**
     * POST /api/workflows/manage
     * Create a new workflow (starts in Draft status)
     * Validates that steps reference valid modules and have valid parameters
     */
    router.post('/manage', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id, name, description, steps } = req.body;
        
        if (!id || !name || !steps || !Array.isArray(steps)) {
            throw new BadRequestError('Missing required fields: id, name, and steps (array) are required');
        }

        // Validate workflow steps (module references and parameters)
        const validation = validateWorkflowSteps(steps);
        if (!validation.valid) {
            throw new BadRequestError(`Workflow validation failed: ${validation.errors.join('; ')}`);
        }

        const input: WorkflowCreateInput = {
            id,
            name,
            description,
            steps,
            createdBy: req.user?.userId
        };

        const workflow = await WorkflowModel.create(input);
        res.status(201).json(workflow);
    }));

    /**
     * PUT /api/workflows/manage/:id
     * Update workflow configuration (name, description, steps)
     * Only allowed in Draft or Testing status
     * Validates that steps reference valid modules and have valid parameters
     */
    router.put('/manage/:id', attachWorkflowPermission, requireWorkflowEditor(), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, description, steps } = req.body;

        const workflow = await WorkflowModel.findById(id);
        throwIfNotFound(workflow, 'Workflow', id);

        // Only allow updates in Draft or Testing status
        if (workflow.status !== 'Draft' && workflow.status !== 'Testing') {
            throw new BadRequestError(`Cannot update workflow in ${workflow.status} status. Only Draft and Testing workflows can be updated.`);
        }

        // Validate workflow steps if steps are being updated
        if (steps !== undefined) {
            if (!Array.isArray(steps)) {
                throw new BadRequestError('Steps must be an array');
            }
            
            const validation = validateWorkflowSteps(steps);
            if (!validation.valid) {
                throw new BadRequestError(`Workflow validation failed: ${validation.errors.join('; ')}`);
            }
        }

        const input: WorkflowUpdateInput = {};
        if (name !== undefined) input.name = name;
        if (description !== undefined) input.description = description;
        if (steps !== undefined) input.steps = steps;

        const updated = await WorkflowModel.update(id, input);
        
        // Log activity for audit trail
        if (updated && req.user?.userId) {
            try {
                const user = await authService.getUserById(req.user.userId);
                const changes: string[] = [];
                if (name !== undefined && name !== workflow.name) {
                    changes.push(`name: "${workflow.name}" → "${name}"`);
                }
                if (description !== undefined && description !== workflow.description) {
                    changes.push(`description updated`);
                }
                if (steps !== undefined) {
                    const stepCount = Array.isArray(steps) ? steps.length : 0;
                    const oldStepCount = Array.isArray(workflow.steps) ? workflow.steps.length : 0;
                    if (stepCount !== oldStepCount) {
                        changes.push(`steps: ${oldStepCount} → ${stepCount} steps`);
                    } else {
                        changes.push('steps configuration updated');
                    }
                }
                
                if (changes.length > 0) {
                    if (req.user?.userId) {
                        await WorkflowActivityModel.addActivity(
                            id,
                            req.user.userId,
                            user?.name,
                            'updated_workflow_config',
                            changes.join(', ')
                        );
                    }
                }
            } catch (activityError) {
                // Don't fail the update if activity logging fails
                logger.error({ error: activityError, workflowId: id }, 'Failed to log workflow update activity');
            }
        }
        
        res.json(updated);
    }));

    /**
     * POST /api/workflows/manage/:id/status
     * Transition workflow to a new status
     * Sends notifications when workflow is unpublished or deprecated
     * Handles running instances based on runningInstanceBehavior parameter
     */
    router.post('/manage/:id/status', attachWorkflowPermission, requireWorkflowEditor(), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { status, comment, runningInstanceBehavior = 'complete' } = req.body;

        if (!status) {
            throw new BadRequestError('Status is required');
        }

        // Validate runningInstanceBehavior
        if (runningInstanceBehavior && !['complete', 'cancel'].includes(runningInstanceBehavior)) {
            throw new BadRequestError('runningInstanceBehavior must be either "complete" or "cancel"');
        }

        // Get workflow before status change to check if it was Published
        const currentWorkflow = await WorkflowModel.findById(id);
        throwIfNotFound(currentWorkflow, 'Workflow', id);

            const wasPublished = currentWorkflow.status === 'Published';
            const isUnpublishing = status === 'Unpublished' || status === 'Deprecated';

            // Handle running instances if unpublishing or deprecating
            let runningInstancesHandled: { total: number; cancelled: number; completed: number } | null = null;
            if (wasPublished && isUnpublishing) {
                try {
                    // Get all runs for this workflow
                    const allRuns = await runManager.getRunsByWorkflowId(id, 1000); // Get up to 1000 runs
                    
                    // Filter for running or pending runs
                    const activeRuns = allRuns.filter(run => 
                        run.status === 'running' || run.status === 'pending'
                    );

                    if (activeRuns.length > 0) {
                        let cancelled = 0;
                        let completed = 0;

                        for (const run of activeRuns) {
                            if (!run._id) {
                                logger.warn({ workflowId: id, run }, 'Skipping run without _id');
                                continue;
                            }
                            const runId = run._id.toString();
                            
                            if (runningInstanceBehavior === 'cancel') {
                                // Cancel the run
                                await runManager.updateStatus(runId, 'cancelled');
                                await runManager.log(runId, 
                                    `Run cancelled due to workflow being ${status.toLowerCase()}`, 
                                    'warn',
                                    { workflowId: id, reason: `Workflow ${status.toLowerCase()}` }
                                );
                                cancelled++;
                            } else {
                                // Let the run complete (no action needed, just log)
                                await runManager.log(runId, 
                                    `Workflow ${status.toLowerCase()}, but run will complete`, 
                                    'info',
                                    { workflowId: id, workflowStatus: status }
                                );
                                completed++;
                            }
                        }

                        runningInstancesHandled = {
                            total: activeRuns.length,
                            cancelled,
                            completed
                        };

                        logger.info({
                            workflowId: id,
                            status,
                            runningInstanceBehavior,
                            totalRuns: activeRuns.length,
                            cancelled,
                            completed
                        }, `Handled ${activeRuns.length} running instances during workflow status change`);
                    }
                } catch (runHandlingError) {
                    // Log but don't fail the status update if run handling fails
                    logger.error({ error: runHandlingError, workflowId: id }, 'Failed to handle running instances during status change');
                }
            }

            const workflow = await WorkflowModel.updateStatus(
                id,
                status as WorkflowStatus,
                req.user?.userId,
                comment
            );

            throwIfNotFound(workflow, 'Workflow', id);

            // Send notifications when workflow is unpublished or deprecated
            if (wasPublished && isUnpublishing) {
                try {
                    const { getNotificationService } = await import('../services/NotificationService.js');
                    const notificationService = getNotificationService();
                    
                    // Get users who should be notified (users with access to this workflow)
                    const access = await WorkflowPermissionModel.findByWorkflowId(workflow.id);
                    const allAccessibleUsers = new Set<string>();
                    
                    // Add workflow owner
                    if (access?.ownerId) {
                        allAccessibleUsers.add(access.ownerId);
                    }
                    if (workflow.createdBy) {
                        allAccessibleUsers.add(workflow.createdBy);
                    }
                    
                    // Add all users who have permissions on this workflow
                    if (access?.permissions) {
                        for (const permission of access.permissions) {
                            if (permission.userId) {
                                allAccessibleUsers.add(permission.userId);
                            }
                        }
                    }
                    
                    // Create notifications for all accessible users
                    const notificationTitle = status === 'Deprecated' 
                        ? `Workflow "${workflow.name}" has been deprecated`
                        : `Workflow "${workflow.name}" has been unpublished`;
                    
                    const notificationMessage = comment 
                        ? `${status === 'Deprecated' ? 'Deprecated' : 'Unpublished'}: ${comment}`
                        : `This workflow is no longer available for execution.`;
                    
                    for (const userId of allAccessibleUsers) {
                        await notificationService.createNotification({
                            user_id: userId,
                            type: 'workflow_complete',
                            title: notificationTitle,
                            message: notificationMessage,
                            link: `/workflows/manage/${workflow.id}`,
                            metadata: {
                                workflowId: workflow.id,
                                workflowName: workflow.name,
                                oldStatus: 'Published',
                                newStatus: status,
                                changedBy: req.user?.userId
                            }
                        });
                    }
                } catch (notificationError) {
                    // Log but don't fail the status update if notifications fail
                    logger.error({ error: notificationError, workflowId: id }, 'Failed to send workflow status change notifications');
                }
            }

            res.json({
                ...workflow,
                runningInstancesHandled
            });
    }));

    /**
     * GET /api/workflows/manage/:id/quality-gates
     * Check if workflow meets quality gates for publishing
     */
    router.get('/manage/:id/quality-gates', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const result = await WorkflowModel.checkQualityGates(id);
        res.json(result);
    }));

    /**
     * POST /api/workflows/manage/:id/test-metrics
     * Update test metrics for a workflow
     */
    router.post('/manage/:id/test-metrics', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { runCount, acceptanceRate, errorRate } = req.body;

        if (runCount === undefined || acceptanceRate === undefined || errorRate === undefined) {
            throw new BadRequestError('Missing required fields: runCount, acceptanceRate, errorRate');
        }

        const workflow = await WorkflowModel.updateTestMetrics(id, {
            runCount,
            acceptanceRate,
            errorRate
        });

        throwIfNotFound(workflow, 'Workflow', id);

        res.json(workflow);
    }));

    /**
     * GET /api/workflows/manage/:id/history
     * Get workflow version history with pagination
     * Query params: limit (default: 50, max: 100), offset (default: 0)
     */
    router.get('/manage/:id/history', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;
        
        const workflow = await WorkflowModel.findById(id);
        
        throwIfNotFound(workflow, 'Workflow', id);

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
     * GET /api/workflows/manage/:id/compare
     * Compare two workflow versions
     * Query params: version1, version2 (required)
     */
    router.get('/manage/:id/compare', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const version1 = parseInt(req.query.version1 as string);
        const version2 = parseInt(req.query.version2 as string);

        if (isNaN(version1) || isNaN(version2)) {
            throw new BadRequestError('version1 and version2 query parameters are required and must be numbers');
        }

        try {
            const comparison = await WorkflowModel.compareVersions(id, version1, version2);
            res.json(comparison);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                throw new NotFoundError('Workflow version', `${id} v${version1} or v${version2}`);
            }
            throw error;
        }
    }));

    /**
     * GET /api/workflows/manage/:id/version-metrics
     * Get performance metrics for workflow versions
     */
    router.get('/manage/:id/version-metrics', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        try {
            const metrics = await WorkflowModel.getVersionMetrics(id);
            res.json(metrics);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                throw new NotFoundError('Workflow', id);
            }
            throw error;
        }
    }));

    /**
     * GET /api/workflows/manage/:id/rollback/preview
     * Preview what a rollback would do without actually performing it
     * Query params: version (required)
     */
    router.get('/manage/:id/rollback/preview', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const version = parseInt(req.query.version as string);

        if (isNaN(version)) {
            throw new BadRequestError('Version query parameter is required and must be a number');
        }

        try {
            const preview = await WorkflowModel.previewRollback(id, version);
            res.json(preview);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                throw new NotFoundError('Workflow version', `${id} v${version}`);
            }
            throw error;
        }
    }));

    /**
     * GET /api/workflows/manage/:id/version-health
     * Iteration 26: Health check for workflow versions
     */
    router.get('/manage/:id/version-health', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const health = await WorkflowModel.versionHealthCheck(id);
        res.json(health);
    }));

    /**
     * GET /api/workflows/manage/:id/version-conflicts
     * Iteration 27: Detect version conflicts
     */
    router.get('/manage/:id/version-conflicts', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const conflicts = await WorkflowModel.detectVersionConflicts(id);
        res.json({ conflicts, hasConflicts: conflicts.length > 0 });
    }));

    /**
     * POST /api/workflows/manage/:id/versions/batch
     * Iteration 29: Batch get versions for multiple workflows
     */
    router.post('/manage/versions/batch', sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { workflowIds } = req.body;
        if (!Array.isArray(workflowIds)) {
            throw new BadRequestError('workflowIds must be an array');
        }
        const versions = await WorkflowModel.batchGetVersions(workflowIds);
        res.json(versions);
    }));

    /**
     * GET /api/workflows/manage/:id/performance-metrics
     * Iteration 30: Get performance metrics for version operations
     */
    router.get('/manage/:id/performance-metrics', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const metrics = await WorkflowModel.getPerformanceMetrics(id);
        res.json(metrics);
    }));

    /**
     * GET /api/workflows/manage/:id/versions/export
     * Iteration 31: Export version history
     */
    router.get('/manage/:id/versions/export', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const format = (req.query.format as 'json' | 'csv') || 'json';
        const exported = await WorkflowModel.exportVersionHistory(id, format);
        
        res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="workflow-${id}-versions.${format}"`);
        res.send(exported);
    }));

    /**
     * GET /api/workflows/manage/:id/versions/size
     * Iteration 33: Get version size information
     */
    router.get('/manage/:id/versions/size', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const sizeInfo = await WorkflowModel.getVersionSizeInfo(id);
        res.json(sizeInfo);
    }));

    /**
     * GET /api/workflows/manage/:id/versions/changes
     * Iteration 36: Get changes between two versions
     */
    router.get('/manage/:id/versions/changes', asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const fromVersion = parseInt(req.query.fromVersion as string);
        const toVersion = parseInt(req.query.toVersion as string);

        if (isNaN(fromVersion) || isNaN(toVersion)) {
            throw new BadRequestError('fromVersion and toVersion query parameters are required');
        }

        const changes = await WorkflowModel.getVersionChanges(id, fromVersion, toVersion);
        res.json(changes);
    }));

    /**
     * GET /api/workflows/manage/versions/stats
     * Iteration 37: Get aggregate version statistics
     */
    router.get('/manage/versions/stats', asyncHandler(async (_req: Request, res: Response) => {
        const stats = await WorkflowModel.getAggregateVersionStats();
        res.json(stats);
    }));

    /**
     * POST /api/workflows/manage/:id/rollback
     * Rollback workflow to a previous version
     */
    router.post('/manage/:id/rollback', attachWorkflowPermission, requireWorkflowEditor(), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { version, comment } = req.body;

        if (version === undefined || typeof version !== 'number') {
            throw new BadRequestError('Version number is required');
        }

        const workflow = await WorkflowModel.rollbackToVersion(
            id,
            version,
            req.user?.userId,
            comment
        );

        throwIfNotFound(workflow, 'Workflow', id);

        res.json({
            message: `Workflow rolled back to version ${version}`,
            workflow
        });
    }));

    /**
     * DELETE /api/workflows/manage/:id
     * Delete a workflow (only allowed in Draft or Deprecated status)
     */
    router.delete('/manage/:id', attachWorkflowPermission, requireWorkflowOwner(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const workflow = await WorkflowModel.findById(id);
        
        throwIfNotFound(workflow, 'Workflow', id);

        // Only allow deletion of Draft or Deprecated workflows
        if (workflow.status !== 'Draft' && workflow.status !== 'Deprecated') {
            throw new BadRequestError(`Cannot delete workflow in ${workflow.status} status. Only Draft and Deprecated workflows can be deleted.`);
        }

        // Delete workflow (only allowed for Draft or Deprecated workflows)
        const deleted = await WorkflowModel.delete(id);
        
        throwIfNotFound(deleted, 'Workflow', id);

        res.json({ message: '[i18n:apiMessages.workflowDeleted]' });
    }));

    /**
     * GET /api/workflows/manage/:id/benchmark-config
     * Get benchmark configuration for a workflow
     */
    router.get('/manage/:id/benchmark-config', attachWorkflowPermission, requireWorkflowViewer(), asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { WorkflowModel } = await import('../models/Workflow.js');
        const { hasDefaultBenchmarkConfig } = await import('../config/defaultWorkflowBenchmarkConfigs.js');
        
        // Check if workflow exists in database with config
        const workflow = await WorkflowModel.findById(id);
        const hasDatabaseConfig = !!workflow?.benchmarkConfig;
        
        // Get config (from database or default)
        const config = await WorkflowModel.getBenchmarkConfig(id);
        
        // Determine source: 'custom' if from database, 'default' if from defaults, null if unknown
        let source: 'custom' | 'default' | null = null;
        if (hasDatabaseConfig) {
            source = 'custom';
        } else if (hasDefaultBenchmarkConfig(id)) {
            source = 'default';
        }
        
        // If config is null (unknown workflow), return empty config with null source
        if (config === null) {
            return res.json({ 
                featureFlags: {}, 
                params: {},
                _source: null,
            });
        }
        
        // Return config with source metadata
        // Frontend will extract and remove _source before using the config
        res.json({
            ...config,
            _source: source,
        });
    }));

    /**
     * PUT /api/workflows/manage/:id/benchmark-config
     * Set benchmark configuration for a workflow
     */
    router.put('/manage/:id/benchmark-config', attachWorkflowPermission, requireWorkflowEditor(), sanitizeInput, asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const config = req.body;
        
        // Validate config structure - must be an object (or null/undefined for clearing)
        // Reject strings, arrays, and other non-object types
        // Note: Express JSON parser converts invalid JSON strings to empty objects {},
        // so we check for empty objects that might result from invalid input
        if (typeof config === 'string') {
            throw new BadRequestError('Invalid benchmark configuration: expected JSON object');
        }
        if (config !== null && config !== undefined) {
            if (Array.isArray(config) || typeof config !== 'object') {
                throw new BadRequestError('Invalid benchmark configuration');
            }
            // Reject empty objects - they might result from invalid JSON input
            // Empty object means "use defaults" which should be represented as null/undefined
            if (Object.keys(config).length === 0) {
                throw new BadRequestError('Invalid benchmark configuration: empty object not allowed');
            }
        }
        
        const updated = await WorkflowModel.setBenchmarkConfig(id, config);
        
        throwIfNotFound(updated, 'Workflow', id);
        
        res.json({ 
            success: true, 
            benchmarkConfig: updated.benchmarkConfig 
        });
    }));

    return router;
}

