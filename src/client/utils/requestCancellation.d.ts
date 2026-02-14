/**
 * Request Cancellation Utility
 *
 * Provides utilities for cancelling in-flight requests when navigating away.
 */
export interface CancellableRequest {
    abortController: AbortController;
    requestId: string;
    timestamp: number;
}
/**
 * Register a cancellable request
 */
export declare function registerCancellableRequest(requestId: string, abortController: AbortController): void;
/**
 * Cancel a specific request
 */
export declare function cancelRequest(requestId: string): boolean;
/**
 * Cancel all requests
 */
export declare function cancelAllRequests(): void;
/**
 * Cancel requests matching a pattern
 */
export declare function cancelMatchingRequests(pattern: string | RegExp): number;
/**
 * Unregister a request
 */
export declare function unregisterRequest(requestId: string): boolean;
/**
 * Get active request count
 */
export declare function getActiveRequestCount(): number;
/**
 * Create a cancellable fetch request
 */
export declare function createCancellableFetch(requestId: string, url: string, options?: RequestInit): Promise<Response>;
/**
 * React hook for request cancellation on navigation
 */
export declare function useRequestCancellationOnNavigation(): void;
