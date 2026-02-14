/**
 * Step Rollback Service
 * 
 * Provides rollback functionality for workflow steps, allowing state
 * to be restored to a previous checkpoint on failure.
 */

import { RunManager } from './RunManager.js';
import { StepCheckpointService, type StepCheckpoint } from './StepCheckpointService.js';
import { logger } from '../../utils/logger.js';

export interface RollbackResult {
  success: boolean;
  restoredContext?: Record<string, unknown>;
  error?: string;
}

export class StepRollbackService {
  constructor(
    private runManager: RunManager,
    private checkpointService: StepCheckpointService
  ) {}

  /**
   * Rollback a step to its checkpoint state
   * This restores the context to the state before step execution
   */
  async rollbackStep(
    runId: string,
    stepId: string
  ): Promise<RollbackResult> {
    try {
      const checkpoint = await this.checkpointService.getStepCheckpoint(runId, stepId);
      
      if (!checkpoint) {
        logger.warn({ runId, stepId }, `No checkpoint found for step ${stepId}, cannot rollback`);
        return {
          success: false,
          error: `No checkpoint found for step ${stepId}`,
        };
      }

      // Restore context from checkpoint
      const run = await this.runManager.getRun(runId);
      if (!run) {
        return {
          success: false,
          error: `Run ${runId} not found`,
        };
      }

      // Update run params with restored context
      const params = run.params || {};
      
      // Restore context to checkpoint state
      // Note: We merge checkpoint context with current params to preserve run metadata
      const restoredContext = { ...checkpoint.context };
      
      // Update context in run params
      // The context is typically stored in run.params, but we need to be careful
      // not to overwrite important metadata like __stepCheckpoints, __completedSteps, etc.
      for (const [key, value] of Object.entries(restoredContext)) {
        // Skip internal metadata keys
        if (!key.startsWith('__')) {
          params[key] = value;
        }
      }

      await this.runManager.updateRunParams(runId, params);

      await this.runManager.log(
        runId,
        `Step ${stepId} rolled back to checkpoint state`,
        'info'
      );

      logger.info(
        { runId, stepId, checkpointTimestamp: checkpoint.timestamp },
        `Step ${stepId} rolled back successfully`
      );

      return {
        success: true,
        restoredContext,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error, runId, stepId },
        `Failed to rollback step ${stepId}`
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Rollback multiple steps in reverse order
   * Useful for rolling back a sequence of failed steps
   */
  async rollbackSteps(
    runId: string,
    stepIds: string[]
  ): Promise<Array<{ stepId: string; result: RollbackResult }>> {
    const results: Array<{ stepId: string; result: RollbackResult }> = [];

    // Rollback in reverse order (most recent first)
    for (let i = stepIds.length - 1; i >= 0; i--) {
      const stepId = stepIds[i];
      const result = await this.rollbackStep(runId, stepId);
      results.push({ stepId, result });
    }

    return results;
  }

  /**
   * Clean up partial results from a failed step
   * This removes any temporary data created during step execution
   */
  async cleanupPartialResults(
    runId: string,
    stepId: string,
    partialResults?: Record<string, unknown>
  ): Promise<void> {
    try {
      const run = await this.runManager.getRun(runId);
      if (!run) {
        return;
      }

      const params = run.params || {};
      
      // Remove step-specific temporary data
      // Look for keys that might have been created by the step
      if (partialResults) {
        for (const key of Object.keys(partialResults)) {
          // Only remove if it's clearly step-specific (e.g., contains stepId)
          if (key.includes(stepId) || key.startsWith(`step_${stepId}_`)) {
            delete params[key];
          }
        }
      }

      await this.runManager.updateRunParams(runId, params);

      await this.runManager.log(
        runId,
        `Cleaned up partial results for step ${stepId}`,
        'debug'
      );

      logger.debug({ runId, stepId }, `Partial results cleaned up for step ${stepId}`);
    } catch (error) {
      logger.warn(
        { error, runId, stepId },
        `Failed to cleanup partial results for step ${stepId}`
      );
      // Don't throw - cleanup is best effort
    }
  }
}


