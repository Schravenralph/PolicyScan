/**
 * Context Validation Service
 * 
 * Validates workflow context before step execution to prevent corruption.
 */

import { Workflow } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';

export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ContextValidationOptions {
  strict?: boolean; // If true, warnings are treated as errors
  checkRequiredFields?: boolean;
  checkDataTypes?: boolean;
  checkCorruption?: boolean;
}

/**
 * Service for validating workflow context
 */
export class ContextValidationService {
  /**
   * Validate context before step execution
   */
  validateContext(
    context: Record<string, unknown>,
    workflow: Workflow,
    stepId: string,
    options: ContextValidationOptions = {}
  ): ContextValidationResult {
    const {
      strict = false,
      checkRequiredFields = true,
      checkDataTypes = true,
      checkCorruption = true,
    } = options;

    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      errors.push('Context must be a plain object');
      return { valid: false, errors, warnings };
    }

    // Check for corruption indicators
    if (checkCorruption) {
      this.checkCorruptionIndicators(context, errors, warnings);
    }

    // Check required fields (if step has requirements)
    if (checkRequiredFields) {
      this.checkRequiredFields(context, workflow, stepId, errors, warnings);
    }

    // Check data types
    if (checkDataTypes) {
      this.checkDataTypes(context, errors, warnings);
    }

    // Check for circular references
    this.checkCircularReferences(context, errors, warnings);

    // Check for invalid values
    this.checkInvalidValues(context, errors, warnings);

    // If strict mode, treat warnings as errors
    if (strict && warnings.length > 0) {
      errors.push(...warnings);
      warnings.length = 0;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check for corruption indicators in context
   */
  private checkCorruptionIndicators(
    context: Record<string, unknown>,
    errors: string[],
    warnings: string[]
  ): void {
    // Check for null/undefined in critical fields
    const criticalFields = ['queryId', 'workflowRunId'];
    for (const field of criticalFields) {
      if (field in context && (context[field] === null || context[field] === undefined)) {
        warnings.push(`Critical field '${field}' is null or undefined`);
      }
    }

    // Check for unexpected types in known fields
    if ('documents' in context && !Array.isArray(context.documents)) {
      warnings.push("Field 'documents' should be an array");
    }

    if ('websites' in context && !Array.isArray(context.websites)) {
      warnings.push("Field 'websites' should be an array");
    }
  }

  /**
   * Check required fields for a step
   */
  private checkRequiredFields(
    context: Record<string, unknown>,
    workflow: Workflow,
    stepId: string,
    errors: string[],
    warnings: string[]
  ): void {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      warnings.push(`Step '${stepId}' not found in workflow`);
      return;
    }

    // Check if step has required context fields
    // This is a basic check - actual requirements depend on step implementation
    if (step.params) {
      const stepParams = step.params as Record<string, unknown>;
      for (const [key, value] of Object.entries(stepParams)) {
        // If step param is required and not in context, warn
        if (value !== null && value !== undefined && !(key in context)) {
          warnings.push(`Step '${stepId}' may require field '${key}' in context`);
        }
      }
    }
  }

  /**
   * Check data types in context
   */
  private checkDataTypes(
    context: Record<string, unknown>,
    errors: string[],
    warnings: string[]
  ): void {
    for (const [key, value] of Object.entries(context)) {
      // Skip internal fields
      if (key.startsWith('__')) {
        continue;
      }

      // Check for functions (should not be in context)
      if (typeof value === 'function') {
        errors.push(`Context field '${key}' contains a function (not serializable)`);
      }

      // Check for circular references in objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        try {
          JSON.stringify(value);
        } catch (e) {
          if (e instanceof Error && e.message.includes('circular')) {
            errors.push(`Context field '${key}' contains circular reference`);
          }
        }
      }
    }
  }

  /**
   * Check for circular references
   */
  private checkCircularReferences(
    context: Record<string, unknown>,
    errors: string[],
    warnings: string[]
  ): void {
    const visited = new WeakSet();
    
    const checkValue = (value: unknown, path: string): void => {
      if (value === null || value === undefined) {
        return;
      }

      if (typeof value === 'object') {
        if (visited.has(value as object)) {
          errors.push(`Circular reference detected at path: ${path}`);
          return;
        }

        visited.add(value as object);

        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            checkValue(item, `${path}[${index}]`);
          });
        } else {
          for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            checkValue(val, `${path}.${key}`);
          }
        }
      }
    };

    for (const [key, value] of Object.entries(context)) {
      if (key.startsWith('__')) {
        continue;
      }
      checkValue(value, key);
    }
  }

  /**
   * Check for invalid values
   */
  private checkInvalidValues(
    context: Record<string, unknown>,
    errors: string[],
    warnings: string[]
  ): void {
    for (const [key, value] of Object.entries(context)) {
      // Skip internal fields
      if (key.startsWith('__')) {
        continue;
      }

      // Check for NaN
      if (typeof value === 'number' && isNaN(value)) {
        warnings.push(`Context field '${key}' contains NaN`);
      }

      // Check for Infinity
      if (typeof value === 'number' && !isFinite(value)) {
        warnings.push(`Context field '${key}' contains Infinity`);
      }
    }
  }

  /**
   * Validate context structure matches expected schema
   */
  validateContextStructure(
    context: Record<string, unknown>,
    expectedSchema?: Record<string, string>
  ): ContextValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!expectedSchema) {
      return { valid: true, errors, warnings };
    }

    for (const [key, expectedType] of Object.entries(expectedSchema)) {
      if (!(key in context)) {
        warnings.push(`Expected field '${key}' not found in context`);
        continue;
      }

      const value = context[key];
      const actualType = this.getType(value);

      if (actualType !== expectedType) {
        warnings.push(
          `Field '${key}' has type '${actualType}', expected '${expectedType}'`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get type of a value
   */
  private getType(value: unknown): string {
    if (value === null) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    return typeof value;
  }
}


