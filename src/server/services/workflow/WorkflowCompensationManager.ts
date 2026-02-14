import { logger } from '../../utils/logger.js';
import { CompensationTracker } from './compensation/CompensationTracker.js';
import type { CompensationAction } from './compensation/types.js';

/**
 * WorkflowCompensationManager Service
 * 
 * Responsible for managing compensation actions and trackers for workflow steps.
 * 
 * This service extracts compensation management logic from WorkflowEngine
 * to follow the single responsibility principle.
 */
export class WorkflowCompensationManager {
  private compensationActions: Map<string, CompensationAction> = new Map();
  private compensationTrackers: Map<string, CompensationTracker> = new Map();

  /**
   * Register a compensation action for a workflow step
   * 
   * @param stepId - The step ID that needs compensation
   * @param compensationAction - The compensation action to execute on failure
   */
  registerCompensationAction(stepId: string, compensationAction: CompensationAction): void {
    this.compensationActions.set(stepId, compensationAction);
    logger.debug({ stepId }, 'Registered compensation action for step');
  }

  /**
   * Get or create a compensation tracker for a run
   * 
   * @param runId - The run ID
   * @returns The compensation tracker for this run
   */
  getCompensationTracker(runId: string): CompensationTracker {
    if (!this.compensationTrackers.has(runId)) {
      this.compensationTrackers.set(runId, new CompensationTracker());
    }
    return this.compensationTrackers.get(runId)!;
  }

  /**
   * Clear compensation tracker for a run (cleanup after workflow completion)
   * 
   * @param runId - The run ID
   */
  clearCompensationTracker(runId: string): void {
    this.compensationTrackers.delete(runId);
  }

  /**
   * Check if a step has a registered compensation action
   * 
   * @param stepId - The step ID
   * @returns True if compensation action is registered
   */
  hasCompensationAction(stepId: string): boolean {
    return this.compensationActions.has(stepId);
  }

  /**
   * Get compensation action for a step
   * 
   * @param stepId - The step ID
   * @returns The compensation action or undefined
   */
  getCompensationAction(stepId: string): CompensationAction | undefined {
    return this.compensationActions.get(stepId);
  }

  /**
   * Get all compensation actions (for CompensationTracker.compensateAll)
   * 
   * @returns Map of step IDs to compensation actions
   */
  getCompensationActions(): Map<string, CompensationAction> {
    return this.compensationActions;
  }
}
