/**
 * ModuleActionAdapter
 * 
 * Adapter class that bridges WorkflowModules and WorkflowEngine actions.
 * Allows modules to be used as actions in workflows by wrapping them in
 * the StepAction interface expected by WorkflowEngine.
 * 
 * @module ModuleActionAdapter
 */

import { WorkflowModule, WorkflowContext } from './WorkflowModule.js';
import type { StepAction } from './WorkflowActionRegistry.js';
import { logger } from '../../utils/logger.js';
import { BadRequestError } from '../../types/errors.js';

/**
 * Adapter that wraps a WorkflowModule as a StepAction for use in WorkflowEngine
 * 
 * This adapter handles:
 * - Parameter validation using the module's validate method
 * - Context passing (merges workflow context with step-specific parameters)
 * - Error handling and logging
 * - Result merging back into workflow context
 */
export class ModuleActionAdapter {
    private module: WorkflowModule;

    /**
     * Create a new adapter for a module
     * 
     * @param module The WorkflowModule to wrap
     */
    constructor(module: WorkflowModule) {
        this.module = module;
    }

    /**
     * Get the module ID
     */
    getModuleId(): string {
        return this.module.id;
    }

    /**
     * Get the module instance
     */
    getModule(): WorkflowModule {
        return this.module;
    }

    /**
     * Convert the module to a StepAction that can be registered with WorkflowEngine
     * 
     * The action receives merged context (workflow context + step.params) as params.
     * It validates parameters, executes the module, and returns the result to be
     * merged into the workflow context for subsequent steps.
     * 
     * @returns A StepAction function
     */
    toAction(): StepAction {
        return async (params: Record<string, unknown>, runId: string, signal?: AbortSignal): Promise<Record<string, unknown> | null | undefined> => {
            try {
                // Check for cancellation before execution
                if (signal?.aborted) {
                    logger.info({ moduleId: this.module.id, runId }, `Module ${this.module.id} cancelled before execution`);
                    throw new Error('Workflow cancelled');
                }

                // Validate parameters using module's validate method
                const validation = this.module.validate(params);
                if (!validation.valid) {
                    const errorMessage = validation.error || `Invalid parameters for module ${this.module.id}`;
                    logger.error({ moduleId: this.module.id, params, runId }, errorMessage);
                    throw new BadRequestError(errorMessage, {
                        reason: 'module_validation_failed',
                        operation: 'execute',
                        moduleId: this.module.id,
                        runId,
                        validationError: validation.error
                    });
                }

                // Check for cancellation after validation
                if (signal?.aborted) {
                    logger.info({ moduleId: this.module.id, runId }, `Module ${this.module.id} cancelled after validation`);
                    throw new Error('Workflow cancelled');
                }

                // Execute module: params from action is already merged context+step.params
                // Pass as both context and params (modules can extract step-specific params from context if needed)
                const context: WorkflowContext = params;
                const result = await this.module.execute(context, params, runId, signal);
                
                // Check for cancellation after execution
                if (signal?.aborted) {
                    logger.info({ moduleId: this.module.id, runId }, `Module ${this.module.id} cancelled after execution`);
                    throw new Error('Workflow cancelled');
                }

                // Log successful execution
                logger.debug({ moduleId: this.module.id, runId }, `Module ${this.module.id} executed successfully`);

                // Return the result (which gets merged into context for next steps)
                return result as Record<string, unknown>;
            } catch (error) {
                // Check if error is from cancellation
                if (signal?.aborted || (error instanceof Error && (error.name === 'AbortError' || error.message === 'Workflow cancelled'))) {
                    logger.info({ moduleId: this.module.id, runId }, `Module ${this.module.id} cancelled`);
                    throw new Error('Workflow cancelled');
                }
                
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(
                    { moduleId: this.module.id, params, runId, error },
                    `Error executing module ${this.module.id}: ${errorMessage}`
                );
                throw error;
            }
        };
    }

    /**
     * Create an adapter from a module instance
     * 
     * @param module The WorkflowModule to adapt
     * @returns A new ModuleActionAdapter instance
     */
    static fromModule(module: WorkflowModule): ModuleActionAdapter {
        return new ModuleActionAdapter(module);
    }
}








