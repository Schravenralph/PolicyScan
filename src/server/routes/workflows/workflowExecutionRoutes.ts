/**
 * Workflow Execution Routes
 * 
 * Handles endpoints for workflow execution:
 * - POST /api/workflows/:id/run - Execute a workflow directly
 * - POST /api/workflows/:id/queue - Queue a workflow for background execution
 * 
 * Note: The POST /workflows/:id/run route in workflowRunRoutes.ts queues workflows
 * with rate limiting and quota checks. This file contains the direct execution route
 * and the explicit queue route.
 */

import express, { Router } from 'express';
import { RunManager } from '../../services/workflow/RunManager.js';
import { WorkflowEngine } from '../../services/workflow/WorkflowEngine.js';
import { validate } from '../../middleware/validation.js';
import { workflowSchemas } from '../../validation/workflowSchemas.js';
import { ServiceConfigurationValidator } from '../../services/workflow/ServiceConfigurationValidator.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler } from '../../utils/errorHandling.js';
import { NotFoundError, BadRequestError, AuthorizationError, ServiceUnavailableError } from '../../types/errors.js';
import {
    explorationWorkflow,
    standardScanWorkflow,
    quickIploScanWorkflow,
    // horstAanDeMaasSimpleWorkflow removed - use horstAanDeMaasWorkflow instead
    horstAanDeMaasWorkflow,
    horstLaborMigrationWorkflow,
    externalLinksWorkflow,
    beleidsscanGraphWorkflow,
    bfs3HopWorkflow
} from '../../workflows/predefinedWorkflows.js';

/**
 * Create router for workflow execution endpoints
 * 
 * @param runManager - Run manager instance
 * @param workflowEngine - Workflow engine instance
 * @returns Express router with execution routes
 */
