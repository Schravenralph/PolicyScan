/**
 * Retry configuration for API requests
 */
interface RetryConfig {
    maxRetries?: number;
    retryDelay?: number;
    backoffMultiplier?: number;
    retryableStatusCodes?: number[];
    retryableErrors?: string[];
}
/**
 * Base API service with common functionality for all domain-specific services
 */
export declare abstract class BaseApiService {
    /**
     * Get authentication token from localStorage
     * Safe for non-browser contexts (SSR, test runners, privacy contexts)
     */
    protected getAuthToken(): string | null;
    /**
     * Generic request method with error handling, authentication, and retry logic
     *
     * Note: GET requests default to retry enabled. For GET endpoints that trigger
     * side effects (report generation, export kickoffs), explicitly set retry: false
     * to prevent duplicate work.
     */
    protected request<T>(endpoint: string, options?: RequestInit & {
        responseType?: 'json' | 'blob';
        timeout?: number;
        retry?: RetryConfig | boolean;
    }): Promise<T>;
    /**
     * GET request
     */
    protected get<T>(endpoint: string, options?: {
        responseType?: 'json' | 'blob';
    }): Promise<T>;
    /**
     * POST request
     */
    protected post<T>(endpoint: string, data?: unknown): Promise<T>;
    /**
     * PATCH request
     */
    protected patch<T>(endpoint: string, data?: unknown): Promise<T>;
    /**
     * PUT request
     */
    protected put<T>(endpoint: string, data?: unknown): Promise<T>;
    /**
     * DELETE request
     */
    protected delete<T>(endpoint: string): Promise<T>;
}
export {};
