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
/**
 * Check if an error is retryable (network error or 5xx server error)
 */
export declare function isRetryableError(error: unknown, retryableStatusCodes?: number[]): boolean;
/**
 * Retry an operation with exponential backoff
 *
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export declare function retryWithBackoff<T>(operation: () => Promise<T>, config?: Partial<RetryConfig>, onRetry?: (attempt: number, error: unknown, delayMs: number) => void): Promise<T>;
/**
 * Retry session creation with exponential backoff
 * Specialized wrapper for session creation operations
 */
export declare function retrySessionCreation<T>(operation: () => Promise<T>, onRetry?: (attempt: number, error: unknown, delayMs: number) => void): Promise<T>;
