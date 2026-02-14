/**
 * StepDefinition - Defines the structure and behavior of a wizard step
 * 
 * This model separates step logic from UI rendering, enabling:
 * - Reusable step logic across different UI implementations
 * - Schema validation for step parameters
 * - Backend endpoint contracts
 * - Step state persistence
 */

import { z } from 'zod';

/**
 * Step execution result
 */
export interface StepExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  nextStepId?: string;
}

/**
 * Step validation result
 */
export interface StepValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
}

/**
 * Step parameter schema definition
 */
export type StepParameterSchema = Record<string, {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  description?: string;
  default?: unknown;
  validation?: (value: unknown) => boolean | string;
}>;

/**
 * StepDefinition interface
 * 
 * Defines the contract for a wizard step, including:
 * - Step metadata (id, name, description)
 * - Parameter schema for validation
 * - Execution logic
 * - UI rendering hints (optional)
 */
export interface StepDefinition {
  /** Unique identifier for the step */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Step description */
  description?: string;
  
  /** Parameter schema for validation */
  parameterSchema: StepParameterSchema;
  
  /** Execute the step logic */
  execute: (params: Record<string, unknown>, context?: Record<string, unknown>) => Promise<StepExecutionResult>;
  
  /** Validate step parameters */
  validate: (params: Record<string, unknown>) => StepValidationResult;
  
  /** Optional: UI rendering hints (component name, props, etc.) */
  uiHints?: {
    component?: string;
    props?: Record<string, unknown>;
  };
  
  /** Optional: Dependencies on other steps */
  dependsOn?: string[];
  
  /** Optional: Next step ID (can be dynamic based on execution result) */
  getNextStepId?: (result: StepExecutionResult) => string | undefined;
}

/**
 * Zod schema for StepDefinition validation
 */
export const StepDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  parameterSchema: z.record(z.string(), z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
  })),
  uiHints: z.object({
    component: z.string().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  dependsOn: z.array(z.string()).optional(),
});


