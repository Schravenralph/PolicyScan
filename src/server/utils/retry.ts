/**
 * Retry Utility with Exponential Backoff
 * 
 * Provides a centralized retry mechanism with exponential backoff for transient failures.
 * Supports configurable retry attempts, delays, and retryable error detection.
 */

import { logger } from './logger.js';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Exponential backoff multiplier (default: 2) */
  multiplier?: number;
  /** Function to determine if an error is retryable (default: retries on transient errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Custom delay function (overrides exponential backoff if provided) */
  getDelay?: (attempt: number, error: unknown) => number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'isRetryable' | 'getDelay'>> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
};

/**
 * Default retryable error detection
 * Retries on transient errors: 429, 500, 502, 503, 504, ECONNRESET, ETIMEDOUT
 */
function defaultIsRetryable(error: unknown): boolean {
  // Check for HTTP status codes
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status) {
      const status = response.status;
      // Retry on rate limit (429) and server errors (5xx)
      if (status === 429 || (status >= 500 && status < 600)) {
        return true;
      }
      // Don't retry on 4xx client errors (except 429)
      if (status >= 400 && status < 500) {
        return false;
      }
    }
  }

  // Check for ServiceConnectionError (has statusCode)
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status) {
      if (status === 429 || (status >= 500 && status < 600)) {
        return true;
      }
      if (status >= 400 && status < 500) {
        return false;
      }
    }
  }

  // Check for ServiceRateLimitError (by name)
  if (error && typeof error === 'object' && 'name' in error) {
    if ((error as { name?: string }).name === 'ServiceRateLimitError') {
      return true;
    }
  }

  // Check for network error codes
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
      return true;
    }
  }

  // Check for error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('etimedout')
    ) {
      return true;
    }
  }

  // Check for axios errors without response (network errors)
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosError = error as { response?: unknown; code?: string };
    if (!axiosError.response) {
      // Network error (no response) - retryable
      return true;
    }
  }

  return false;
}

/**
 * Calculate exponential backoff delay
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @param initialDelay - Initial delay in milliseconds
 * @param multiplier - Exponential multiplier
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
function calculateExponentialBackoff(
  attempt: number,
  initialDelay: number,
  multiplier: number,
  maxDelay: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Extract Retry-After header value from error response
 * 
 * @param error - The error object
 * @returns Retry-After value in milliseconds, or null if not present
 */
function getRetryAfterDelay(error: unknown): number | null {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { headers?: Record<string, string | string[]> } }).response;
    if (response?.headers) {
      const retryAfter = response.headers['retry-after'] || response.headers['Retry-After'];
      if (retryAfter) {
        const value = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
        const seconds = parseInt(value, 10);
        if (!isNaN(seconds) && seconds > 0) {
          return seconds * 1000; // Convert to milliseconds
        }
      }
    }
  }

  // Check for ServiceRateLimitError retryAfterSeconds
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    const seconds = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
    if (seconds && typeof seconds === 'number' && seconds > 0) {
      return seconds * 1000; // Convert to milliseconds
    }
  }

  return null;
}

/**
 * Retry an operation with exponential backoff
 * 
 * @param operation - The operation to retry (async function)
 * @param config - Retry configuration
 * @param context - Optional context for logging (e.g., operation name, URL)
 * @returns Result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {},
  context?: string
): Promise<T> {
  const {
    maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelay = DEFAULT_RETRY_CONFIG.initialDelay,
    maxDelay = DEFAULT_RETRY_CONFIG.maxDelay,
    multiplier = DEFAULT_RETRY_CONFIG.multiplier,
    isRetryable = defaultIsRetryable,
    getDelay,
  } = config;

  let lastError: unknown;
  const contextStr = context ? ` (${context})` : '';

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry if this was a retry attempt
      if (attempt > 0) {
        logger.info(
          {
            attempt: attempt + 1,
            maxAttempts: maxAttempts + 1,
            context,
          },
          `Operation succeeded after ${attempt} retry attempts${contextStr}`
        );
      }
      
      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryable(error)) {
        logger.debug(
          {
            attempt: attempt + 1,
            maxAttempts: maxAttempts + 1,
            error: error instanceof Error ? error.message : String(error),
            context,
          },
          `Non-retryable error encountered${contextStr}`
        );
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt >= maxAttempts) {
        logger.error(
          {
            attempt: attempt + 1,
            maxAttempts: maxAttempts + 1,
            error: error instanceof Error ? error.message : String(error),
            context,
          },
          `Operation failed after ${maxAttempts + 1} attempts${contextStr}`
        );
        throw error;
      }

      // Calculate delay
      let delay: number;
      if (getDelay) {
        delay = getDelay(attempt, error);
      } else {
        // Check for Retry-After header (for rate limit errors)
        const retryAfterDelay = getRetryAfterDelay(error);
        if (retryAfterDelay !== null) {
          delay = Math.min(retryAfterDelay, maxDelay);
          logger.warn(
            {
              attempt: attempt + 1,
              maxAttempts: maxAttempts + 1,
              delay,
              retryAfter: retryAfterDelay,
              context,
            },
            `Rate limit detected, using Retry-After header delay${contextStr}`
          );
        } else {
          delay = calculateExponentialBackoff(attempt, initialDelay, multiplier, maxDelay);
        }
      }

      logger.warn(
        {
          attempt: attempt + 1,
          maxAttempts: maxAttempts + 1,
          delay,
          error: error instanceof Error ? error.message : String(error),
          context,
        },
        `Retrying operation${contextStr} (attempt ${attempt + 1}/${maxAttempts + 1})`
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError || new Error('Operation failed after retries');
}

/**
 * Check if an error is retryable using default logic
 * 
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return defaultIsRetryable(error);
}


