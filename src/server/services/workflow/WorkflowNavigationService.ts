import { IRunManager } from './interfaces/IRunManager.js';
import { Workflow, Run } from '../infrastructure/types.js';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../../types/errors.js';

/**
 * WorkflowNavigationService
 * 
 * Responsible for managing workflow navigation between steps.
 * 
 * This service extracts navigation logic from WorkflowEngine
 * to follow the single responsibility principle.
 */
export class WorkflowNavigationService {
  constructor(private runManager: IRunManager) {}

  /**
   * Navigate to next step
   * 
   * Moves the workflow to the next step in sequence, validating prerequisites
   * and updating navigation history.
   * 
   * @param runId - The run ID
   * @param workflow - The workflow definition
   * @returns The updated run
   * @throws Error if navigation is invalid or next step doesn't exist
   */
  async goNext(runId: string, workflow: Workflow): Promise<Run> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId);
    }

    // Get current step from paused state or params
    const currentStepId =
      run.pausedState?.stepId || (run.params?.__currentStepId as string | undefined);

    if (!currentStepId) {
      throw new BadRequestError(`No current step found for run ${runId}`, {
        runId,
        reason: 'no_current_step'
      });
    }

    const currentStep = workflow.steps.find((s) => s.id === currentStepId);
    if (!currentStep) {
      throw new NotFoundError('Workflow step', currentStepId, {
        workflowId: workflow.id,
        stepId: currentStepId
      });
    }

    if (!currentStep.next) {
      throw new BadRequestError(`No next step available from step ${currentStepId}`, {
        workflowId: workflow.id,
        stepId: currentStepId,
        reason: 'no_next_step'
      });
    }

    // Validate navigation to next step
    const validation = await this.validateStepNavigation(runId, workflow, currentStepId, currentStep.next);
    if (!validation.valid) {
      throw new BadRequestError(`Cannot navigate to next step: ${validation.reason || 'Invalid navigation'}`, {
        workflowId: workflow.id,
        currentStepId,
        nextStepId: currentStep.next,
        reason: validation.reason || 'invalid_navigation'
      });
    }

    // Update navigation history
    await this.addNavigationHistory(runId, currentStepId, currentStep.next, 'forward');

    // Update current step in paused state or context
    if (run.pausedState) {
      await this.runManager.pauseRun(runId, {
        stepId: currentStep.next,
        context: run.pausedState.context,
      });
    } else {
      // Update params with new current step
      const params = run.params || {};
      params.__currentStepId = currentStep.next;
      await this.runManager.updateRunParams(runId, params);
    }

    await this.runManager.log(runId, `Navigated to next step: ${currentStep.next}`, 'info');

    const updatedRun = await this.runManager.getRun(runId);
    if (!updatedRun) {
      throw new ServiceUnavailableError(`Failed to get updated run ${runId} after navigation`, {
        runId,
        reason: 'run_not_found_after_navigation'
      });
    }

    return updatedRun;
  }

  /**
   * Navigate to previous step
   * 
   * Moves the workflow back to the previous step, using navigation history.
   * 
   * @param runId - The run ID
   * @param workflow - The workflow definition
   * @returns The updated run
   * @throws Error if navigation is invalid or cannot go back
   */
  async goBack(runId: string, workflow: Workflow): Promise<Run> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId);
    }

    // Get current step
    const currentStepId =
      run.pausedState?.stepId || (run.context?.currentStepId as string | undefined);

    if (!currentStepId) {
      throw new BadRequestError(`No current step found for run ${runId}`, {
        runId,
        reason: 'no_current_step'
      });
    }

    const currentStep = workflow.steps.find((s) => s.id === currentStepId);
    if (!currentStep) {
      throw new NotFoundError('Workflow step', currentStepId, {
        workflowId: workflow.id,
        stepId: currentStepId
      });
    }

    // Check if can go back (default: true if not specified)
    if (currentStep.canGoBack === false) {
      throw new BadRequestError(`Cannot go back from step ${currentStepId}: canGoBack is false`, {
        workflowId: workflow.id,
        stepId: currentStepId,
        reason: 'cannot_go_back'
      });
    }

    // Get navigation history from params
    const navigationHistory = (run.params?.__navigationHistory as Array<{
      stepId: string;
      timestamp: string;
      direction: 'forward' | 'back' | 'jump';
    }>) || [];

    // Find previous step from history (last forward navigation)
    let previousStepId: string | undefined;
    for (let i = navigationHistory.length - 1; i >= 0; i--) {
      const entry = navigationHistory[i];
      if (entry.direction === 'forward' && entry.stepId === currentStepId) {
        // Find the step before this one
        if (i > 0) {
          previousStepId = navigationHistory[i - 1].stepId;
        } else {
          // This is the first step, go to workflow start
          previousStepId = workflow.steps[0]?.id;
        }
        break;
      }
    }

    if (!previousStepId) {
      // No history, try to find previous step by position
      const currentIndex = workflow.steps.findIndex((s) => s.id === currentStepId);
      if (currentIndex > 0) {
        previousStepId = workflow.steps[currentIndex - 1].id;
      } else {
        throw new BadRequestError(`Cannot go back: already at first step`, {
          workflowId: workflow.id,
          stepId: currentStepId,
          reason: 'already_at_first_step'
        });
      }
    }

    // Update navigation history
    await this.addNavigationHistory(runId, currentStepId, previousStepId, 'back');

    // Update current step
    if (run.pausedState) {
      await this.runManager.pauseRun(runId, {
        stepId: previousStepId,
        context: run.pausedState.context,
      });
    } else {
      const params = run.params || {};
      params.__currentStepId = previousStepId;
      await this.runManager.updateRunParams(runId, params);
    }

    await this.runManager.log(runId, `Navigated back to step: ${previousStepId}`, 'info');

    const updatedRun = await this.runManager.getRun(runId);
    if (!updatedRun) {
      throw new ServiceUnavailableError(`Failed to get updated run ${runId} after navigation`, {
        runId,
        reason: 'run_not_found_after_navigation'
      });
    }

    return updatedRun;
  }

  /**
   * Jump to specific step
   * 
   * Jumps directly to a target step, validating prerequisites and navigation rules.
   * 
   * @param runId - The run ID
   * @param workflow - The workflow definition
   * @param targetStepId - The target step ID to jump to
   * @returns The updated run
   * @throws Error if navigation is invalid or target step doesn't exist
   */
  async jumpToStep(runId: string, workflow: Workflow, targetStepId: string): Promise<Run> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId);
    }

    // Validate target step exists
    const targetStep = workflow.steps.find((s) => s.id === targetStepId);
    if (!targetStep) {
      throw new NotFoundError('Workflow step', targetStepId, {
        workflowId: workflow.id,
        stepId: targetStepId
      });
    }

    // Check if can jump to this step (default: false if not specified)
    if (targetStep.canJumpTo !== true) {
      throw new BadRequestError(`Cannot jump to step ${targetStepId}: canJumpTo is not true`, {
        workflowId: workflow.id,
        stepId: targetStepId,
        reason: 'cannot_jump_to_step'
      });
    }

    // Get current step
    const currentStepId = run.pausedState?.stepId || (run.context?.currentStepId as string | undefined);

    // Validate navigation
    if (currentStepId) {
      const validation = await this.validateStepNavigation(runId, workflow, currentStepId, targetStepId);
      if (!validation.valid) {
        throw new BadRequestError(`Cannot jump to step ${targetStepId}: ${validation.reason || 'Invalid navigation'}`, {
          workflowId: workflow.id,
          currentStepId,
          targetStepId,
          reason: validation.reason || 'invalid_navigation'
        });
      }
    }

    // Update navigation history
    if (currentStepId) {
      await this.addNavigationHistory(runId, currentStepId, targetStepId, 'jump');
    }

    // Update current step
    if (run.pausedState) {
      await this.runManager.pauseRun(runId, {
        stepId: targetStepId,
        context: run.pausedState.context,
      });
    } else {
      const params = run.params || {};
      params.__currentStepId = targetStepId;
      await this.runManager.updateRunParams(runId, params);
    }

    await this.runManager.log(runId, `Jumped to step: ${targetStepId}`, 'info');

    const updatedRun = await this.runManager.getRun(runId);
    if (!updatedRun) {
      throw new ServiceUnavailableError(`Failed to get updated run ${runId} after navigation`, {
        runId,
        reason: 'run_not_found_after_navigation'
      });
    }

    return updatedRun;
  }

  /**
   * Validate step navigation
   * 
   * Validates that navigation from one step to another is allowed,
   * checking prerequisites and navigation rules.
   * 
   * @param runId - The run ID
   * @param workflow - The workflow definition
   * @param fromStepId - The source step ID
   * @param toStepId - The target step ID
   * @returns Validation result with valid flag and optional reason
   */
  async validateStepNavigation(
    runId: string,
    workflow: Workflow,
    fromStepId: string,
    toStepId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if target step exists
    const targetStep = workflow.steps.find((s) => s.id === toStepId);
    if (!targetStep) {
      return { valid: false, reason: `Target step ${toStepId} not found in workflow` };
    }

    // Check prerequisites
    if (targetStep.prerequisites && targetStep.prerequisites.length > 0) {
      const run = await this.runManager.getRun(runId);
      if (!run) {
        return { valid: false, reason: `Run ${runId} not found` };
      }

      // Get completed steps and navigation history from params
      const completedSteps = (run.params?.__completedSteps as string[]) || [];
      const navigationHistory = (run.params?.__navigationHistory as Array<{
        stepId: string;
        timestamp: string;
        direction: 'forward' | 'back' | 'jump';
      }>) || [];

      // Check if all prerequisites are completed
      for (const prerequisiteId of targetStep.prerequisites) {
        // Check if prerequisite is in completed steps
        if (!completedSteps.includes(prerequisiteId)) {
          // Check if prerequisite was navigated to (in history)
          const prerequisiteInHistory = navigationHistory.some((entry) => entry.stepId === prerequisiteId);
          if (!prerequisiteInHistory) {
            return {
              valid: false,
              reason: `Prerequisite step ${prerequisiteId} not completed`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Add navigation history entry
   * 
   * Helper method to add a navigation history entry to the run context.
   * 
   * @param runId - The run ID
   * @param fromStepId - The source step ID
   * @param toStepId - The target step ID
   * @param direction - The navigation direction
   */
  private async addNavigationHistory(
    runId: string,
    fromStepId: string,
    toStepId: string,
    direction: 'forward' | 'back' | 'jump'
  ): Promise<void> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId);
    }

    const params = run.params || {};
    const navigationHistory = (params.__navigationHistory as Array<{
      stepId: string;
      timestamp: string;
      direction: 'forward' | 'back' | 'jump';
    }>) || [];

    // Add new entry
    navigationHistory.push({
      stepId: toStepId,
      timestamp: new Date().toISOString(),
      direction,
    });

    // Update params with navigation history
    params.__navigationHistory = navigationHistory;
    await this.runManager.updateRunParams(runId, params);
  }
}
