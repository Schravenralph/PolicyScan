/**
 * Beleidsscan Wizard API Routes
 * 
 * Provides REST endpoints for wizard session management, navigation, validation, and step execution.
 * All endpoints use string step IDs and session IDs, and enforce validation using schemas from wizard definitions.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth/AuthService.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { WizardSessionEngine } from '../services/wizard/WizardSessionEngine.js';
import { WizardSessionService } from '../services/wizard/WizardSessionService.js';
import {
  RevisionConflictError,
  WizardPrerequisiteError,
  WizardNavigationError,
} from '../models/WizardSession.js';
import { logger } from '../utils/logger.js';
import { BadRequestError, NotFoundError, ConflictError } from '../types/errors.js';
import { getActionExecutionService } from '../services/wizard/ActionExecutionService.js';
import { DatabaseNotFoundError } from '../utils/databaseErrorHandler.js';

/**
 * Request body schema for creating a wizard session
 */
const createSessionSchema = z.object({
  wizardDefinitionId: z.string().min(1, 'wizardDefinitionId is required'),
  wizardDefinitionVersion: z.number().int().positive().optional(),
});

/**
 * Request body schema for navigating to a step
 */
const navigateSchema = z.object({
  targetStepId: z.string().min(1, 'targetStepId is required'),
  revision: z.number().int().nonnegative().optional(), // For optimistic locking
});

/**
 * Request body schema for validating step inputs
 */
const validateInputSchema = z.object({
  input: z.unknown(), // Will be validated against step definition schema
  revision: z.number().int().nonnegative().optional(), // For optimistic locking
});

/**
 * Request body schema for executing a step action
 */
const executeActionSchema = z.object({
  input: z.unknown(), // Will be validated against step definition schema
  revision: z.number().int().nonnegative().optional(), // For optimistic locking
});

/**
 * Request body schema for marking a step as completed
 */
const markStepCompletedSchema = z.object({
  output: z.unknown().refine((val) => val !== undefined, {
    message: 'output is required',
  }), // Will be validated against step definition schema
  revision: z.number().int().nonnegative().optional(), // For optimistic locking
});

/**
 * Create wizard API routes
 * 
 * @param authService - Authentication service for route protection
 * @returns Express router with wizard endpoints
 */
