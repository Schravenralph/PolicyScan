/**
 * Document Loading Retry Utility
 *
 * Provides automatic retry functionality with exponential backoff for document loading.
 */
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
 * Retry document loading operation with exponential backoff
 */
export declare function withDocumentLoadingRetry<T>(operation: () => Promise<T>, options?: DocumentLoadingRetryOptions): Promise<DocumentLoadingRetryResult<T>>;
/**
 * Validate query ID format (basic validation)
 */
export declare function validateQueryId(queryId: string | null | undefined): {
    valid: boolean;
    error?: string;
};
