/**
 * Compensation Tracker
 * 
 * Tracks executed steps that may need compensation on workflow failure.
 */

import { logger } from '../../../utils/logger.js';
import type { CompensationMetadata, CompensationAction } from './types.js';

/**
 * Service for tracking and executing compensation actions
 */
export class CompensationTracker {
  private executedSteps: CompensationMetadata[] = [];

  /**
   * Track a step execution for potential compensation
   */
  trackStep(
    stepId: string,
    action: string,
    result: unknown,
    context: Record<string, unknown>
  ): void {
    this.executedSteps.push({
      stepId,
      action,
      result,
      context,
      executedAt: new Date(),
      compensated: false,
    });

    logger.debug(
      { stepId, action, executedStepsCount: this.executedSteps.length },
      'Tracked step for potential compensation'
    );
  }

  /**
   * Get all tracked steps that haven't been compensated
   */
  getUncompensatedSteps(): CompensationMetadata[] {
    return this.executedSteps.filter(step => !step.compensated);
  }

  /**
   * Get all tracked steps (including compensated ones)
   */
  getAllSteps(): CompensationMetadata[] {
    return [...this.executedSteps];
  }

  /**
   * Execute compensation for all tracked steps in reverse order
   * 
   * @param compensationActions - Map of step IDs to compensation actions
   */
  async compensateAll(
    compensationActions: Map<string, CompensationAction>
  ): Promise<void> {
    const uncompensatedSteps = this.getUncompensatedSteps();
    
    if (uncompensatedSteps.length === 0) {
      logger.debug('No steps to compensate');
      return;
    }

    logger.info(
      { stepCount: uncompensatedSteps.length },
      'Starting compensation for failed workflow steps'
    );

    // Compensate in reverse order (most recent first)
    for (let i = uncompensatedSteps.length - 1; i >= 0; i--) {
      const step = uncompensatedSteps[i];
      const compensationAction = compensationActions.get(step.stepId);

      if (!compensationAction) {
        logger.debug(
          { stepId: step.stepId, action: step.action },
          'No compensation action defined for step, skipping'
        );
        // Mark as compensated even if no action exists
        step.compensated = true;
        continue;
      }

      try {
        logger.info(
          { stepId: step.stepId, action: step.action },
          'Executing compensation for step'
        );

        await compensationAction(step.result, step.context);

        step.compensated = true;
        step.compensatedAt = new Date();

        logger.info(
          { stepId: step.stepId, action: step.action },
          'Compensation completed successfully for step'
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        step.compensationError = error instanceof Error ? error : new Error(errorMessage);
        
        // Mark as compensated even if compensation action failed (best effort principle)
        step.compensated = true;
        step.compensatedAt = new Date();

        logger.error(
          { stepId: step.stepId, action: step.action, error },
          'Compensation failed for step, continuing with other steps'
        );

        // Continue with other steps even if this one fails (best effort)
      }
    }

    logger.info(
      { stepCount: uncompensatedSteps.length },
      'Completed compensation for all tracked steps'
    );
  }

  /**
   * Clear all tracked steps
   */
  clear(): void {
    this.executedSteps = [];
    logger.debug('Cleared all tracked compensation steps');
  }

  /**
   * Get compensation summary for logging
   */
  getSummary(): {
    total: number;
    compensated: number;
    uncompensated: number;
    errors: number;
  } {
    const total = this.executedSteps.length;
    const compensated = this.executedSteps.filter(s => s.compensated).length;
    const uncompensated = total - compensated;
    const errors = this.executedSteps.filter(s => s.compensationError).length;

    return { total, compensated, uncompensated, errors };
  }
}

