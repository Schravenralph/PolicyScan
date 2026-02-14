/**
 * Transformation Error Handler - Handles errors during data transformation
 * 
 * Provides utilities for safely executing transformations with error handling,
 * fallback values, and recovery mechanisms.
 */

import { logError } from './errorHandler';

export interface TransformationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  originalData?: unknown;
  fallbackUsed?: boolean;
}

/**
 * Execute transformation with error handling and validation
 */
export function safeTransform<TInput, TOutput>(
  input: TInput,
  transformFn: (input: TInput) => TOutput,
  options?: {
    validateInput?: (input: TInput) => { valid: boolean; errors: string[] };
    validateOutput?: (output: TOutput) => { valid: boolean; errors: string[] };
    fallback?: (input: TInput, error: Error) => TOutput | null;
    preserveOriginal?: boolean;
  }
): TransformationResult<TOutput> {
  const originalData = options?.preserveOriginal ? structuredClone(input) : undefined;

  try {
    // Validate input if validator provided
    if (options?.validateInput) {
      const validation = options.validateInput(input);
      if (!validation.valid) {
        const error = new Error(`Input validation failed: ${validation.errors.join(', ')}`);
        logError(error, 'transformation-input-validation');
        
        // Try fallback if provided
        if (options?.fallback) {
          try {
            const fallbackData = options.fallback(input, error);
            if (fallbackData !== null) {
              return {
                success: true,
                data: fallbackData,
                originalData,
                fallbackUsed: true,
              };
            }
          } catch (fallbackError) {
            logError(fallbackError, 'transformation-fallback-failed');
          }
        }

        return {
          success: false,
          error,
          originalData,
        };
      }
    }

    // Execute transformation
    const output = transformFn(input);

    // Validate output if validator provided
    if (options?.validateOutput) {
      const validation = options.validateOutput(output);
      if (!validation.valid) {
        const error = new Error(`Output validation failed: ${validation.errors.join(', ')}`);
        logError(error, 'transformation-output-validation');
        
        // Try fallback if provided
        if (options?.fallback) {
          try {
            const fallbackData = options.fallback(input, error);
            if (fallbackData !== null) {
              return {
                success: true,
                data: fallbackData,
                originalData,
                fallbackUsed: true,
              };
            }
          } catch (fallbackError) {
            logError(fallbackError, 'transformation-fallback-failed');
          }
        }

        return {
          success: false,
          error,
          originalData,
          data: output, // Include output even if invalid for debugging
        };
      }
    }

    return {
      success: true,
      data: output,
      originalData,
    };
  } catch (error) {
    const transformationError = error instanceof Error ? error : new Error(String(error));
    logError(transformationError, 'transformation-error');

    // Try fallback if provided
    if (options?.fallback) {
      try {
        const fallbackData = options.fallback(input, transformationError);
        if (fallbackData !== null) {
          return {
            success: true,
            data: fallbackData,
            originalData,
            fallbackUsed: true,
          };
        }
      } catch (fallbackError) {
        console.error('Transformation fallback failed:', fallbackError);
      }
    }

    return {
      success: false,
      error: transformationError,
      originalData,
    };
  }
}

/**
 * Transform array with error handling (continues on individual failures)
 */
export function safeTransformArray<TInput, TOutput>(
  inputs: TInput[],
  transformFn: (input: TInput) => TOutput,
  options?: {
    validateInput?: (input: TInput) => { valid: boolean; errors: string[] };
    validateOutput?: (output: TOutput) => { valid: boolean; errors: string[] };
    fallback?: (input: TInput, error: Error) => TOutput | null;
    continueOnError?: boolean;
  }
): {
  results: TransformationResult<TOutput>[];
  succeeded: number;
  failed: number;
} {
  const results: TransformationResult<TOutput>[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const input of inputs) {
    const result = safeTransform(input, transformFn, {
      ...options,
      preserveOriginal: true,
    });

    results.push(result);

    if (result.success) {
      succeeded++;
    } else {
      failed++;
      
      // If continueOnError is false, stop on first error
      if (!options?.continueOnError) {
        break;
      }
    }
  }

  return {
    results,
    succeeded,
    failed,
  };
}

