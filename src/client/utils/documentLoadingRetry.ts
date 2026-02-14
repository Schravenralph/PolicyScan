/**
 * Document Loading Retry Utility
 * 
 * Provides automatic retry functionality with exponential backoff for document loading.
 */

import { logError } from './errorHandler';

export interface DocumentLoadingRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface DocumentLoadingRetryResult<T> {
  success: boolean;
  result?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // Network errors are retryable
  const retryablePatterns = [
    'network',
    'timeout',
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'failed to fetch',
    'aborted',
  ];

  // Check error message
  if (retryablePatterns.some(pattern => errorMessage.includes(pattern))) {
    return true;
  }

  // Check error name
  if (retryablePatterns.some(pattern => errorName.includes(pattern))) {
    return true;
  }

  // HTTP 5xx errors are retryable
  if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
    return true;
  }

  // HTTP 429 (rate limit) is retryable
  if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
    return true;
  }

  // Don't retry on 4xx errors (except 429)
  if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('404')) {
    return false;
  }

  return false;
}

/**
 * Retry document loading operation with exponential backoff
 */
export async function withDocumentLoadingRetry<T>(
  operation: () => Promise<T>,
  options?: DocumentLoadingRetryOptions
): Promise<DocumentLoadingRetryResult<T>> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    factor = 2,
    shouldRetry = isRetryableError,
    onRetry,
  } = options || {};

  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;

    try {
      const result = await operation();
      return {
        success: true,
        result,
        attempts,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry (call shouldRetry to allow custom logic/logging)
      const canRetry = attempt < maxRetries;
      const shouldRetryThisError = shouldRetry(error);

      if (canRetry && shouldRetryThisError) {
        const delay = Math.min(
          initialDelayMs * Math.pow(factor, attempt),
          maxDelayMs
        );

        // Notify about retry
        if (onRetry) {
          try {
            onRetry(attempt + 1, error);
          } catch (retryError) {
            logError(retryError, 'document-loading-retry-callback');
          }
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry - return error
      return {
        success: false,
        error,
        attempts,
      };
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: lastError,
    attempts,
  };
}

/**
 * Validate query ID format (basic validation)
 */
export function validateQueryId(queryId: string | null | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!queryId) {
    return {
      valid: false,
      error: 'Query ID is required',
    };
  }

  if (typeof queryId !== 'string') {
    return {
      valid: false,
      error: 'Query ID must be a string',
    };
  }

  if (queryId.trim().length === 0) {
    return {
      valid: false,
      error: 'Query ID cannot be empty',
    };
  }

  // MongoDB ObjectId format validation (24 hex characters)
  if (!/^[0-9a-fA-F]{24}$/.test(queryId)) {
    return {
      valid: false,
      error: 'Query ID has invalid format',
    };
  }

  return {
    valid: true,
  };
}


