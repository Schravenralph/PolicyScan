/**
 * Step Routes - API endpoints for step execution and state management
 */
import { Router, Request, Response } from 'express';
import { WebsiteSelectionStep } from '../services/steps/WebsiteSelectionStep.js';
import { StepStateModel } from '../models/StepState.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError } from '../types/errors.js';

const router = Router();

// Step registry - maps step IDs to step definitions
const stepRegistry = new Map<string, WebsiteSelectionStep>();

// Register steps
const websiteSelectionStep = new WebsiteSelectionStep();
stepRegistry.set(websiteSelectionStep.id, websiteSelectionStep);

/**
 * POST /api/steps/:stepId/execute
 * Execute a step
 */
router.post('/:stepId/execute', asyncHandler(async (req: Request, res: Response) => {
    const { stepId } = req.params;
    const { params, context } = req.body as { params?: Record<string, unknown>; context?: Record<string, unknown> };
    
    const step = stepRegistry.get(stepId);
    if (!step) {
        throw new NotFoundError('Step', stepId);
    }

    // Execute step
    const result = await step.execute(params || {}, context || {});
    
    if (result.success) {
        res.status(200).json(result);
    } else {
        throw new BadRequestError(result.error || 'Step execution failed');
    }
}));

/**
 * POST /api/steps/:stepId/validate
 * Validate step parameters
 */
router.post('/:stepId/validate', asyncHandler(async (req: Request, res: Response) => {
    const { stepId } = req.params;
    const { params } = req.body as { params?: Record<string, unknown> };
    
    const step = stepRegistry.get(stepId);
    if (!step) {
        throw new NotFoundError('Step', stepId);
    }

    // Validate step parameters using step's validate method
    if ('validate' in step && typeof step.validate === 'function') {
        const validation = step.validate(params || {});
        res.status(200).json(validation);
    } else {
        // Fallback if step doesn't have validate method
        res.status(200).json({
            valid: true,
            errors: undefined,
        });
    }
}));

/**
 * GET /api/steps/:stepId/schema
 * Get step parameter schema
 */
router.get('/:stepId/schema', asyncHandler(async (req: Request, res: Response) => {
    const { stepId } = req.params;
    
    const step = stepRegistry.get(stepId);
    if (!step) {
        throw new NotFoundError('Step', stepId);
    }

    res.status(200).json({
        stepId: step.id,
        name: 'name' in step ? step.name : stepId,
        description: 'description' in step ? step.description : '',
        parameterSchema: 'parameterSchema' in step ? step.parameterSchema : {},
        uiHints: 'uiHints' in step ? step.uiHints : undefined,
    });
}));

/**
 * GET /api/steps/state/:runId/:stepId
 * Get step state
 */
router.get('/state/:runId/:stepId', asyncHandler(async (req: Request, res: Response) => {
    const { runId, stepId } = req.params;
    
    const stepState = await StepStateModel.findByRunAndStep(runId, stepId);
    if (!stepState) {
        throw new NotFoundError('Step state', `${runId}/${stepId}`);
    }
    
    res.status(200).json(stepState);
}));

/**
 * GET /api/steps/state/:runId
 * Get all step states for a run
 */
router.get('/state/:runId', asyncHandler(async (req: Request, res: Response) => {
    const { runId } = req.params;
    
    const stepStates = await StepStateModel.findByRun(runId);
    res.status(200).json(stepStates);
}));

/**
 * PUT /api/steps/state/:runId/:stepId
 * Update step state
 */
router.put('/state/:runId/:stepId', asyncHandler(async (req: Request, res: Response) => {
    const { runId, stepId } = req.params;
    const update = req.body as Record<string, unknown>;
    
    const stepState = await StepStateModel.update(runId, stepId, update);
    if (!stepState) {
        throw new NotFoundError('Step state', `${runId}/${stepId}`);
    }
    
    res.status(200).json(stepState);
}));


export default router;
