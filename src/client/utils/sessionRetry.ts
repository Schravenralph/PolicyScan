/**
 * Utility for retrying session creation operations with exponential backoff
 * Handles transient failures (network errors, 5xx server errors) but not client errors (4xx)
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [500, 502, 503, 504, 429],
};

/**
 * Check if an error is retryable (network error or 5xx server error)
 */
export function isRetryableError(error: unknown, retryableStatusCodes: number[] = DEFAULT_CONFIG.retryableStatusCodes): boolean {
  // Network errors (no response)
  if (error instanceof Error) {
    const networkErrorMessages = ['network', 'timeout', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'];
    if (networkErrorMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()))) {
      return true;
    }
  }

  // HTTP errors with status codes
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    const status = response?.status;
    if (status !== undefined) {
      // Retry on 5xx server errors and rate limits (429)
      if (retryableStatusCodes.includes(status)) {
        return true;
      }
      // Don't retry on 4xx client errors (except 429 which is already handled)
      if (status >= 400 && status < 500) {
        return false;
      }
    }
  }

  // Timeout errors
  if (error instanceof Error && error.name === 'TimeoutError') {
    return true;
  }

  return false;
}

/**
 * Get delay for retry attempt with exponential backoff
 */
function getRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Retry an operation with exponential backoff
 * 
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // If this is the last attempt or error is not retryable, throw
      if (attempt >= finalConfig.maxAttempts || !isRetryableError(error, finalConfig.retryableStatusCodes)) {
        throw error;
      }

      // Calculate delay and wait before retrying
      const delayMs = getRetryDelay(attempt, finalConfig);
      
      if (onRetry) {
        onRetry(attempt + 1, error, delayMs);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Retry session creation with exponential backoff
 * Specialized wrapper for session creation operations
 */
export async function retrySessionCreation<T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  return retryWithBackoff(operation, DEFAULT_CONFIG, onRetry);
}


