/**
 * Action Contract System
 * 
 * Defines strict contracts for workflow actions to ensure type safety,
 * runtime validation, and clear documentation of action behavior.
 * 
 * @module action-contract
 */

import { ObjectId } from 'mongodb';
import { ScrapedDocument } from '../services/infrastructure/types.js';

/**
 * Base interface for action input parameters
 */
export interface ActionInput {
  [key: string]: unknown;
}

/**
 * Base interface for action output results
 */
export interface ActionOutput {
  [key: string]: unknown;
}

/**
 * Schema definition for validating action inputs
 */
export interface InputSchema {
  /** Required input fields */
  required?: string[];
  /** Optional input fields */
  optional?: string[];
  /** Type definitions for each field */
  types?: Record<string, string | string[]>;
  /** Custom validation function */
  validate?: (input: ActionInput) => boolean | string;
}

/**
 * Schema definition for validating action outputs
 */
export interface OutputSchema {
  /** Required output fields */
  required?: string[];
  /** Optional output fields */
  optional?: string[];
  /** Type definitions for each field */
  types?: Record<string, string | string[]>;
  /** Custom validation function */
  validate?: (output: ActionOutput) => boolean | string;
}

/**
 * Complete contract specification for a workflow action
 */
export interface ActionContract {
  /** Unique action identifier */
  name: string;
  /** Human-readable description of what the action does */
  description: string;
  /** Input parameter schema */
  input: InputSchema;
  /** Output result schema */
  output: OutputSchema;
  /** Whether the action can return null/undefined (e.g., for conditional steps) */
  nullable?: boolean;
  /** Whether the action can throw errors (all actions can, but some document specific error types) */
  throws?: string[];
  /** Dependencies: other actions that should run before this one */
  dependsOn?: string[];
  /** Side effects: what the action modifies (e.g., 'navigationGraph', 'knowledgeGraph', 'database') */
  sideEffects?: string[];
  /** Performance characteristics */
  performance?: {
    /** Estimated execution time (ms) */
    estimatedTime?: number;
    /** Whether the action is async/blocking */
    blocking?: boolean;
  };
}

/**
 * Registry of all action contracts
 */
export interface ActionContractRegistry {
  [actionName: string]: ActionContract;
}

/**
 * Validation result for contract checks
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Helper type for action function signature
 */
export type StepAction = (
  params: Record<string, unknown>,
  runId: string
) => Promise<Record<string, unknown> | null | undefined>;










