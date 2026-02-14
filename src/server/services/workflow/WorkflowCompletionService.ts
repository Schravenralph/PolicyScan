/**
 * Workflow Completion Service
 * 
 * Enforces the WorkflowCompletionContract by ensuring:
 * 1. Results are saved to database (mandatory)
 * 2. Completion events are emitted (mandatory - triggers queue refresh)
 * 3. Both operations succeed or fail together
 */

import { logger } from '../../utils/logger.js';
import type { RunManager } from './RunManager.js';
import type { ProgressEventEmitter } from '../infrastructure/queue-processors/BaseJobProcessor.js';
import type {
  WorkflowCompletionContract,
  WorkflowCompletionContractResult,
  createContractValidation,
} from '../../types/workflow-completion-contract.js';
import { createContractValidation as createValidation } from '../../types/workflow-completion-contract.js';

export class WorkflowCompletionService {
  constructor(
    private runManager: RunManager,
    private progressEmitter: ProgressEventEmitter
  ) {}

  /**
   * Complete workflow with contract enforcement
   * 
   * This method ensures both mandatory steps are completed:
   * 1. Save results to database
   * 2. Emit completion event (for queue updates)
   * 
   * If either step fails, the entire operation fails and an error is thrown.
   * 
   * @param contract - The workflow completion contract
   * @returns Contract result with validation
   * @throws Error if contract cannot be fulfilled
   */
  async completeWorkflowWithContract(
    contract: WorkflowCompletionContract
  ): Promise<WorkflowCompletionContractResult> {
    const { runId, workflowId, jobId, result, status, queryId, metadata } = contract;
    
    logger.info(
      { runId, workflowId, jobId, status },
      'Starting workflow completion with contract enforcement'
    );

    const stepsCompleted = {
      saveResults: false,
      emitCompletionEvent: false,
    };

    const errors: {
      saveResults?: string;
      emitCompletionEvent?: string;
    } = {};

    // Step 1: Save results to database (MANDATORY)
    // Check if run is already completed to avoid duplicate saves
    try {
      const existingRun = await this.runManager.getRun(runId);
      if (existingRun && (existingRun.status === 'completed' || existingRun.status === 'completed_with_errors')) {
        // Run already completed - skip save but mark as completed
        stepsCompleted.saveResults = true;
        logger.info({ runId, workflowId, jobId }, 'Contract step 1/2: Results already saved to database (skipping duplicate save)');
      } else {
        // Run not completed yet - save results
        await this.runManager.completeRun(runId, result, status);
        stepsCompleted.saveResults = true;
        logger.info({ runId, workflowId, jobId }, 'Contract step 1/2: Results saved to database');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.saveResults = errorMessage;
      logger.error(
        { runId, workflowId, jobId, error: errorMessage },
        'Contract violation: Failed to save results to database'
      );
      // Don't throw yet - try to emit event, then fail together
    }

    // Step 2: Emit completion event (MANDATORY - triggers queue refresh)
    try {
      await this.progressEmitter.emitProgressEvent({
        type: 'job_completed',
        jobId,
        jobType: 'workflow',
        queryId,
        timestamp: new Date(),
        data: {
          status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'cancelled',
          message: `Workflow ${workflowId} ${status} (runId: ${runId})`,
          result: {
            success: status === 'completed',
            runId,
            results: result,
          },
          metadata: {
            runId,
            workflowId,
            queryId,
            ...metadata,
          },
        },
      });
      stepsCompleted.emitCompletionEvent = true;
      logger.info({ runId, workflowId, jobId }, 'Contract step 2/2: Completion event emitted');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.emitCompletionEvent = errorMessage;
      logger.error(
        { runId, workflowId, jobId, error: errorMessage },
        'Contract violation: Failed to emit completion event'
      );
    }

    // Validate contract
    const validation = createValidation(
      stepsCompleted.saveResults,
      stepsCompleted.emitCompletionEvent
    );

    const contractResult: WorkflowCompletionContractResult = {
      success: validation.isValid(),
      runId,
      workflowId,
      jobId,
      status,
      stepsCompleted,
      ...(Object.keys(errors).length > 0 && { errors }),
    };

    // If contract is violated, throw error
    if (!validation.isValid()) {
      const errorMessages = Object.entries(errors)
        .filter(([_, message]) => message !== undefined)
        .map(([step, message]) => `${step}: ${message}`)
        .join('; ');

      const contractViolationError = new Error(
        `WorkflowCompletionContract violation: ${errorMessages}. ` +
        `Both saveResults and emitCompletionEvent must succeed. ` +
        `runId: ${runId}, workflowId: ${workflowId}, jobId: ${jobId}`
      );

      logger.error(
        {
          runId,
          workflowId,
          jobId,
          stepsCompleted,
          errors,
        },
        'WorkflowCompletionContract violation - completion failed'
      );

      throw contractViolationError;
    }

    logger.info(
      { runId, workflowId, jobId, status },
      'Workflow completion contract fulfilled successfully'
    );

    return contractResult;
  }

  /**
   * Fail workflow with contract enforcement
   * 
   * Similar to completeWorkflowWithContract but for failed workflows.
   * Ensures both steps are completed even on failure.
   */
  async failWorkflowWithContract(
    contract: Omit<WorkflowCompletionContract, 'status'> & { 
      status: 'failed';
      error: string;
      errorDetails?: unknown;
    }
  ): Promise<WorkflowCompletionContractResult> {
    const { runId, workflowId, jobId, result, queryId, metadata, error, errorDetails } = contract;
    
    logger.info(
      { runId, workflowId, jobId },
      'Starting workflow failure with contract enforcement'
    );

    const stepsCompleted = {
      saveResults: false,
      emitCompletionEvent: false,
    };

    const errors: {
      saveResults?: string;
      emitCompletionEvent?: string;
    } = {};

    // Step 1: Save failure to database (MANDATORY)
    try {
      await this.runManager.failRun(runId, error);
      stepsCompleted.saveResults = true;
      logger.info({ runId, workflowId, jobId }, 'Contract step 1/2: Failure saved to database');
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : String(saveError);
      errors.saveResults = errorMessage;
      logger.error(
        { runId, workflowId, jobId, error: errorMessage },
        'Contract violation: Failed to save failure to database'
      );
    }

    // Step 2: Emit failure event (MANDATORY - triggers queue refresh)
    try {
      await this.progressEmitter.emitProgressEvent({
        type: 'job_failed',
        jobId,
        jobType: 'workflow',
        queryId,
        timestamp: new Date(),
        data: {
          status: 'failed',
          error: error,
          errorDetails: errorDetails,
          result: {
            success: false,
            runId,
            results: result,
          },
          metadata: {
            runId,
            workflowId,
            queryId,
            ...metadata,
          },
        },
      });
      stepsCompleted.emitCompletionEvent = true;
      logger.info({ runId, workflowId, jobId }, 'Contract step 2/2: Failure event emitted');
    } catch (emitError) {
      const errorMessage = emitError instanceof Error ? emitError.message : String(emitError);
      errors.emitCompletionEvent = errorMessage;
      logger.error(
        { runId, workflowId, jobId, error: errorMessage },
        'Contract violation: Failed to emit failure event'
      );
    }

    // Validate contract
    const validation = createValidation(
      stepsCompleted.saveResults,
      stepsCompleted.emitCompletionEvent
    );

    const contractResult: WorkflowCompletionContractResult = {
      success: validation.isValid(),
      runId,
      workflowId,
      jobId,
      status: 'failed',
      stepsCompleted,
      ...(Object.keys(errors).length > 0 && { errors }),
    };

    // If contract is violated, throw error
    if (!validation.isValid()) {
      const errorMessages = Object.entries(errors)
        .filter(([_, message]) => message !== undefined)
        .map(([step, message]) => `${step}: ${message}`)
        .join('; ');

      const contractViolationError = new Error(
        `WorkflowCompletionContract violation on failure: ${errorMessages}. ` +
        `Both saveResults and emitCompletionEvent must succeed. ` +
        `runId: ${runId}, workflowId: ${workflowId}, jobId: ${jobId}`
      );

      logger.error(
        {
          runId,
          workflowId,
          jobId,
          stepsCompleted,
          errors,
        },
        'WorkflowCompletionContract violation - failure handling failed'
      );

      throw contractViolationError;
    }

    logger.info(
      { runId, workflowId, jobId },
      'Workflow failure contract fulfilled successfully'
    );

    return contractResult;
  }
}