export function createBeleidsscanWizardRoutes(
  authService: AuthService,
  wizardEngine = WizardSessionEngine
): Router {
  const router = Router();

  // All wizard routes require authentication
  router.use(authenticate(authService));

  /**
   * POST /api/wizard/sessions
   * Create a new wizard session
   * 
   * Body: { wizardDefinitionId: string, wizardDefinitionVersion?: number }
   * Returns: { session: WizardSessionDocument }
   */
  router.post('/sessions', asyncHandler(async (req: Request, res: Response) => {
    let body;
    try {
      body = createSessionSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestError('Validation failed', {
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
    const userId = req.user?.userId;

    if (!userId) {
      throw new BadRequestError('User ID not found in request', {
        reason: 'missing_user_id',
        operation: 'wizard_route'
      });
    }

    logger.info(
      { userId, wizardDefinitionId: body.wizardDefinitionId, version: body.wizardDefinitionVersion },
      'Creating wizard session'
    );

    const session = await wizardEngine.createSession(
      body.wizardDefinitionId,
      body.wizardDefinitionVersion,
      userId // Pass userId to store in session context
    );

    res.status(201).json({
      session,
    });
  }));

  /**
   * GET /api/wizard/sessions/:sessionId/state
   * Get deterministic wizard session state (for E2E testing and debugging)
   * 
   * Returns: { state: WizardState }
   */
  router.get('/sessions/:sessionId/state', asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessionId) {
      throw new BadRequestError('sessionId is required');
    }

    logger.debug({ sessionId }, 'Getting wizard session state');

    try {
      const state = await wizardEngine.getDeterministicState(sessionId);
      res.json({ state });
    } catch (error) {
      if (error instanceof DatabaseNotFoundError) {
        throw new NotFoundError(error.message, sessionId);
      }
      throw error;
    }
  }));

  /**
   * POST /api/wizard/sessions/:sessionId/navigate
   * Navigate to a target step (enforces prerequisites and navigation policy)
   * 
   * Body: { targetStepId: string, revision?: number }
   * Returns: { session: WizardSessionDocument }
   */
  router.post('/sessions/:sessionId/navigate', asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    let body;
    try {
      body = navigateSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestError('Validation failed', {
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }

    if (!sessionId) {
      throw new BadRequestError('sessionId is required');
    }

    logger.info(
      { sessionId, targetStepId: body.targetStepId, revision: body.revision },
      'Navigating wizard session'
    );

    try {
      // Note: Navigation doesn't currently use revision for optimistic locking,
      // but we accept it in the request for future compatibility
      const session = await wizardEngine.navigate(sessionId, body.targetStepId);

      res.json({
        session,
      });
    } catch (error) {
      // Handle structured navigation errors
      if (error instanceof WizardPrerequisiteError) {
        throw new BadRequestError(error.message, error.details);
      }
      if (error instanceof WizardNavigationError) {
        throw new BadRequestError(error.message, error.context);
      }

      if (error instanceof DatabaseNotFoundError) {
        throw new NotFoundError(error.message, sessionId);
      }

      throw error;
    }
  }));

  /**
   * POST /api/wizard/sessions/:sessionId/steps/:stepId/validate
   * Validate inputs for a step (uses definition schemas)
   * 
   * Body: { input: unknown, revision?: number }
   * Returns: { valid: boolean, errors?: ZodError }
   */
  router.post(
    '/sessions/:sessionId/steps/:stepId/validate',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId, stepId } = req.params;
      let body;
      try {
        body = validateInputSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError('Validation failed', {
            details: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        throw error;
      }

      if (!sessionId || !stepId) {
        throw new BadRequestError('sessionId and stepId are required');
      }

      logger.debug({ sessionId, stepId }, 'Validating step input');

      // Validate input using step definition schema
      try {
        await wizardEngine.validateStepInput(sessionId, stepId, body.input);
        res.json({
          valid: true,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          // For validation endpoints, we preserve the specific format but use BadRequestError
          // This ensures it goes through error transformation while maintaining API contract
          throw new BadRequestError('Validation failed', {
            valid: false,
            errors: error.issues,
          });
        }

        if (error instanceof DatabaseNotFoundError) {
          throw new NotFoundError(error.message, sessionId);
        }

        throw error;
      }
    })
  );

  /**
   * POST /api/wizard/sessions/:sessionId/steps/:stepId/actions/:actionId/execute
   * Execute a step action
   * 
   * Body: { input: unknown, revision?: number }
   * Returns: { output: unknown, contextUpdates?: Record<string, unknown> }
   */
  router.post(
    '/sessions/:sessionId/steps/:stepId/actions/:actionId/execute',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId, stepId, actionId } = req.params;
      let body;
      try {
        body = executeActionSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError('Validation failed', {
            details: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        throw error;
      }

      if (!sessionId || !stepId || !actionId) {
        throw new BadRequestError('sessionId, stepId, and actionId are required');
      }

      logger.info(
        { sessionId, stepId, actionId, revision: body.revision },
        'Executing wizard step action'
      );

      try {
        // Execute the action with optional revision for optimistic locking
        const output = await wizardEngine.executeStep(
          sessionId,
          stepId,
          actionId,
          body.input,
          body.revision
        );

        // Extract context updates from output if available
        let contextUpdates: Record<string, unknown> | undefined;
        if (output && typeof output === 'object' && 'contextUpdates' in output) {
          contextUpdates = output.contextUpdates as Record<string, unknown>;
        }

        // Extract actionId from output if available (from ActionExecutionService)
        // Otherwise, generate a simple ID for tracking
        let actionExecutionId: string;
        if (output && typeof output === 'object' && 'actionId' in output && typeof output.actionId === 'string') {
          actionExecutionId = output.actionId;
        } else {
          // Fallback: generate action execution ID for tracking (format: stepId:actionId:sessionId)
          actionExecutionId = `${stepId}:${actionId}:${sessionId}`;
        }

        res.json({
          actionId: actionExecutionId,
          stepId,
          actionType: actionId,
          output,
          contextUpdates,
        });
      } catch (error) {
        // Handle revision conflicts (409)
        // Handle revision conflicts (409)
        // Check if error is RevisionConflictError or wrapped in DatabaseQueryError
        let conflictError: RevisionConflictError | null = null;
        if (error instanceof RevisionConflictError) {
          conflictError = error;
        } else if (error && typeof error === 'object' && 'originalError' in error) {
          const originalError = (error as { originalError?: unknown }).originalError;
          if (originalError instanceof RevisionConflictError) {
            conflictError = originalError;
          }
        }
        
        if (conflictError) {
          throw new ConflictError(
            `Revision conflict: expected revision ${conflictError.expectedRevision}, but found ${conflictError.actualRevision}`,
            {
              sessionId: conflictError.sessionId,
              expectedRevision: conflictError.expectedRevision,
              actualRevision: conflictError.actualRevision,
            }
          );
        }

        if (error instanceof DatabaseNotFoundError) {
          throw new NotFoundError(error.message, sessionId);
        }

        // Handle validation errors
        if (error instanceof Error) {
          // Handle "not yet implemented" errors
          if (error.message.includes('not yet implemented')) {
            // Action registry not implemented yet (WI-110 dependency)
            throw new BadRequestError(
              'Action execution is not yet fully implemented. Action registry (WI-110) must be completed first.'
            );
          }
        }

        throw error;
      }
    })
  );

  /**
   * GET /api/wizard/actions/:actionId
   * Get action execution status
   * 
   * Returns action execution details from ActionExecutionService if available,
   * otherwise returns basic information parsed from actionId.
   * 
   * Returns: { actionId: string, actionType: string, status: string, ... }
   */
  router.get(
    '/actions/:actionId',
    asyncHandler(async (req: Request, res: Response) => {
      const { actionId } = req.params;

      if (!actionId) {
        throw new BadRequestError('actionId is required');
      }

      logger.info({ actionId }, 'Getting action execution status');

      try {
        const actionExecutionService = getActionExecutionService();

        // Try to get action execution from database
        const actionExecution = await actionExecutionService.getAction(actionId);

        if (actionExecution) {
          // Return full action execution details
          res.json({
            actionId: actionExecution.actionId,
            actionType: actionExecution.actionType,
            status: actionExecution.status,
            sessionId: actionExecution.sessionId,
            queryId: actionExecution.queryId,
            workflowRunId: actionExecution.workflowRunId,
            result: actionExecution.result,
            error: actionExecution.error,
            createdAt: actionExecution.createdAt.toISOString(),
            completedAt: actionExecution.completedAt?.toISOString(),
          });
        } else {
          // Fallback: parse actionId format (for backward compatibility)
          // Try to parse as stepId:actionType:sessionId format
          const parts = actionId.split(':');
          if (parts.length >= 2) {
            const actionType = parts[0];
            res.json({
              actionId,
              actionType,
              status: 'unknown',
              note: 'Action execution not found in database. This may be a legacy actionId format.',
            });
          } else {
            throw new NotFoundError('Action execution', actionId);
          }
        }
      } catch (error) {
        if (error instanceof DatabaseNotFoundError) {
          throw new NotFoundError(error.message, actionId);
        }
        throw error;
      }
    })
  );

  /**
   * POST /api/wizard/sessions/:sessionId/steps/:stepId/complete
   * Mark a step as completed
   * 
   * Body: { output: unknown, revision?: number }
   * Returns: { session: WizardSession }
   */
  router.post(
    '/sessions/:sessionId/steps/:stepId/complete',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId, stepId } = req.params;
      let body;
      try {
        body = markStepCompletedSchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new BadRequestError('Validation failed', {
            details: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        throw error;
      }

      if (!sessionId || !stepId) {
        throw new BadRequestError('sessionId and stepId are required');
      }

      logger.info(
        { sessionId, stepId, revision: body.revision },
        'Marking wizard step as completed'
      );

      try {
        await wizardEngine.markStepCompleted(
          sessionId,
          stepId,
          body.output,
          body.revision
        );

        // Return updated session
        const session = await WizardSessionService.getSessionOrThrow(sessionId);
        res.json({
          session: {
            sessionId: session.sessionId,
            wizardDefinitionId: session.wizardDefinitionId,
            wizardDefinitionVersion: session.wizardDefinitionVersion,
            currentStepId: session.currentStepId,
            completedSteps: session.completedSteps,
            status: session.status,
            context: session.context,
            revision: session.revision,
            createdAt: session.createdAt.toISOString(),
            updatedAt: session.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        // Handle revision conflicts (409)
        // Check if error is RevisionConflictError or wrapped in DatabaseQueryError
        let conflictError: RevisionConflictError | null = null;
        if (error instanceof RevisionConflictError) {
          conflictError = error;
        } else if (error && typeof error === 'object' && 'originalError' in error) {
          const originalError = (error as { originalError?: unknown }).originalError;
          if (originalError instanceof RevisionConflictError) {
            conflictError = originalError;
          }
        }
        
        if (conflictError) {
          throw new ConflictError(
            `Revision conflict: expected revision ${conflictError.expectedRevision}, but found ${conflictError.actualRevision}`,
            {
              sessionId: conflictError.sessionId,
              expectedRevision: conflictError.expectedRevision,
              actualRevision: conflictError.actualRevision,
            }
          );
        }

        if (error instanceof DatabaseNotFoundError) {
          throw new NotFoundError(error.message, sessionId);
        }


        throw error;
      }
    })
  );

  /**
   * GET /api/wizard/sessions/:sessionId/result
   * Get WizardResult for a session (for final summary/export)
   * 
   * Returns: { result: WizardResult }
   */
  router.get(
    '/sessions/:sessionId/result',
    asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      if (!sessionId) {
        throw new BadRequestError('sessionId is required');
      }

      logger.info({ sessionId }, 'Getting wizard result');

      try {
        const result = await wizardEngine.composeWizardResult(sessionId);
        res.json({
          result,
        });
      } catch (error) {
        if (error instanceof DatabaseNotFoundError) {
          throw new NotFoundError(error.message, sessionId);
        }
        throw error;
      }
    })
  );

  return router;
}
