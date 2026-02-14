/**
 * Parameter Validation Service - Centralized parameter validation
 * 
 * Provides standardized parameter validation with consistent error messages
 * and validation patterns across the application.
 */

import { z, ZodError, ZodSchema } from 'zod';
import { logger } from '../../utils/logger.js';

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

/**
 * Parameter Validation Service
 */
export class ParameterValidationService {
  /**
   * Validate parameters against a Zod schema
   */
  validate<T>(
    schema: ZodSchema<T>,
    data: unknown,
    options?: {
      context?: string;
      allowUnknown?: boolean;
    }
  ): ValidationResult<T> {
    try {
      const validated = schema.parse(data);
      return {
        valid: true,
        data: validated,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = this.formatZodErrors(error);
        
        if (options?.context) {
          logger.warn({ errors, context: options.context }, 'Parameter validation failed');
        }

        return {
          valid: false,
          errors,
        };
      }

      // Unexpected error
      logger.error({ error, context: options?.context }, 'Unexpected validation error');
      return {
        valid: false,
        errors: [
          {
            field: 'unknown',
            message: 'Validation failed with unexpected error',
            code: 'VALIDATION_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Validate required parameters
   */
  validateRequired(
    params: Record<string, unknown>,
    required: string[],
    options?: {
      context?: string;
    }
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const field of required) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        errors.push({
          field,
          message: `${field} is required`,
          code: 'REQUIRED_FIELD',
          value: params[field],
        });
      }
    }

    if (errors.length > 0) {
      if (options?.context) {
        logger.warn({ errors, context: options.context }, 'Required parameter validation failed');
      }

      return {
        valid: false,
        errors,
      };
    }

    return {
      valid: true,
    };
  }

  /**
   * Validate parameter types
   */
  validateTypes(
    params: Record<string, unknown>,
    typeMap: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>,
    options?: {
      context?: string;
    }
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [field, expectedType] of Object.entries(typeMap)) {
      const value = params[field];
      
      // Skip if field is not present (use validateRequired for that)
      if (value === undefined) {
        continue;
      }

      let isValid = false;
      switch (expectedType) {
        case 'string':
          isValid = typeof value === 'string';
          break;
        case 'number':
          isValid = typeof value === 'number' && !Number.isNaN(value);
          break;
        case 'boolean':
          isValid = typeof value === 'boolean';
          break;
        case 'array':
          isValid = Array.isArray(value);
          break;
        case 'object':
          isValid = typeof value === 'object' && value !== null && !Array.isArray(value);
          break;
      }

      if (!isValid) {
        errors.push({
          field,
          message: `${field} must be of type ${expectedType}`,
          code: 'TYPE_MISMATCH',
          value,
        });
      }
    }

    if (errors.length > 0) {
      if (options?.context) {
        logger.warn({ errors, context: options.context }, 'Type validation failed');
      }

      return {
        valid: false,
        errors,
      };
    }

    return {
      valid: true,
    };
  }

  /**
   * Validate parameter ranges (for numbers)
   */
  validateRanges(
    params: Record<string, unknown>,
    rangeMap: Record<string, { min?: number; max?: number }>,
    options?: {
      context?: string;
    }
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [field, range] of Object.entries(rangeMap)) {
      const value = params[field];
      
      // Skip if field is not present or not a number
      if (value === undefined || typeof value !== 'number') {
        continue;
      }

      if (range.min !== undefined && value < range.min) {
        errors.push({
          field,
          message: `${field} must be at least ${range.min}`,
          code: 'RANGE_ERROR',
          value,
        });
      }

      if (range.max !== undefined && value > range.max) {
        errors.push({
          field,
          message: `${field} must be at most ${range.max}`,
          code: 'RANGE_ERROR',
          value,
        });
      }
    }

    if (errors.length > 0) {
      if (options?.context) {
        logger.warn({ errors, context: options.context }, 'Range validation failed');
      }

      return {
        valid: false,
        errors,
      };
    }

    return {
      valid: true,
    };
  }

  /**
   * Format Zod errors into standardized format
   */
  private formatZodErrors(error: ZodError): ValidationError[] {
    return error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
      value: (() => {
        if (issue.path.length === 0) return undefined;
        let result: unknown = undefined;
        for (const key of issue.path) {
          if (typeof key === 'string' && result && typeof result === 'object' && key in result) {
            result = (result as Record<string, unknown>)[key];
          } else {
            return undefined;
          }
        }
        return result;
      })(),
    }));
  }

  /**
   * Validate parameter transformation
   */
  validateTransformation<TInput, TOutput>(
    input: TInput,
    transformFn: (input: TInput) => TOutput,
    inputSchema?: ZodSchema<TInput>,
    outputSchema?: ZodSchema<TOutput>,
    options?: {
      context?: string;
    }
  ): ValidationResult<TOutput> {
    // Validate input if schema provided
    if (inputSchema) {
      const inputValidation = this.validate(inputSchema, input, options);
      if (!inputValidation.valid) {
        return {
          valid: false,
          errors: inputValidation.errors,
        };
      }
    }

    // Perform transformation
    let transformed: TOutput;
    try {
      transformed = transformFn(input);
    } catch (error) {
      const transformationError = error instanceof Error ? error : new Error(String(error));
      logger.error({ error: transformationError, context: options?.context }, 'Parameter transformation failed');
      
      return {
        valid: false,
        errors: [
          {
            field: 'transformation',
            message: `Transformation failed: ${transformationError.message}`,
            code: 'TRANSFORMATION_ERROR',
          },
        ],
      };
    }

    // Validate output if schema provided
    if (outputSchema) {
      const outputValidation = this.validate(outputSchema, transformed, options);
      if (!outputValidation.valid) {
        return {
          valid: false,
          errors: outputValidation.errors,
        };
      }
      return {
        valid: true,
        data: transformed,
      };
    }

    return {
      valid: true,
      data: transformed,
    };
  }
}

// Singleton instance
let validationServiceInstance: ParameterValidationService | null = null;

/**
 * Get or create parameter validation service instance
 */
export function getParameterValidationService(): ParameterValidationService {
  if (!validationServiceInstance) {
    validationServiceInstance = new ParameterValidationService();
  }
  return validationServiceInstance;
}


