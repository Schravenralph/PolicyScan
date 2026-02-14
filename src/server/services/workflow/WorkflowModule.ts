/**
 * WorkflowModule Interface
 * 
 * Defines the contract for reusable workflow modules that can be composed
 * into workflows. Modules are pluggable components that execute specific tasks.
 * 
 * @module WorkflowModule
 */

import type { ModuleMetadata } from '../../types/module-metadata.js';

export interface WorkflowContext {
    [key: string]: unknown;
}

export interface WorkflowModule {
    /** Unique identifier for the module type (e.g., "DiscoverSources") */
    id: string;
    
    /** Human-readable name (e.g., "Discover Sources") */
    name: string;
    
    /** Description of what the module does */
    description: string;
    
    /** Category/group for organization (e.g., "discovery", "processing", "storage") */
    category: string;
    
    /** Get module metadata for marketplace registration */
    getMetadata(): ModuleMetadata;
    
    /** Execute the module with given context and parameters */
    execute(context: WorkflowContext, params: Record<string, unknown>, runId: string, signal?: AbortSignal): Promise<WorkflowContext>;
    
    /** Validate module parameters before execution */
    validate(params: Record<string, unknown>): { valid: boolean; error?: string };
    
    /** Get default parameters for this module */
    getDefaultParams(): Record<string, unknown>;
    
    /** Get parameter schema for UI generation */
    getParameterSchema(): ModuleParameterSchema;
}

export interface ModuleParameterSchema {
    [key: string]: {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        label: string;
        description?: string;
        required?: boolean;
        default?: unknown;
        options?: Array<{ value: string | number; label: string }>;
        validation?: {
            min?: number;
            max?: number;
            pattern?: string;
        };
    };
}

/**
 * Base class for workflow modules
 * Provides common functionality and structure
 */
export abstract class BaseWorkflowModule implements WorkflowModule {
    abstract id: string;
    abstract name: string;
    abstract description: string;
    abstract category: string;

    abstract execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string,
        signal?: AbortSignal
    ): Promise<WorkflowContext>;
    
    /**
     * Get module metadata for marketplace registration
     * Subclasses should override this to provide complete metadata
     */
    abstract getMetadata(): ModuleMetadata;

    validate(params: Record<string, unknown>): { valid: boolean; error?: string } {
        const schema = this.getParameterSchema();
        const errors: string[] = [];

        for (const [key, paramDef] of Object.entries(schema)) {
            if (!paramDef || typeof paramDef !== 'object') {
                continue; // Skip invalid parameter definitions
            }
            if (paramDef.required && (params[key] === undefined || params[key] === null || params[key] === '')) {
                errors.push(`${paramDef.label || key} is required`);
            }

            if (params[key] !== undefined && params[key] !== null) {
                // Type validation
                if (paramDef.type === 'number' && typeof params[key] !== 'number') {
                    errors.push(`${paramDef.label} must be a number`);
                } else if (paramDef.type === 'boolean' && typeof params[key] !== 'boolean') {
                    errors.push(`${paramDef.label} must be a boolean`);
                } else if (paramDef.type === 'string' && typeof params[key] !== 'string') {
                    errors.push(`${paramDef.label} must be a string`);
                } else if (paramDef.type === 'array' && !Array.isArray(params[key])) {
                    errors.push(`${paramDef.label} must be an array`);
                }

                // Range validation
                if (paramDef.validation) {
                    if (paramDef.type === 'number') {
                        const numValue = params[key] as number;
                        if (paramDef.validation.min !== undefined && numValue < paramDef.validation.min) {
                            errors.push(`${paramDef.label} must be at least ${paramDef.validation.min}`);
                        }
                        if (paramDef.validation.max !== undefined && numValue > paramDef.validation.max) {
                            errors.push(`${paramDef.label} must be at most ${paramDef.validation.max}`);
                        }
                    }
                }
            }
        }

        if (errors.length > 0) {
            return { valid: false, error: errors.join('; ') };
        }

        return { valid: true };
    }

    abstract getDefaultParams(): Record<string, unknown>;
    abstract getParameterSchema(): ModuleParameterSchema;
}

/**
 * Convert a WorkflowModule to a StepAction for use with WorkflowEngine
 * 
 * This adapter allows modules to be registered as actions in WorkflowEngine.
 * Actions receive merged context (context + step.params) as their params argument.
 * 
 * @param module The WorkflowModule to convert
 * @returns A StepAction function that can be registered with WorkflowEngine
 * 
 * @example
 * ```typescript
 * const searchModule = new SearchWebModule();
 * workflowEngine.registerAction('searchWeb', moduleToAction(searchModule));
 * ```
 */
export function moduleToAction(module: WorkflowModule): (params: Record<string, unknown>, runId: string, signal?: AbortSignal) => Promise<Record<string, unknown> | null | undefined> {
  return async (params: Record<string, unknown>, runId: string, signal?: AbortSignal) => {
    // Check for cancellation before execution
    if (signal?.aborted) {
      throw new Error('Workflow cancelled');
    }
    
    // Validate parameters using module's validate method
    const validation = module.validate(params);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid parameters');
    }
    
    // Check for cancellation after validation
    if (signal?.aborted) {
      throw new Error('Workflow cancelled');
    }
    
    // Execute module: params from action is already merged context+step.params
    // Pass as both context and params (modules can extract step-specific params from context if needed)
    const context: WorkflowContext = params;
    const result = await module.execute(context, params, runId, signal);
    
    // Check for cancellation after execution
    if (signal?.aborted) {
      throw new Error('Workflow cancelled');
    }
    
    // Return the result (which gets merged into context for next steps)
    return result as Record<string, unknown>;
  };
}

