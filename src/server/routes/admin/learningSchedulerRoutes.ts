/**
 * Learning Scheduler Admin Routes
 * 
 * Routes for learning scheduler management and task triggering in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from './shared/middleware.js';
import { BadRequestError, ConflictError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Register learning scheduler routes
 * 
 * @param router - Express router instance
 */
export function registerLearningSchedulerRoutes(router: Router): void {
    /**
     * GET /api/admin/learning/scheduler/status
     * Get learning scheduler status and task information (admin only)
     */
    router.get('/learning/scheduler/status', asyncHandler(async (req: Request, res: Response) => {
        // Get learning scheduler from app locals
        const learningScheduler = (req.app.locals as { learningScheduler?: import('../../services/learning/LearningScheduler.js').LearningScheduler }).learningScheduler;
        
        if (!learningScheduler) {
            return res.json({
                enabled: false,
                message: 'Learning scheduler is not initialized',
                tasks: [],
            });
        }

        const status = learningScheduler.getStatus();
        res.json(status);
    }));

    /**
     * POST /api/admin/learning/scheduler/recover
     * Recover stuck scheduled tasks (admin only)
     */
    router.post('/learning/scheduler/recover', asyncHandler(async (req: Request, res: Response) => {
        // Get learning scheduler from app locals
        const learningScheduler = (req.app.locals as { learningScheduler?: import('../../services/learning/LearningScheduler.js').LearningScheduler }).learningScheduler;
        
        if (!learningScheduler) {
            throw new BadRequestError('Learning scheduler is not initialized');
        }

        const timeoutMinutes = parseInt(req.body.timeoutMinutes as string || '30', 10);
        const recovered = learningScheduler.recoverStuckTasks(timeoutMinutes);
        
        res.json({
            success: true,
            recovered,
            message: recovered > 0 
                ? `Recovered ${recovered} stuck scheduled task(s)`
                : 'No stuck tasks found'
        });
    }));

    /**
     * POST /api/admin/learning/scheduler/trigger/:taskId
     * Manually trigger a scheduled task (admin only)
     */
    router.post('/learning/scheduler/trigger/:taskId', asyncHandler(async (req: Request, res: Response) => {
        // Get learning scheduler from app locals
        const learningScheduler = (req.app.locals as { learningScheduler?: import('../../services/learning/LearningScheduler.js').LearningScheduler }).learningScheduler;
        
        if (!learningScheduler) {
            throw new BadRequestError('Learning scheduler is not initialized');
        }

        const { taskId } = req.params;
        const validTaskIds = ['rankings', 'dictionaries', 'sources', 'monthly-review'];
        
        if (!validTaskIds.includes(taskId)) {
            throw new BadRequestError(`Invalid task ID. Must be one of: ${validTaskIds.join(', ')}`);
        }

        // Check if task can be triggered
        if (!learningScheduler.canTriggerTask(taskId)) {
            throw new ConflictError(`Task "${taskId}" is already running`, {
                taskId,
                message: 'The task is currently running. Please wait for it to complete or recover it if stuck.'
            });
        }

        // Trigger task asynchronously (don't wait for completion)
        learningScheduler.triggerTask(taskId).catch((error) => {
            logger.error({ error, taskId }, 'Error in manually triggered scheduled task');
        });

        res.json({
            success: true,
            message: `Task "${taskId}" triggered successfully`,
            taskId
        });
    }));
}

