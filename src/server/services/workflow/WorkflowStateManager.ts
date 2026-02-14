import { IRunManager } from './interfaces/IRunManager.js';
import { Run, Workflow } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../../types/errors.js';

/**
 * WorkflowStateManager Service
 * 
 * Responsible for managing workflow execution state including:
 * - Context management
 * - Run state tracking
 * - Resume/pause functionality
 * - State persistence
 * 
 * This service extracts state management logic from WorkflowEngine
 * to follow the single responsibility principle.
 */
export class WorkflowStateManager {
  private completionService?: import('./WorkflowCompletionService.js').WorkflowCompletionService;
  
  constructor(
    private runManager: IRunManager,
    completionService?: import('./WorkflowCompletionService.js').WorkflowCompletionService
  ) {
    this.completionService = completionService;
  }

  /**
   * Initialize workflow state
   */
  async initializeState(
    workflow: Workflow,
    params: Record<string, unknown>,
    existingRunId?: string
  ): Promise<{
    runId: string;
    currentStepId: string | undefined;
    context: Record<string, unknown>;
    isResuming: boolean;
  }> {
    let runId: string = existingRunId || '';
    let currentStepId: string | undefined = workflow.steps[0]?.id;
    let context: Record<string, unknown> = { ...params };
    let isResuming = false;

    if (!runId) {
      // Create a new run if not provided
      // Extract createdBy from params if available (for resource-level authorization)
      const createdBy = params?.createdBy as string | undefined || params?.userId as string | undefined;
      const run = await this.runManager.createRun('workflow', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        ...params
      }, createdBy);
      if (!run._id) {
        throw new ServiceUnavailableError('Failed to create run: run ID is missing', {
          runId,
          reason: 'run_creation_failed'
        });
      }
      runId = run._id.toString();
    } else {
      // Check if resuming
      const run = await this.runManager.getRun(runId);
      if (run?.status === 'paused' && run.pausedState) {
        currentStepId = run.pausedState.stepId;
        context = run.pausedState.context;
        isResuming = true;
        await this.runManager.updateStatus(runId, 'running');
        await this.runManager.log(runId, `Resuming workflow from step: ${currentStepId}`, 'info');
      } else if (run?.status === 'paused' && !run.pausedState) {
        // Handle edge case: run is paused but pausedState is missing
        // This can happen if resumeRun() was called but pausedState was already cleared
        // Try to restore from params or log a warning
        await this.runManager.log(
          runId,
          'Warning: Resuming paused workflow but pausedState is missing. Attempting to restore from params.',
          'warn'
        );
        // Use params passed to initializeState (which should contain the saved context)
        context = { ...params };
        // Check if stepId was saved in params (from workflowRoutes resume handler)
        if (params.__resumeStepId && typeof params.__resumeStepId === 'string') {
          currentStepId = params.__resumeStepId;
          // Remove internal marker from context
          delete context.__resumeStepId;
        } else {
          currentStepId = workflow.steps[0]?.id;
        }
        isResuming = true;
        await this.runManager.updateStatus(runId, 'running');
      } else if (run?.status === 'pending') {
        // Run is pending - this is a fresh start
        // Use params as-is and start from the first step
        context = { ...params };
        currentStepId = workflow.steps[0]?.id;
        isResuming = false;
        await this.runManager.log(
          runId,
          `Nieuwe workflowuitvoering starten vanaf eerste stap: ${currentStepId}`,
          'info'
        );
      } else if (run?.status === 'running') {
        // Run exists but is already running - check if this is an explicit resume or a fresh start
        // For fresh starts, the run is created and set to 'running' before execution
        // For resumes, there should be explicit resume intent indicators
        
        // Check for explicit resume intent:
        // 1. __resumeStepId in params (explicit resume from resume() method)
        // 2. pausedState exists (was actually paused before)
        // 3. Checkpoint exists (was actually running before)
        const hasResumeIntent = 
          (params.__resumeStepId !== undefined) ||
          (run.params?.__resumeStepId !== undefined) ||
          (run.pausedState !== undefined) ||
          (run.params?.__latestCheckpoint !== undefined);
        
        if (hasResumeIntent) {
          // This is an explicit resume - restore state
          context = { ...params };
          // Check if stepId was saved in params (from workflowRoutes resume handler or resumeRun)
          // First check params passed to initializeState, then check run.params
          let resumeStepId: string | undefined;
          if (params.__resumeStepId && typeof params.__resumeStepId === 'string') {
            resumeStepId = params.__resumeStepId;
            // Remove internal marker from context
            delete context.__resumeStepId;
          } else if (run.params?.__resumeStepId && typeof run.params.__resumeStepId === 'string') {
            // Fallback: check run.params (stored by resumeRun)
            resumeStepId = run.params.__resumeStepId;
          }
          
          if (resumeStepId) {
            currentStepId = resumeStepId;
            isResuming = true;
            await this.runManager.log(runId, `Resuming workflow from step: ${currentStepId} (restored from params)`, 'info');
          } else {
            // No stepId in params - try to use latest checkpoint
            const latestCheckpoint = run.params?.__latestCheckpoint as {
              stepId: string;
              nextStepId?: string;
              context: Record<string, unknown>;
              checkpointedAt: string;
            } | undefined;
            
            if (latestCheckpoint && latestCheckpoint.context) {
              currentStepId = latestCheckpoint.nextStepId || latestCheckpoint.stepId;
              // Merge original input parameters with checkpoint context to preserve inputs like selectedWebsites
              const originalParams = run.params || {};
              context = this.mergeOriginalParamsWithCheckpointContext(
                latestCheckpoint.context,
                originalParams
              );
              isResuming = true;
              await this.runManager.log(
                runId,
                `Resuming workflow from checkpoint (step: ${latestCheckpoint.stepId}, next: ${currentStepId}, checkpointed: ${latestCheckpoint.checkpointedAt})`,
                'info'
              );
            } else if (run.pausedState) {
              // Fallback to pausedState if checkpoint not available
              currentStepId = run.pausedState.stepId;
              context = { ...run.pausedState.context };
              isResuming = true;
              await this.runManager.log(
                runId,
                `Resuming workflow from pausedState (step: ${currentStepId})`,
                'info'
              );
            } else {
              // No checkpoint, stepId, or pausedState - start from beginning
              await this.runManager.log(
                runId,
                'Warning: Resuming workflow but no checkpoint or stepId found. Starting from first step.',
                'warn'
              );
              currentStepId = workflow.steps[0]?.id;
            }
          }
        } else {
          // No resume intent - this is a fresh start
          // Use params as-is and start from the first step
          context = { ...params };
          currentStepId = workflow.steps[0]?.id;
          isResuming = false;
          await this.runManager.log(
            runId,
            `Nieuwe workflowuitvoering starten vanaf eerste stap: ${currentStepId}`,
            'info'
          );
        }
      } else if (run?.status === 'failed') {
        // Try to resume failed workflow from latest checkpoint
        const latestCheckpoint = run.params?.__latestCheckpoint as {
          stepId: string;
          nextStepId?: string;
          context: Record<string, unknown>;
          checkpointedAt: string;
        } | undefined;
        
        if (latestCheckpoint && latestCheckpoint.context) {
          // Resume from checkpoint
          currentStepId = latestCheckpoint.nextStepId || latestCheckpoint.stepId;
          // Merge original input parameters with checkpoint context to preserve inputs like selectedWebsites
          const originalParams = run.params || {};
          context = this.mergeOriginalParamsWithCheckpointContext(
            latestCheckpoint.context,
            originalParams
          );
          isResuming = true;
          await this.runManager.updateStatus(runId, 'running');
          await this.runManager.log(
            runId,
            `Resuming failed workflow from checkpoint (step: ${latestCheckpoint.stepId}, next: ${currentStepId}, checkpointed: ${latestCheckpoint.checkpointedAt})`,
            'info'
          );
        } else {
          // No checkpoint available - cannot resume
          await this.runManager.log(
            runId,
            'Warning: Cannot resume failed workflow - no checkpoint available. Starting from first step.',
            'warn'
          );
          currentStepId = workflow.steps[0]?.id;
          await this.runManager.updateStatus(runId, 'running');
        }
      }
    }

