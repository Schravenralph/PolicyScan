/**
 * Utility for retrying validation operations with exponential backoff
 * Handles transient failures (network errors, timeouts) but not validation errors
 */

import { retryWithBackoff, isRetryableError } from './sessionRetry';

export interface ValidationRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: ValidationRetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 500, // Start with 500ms for validation (faster than API calls)
  maxDelayMs: 5000, // Max 5 seconds delay
  backoffMultiplier: 2,
  timeoutMs: 10000, // 10 second timeout for validation
};

/**
 * Check if an error is retryable for validation
 * Validation errors (4xx, except 429) are NOT retryable
 */
export function isValidationRetryableError(error: unknown): boolean {
  // Don't retry on validation errors (400, 422)
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    const status = response?.status;
    
    if (status === 400 || status === 422) {
      // Validation errors - not retryable
      return false;
    }
  }

  // Retry on network errors, timeouts, and server errors
  return isRetryableError(error);
}

/**
 * Retry validation with exponential backoff and timeout
 * 
 * @param operation - The async validation operation to retry
 * @param config - Retry configuration
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function retryValidation<T>(
  operation: () => Promise<T>,
  config: Partial<ValidationRetryConfig> = {},
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Wrap operation with timeout
  const operationWithTimeout = async (): Promise<T> => {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Validatie timeout na ${finalConfig.timeoutMs}ms`));
        }, finalConfig.timeoutMs);
      }),
    ]);
  };

  // Use base retry utility but with validation-specific error checking
  return retryWithBackoff(
    operationWithTimeout,
    finalConfig,
    (attempt, error, delayMs) => {
      // Only retry if error is retryable
      if (!isValidationRetryableError(error)) {
        throw error; // Re-throw validation errors immediately
      }
      if (onRetry) {
        onRetry(attempt, error, delayMs);
      }
    }
  );
}

/**
 * Extract validation error details for field-specific error messages
 */
export function extractValidationErrors(error: unknown): {
  fieldErrors: Record<string, string>;
  generalError?: string;
} {
  const fieldErrors: Record<string, string> = {};
  let generalError: string | undefined;

  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;

    if (data && typeof data === 'object') {
      // Check for Zod-style errors
      if ('errors' in data && Array.isArray(data.errors)) {
        const errors = data.errors as Array<{ path: (string | number)[]; message: string }>;
        errors.forEach((err) => {
          const fieldPath = err.path.join('.');
          if (fieldPath) {
            fieldErrors[fieldPath] = err.message;
          } else {
            generalError = err.message;
          }
        });
      }

      // Check for field-specific errors
      if ('fieldErrors' in data && typeof data.fieldErrors === 'object') {
        Object.assign(fieldErrors, data.fieldErrors as Record<string, string>);
      }

      // Check for general error message
      if ('message' in data && typeof data.message === 'string') {
        generalError = data.message;
      }
    }
  }

  if (error instanceof Error && !generalError) {
    generalError = error.message;
  }

  return { fieldErrors, generalError };
}


