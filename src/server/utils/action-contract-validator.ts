/**
 * Action Contract Validator
 * 
 * Provides runtime validation for action contracts.
 * This is optional and primarily used during development to catch contract violations early.
 * 
 * @module action-contract-validator
 */

import { ActionContract, ValidationResult, ActionInput, ActionOutput } from '../types/action-contract.js';
import { logger } from './logger.js';

/**
 * Validates action input against contract
 */
export function validateActionInput(
  contract: ActionContract,
  input: ActionInput,
  runId?: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const schema = contract.input;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in input) || input[field] === undefined || input[field] === null) {
        errors.push(`Missing required input field: ${field}`);
      }
    }
  }

  // Check field types
  if (schema.types) {
    for (const [field, expectedTypes] of Object.entries(schema.types)) {
      if (!(field in input) || input[field] === undefined) {
        continue; // Skip if field is optional and not provided
      }

      const value = input[field];
      const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
      const actualType = getType(value);

      if (!types.includes(actualType) && !types.includes('any')) {
        errors.push(
          `Type mismatch for field '${field}': expected ${types.join(' or ')}, got ${actualType}`
        );
      }
    }
  }

  // Run custom validation
  if (schema.validate) {
    const result = schema.validate(input);
    if (result !== true) {
      errors.push(typeof result === 'string' ? result : `Custom validation failed for ${contract.name}`);
    }
  }

  // Log warnings/errors
  if (errors.length > 0 && runId) {
    logger.warn(
      { action: contract.name, runId, errors },
      `Action input validation failed for ${contract.name}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validates action output against contract
 */
export function validateActionOutput(
  contract: ActionContract,
  output: ActionOutput | null | undefined,
  runId?: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check nullable
  if (output === null || output === undefined) {
    if (!contract.nullable) {
      errors.push(`Action ${contract.name} returned null/undefined but contract does not allow nullable`);
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  const schema = contract.output;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in output) || output[field] === undefined) {
        errors.push(`Missing required output field: ${field}`);
      }
    }
  }

  // Check field types
  if (schema.types) {
    for (const [field, expectedTypes] of Object.entries(schema.types)) {
      if (!(field in output) || output[field] === undefined) {
        continue; // Skip if field is optional and not provided
      }

      const value = output[field];
      const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
      const actualType = getType(value);

      if (!types.includes(actualType) && !types.includes('any')) {
        errors.push(
          `Type mismatch for output field '${field}': expected ${types.join(' or ')}, got ${actualType}`
        );
      }
    }
  }

  // Run custom validation
  if (schema.validate) {
    const result = schema.validate(output);
    if (result !== true) {
      errors.push(typeof result === 'string' ? result : `Custom validation failed for ${contract.name}`);
    }
  }

  // Log warnings/errors
  if (errors.length > 0 && runId) {
    logger.warn(
      { action: contract.name, runId, errors },
      `Action output validation failed for ${contract.name}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Get runtime type of a value
 */
function getType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'Date';
  if (value instanceof RegExp) return 'RegExp';
  if (value instanceof Error) return 'Error';
  // Check for ObjectId (MongoDB)
  if (typeof value === 'object' && value !== null && 'toString' in value && typeof (value as { toString(): string }).toString === 'function') {
    const str = (value as { toString(): string }).toString();
    if (str.length === 24 && /^[0-9a-fA-F]{24}$/.test(str)) {
      return 'ObjectId';
    }
  }
  return typeof value;
}

/**
 * Validate action contract before execution
 * Returns true if validation should be enabled (based on environment)
 */
export function shouldValidateContracts(): boolean {
  return process.env.VALIDATE_ACTION_CONTRACTS === 'true' || process.env.NODE_ENV === 'development';
}

/**
 * Wrapper to validate action execution
 */
export async function validateAndExecuteAction<T extends ActionOutput | null | undefined>(
  contract: ActionContract,
  action: (params: ActionInput, runId: string) => Promise<T>,
  params: ActionInput,
  runId: string
): Promise<T> {
  // Validate input
  if (shouldValidateContracts()) {
    const inputValidation = validateActionInput(contract, params, runId);
    if (!inputValidation.valid) {
      logger.error(
        { action: contract.name, runId, errors: inputValidation.errors },
        `Action input validation failed for ${contract.name}`
      );
      // In development, throw error; in production, log and continue
      if (process.env.NODE_ENV === 'development') {
        throw new Error(`Action input validation failed: ${inputValidation.errors.join(', ')}`);
      }
    }
  }

  // Execute action
  const result = await action(params, runId);

  // Validate output
  if (shouldValidateContracts()) {
    const outputValidation = validateActionOutput(contract, result, runId);
    if (!outputValidation.valid) {
      logger.error(
        { action: contract.name, runId, errors: outputValidation.errors },
        `Action output validation failed for ${contract.name}`
      );
      // In development, throw error; in production, log and continue
      if (process.env.NODE_ENV === 'development') {
        throw new Error(`Action output validation failed: ${outputValidation.errors.join(', ')}`);
      }
    }
  }

  return result;
}














