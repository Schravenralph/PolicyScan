import { RunManager } from '../workflow/RunManager.js';
import type { IRunManager } from './interfaces/IRunManager.js';
import { Workflow, Run } from '../infrastructure/types.js';
import { StepAction } from './WorkflowEngine.js';
import { evaluateCondition } from '../../utils/condition-evaluator.js';
import { getActionContract, validateWorkflowActionOutput } from '../../types/action-contracts.js';
import { validateActionInput, validateActionOutput, shouldValidateContracts } from '../../utils/action-contract-validator.js';
import { moduleRegistry } from './WorkflowModuleRegistry.js';
import { ModuleActionAdapter } from '../workflow/ModuleActionAdapter.js';
import { logger } from '../../utils/logger.js';
import { withTimeout } from '../../utils/withTimeout.js';
import { TimeoutEventLogger } from './TimeoutEventLogger.js';
import { getWorkflowMetricsService } from './WorkflowMetricsService.js';
import { getWorkflowAlertService } from './WorkflowAlertService.js';
import { validateEnv } from '../../config/env.js';
import { InputValidationService } from './InputValidationService.js';
import { validateWorkflowActionParams } from '../../validation/workflowActionsSchemas.js';
import {
  workflowStepDuration,
  workflowStepExecutionsTotal,
} from '../../utils/metrics.js';
import { getRecommendedTimeout } from './StepTimeoutConfig.js';
import { getWorkflowTransactionService, TransactionOptions } from './WorkflowTransactionService.js';
import type { ClientSession } from 'mongodb';

/**
 * WorkflowExecutor Service
 * 
 * Responsible for executing workflow steps, managing step transitions,
 * and coordinating workflow execution flow.
 * 
 * This service extracts workflow execution logic from WorkflowEngine
 * to follow the single responsibility principle.
 */
export class WorkflowExecutor {
  private timeoutEventLogger: TimeoutEventLogger;

  constructor(
    private runManager: IRunManager,
    private actions: Map<string, StepAction>
  ) {
    this.timeoutEventLogger = new TimeoutEventLogger(runManager);
  }

