/**
 * Utility for retrying website generation operations with exponential backoff
 * Handles transient failures (network errors, 5xx server errors, rate limits) but not client errors (4xx)
 */
export interface WebsiteGenerationRetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableStatusCodes: number[];
}
/**
 * Check if an error is retryable for website generation
 * Includes rate limit (429) and server errors (5xx)
 */
export declare function isWebsiteGenerationRetryableError(error: unknown, retryableStatusCodes?: number[]): boolean;
/**
 * Retry website generation with exponential backoff
 *
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export declare function retryWebsiteGeneration<T>(operation: () => Promise<T>, config?: Partial<WebsiteGenerationRetryConfig>, onRetry?: (attempt: number, error: unknown, delayMs: number) => void): Promise<T>;
/**
 * Extract error type for better error messages
 */
export declare function getWebsiteGenerationErrorType(error: unknown): {
    type: 'rate_limit' | 'api_error' | 'timeout' | 'network' | 'auth' | 'unknown';
    message: string;
    retryable: boolean;
};
