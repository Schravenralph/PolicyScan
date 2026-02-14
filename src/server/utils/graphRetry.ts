/**
 * Graph Retry Utility
 * 
 * Provides retry logic for graph operations with exponential backoff.
 */

import { logger } from './logger.js';

export interface GraphRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<GraphRetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ConnectionError',
    'ServiceUnavailable',
    'TransientError',
    'DatabaseUnavailable',
    'SessionExpired',
  ],
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (!error) {
    return false;
  }

  const errorName = error instanceof Error ? error.constructor.name : String(error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check error name
  if (retryableErrors.some((retryable) => errorName.includes(retryable))) {
    return true;
  }

  // Check error message
  if (retryableErrors.some((retryable) => errorMessage.includes(retryable))) {
    return true;
  }

  return false;
}

/**
 * Calculate delay for retry attempt
 */
function calculateDelay(attempt: number, options: Required<GraphRetryOptions>): number {
  const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(delay, options.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a graph operation with exponential backoff
 */
export async function withGraphRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: GraphRetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableErrors)) {
        logger.warn(
          { error, operationName, attempt },
          `Graph operation failed with non-retryable error: ${operationName}`
        );
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt >= opts.maxRetries) {
        logger.error(
          { error, operationName, attempts: attempt + 1 },
          `Graph operation failed after ${attempt + 1} attempts: ${operationName}`
        );
        throw error;
      }

      // Calculate delay and retry
      const delay = calculateDelay(attempt, opts);
      logger.warn(
        { error, operationName, attempt: attempt + 1, delay, maxRetries: opts.maxRetries },
        `Graph operation failed, retrying: ${operationName}`
      );

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Execute a graph operation with retry, returning null on failure instead of throwing
 */
export async function withGraphRetryOrNull<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: GraphRetryOptions = {}
): Promise<T | null> {
  try {
    return await withGraphRetry(operation, operationName, options);
  } catch (error) {
    logger.warn({ error, operationName }, `Graph operation failed after retries, returning null: ${operationName}`);
    return null;
  }
}


