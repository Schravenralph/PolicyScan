/**
 * Step Checkpoint Service
 * 
 * Provides checkpointing functionality for workflow steps, allowing state
 * to be saved before execution and restored on failure.
 */

import { RunManager } from './RunManager.js';
import { logger } from '../../utils/logger.js';
import type { Workflow } from '../infrastructure/types.js';

export interface StepCheckpoint {
  stepId: string;
  stepName: string;
  action: string;
  context: Record<string, unknown>;
  stepParams: Record<string, unknown>;
  timestamp: string;
  runId: string;
  workflowId: string;
}

export class StepCheckpointService {
  constructor(private runManager: RunManager) {}

  /**
   * Create a checkpoint before step execution
   * This allows us to rollback to this state if the step fails
   */
  async createStepCheckpoint(
    runId: string,
    workflow: Workflow,
    stepId: string,
    context: Record<string, unknown>,
    stepParams: Record<string, unknown>
  ): Promise<StepCheckpoint> {
    const step = workflow.steps.find((s: { id: string }) => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    const checkpoint: StepCheckpoint = {
      stepId,
      stepName: step.name || stepId,
      action: step.action || '',
      context: { ...context }, // Deep copy to avoid reference issues
      stepParams: { ...stepParams },
      timestamp: new Date().toISOString(),
      runId,
      workflowId: workflow.id,
    };

    // Store checkpoint in run params
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const params = run.params || {};
    const stepCheckpoints = (params.__stepCheckpoints as Record<string, StepCheckpoint>) || {};
    stepCheckpoints[stepId] = checkpoint;
    params.__stepCheckpoints = stepCheckpoints;

    // Also add to checkpoint history
    const checkpointHistory = (params.__stepCheckpointHistory as StepCheckpoint[]) || [];
    checkpointHistory.push(checkpoint);
    // Optimized: Keep only last 20 step checkpoints (reduced from 100 for performance)
    // Use recovery optimization service if available
    try {
      const { getRecoveryOptimizationService } = await import('./RecoveryOptimizationService.js');
      const recoveryOpt = getRecoveryOptimizationService();
      const optimizedHistory = recoveryOpt.optimizeCheckpointHistory(
        checkpointHistory,
        recoveryOpt.getMaxStepCheckpointHistory()
      );
      params.__stepCheckpointHistory = optimizedHistory;
    } catch (error) {
      // Fallback to simple limit if optimization service unavailable
      const maxHistory = parseInt(process.env.RECOVERY_MAX_STEP_CHECKPOINT_HISTORY || '20', 10);
      if (checkpointHistory.length > maxHistory) {
        params.__stepCheckpointHistory = checkpointHistory.slice(-maxHistory);
      } else {
        params.__stepCheckpointHistory = checkpointHistory;
      }
    }

    await this.runManager.updateRunParams(runId, params);

    logger.debug(
      { runId, stepId, workflowId: workflow.id },
      `Step checkpoint created for ${stepId}`
    );

    return checkpoint;
  }

  /**
   * Get the most recent checkpoint for a step
   */
  async getStepCheckpoint(runId: string, stepId: string): Promise<StepCheckpoint | null> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      return null;
    }

    const stepCheckpoints = (run.params?.__stepCheckpoints as Record<string, StepCheckpoint>) || {};
    return stepCheckpoints[stepId] || null;
  }

  /**
   * Get all checkpoints for a run
   */
  async getAllCheckpoints(runId: string): Promise<StepCheckpoint[]> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      return [];
    }

    const stepCheckpoints = (run.params?.__stepCheckpoints as Record<string, StepCheckpoint>) || {};
    return Object.values(stepCheckpoints);
  }

  /**
   * Clear checkpoint for a step (after successful execution)
   */
  async clearStepCheckpoint(runId: string, stepId: string): Promise<void> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      return;
    }

    const params = run.params || {};
    const stepCheckpoints = (params.__stepCheckpoints as Record<string, StepCheckpoint>) || {};
    delete stepCheckpoints[stepId];
    params.__stepCheckpoints = stepCheckpoints;

    await this.runManager.updateRunParams(runId, params);

    logger.debug({ runId, stepId }, `Step checkpoint cleared for ${stepId}`);
  }

  /**
   * Clear all checkpoints for a run
   */
  async clearAllCheckpoints(runId: string): Promise<void> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      return;
    }

    const params = run.params || {};
    delete params.__stepCheckpoints;
    delete params.__stepCheckpointHistory;

    await this.runManager.updateRunParams(runId, params);

    logger.debug({ runId }, 'All step checkpoints cleared');
  }
}