    return { runId, currentStepId, context, isResuming };
  }

  /**
   * Merge original input parameters from run.params with checkpoint context
   * This ensures critical input parameters like selectedWebsites are preserved when resuming
   * 
   * @param checkpointContext - The context restored from checkpoint
   * @param originalParams - The original params from run.params
   * @returns Merged context with original input parameters preserved
   */
  private mergeOriginalParamsWithCheckpointContext(
    checkpointContext: Record<string, unknown>,
    originalParams: Record<string, unknown>
  ): Record<string, unknown> {
    const mergedContext = { ...checkpointContext };
    const internalKeys = [
      '__latestCheckpoint',
      '__checkpointHistory',
      '__currentStepId',
      '__resumeStepId',
      '__stepCheckpoints',
      '__stepCheckpointHistory',
      'workflowId',
      'workflowName',
      'userId',
      'createdBy'
    ];
    
    // Merge original input parameters, excluding internal metadata keys
    for (const [key, value] of Object.entries(originalParams)) {
      if (!internalKeys.includes(key) && !Object.prototype.hasOwnProperty.call(mergedContext, key)) {
        mergedContext[key] = value;
      }
    }
    
    return mergedContext;
  }

  /**
   * Check if workflow should continue or pause
   */
  async checkWorkflowStatus(runId: string): Promise<'continue' | 'cancelled' | 'paused'> {
    const currentRun = await this.runManager.getRun(runId);
    if (!currentRun) {
      // Run not found - try to log (may fail if run truly doesn't exist)
      try {
        await this.runManager.log(runId, 'Workflow run niet gevonden', 'error');
        await this.runManager.failRun(runId, 'Run not found during status check');
      } catch {
        // If logging/failing fails, the run may have been deleted
        // This is a critical error but we can't recover from it
      }
      // Return 'cancelled' to stop workflow execution since we can't track state
      return 'cancelled';
    }
    if (currentRun.status === 'cancelled') {
      await this.runManager.log(runId, 'Workflow geannuleerd door gebruiker', 'warn');
      return 'cancelled';
    }
    if (currentRun.status === 'paused') {
      return 'paused';
    }
    return 'continue';
  }

  /**
   * Pause workflow and save state
   */
  async pauseWorkflow(
    runId: string,
    stepId: string,
    context: Record<string, unknown>
  ): Promise<Run> {
    await this.runManager.pauseRun(runId, { stepId, context });
    const pausedRun = await this.runManager.getRun(runId);
    if (!pausedRun) {
      throw new ServiceUnavailableError(`Failed to pause workflow: run ${runId} not found after pausing`, {
        runId,
        stepId,
        reason: 'run_not_found_after_pause'
      });
    }
    return pausedRun;
  }

  /**
   * Complete workflow execution
   * 
   * If a WorkflowCompletionService is provided, uses it to enforce the contract.
   * Otherwise, falls back to direct completeRun() call (for backward compatibility).
   */
  async completeWorkflow(
    runId: string,
    context: Record<string, unknown>,
    options?: {
      workflowId?: string;
      jobId?: string;
      queryId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Run> {
    // If completion service is available, use contract enforcement
    if (this.completionService && options?.workflowId && options?.jobId) {
      await this.completionService.completeWorkflowWithContract({
        runId,
        workflowId: options.workflowId,
        jobId: options.jobId,
        result: context,
        status: 'completed',
        queryId: options.queryId,
        metadata: options.metadata,
      });
    } else {
      // Fallback to direct completeRun() call (backward compatibility)
      await this.runManager.completeRun(runId, context);
    }
    
    const completedRun = await this.runManager.getRun(runId);
    if (!completedRun) {
      throw new ServiceUnavailableError(`Failed to complete workflow: run ${runId} not found after completion`, {
        runId,
        reason: 'run_not_found_after_completion'
      });
    }
    return completedRun;
  }

  /**
   * Fail workflow execution
   */
  async failWorkflow(
    runId: string,
    errorMessage: string,
    status?: 'failed' | 'timeout'
  ): Promise<Run> {
    await this.runManager.failRun(runId, errorMessage, status);
    const failedRun = await this.runManager.getRun(runId);
    if (!failedRun) {
      throw new ServiceUnavailableError(`Failed to fail workflow: run ${runId} not found after failing`, {
        runId,
        reason: 'run_not_found_after_failure'
      });
    }
    return failedRun;
  }

  /**
   * Start workflow execution
   */
  async startWorkflow(runId: string, workflowName: string): Promise<void> {
    await this.runManager.startRun(runId);
    await this.runManager.log(runId, `Workflow starten: ${workflowName}`, 'info');
  }

  /**
   * Mark a step as completed
   * 
   * Adds the step ID to the completed steps list in run params.
   * This is used for prerequisite validation and workflow state tracking.
   * 
   * @param runId - The run ID
   * @param stepId - The step ID to mark as completed
   * @param metadata - Optional metadata about the step completion
   */
  async markStepCompleted(
    runId: string,
    stepId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId);
    }

    const params = run.params || {};
    const completedSteps = (params.__completedSteps as string[]) || [];
    const wasAlreadyCompleted = completedSteps.includes(stepId);

    // Only add if not already completed (idempotent for completedSteps)
    if (!wasAlreadyCompleted) {
      completedSteps.push(stepId);
      params.__completedSteps = completedSteps;
    }

    // Always update stepStates (even if already completed, to update metadata)
    const stepStates = (params.__stepStates as Record<string, Record<string, unknown>>) || {};
    if (metadata) {
      stepStates[stepId] = {
        completedAt: new Date().toISOString(),
        ...metadata
      };
    } else {
      // Only set completedAt if not already set (preserve existing metadata)
      if (!stepStates[stepId]) {
        stepStates[stepId] = {
          completedAt: new Date().toISOString()
        };
      } else {
        // Update completedAt timestamp
        stepStates[stepId] = {
          ...stepStates[stepId],
          completedAt: new Date().toISOString()
        };
      }
    }
    params.__stepStates = stepStates;

    // Always update params (to update stepStates even if step was already completed)
    await this.runManager.updateRunParams(runId, params);
    
    // Only log if it was newly completed
    if (!wasAlreadyCompleted) {
      await this.runManager.log(runId, `Stap ${stepId} gemarkeerd als voltooid`, 'info');
    }
  }

  /**
   * Create a checkpoint of workflow state after step completion
   * 
   * This robust checkpointing method saves:
   * - Step completion status
   * - Full workflow context (for resume capability)
   * - Current step ID
   * - Checkpoint timestamp
   * 
   * This ensures that if the workflow fails at any point, we can resume
   * from the last successful checkpoint with the exact state.
   * 
   * @param runId - The run ID
   * @param stepId - The step ID that was just completed
   * @param context - The full workflow context after step completion
   * @param nextStepId - The next step ID (if known)
   * @param metadata - Optional metadata about the step completion
   */
  async checkpointWorkflowState(
    runId: string,
    stepId: string,
    context: Record<string, unknown>,
    nextStepId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      logger.error({ runId, stepId }, 'Cannot create checkpoint: Run not found');
      throw new NotFoundError('Workflow run', runId, {
        stepId
      });
    }
    
    // Validate inputs for robustness
    if (!stepId || typeof stepId !== 'string') {
      logger.error({ runId, stepId }, 'Cannot create checkpoint: Invalid stepId');
      throw new BadRequestError(`Invalid stepId: ${stepId}`, {
        runId,
        stepId,
        stepIdType: typeof stepId
      });
    }
    
    // Handle partial or invalid contexts gracefully
    // This allows checkpoint creation even when context is incomplete (e.g., during error recovery)
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      const contextType = context === null ? 'null' : typeof context;
      logger.warn(
        { runId, stepId, contextType },
        'Checkpoint context is not a valid object, using empty object (partial checkpoint)'
      );
      context = {};
    } else {
      // Deep copy context to avoid reference issues, but handle circular references gracefully
      try {
        // Validate that context can be serialized (basic check)
        JSON.stringify(context);
      } catch (serializeError) {
        logger.warn(
          { runId, stepId, error: serializeError },
          'Context contains non-serializable data, creating minimal checkpoint with serializable fields only'
        );
        // Create a minimal context with only serializable fields
        const minimalContext: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(context)) {
          try {
            JSON.stringify(value);
            minimalContext[key] = value;
          } catch {
            // Skip non-serializable values
            logger.debug({ runId, stepId, key }, 'Skipping non-serializable context field in checkpoint');
          }
        }
        context = minimalContext;
      }
    }

    // Mark step as completed (includes step completion tracking)
    await this.markStepCompleted(runId, stepId, metadata);

    // Save full context for resume capability
    // Store context in a way that can be restored during resume
    const params = run.params || {};
    
    // Save checkpoint data
    const checkpoint = {
      stepId,
      nextStepId,
      context: { ...context }, // Deep copy to avoid reference issues
      checkpointedAt: new Date().toISOString(),
      ...metadata
    };
    
    // Store latest checkpoint (for quick resume)
    params.__latestCheckpoint = checkpoint;
    
    // Also store in checkpoint history (for debugging/audit)
    const checkpointHistory = (params.__checkpointHistory as Array<typeof checkpoint>) || [];
    checkpointHistory.push(checkpoint);
    // Optimized: Keep only last 20 checkpoints (reduced from 50 for performance)
    // Use recovery optimization service if available
    try {
      const { getRecoveryOptimizationService } = await import('./RecoveryOptimizationService.js');
      const recoveryOpt = getRecoveryOptimizationService();
      const optimizedHistory = recoveryOpt.optimizeCheckpointHistory(
        checkpointHistory,
        recoveryOpt.getMaxCheckpointHistory()
      );
      params.__checkpointHistory = optimizedHistory;
    } catch (error) {
      // Fallback to simple limit if optimization service unavailable
      const maxHistory = parseInt(process.env.RECOVERY_MAX_CHECKPOINT_HISTORY || '20', 10);
      if (checkpointHistory.length > maxHistory) {
        params.__checkpointHistory = checkpointHistory.slice(-maxHistory);
      } else {
        params.__checkpointHistory = checkpointHistory;
      }
    }
    
    // Update current step ID for resume
    if (nextStepId) {
      params.__currentStepId = nextStepId;
    }
    
    // Persist all checkpoint data
    await this.runManager.updateRunParams(runId, params);
    
    await this.runManager.log(
      runId,
      `Checkpoint created after step ${stepId} completion (next: ${nextStepId || 'end'})`,
      'debug'
    );
  }

  /**
   * Check if a step is completed
   * 
   * @param runId - The run ID
   * @param stepId - The step ID to check
   * @returns True if the step is completed, false otherwise
   */
  async isStepCompleted(runId: string, stepId: string): Promise<boolean> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      return false;
    }

    const completedSteps = (run.params?.__completedSteps as string[]) || [];
    return completedSteps.includes(stepId);
  }

  /**
   * Get all completed steps for a run
   * 
   * @param runId - The run ID
   * @returns Array of completed step IDs
   */
  async getCompletedSteps(runId: string): Promise<string[]> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      return [];
    }

    return (run.params?.__completedSteps as string[]) || [];
  }

  /**
   * Get workflow state for deterministic E2E testing
   * 
   * Returns a deterministic state object that includes:
   * - Current step ID
   * - Completed steps
   * - Navigation history
   * - Step states (completion metadata)
   * 
   * This state can be used for E2E testing to verify workflow progress.
   * 
   * @param runId - The run ID
   * @param workflow - The workflow definition
   * @returns Workflow state object
   */
  async getWorkflowState(
    runId: string,
    workflow: Workflow
  ): Promise<{
    runId: string;
    currentStepId: string | undefined;
    completedSteps: string[];
    navigationHistory: Array<{
      stepId: string;
      timestamp: string;
      direction: 'forward' | 'back' | 'jump';
    }>;
    stepStates: Record<string, Record<string, unknown>>;
    prerequisites: Record<string, string[]>;
  }> {
    const run = await this.runManager.getRun(runId);
    if (!run) {
      throw new NotFoundError('Workflow run', runId);
    }

    // Get current step ID from pausedState or params
    let currentStepId: string | undefined;
    if (run.pausedState?.stepId) {
      currentStepId = run.pausedState.stepId;
    } else if (run.params?.__currentStepId) {
      currentStepId = run.params.__currentStepId as string;
    } else {
      // Fallback to first step if not set
      currentStepId = workflow.steps[0]?.id;
    }

    // Get completed steps
    const completedSteps = (run.params?.__completedSteps as string[]) || [];

    // Get navigation history
    const navigationHistory = (run.params?.__navigationHistory as Array<{
      stepId: string;
      timestamp: string;
      direction: 'forward' | 'back' | 'jump';
    }>) || [];

    // Get step states (completion metadata)
    const stepStates = (run.params?.__stepStates as Record<string, Record<string, unknown>>) || {};

    // Build prerequisites map from workflow definition
    const prerequisites: Record<string, string[]> = {};
    for (const step of workflow.steps) {
      if (step.prerequisites && step.prerequisites.length > 0) {
        prerequisites[step.id] = step.prerequisites;
      }
    }

    return {
      runId,
      currentStepId,
      completedSteps,
      navigationHistory,
      stepStates,
      prerequisites
    };
  }
}

