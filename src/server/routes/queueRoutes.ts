/**
 * Queue Management Routes
 * 
 * Provides endpoints for managing workflow queue jobs:
 * - GET /api/queue/workflow/jobs - List waiting and active workflow jobs
 * - POST /api/queue/workflow/jobs/:jobId/pause - Pause an active job
 * - POST /api/queue/workflow/jobs/:jobId/resume - Resume a paused job
 * - DELETE /api/queue/workflow/jobs/:jobId - Remove a job from queue
 */

import { Router } from 'express';
import { getQueueService } from '../services/infrastructure/QueueService.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError, ConflictError } from '../types/errors.js';

export function createQueueRouter(): Router {
    const router = Router();

    /**
     * GET /api/queue/workflow/jobs
     * Get all waiting and active workflow jobs
     * Note: Authentication is handled at the router level in index.ts
     */
    router.get('/workflow/jobs', asyncHandler(async (req, res) => {
        try {
            const queueService = getQueueService();
            const jobs = await queueService.getWorkflowJobs();
            
            res.json({
                jobs,
                count: jobs.length,
                waiting: jobs.filter(j => j.status === 'waiting').length,
                active: jobs.filter(j => j.status === 'active').length,
                paused: jobs.filter(j => j.status === 'paused').length,
            });
        } catch (error) {
            // Check if this is a Redis connection error
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRedisError = errorMessage.includes('Redis') ||
                                errorMessage.includes('redis') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('EAI_AGAIN') ||
                                errorMessage.includes('getaddrinfo') ||
                                errorMessage.includes('connection') ||
                                errorMessage.includes('timeout') ||
                                errorMessage.includes('Queue service not available');
            
            if (isRedisError) {
                logger.warn({ error: errorMessage }, 'Redis unavailable, returning empty queue result');
                // Return empty result instead of failing completely
                // This allows the UI to load even if queue service is unavailable
                res.json({
                    jobs: [],
                    count: 0,
                    waiting: 0,
                    active: 0,
                    paused: 0,
                });
            } else if (error instanceof ServiceUnavailableError) {
                // Re-throw ServiceUnavailableError to return 503
                throw error;
            } else {
                // For other unexpected errors, log and return empty result
                logger.error({ error }, 'Failed to fetch workflow queue jobs (unexpected error)');
                res.json({
                    jobs: [],
                    count: 0,
                    waiting: 0,
                    active: 0,
                    paused: 0,
                });
            }
        }
    }));

    /**
     * POST /api/queue/workflow/jobs/:jobId/pause
     * Pause an active workflow job
     * Note: Authentication is handled at the router level in index.ts
     */
    router.post('/workflow/jobs/:jobId/pause', asyncHandler(async (req, res) => {
        const { jobId } = req.params;
        
        if (!jobId) {
            throw new BadRequestError('Job ID is required');
        }

        const queueService = getQueueService();
        
        try {
            const success = await queueService.pauseWorkflowJob(jobId);
            if (!success) {
                throw new NotFoundError('Workflow job', jobId);
            }
            
            logger.info({ jobId, userId: (req as { user?: { userId?: string } }).user?.userId }, 'Workflow job paused');
            res.json({ 
                message: 'Job paused successfully',
                jobId 
            });
        } catch (error) {
            if (error instanceof NotFoundError || error instanceof BadRequestError || error instanceof ServiceUnavailableError) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRedisError = errorMessage.includes('Redis') ||
                                errorMessage.includes('redis') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('Queue service not available');
            
            if (isRedisError) {
                throw new ServiceUnavailableError(
                    `Queue service is unavailable. Redis connection may be down: ${errorMessage}`,
                    {
                        reason: 'redis_connection_failed',
                        operation: 'pauseWorkflowJob',
                        originalError: errorMessage
                    }
                );
            }
            throw new BadRequestError(`Failed to pause job: ${errorMessage}`);
        }
    }));

    /**
     * POST /api/queue/workflow/jobs/:jobId/resume
     * Resume a paused workflow job
     * Note: Authentication is handled at the router level in index.ts
     */
    router.post('/workflow/jobs/:jobId/resume', asyncHandler(async (req, res) => {
        const { jobId } = req.params;
        
        if (!jobId) {
            throw new BadRequestError('Job ID is required');
        }

        const queueService = getQueueService();
        
        try {
            const success = await queueService.resumeWorkflowJob(jobId);
            if (!success) {
                throw new NotFoundError('Workflow job', jobId);
            }
            
            logger.info({ jobId, userId: (req as { user?: { userId?: string } }).user?.userId }, 'Workflow job resumed');
            res.json({ 
                message: 'Job resumed successfully',
                jobId 
            });
        } catch (error) {
            if (error instanceof NotFoundError || error instanceof BadRequestError || error instanceof ServiceUnavailableError) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRedisError = errorMessage.includes('Redis') ||
                                errorMessage.includes('redis') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('Queue service not available');
            
            if (isRedisError) {
                throw new ServiceUnavailableError(
                    `Queue service is unavailable. Redis connection may be down: ${errorMessage}`,
                    {
                        reason: 'redis_connection_failed',
                        operation: 'resumeWorkflowJob',
                        originalError: errorMessage
                    }
                );
            }
            throw new BadRequestError(`Failed to resume job: ${errorMessage}`);
        }
    }));

    /**
     * DELETE /api/queue/workflow/jobs/:jobId
     * Remove a workflow job from the queue
     * Note: Authentication is handled at the router level in index.ts
     */
    router.delete('/workflow/jobs/:jobId', asyncHandler(async (req, res) => {
        const { jobId } = req.params;
        
        if (!jobId) {
            throw new BadRequestError('Job ID is required');
        }

        const queueService = getQueueService();
        
        try {
            const success = await queueService.removeWorkflowJob(jobId);
            if (!success) {
                throw new NotFoundError('Workflow job', jobId);
            }
            
            logger.info({ jobId, userId: (req as { user?: { userId?: string } }).user?.userId }, 'Workflow job removed from queue');
            res.json({ 
                message: 'Job removed successfully',
                jobId 
            });
        } catch (error) {
            if (error instanceof NotFoundError || error instanceof BadRequestError || error instanceof ServiceUnavailableError || error instanceof ConflictError) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRedisError = errorMessage.includes('Redis') ||
                                errorMessage.includes('redis') ||
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('Queue service not available');
            
            if (isRedisError) {
                throw new ServiceUnavailableError(
                    `Queue service is unavailable. Redis connection may be down: ${errorMessage}`,
                    {
                        reason: 'redis_connection_failed',
                        operation: 'removeWorkflowJob',
                        originalError: errorMessage
                    }
                );
            }
            
            // Check if error is about job being in a non-removable state
            // These errors often indicate race conditions where the job transitioned states
            // The QueueService should handle most of these as idempotent success, but if an error
            // still reaches here, it might be a legitimate conflict or the job was already removed
            const isNonRemovableStateError = errorMessage.includes('Cannot remove job') && 
                                            (errorMessage.includes('state') || 
                                             errorMessage.includes('completed') || 
                                             errorMessage.includes('failed') ||
                                             errorMessage.includes('transitioned'));
            
            if (isNonRemovableStateError) {
                // If the error mentions "transitioned", it's likely a race condition where
                // the job completed/transitioned between state check and removal
                // Treat these as idempotent success (job is effectively removed)
                if (errorMessage.includes('transitioned')) {
                    logger.info({ jobId, error: errorMessage }, 'Job state transitioned during removal, treating as success (idempotent)');
                    res.json({ 
                        message: 'Job removed successfully (job completed or transitioned during removal)',
                        jobId 
                    });
                    return;
                }
                
                // For other non-removable state errors, throw 409 Conflict
                // This indicates the job exists but is in a state that cannot be removed
                throw new ConflictError(
                    errorMessage,
                    {
                        reason: 'job_in_non_removable_state',
                        operation: 'removeWorkflowJob',
                        jobId,
                        originalError: errorMessage
                    }
                );
            }
            
            // Check for "Could not remove job" or stale errors from Bull (race conditions, already removed, etc.)
            // These are often idempotent cases where the job is already gone or in a terminal state
            // Since removeWorkflowJob now handles these internally and returns true, we should treat them as success
            const isCouldNotRemoveError = errorMessage.includes('Could not remove job') ||
                                         errorMessage.includes('could not remove job') ||
                                         errorMessage.toLowerCase().includes('stale') ||
                                         errorMessage.includes('not in a state that can be removed');
            
            if (isCouldNotRemoveError) {
                // This error typically means the job was already removed or transitioned to a non-removable state
                // Since removeWorkflowJob now handles idempotent cases internally and returns true,
                // this error shouldn't normally reach here. But if it does (e.g., from a different code path),
                // treat it as success since the job is effectively removed
                logger.info({ jobId, error: errorMessage }, 'Job removal returned error but job is effectively removed (idempotent success)');
                res.json({ 
                    message: 'Job removed successfully (was already removed or completed)',
                    jobId 
                });
                return;
            }
            
            throw new BadRequestError(`Failed to remove job: ${errorMessage}`);
        }
    }));

    return router;
}