  /**
   * Execute parallel steps
   * Executes multiple steps concurrently and merges their results
   * Uses Promise.allSettled() to allow partial success when some steps timeout or fail
   */
  async executeParallelSteps(
    workflow: Workflow,
    stepIds: string[],
    context: Record<string, unknown>,
    runId: string,
    signal?: AbortSignal
  ): Promise<{ result: Record<string, unknown>; duration: number; stepResults: Map<string, { result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null> }> {
    const startTime = Date.now();
    await this.runManager.log(runId, `Executing ${stepIds.length} steps in parallel: ${stepIds.join(', ')}`, 'info');

    // Get step information for timeout logging
    const stepInfo = new Map<string, { name: string; timeout?: number }>();
    for (const stepId of stepIds) {
      const step = workflow.steps.find(s => s.id === stepId);
      if (step) {
        stepInfo.set(stepId, { name: step.name, timeout: step.timeout });
      }
    }

    // Check for cancellation before parallel execution
    if (signal?.aborted) {
      await this.runManager.log(runId, 'Parallel steps cancelled before execution', 'info');
      throw new Error('Workflow cancelled');
    }

    // Execute all steps in parallel with individual timeout protection
    // Each step already has timeout protection in executeStep(), but we use
    // Promise.allSettled() to allow partial success when some steps timeout
    const stepPromises = stepIds.map(async (stepId) => {
      const stepStartTime = Date.now();
      try {
        const stepResult = await this.executeStep(workflow, stepId, context, runId, signal);
        return { stepId, result: stepResult, error: null, isTimeout: false, elapsedMs: Date.now() - stepStartTime };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const elapsedMs = Date.now() - stepStartTime;
        const isTimeoutError = errorMessage.includes('timed out') || errorMessage.includes('StepTimeoutError');
        const isCancellationError = signal?.aborted || errorMessage.includes('Workflow cancelled') || (error instanceof Error && error.name === 'AbortError');
        
        // Log cancellation errors
        if (isCancellationError) {
          await this.runManager.log(runId, `Parallel step ${stepId} cancelled during execution`, 'info');
        }
        // Log timeout errors with detailed context using TimeoutEventLogger
        else if (isTimeoutError) {
          const step = stepInfo.get(stepId);
          const stepName = step?.name || stepId;
          // Use same timeout resolution logic as executeStep
          const stepForTimeout = workflow.steps.find(s => s.id === stepId);
          const timeoutMs = stepForTimeout ? getRecommendedTimeout(stepForTimeout, stepForTimeout.action) :
            (await import('../../config/env.js')).validateEnv().WORKFLOW_STEP_DEFAULT_TIMEOUT_MS;
          const percentageUsed = (elapsedMs / timeoutMs) * 100;
          
          // Format error message using TimeoutErrorFormatter
          const { getTimeoutErrorFormatter } = await import('../../utils/TimeoutErrorFormatter.js');
          const formatter = getTimeoutErrorFormatter();
          const formattedError = formatter.formatError({
            type: 'parallel_step',
            workflowId: workflow.id,
            workflowName: workflow.name,
            stepId,
            stepName,
            timeoutMs,
            elapsedMs,
            percentageUsed,
            runId,
          });
          
          await this.timeoutEventLogger.logTimeoutEvent({
            type: 'parallel_step_timeout',
            runId,
            workflowId: workflow.id,
            workflowName: workflow.name,
            stepId,
            stepName,
            timeoutMs,
            elapsedMs,
            percentageUsed,
            timestamp: new Date(),
          });
        } else {
          await this.runManager.log(runId, `Parallel step ${stepId} failed: ${errorMessage}`, 'error');
        }
        
        return { stepId, result: null, error, isTimeout: isTimeoutError, elapsedMs };
      }
    });

    // Use Promise.allSettled() to allow partial success
    // This ensures that if some steps timeout, others can still complete
    const stepResults = await Promise.allSettled(stepPromises);
    const duration = Date.now() - startTime;

    // Build result map and merged context
    const resultMap = new Map<string, { result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null>();
    const mergedResult: Record<string, unknown> = {};
    const errors: Array<{ stepId: string; error: unknown; isTimeout: boolean; elapsedMs: number }> = [];
    const timeouts: Array<{ stepId: string; elapsedMs: number; timeoutMs?: number }> = [];

    // Process allSettled results
    for (let i = 0; i < stepResults.length; i++) {
      const settledResult = stepResults[i];
      const stepId = stepIds[i];
      
      if (settledResult.status === 'fulfilled') {
        const { stepId: resultStepId, result, error, isTimeout, elapsedMs } = settledResult.value;
        resultMap.set(resultStepId, result);
        
        if (error) {
          errors.push({ stepId: resultStepId, error, isTimeout, elapsedMs });
          if (isTimeout) {
            const step = stepInfo.get(resultStepId);
            timeouts.push({ stepId: resultStepId, elapsedMs, timeoutMs: step?.timeout });
          }
        } else if (result && result.result !== null && result.result !== undefined) {
          // Merge each step's result into the merged result
          const step = workflow.steps.find(s => s.id === resultStepId);
          if (step) {
            // Store result under step ID
            mergedResult[resultStepId] = result.result;
            
            // Merge into main context (similar to updateContext logic)
            if (typeof result.result === 'object' && !Array.isArray(result.result) && result.result.constructor === Object) {
              for (const [key, value] of Object.entries(result.result)) {
                if (value === null || value === undefined) {
                  continue;
                }
                
                // Don't overwrite step IDs or existing step results
                if (key !== resultStepId && !workflow.steps.some(s => s.id === key)) {
                  // If both are objects, merge them; otherwise replace
                  if (mergedResult[key] && typeof mergedResult[key] === 'object' && !Array.isArray(mergedResult[key]) && 
                      value !== null && typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
                    mergedResult[key] = { ...mergedResult[key] as Record<string, unknown>, ...value };
                  } else {
                    mergedResult[key] = value;
                  }
                }
              }
            }
          }
        }
      } else {
        // Promise.allSettled rejection (shouldn't happen since we catch errors in the promise)
        // But handle it just in case
        const rejectionReason = settledResult.reason;
        const errorMessage = rejectionReason instanceof Error ? rejectionReason.message : String(rejectionReason);
        const isTimeoutError = errorMessage.includes('timed out');
        await this.runManager.log(runId, `Parallel step ${stepId} rejected: ${errorMessage}`, 'error');
        errors.push({ stepId, error: rejectionReason, isTimeout: isTimeoutError, elapsedMs: 0 });
        if (isTimeoutError) {
          const step = stepInfo.get(stepId);
          timeouts.push({ stepId, elapsedMs: 0, timeoutMs: step?.timeout });
        }
      }
    }

    // Log summary with timeout information
    const errorCount = errors.length;
    const timeoutCount = timeouts.length;
    const successCount = stepIds.length - errorCount;
    const totalCount = stepIds.length;

    if (timeoutCount > 0) {
      const timeoutDetails = timeouts.map(t => {
        const step = stepInfo.get(t.stepId);
        const stepName = step?.name || t.stepId;
        return `${stepName} (${t.stepId}): ${t.elapsedMs}ms elapsed, limit: ${t.timeoutMs || 'default'}ms`;
      }).join('; ');
      
      await this.runManager.log(
        runId,
        `Parallel execution completed: ${successCount} succeeded, ${timeoutCount} timed out, ${errorCount - timeoutCount} failed out of ${totalCount} steps. Timeouts: ${timeoutDetails}`,
        timeoutCount === totalCount ? 'error' : 'warn'
      );
    } else if (errorCount > 0) {
      await this.runManager.log(
        runId,
        `Parallel execution completed: ${successCount} succeeded, ${errorCount} failed out of ${totalCount} steps`,
        errorCount === totalCount ? 'error' : 'warn'
      );
    } else {
      await this.runManager.log(runId, `All ${stepIds.length} parallel steps completed successfully`, 'info');
    }
    
    // If all steps failed (including timeouts), throw an error
    if (errorCount === totalCount) {
      const errorMessages = errors.map(e => {
        const step = stepInfo.get(e.stepId);
        const stepName = step?.name || e.stepId;
        const errorType = e.isTimeout ? 'timeout' : 'error';
        return `${stepName} (${e.stepId}): ${errorType} - ${e.error instanceof Error ? e.error.message : String(e.error)}`;
      }).join('; ');
      throw new Error(`All parallel steps failed: ${errorMessages}`);
    }

    return {
      result: mergedResult,
      duration,
      stepResults: resultMap
    };
  }

  /**
   * Execute a workflow step
   * Returns null if step was skipped due to condition evaluation
   * 
   * @param useTransaction - If true, execute step within a MongoDB transaction (when supported)
   * @param transactionOptions - Optional transaction configuration
   */
  async executeStep(
    workflow: Workflow,
    stepId: string,
    context: Record<string, unknown>,
    runId: string,
    signal?: AbortSignal,
    useTransaction: boolean = false,
    transactionOptions?: TransactionOptions
  ): Promise<{ result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null> {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    // Evaluate condition if present
    if (step.condition !== undefined) {
      const conditionResult = evaluateCondition(step.condition, context);
      
      if (!conditionResult.result) {
        // Condition evaluated to false - skip this step
        const reason = conditionResult.error 
          ? `Condition false (error: ${conditionResult.error})`
          : 'Condition evaluated to false';
        await this.runManager.log(
          runId, 
          `Skipping step: ${step.name} - ${reason}`, 
          'info'
        );
        
        // Record Prometheus metrics for skipped step
        workflowStepExecutionsTotal.inc({ workflow_id: workflow.id, step_id: stepId, status: 'skipped' });
        
        // Return null to indicate step was skipped
        return null;
      }
      
      // Condition passed - log for debugging
      await this.runManager.log(
        runId,
        `Condition passed for step: ${step.name}`,
        'debug'
      );
    }

    // Check for cancellation before action execution
    if (signal?.aborted) {
      await this.runManager.log(runId, `Step ${step.name} cancelled before execution`, 'info');
      throw new Error('Workflow cancelled');
    }

    const stepStartTime = Date.now();
    
    // Check if transaction should be used
    const transactionService = getWorkflowTransactionService();
    const shouldUseTransaction = useTransaction && await transactionService.isTransactionSupported();
    
    if (shouldUseTransaction) {
      await this.runManager.log(runId, `Executing step: ${step.name} (${step.action}) with transaction`, 'info');
    } else {
      await this.runManager.log(runId, `Executing step: ${step.name} (${step.action})`, 'info');
    }

    let action = this.actions.get(step.action);
    
    // If action not found, check if it's a module in the registry
    if (!action) {
      const moduleEntry = moduleRegistry.get(step.action);
      if (moduleEntry) {
        // Ensure module instance exists
        if (!moduleEntry.module) {
          const errorMsg = `Module entry exists for ${step.action} but module instance is missing`;
          await this.runManager.log(runId, errorMsg, 'error');
          throw new Error(errorMsg);
        }
        // Auto-register module as action
        const adapter = ModuleActionAdapter.fromModule(moduleEntry.module);
        action = adapter.toAction();
        this.actions.set(step.action, action);
        await this.runManager.log(
          runId,
          `Auto-registered module ${step.action} as action`,
          'info'
        );
      } else {
        const availableActions = Array.from(this.actions.keys()).join(', ');
        const availableModules = moduleRegistry.getAll().map(e => e.metadata.id).join(', ');
        const errorMsg = `Action not found: ${step.action}. Available actions: ${availableActions || '(none)'}. Available modules: ${availableModules || '(none)'}`;
        await this.runManager.log(runId, errorMsg, 'error');
        throw new Error(errorMsg);
      }
    }

    // Configure timeout: use step timeout, step-type-specific default, or global default
    // Step-type-specific defaults provide better timeouts for different action types
    // (e.g., scraping steps get 10 minutes, API calls get 2 minutes)
    const timeoutMs = getRecommendedTimeout(step, step.action);
    const env = validateEnv();
    const DEFAULT_TIMEOUT_MS = env.WORKFLOW_STEP_DEFAULT_TIMEOUT_MS; // Fallback default
    
    // Validate timeout value
    if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
      await this.runManager.log(
        runId,
        `Invalid timeout value ${timeoutMs}ms for step ${step.name}, using default ${DEFAULT_TIMEOUT_MS}ms`,
        'warn'
      );
    }
    
    const validTimeoutMs = timeoutMs > 0 && Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
    const timeoutWarningThreshold = validTimeoutMs * 0.8; // 80% threshold

    // Declare warning timer outside try block so it's accessible in catch
    let warningTimer: NodeJS.Timeout | null = null;

    try {
      // Execute action with merged context and step params
      // Step params override context params, but we preserve original context
      const stepParams = { ...context, ...step.params };
      
      // Note: Context key logging removed - it was creating noise in user-facing logs.
      // Debug logs are now filtered in the frontend, and this information isn't useful for end users.
      // For debugging, developers can check the workflow context directly in the run state.
      
      // Step 1: Validate using Zod schemas (type, format, required fields)
      const schemaValidation = validateWorkflowActionParams(step.action, stepParams);
      if (!schemaValidation.valid && schemaValidation.errors) {
        // schemaValidation.errors is a ZodError, which has an 'errors' array property
        const zodError = schemaValidation.errors;
        const errorArray = Array.isArray(zodError.errors) ? zodError.errors : [];
        const errorMessages = errorArray.length > 0
          ? errorArray.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
          : zodError.message || 'Validation failed';
        await this.runManager.log(
          runId,
          `Schema validation failed for ${step.action}: ${errorMessages}`,
          'error'
        );
        throw new Error(`Input validation failed for ${step.action}: ${errorMessages}`);
      }
      
      // Step 2: Security validation (injection attacks, XSS, path traversal)
      // Use step.action (action name) not stepId for validation schema lookup
      const securityValidation = InputValidationService.validateWorkflowInput(step.action, stepParams);
      if (!securityValidation.valid && securityValidation.errors) {
        const errorMessages = securityValidation.errors.map(e => 
          `${e.field || 'unknown'}: ${e.message} (${e.code})`
        ).join(', ');
        await this.runManager.log(
          runId,
          `Security validation failed for ${step.action}: ${errorMessages}`,
          'error'
        );
        throw new Error(`Security validation failed for ${step.action}: ${errorMessages}`);
      }
      
      // Use sanitized parameters if available
      const validatedParams = securityValidation.sanitizedParams || 
                             (schemaValidation.validatedParams as Record<string, unknown>) || 
                             stepParams;
      
      // Step 3: Validate action contract if enabled (for development/debugging)
      // Note: Only validates old-style contracts (with 'input' property)
      // New Zod-based contracts are validated separately
      if (shouldValidateContracts()) {
        const contract = getActionContract(step.action);
        if (contract && 'input' in contract) {
          // Old-style contract validation
          const inputValidation = validateActionInput(contract as any, validatedParams, runId);
          if (!inputValidation.valid) {
            await this.runManager.log(
              runId,
              `Action input validation warnings for ${step.action}: ${inputValidation.errors.join(', ')}`,
              'warn'
            );
            // In development, throw error; in production, log and continue
            if (process.env.NODE_ENV === 'development') {
              throw new Error(`Action input validation failed: ${inputValidation.errors.join(', ')}`);
            }
          }
        }
      }
      
      // Check for cancellation before action execution
      if (signal?.aborted) {
        await this.runManager.log(runId, `Step ${step.name} cancelled before action execution`, 'info');
        throw new Error('Workflow cancelled');
      }
      
      // Execute action with optional transaction support
      let actionPromise: Promise<Record<string, unknown> | null | undefined>;
      
      if (shouldUseTransaction) {
        // Execute within transaction
        const transactionResult = await transactionService.executeInTransaction(async (session: ClientSession) => {
          // Store session in context so actions can access it
          // Use a special key that won't conflict with normal context data
          const contextWithSession = {
            ...validatedParams,
            __transactionSession: session,
          };
          
          // Execute action with session in context
          const actionResult = await action(contextWithSession, runId, signal);
          
          return actionResult;
        }, transactionOptions);
        
        if (!transactionResult.success) {
          const error = transactionResult.error || new Error('Transaction failed');
          await this.runManager.log(
            runId,
            `Step ${step.name} failed in transaction: ${error.message}`,
            'error'
          );
          throw error;
        }
        
        actionPromise = Promise.resolve(transactionResult.result || null);
      } else {
        // Execute without transaction (normal flow)
        actionPromise = action(validatedParams, runId, signal);
      }
      
      // Monitor timeout warning threshold
      let warningLogged = false;
      warningTimer = setTimeout(async () => {
        if (warningLogged) return;
        warningLogged = true;
        const elapsedMs = Date.now() - stepStartTime;
        const percentageUsed = (elapsedMs / validTimeoutMs) * 100;
        await this.timeoutEventLogger.logTimeoutWarning({
          type: 'step_timeout',
          runId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId,
          stepName: step.name,
          timeoutMs: validTimeoutMs,
          elapsedMs,
          percentageUsed,
          warningThreshold: timeoutWarningThreshold,
          timestamp: new Date(),
        });
        
        // Trigger timeout warning alert
        const alertService = getWorkflowAlertService();
        const userId = context.userId as string | undefined;
        await alertService.checkTimeoutWarning(
          runId,
          workflow.id,
          workflow.name,
          elapsedMs,
          validTimeoutMs,
          stepId,
          step.name,
          userId
        );
      }, timeoutWarningThreshold);
      
      // Execute action with timeout protection
      const result = await withTimeout(
        actionPromise,
        validTimeoutMs,
        `Step ${step.name} (${stepId})`
      );
      
      // Clear warning timer if action completes before timeout
      if (warningTimer) {
        clearTimeout(warningTimer);
        warningTimer = null;
      }
      
      // Validate action output if enabled (using Zod-based contracts)
      if (shouldValidateContracts()) {
        const outputValidation = validateWorkflowActionOutput(step.action, result);
        if (!outputValidation.valid && outputValidation.errors) {
          const zodError = outputValidation.errors;
          const errorArray = Array.isArray(zodError.errors) ? zodError.errors : [];
          const errorMessages = errorArray.length > 0
            ? errorArray.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
            : zodError.message || 'Output validation failed';
          await this.runManager.log(
            runId,
            `Action output validation failed for ${step.action}: ${errorMessages}`,
            'warn'
          );
          // In development, throw error; in production, log and continue
          if (process.env.NODE_ENV === 'development') {
            throw new Error(`Action output validation failed for ${step.action}: ${errorMessages}`);
          }
        }
      }
      
      // Add timing information to result
      const stepDuration = Date.now() - stepStartTime;
      // Only add duration if result is a non-null object
      if (result !== null && result !== undefined && typeof result === 'object' && !Array.isArray(result)) {
        (result as Record<string, unknown>).duration = stepDuration;
      }

      await this.runManager.log(runId, `Step completed: ${step.name}`, 'info');

      // Record step metrics (non-blocking)
      const metricsService = getWorkflowMetricsService();
      metricsService.recordExecutionAsync({
        workflowId: workflow.id,
        workflowName: workflow.name,
        stepId,
        stepName: step.name,
        duration: stepDuration,
        status: 'completed',
        metadata: {
          action: step.action,
          runId,
        },
      });
      
      // Record Prometheus metrics for step execution
      const stepDurationSeconds = stepDuration / 1000;
      workflowStepDuration.observe({ workflow_id: workflow.id, step_id: stepId }, stepDurationSeconds);
      workflowStepExecutionsTotal.inc({ workflow_id: workflow.id, step_id: stepId, status: 'success' });

      return { result, duration: stepDuration };
    } catch (error) {
      // Clear warning timer on error
      if (warningTimer) {
        clearTimeout(warningTimer);
        warningTimer = null;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const elapsedMs = Date.now() - stepStartTime;
      
      // Determine status for metrics
      let metricsStatus: 'completed' | 'failed' | 'timeout' | 'cancelled' = 'failed';
      
      // Check if this is a cancellation error
      const isCancellationError = signal?.aborted || errorMessage.includes('Workflow cancelled') || (error instanceof Error && error.name === 'AbortError');
      
      if (isCancellationError) {
        metricsStatus = 'cancelled';
        await this.runManager.log(runId, `Step ${step.name} cancelled during execution`, 'info');
        
        // Record cancellation metrics (non-blocking)
        const metricsService = getWorkflowMetricsService();
        metricsService.recordExecutionAsync({
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId,
          stepName: step.name,
          duration: elapsedMs,
          status: 'cancelled',
          metadata: {
            action: step.action,
            runId,
          },
        });
        
        // Record Prometheus metrics for cancelled step
        const stepDurationSeconds = elapsedMs / 1000;
        workflowStepDuration.observe({ workflow_id: workflow.id, step_id: stepId }, stepDurationSeconds);
        workflowStepExecutionsTotal.inc({ workflow_id: workflow.id, step_id: stepId, status: 'cancelled' });
        
        throw new Error('Workflow cancelled');
      }
      
      // Check if this is a timeout error
      const isTimeoutError = errorMessage.includes('timed out');
      
      if (isTimeoutError) {
        metricsStatus = 'timeout';
        // Log timeout event using TimeoutEventLogger
        const percentageUsed = (elapsedMs / validTimeoutMs) * 100;
        await this.timeoutEventLogger.logTimeoutEvent({
          type: 'step_timeout',
          runId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId,
          stepName: step.name,
          timeoutMs: validTimeoutMs,
          elapsedMs,
          percentageUsed,
          timestamp: new Date(),
        });
        
        // Create a timeout-specific error using TimeoutErrorFormatter
        const { getTimeoutErrorFormatter } = await import('../../utils/TimeoutErrorFormatter.js');
        const formatter = getTimeoutErrorFormatter();
        const formattedError = formatter.formatError({
          type: 'step',
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId,
          stepName: step.name,
          timeoutMs: validTimeoutMs,
          elapsedMs,
          percentageUsed,
          action: step.action,
          runId,
        });
        
        const timeoutError = new Error(formattedError.message);
        timeoutError.name = 'StepTimeoutError';
        // Attach suggestions and metadata to error for frontend use
        (timeoutError as Error & { suggestions?: string[]; metadata?: unknown }).suggestions = formattedError.suggestions;
        (timeoutError as Error & { suggestions?: string[]; metadata?: unknown }).metadata = formattedError.metadata;
        
        // Record timeout metrics (non-blocking)
        const metricsService = getWorkflowMetricsService();
        metricsService.recordExecutionAsync({
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId,
          stepName: step.name,
          duration: elapsedMs,
          status: 'timeout',
          metadata: {
            action: step.action,
            runId,
            timeoutMs: validTimeoutMs,
          },
        });
        
        // Record Prometheus metrics for timeout step
        const stepDurationSeconds = elapsedMs / 1000;
        workflowStepDuration.observe({ workflow_id: workflow.id, step_id: stepId }, stepDurationSeconds);
        workflowStepExecutionsTotal.inc({ workflow_id: workflow.id, step_id: stepId, status: 'timeout' });
        
        throw timeoutError;
      } else {
        // Log detailed error information for non-timeout errors
        await this.runManager.log(
          runId, 
          `Step failed: ${step.name} - ${errorMessage}${errorStack ? `\nStack: ${errorStack.substring(0, 500)}` : ''}`,
          'error'
        );
        
        // Log context state at failure point for debugging
        const contextSummary = Object.keys(context).join(', ');
        await this.runManager.log(
          runId,
          `Context at failure: ${contextSummary}`,
          'debug'
        );
        
        // Record failure metrics (non-blocking)
        const metricsService = getWorkflowMetricsService();
        metricsService.recordExecutionAsync({
          workflowId: workflow.id,
          workflowName: workflow.name,
          stepId,
          stepName: step.name,
          duration: elapsedMs,
          status: 'failed',
          metadata: {
            action: step.action,
            runId,
            error: errorMessage,
          },
        });
        
        // Record Prometheus metrics for failed step
        const stepDurationSeconds = elapsedMs / 1000;
        workflowStepDuration.observe({ workflow_id: workflow.id, step_id: stepId }, stepDurationSeconds);
        workflowStepExecutionsTotal.inc({ workflow_id: workflow.id, step_id: stepId, status: 'failed' });
      }
      
      throw error;
    }
  }

  /**
   * Update context with step result
   */
  updateContext(
    context: Record<string, unknown>,
    stepId: string,
    result: Record<string, unknown> | null | undefined,
    workflow: Workflow
  ): Record<string, unknown> {
    // Early return for null/undefined results
    if (result === null || result === undefined) {
      return context;
    }

    // Validate stepId is a string
    if (typeof stepId !== 'string' || stepId.trim() === '') {
      throw new Error(`Invalid stepId: must be a non-empty string, got ${typeof stepId}`);
    }

    // Store result under step ID for reference (preserves step-specific data)
    context[stepId] = result;
    
    // Also merge into main context if it's an object
    // This allows subsequent steps to access properties directly from context
    if (typeof result === 'object' && !Array.isArray(result) && result.constructor === Object) {
      // Safe merge: only merge plain objects, skip functions and special objects
      for (const [key, value] of Object.entries(result)) {
        // Skip null/undefined values
        if (value === null || value === undefined) {
          continue;
        }
        
        // Don't overwrite step IDs or existing step results
        if (key !== stepId && !workflow.steps.some(s => s.id === key)) {
          // If both are objects, merge them; otherwise replace
          if (context[key] && typeof context[key] === 'object' && !Array.isArray(context[key]) && 
              value !== null && typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
            context[key] = { ...context[key] as Record<string, unknown>, ...value };
          } else {
            context[key] = value;
          }
        }
      }
    }

    return context;
  }

  /**
   * Get the next step ID
   * Handles conditional branching based on step condition evaluation
   */
  getNextStepId(
    workflow: Workflow, 
    currentStepId: string, 
    context: Record<string, unknown>,
    stepWasSkipped?: boolean
  ): string | undefined {
    const step = workflow.steps.find(s => s.id === currentStepId);
    if (!step) {
      // Log warning if step not found (this shouldn't happen in normal execution)
      logger.warn({ workflowId: workflow.id, currentStepId, availableSteps: workflow.steps.map(s => s.id) }, 
        `Step ${currentStepId} not found in workflow ${workflow.id}`);
      return undefined;
    }

    // If step has a condition and was skipped, use elseNext if defined
    // (elseNext is only used when step was skipped due to condition being false)
    if (stepWasSkipped && step.elseNext) {
      return step.elseNext;
    }

    // If step was executed (not skipped), always use next property
    // Note: If step was executed, it means the condition was true before execution,
    // so we should use next regardless of condition evaluation after execution
    return step.next;
  }
}

