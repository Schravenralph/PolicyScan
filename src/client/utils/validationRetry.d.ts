/**
 * Utility for retrying validation operations with exponential backoff
 * Handles transient failures (network errors, timeouts) but not validation errors
 */
export interface ValidationRetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    timeoutMs: number;
}
/**
 * Check if an error is retryable for validation
 * Validation errors (4xx, except 429) are NOT retryable
 */
export declare function isValidationRetryableError(error: unknown): boolean;
/**
 * Retry validation with exponential backoff and timeout
 *
 * @param operation - The async validation operation to retry
 * @param config - Retry configuration
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export declare function retryValidation<T>(operation: () => Promise<T>, config?: Partial<ValidationRetryConfig>, onRetry?: (attempt: number, error: unknown, delayMs: number) => void): Promise<T>;
/**
 * Extract validation error details for field-specific error messages
 */
export declare function extractValidationErrors(error: unknown): {
    fieldErrors: Record<string, string>;
    generalError?: string;
};