export function createWorkflowExecutionRouter(
    _runManager: RunManager,
    workflowEngine: WorkflowEngine
): Router {
    const router = express.Router();

    // POST /api/workflows/:id/run
    // Start a workflow execution (direct execution, not queued)
    router.post('/:id/run', validate(workflowSchemas.runWorkflow), asyncHandler(async (req, res) => {
        const { id } = req.params;
        const params = req.body;
        
        // Add userId to params if user is authenticated (for notifications)
        const userId = req.user?.userId;
        if (userId) {
            params.userId = userId;
        }

        // Check if workflow exists (predefined or in database)
        let workflow;
        const predefinedWorkflows = [
            'iplo-exploration',
            'standard-scan',
            'quick-iplo-scan',
            'external-links-exploration',
            'beleidsscan-graph',
            'bfs-3-hop',
            'horst-aan-de-maas',
            'horst-labor-migration'
        ];

        if (predefinedWorkflows.includes(id)) {
            // Get predefined workflow
            switch (id) {
                case 'iplo-exploration':
                    workflow = explorationWorkflow;
                    break;
                case 'standard-scan':
                    workflow = standardScanWorkflow;
                    break;
                case 'quick-iplo-scan':
                    workflow = quickIploScanWorkflow;
                    break;
                case 'external-links-exploration':
                    workflow = externalLinksWorkflow;
                    break;
                case 'beleidsscan-graph':
                    workflow = beleidsscanGraphWorkflow;
                    break;
                case 'bfs-3-hop':
                    workflow = bfs3HopWorkflow;
                    break;
                case 'horst-aan-de-maas':
                    workflow = horstAanDeMaasWorkflow;
                    break;
                case 'horst-labor-migration':
                    workflow = horstLaborMigrationWorkflow;
                    break;
            }
        } else {
            // Check database for workflow
            const { WorkflowModel } = await import('../../models/Workflow.js');
            const workflowDoc = await WorkflowModel.findById(id);
            if (workflowDoc) {
                // Check if workflow can be executed (status check)
                const isDeveloper = req.user?.role === 'admin' || req.user?.role === 'developer';
                const canExecute = WorkflowModel.canExecute(workflowDoc, isDeveloper);
                
                if (!canExecute.allowed) {
                    throw new AuthorizationError(canExecute.reason || 'Workflow cannot be executed');
                }

                // Convert WorkflowDocument to Workflow type
                workflow = {
                    id: workflowDoc.id,
                    name: workflowDoc.name,
                    description: workflowDoc.description,
                    steps: workflowDoc.steps
                };
            }
        }

        if (!workflow) {
            throw new NotFoundError('Workflow', id);
        }

        // Validate external service configuration before starting workflow
        // Use workflow.id (not route param id) as it's the actual workflow identifier
        const serviceValidator = new ServiceConfigurationValidator();
        const serviceValidation = serviceValidator.validateWorkflowServices(workflow.id);
        if (!serviceValidation.valid) {
            logger.warn(
                { workflowId: workflow.id, missingServices: serviceValidation.missingServices },
                'Workflow start blocked: required external services not configured'
            );
            throw new BadRequestError(serviceValidation.error || 'External service configuration required', {
                missingServices: serviceValidation.missingServices.map(s => ({
                    name: s.name,
                    error: s.error,
                    guidance: s.guidance,
                })),
            });
        }

        // Check if review mode is enabled
        const reviewMode = req.body.reviewMode === true;

        // Start workflow and get run ID immediately
        const runId = await workflowEngine.startWorkflow(workflow, params, { reviewMode });

        res.json({ message: '[i18n:apiMessages.workflowStarted]', workflowId: id, runId, reviewMode });
    }));

    // POST /api/workflows/:id/queue
    // Queue a workflow for background execution
    router.post('/:id/queue', validate(workflowSchemas.queueWorkflow), asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { getQueueService } = await import('../../services/infrastructure/QueueService.js');
        const { WorkflowModel } = await import('../../models/Workflow.js');
        const { JobPriority } = await import('../../types/job-data.js');
        
        const queueService = getQueueService();
        const userId = req.user?.userId;

        // Check if workflow exists (predefined or in database)
        let workflowExists = false;
        const predefinedWorkflows = [
            'iplo-exploration',
            'standard-scan',
            'quick-iplo-scan',
            'external-links-exploration',
            'beleidsscan-graph',
            'bfs-3-hop',
            'horst-aan-de-maas',
            'horst-labor-migration'
        ];

        if (predefinedWorkflows.includes(id)) {
            workflowExists = true;
        } else {
            // Check database for workflow
            const workflowDoc = await WorkflowModel.findById(id);
            if (workflowDoc) {
                workflowExists = true;
            }
        }

        if (!workflowExists) {
            throw new NotFoundError('Workflow', id);
        }

        // Validate external service configuration before queueing workflow
        // This provides early feedback, but validation also happens at execution time
        const serviceValidator = new ServiceConfigurationValidator();
        const serviceValidation = serviceValidator.validateWorkflowServices(id);
        if (!serviceValidation.valid) {
            logger.warn(
                { workflowId: id, missingServices: serviceValidation.missingServices },
                'Workflow queue blocked: required external services not configured'
            );
            throw new BadRequestError(serviceValidation.error || 'External service configuration required', {
                missingServices: serviceValidation.missingServices.map(s => ({
                    name: s.name,
                    error: s.error,
                    guidance: s.guidance,
                })),
            });
        }

        // Extract job parameters
        const params = { ...req.body };
        delete params.priority;
        delete params.delay;
        delete params.reviewMode;

        const priority = req.body.priority ? JobPriority[req.body.priority as keyof typeof JobPriority] : undefined;
        const delay = req.body.delay ? (typeof req.body.delay === 'number' ? req.body.delay : parseInt(req.body.delay as string, 10)) : undefined;
        const reviewMode = req.body.reviewMode === true;

        // Queue the workflow job
        const jobData = {
            workflowId: id,
            params,
            userId,
            priority,
            options: {
                reviewMode,
            },
        };

        let job;
        try {
            job = await queueService.queueWorkflow(jobData, delay);
        } catch (error) {
            // Handle queue overflow errors
            if (error instanceof Error && error.message.includes('queue is full')) {
                logger.warn(
                    { userId, workflowId: id, error: error.message },
                    'Workflow queue overflow: rejecting request'
                );
                throw new ServiceUnavailableError('Workflow queue is currently full. Please try again later.', {
                    retryAfter: 60, // Suggest retry after 60 seconds
                });
            }
            // Re-throw other errors
            throw error;
        }

        res.json({
            message: '[i18n:apiMessages.workflowQueued]',
            workflowId: id,
            jobId: String(job.id),
            priority: priority ? Object.keys(JobPriority).find(key => JobPriority[key as keyof typeof JobPriority] === priority) : 'NORMAL',
            delay,
            reviewMode,
        });
    }));

    return router;
}


