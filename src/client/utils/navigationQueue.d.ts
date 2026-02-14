/**
 * Navigation Queue - Prevents concurrent navigation requests
 *
 * Queues navigation requests and processes them sequentially to prevent
 * revision conflicts from concurrent navigation attempts.
 */
export interface NavigationRequest {
    sessionId: string;
    targetStepId: string;
    revision?: number;
    resolve: (value: void) => void;
    reject: (error: Error) => void;
    timestamp: number;
}
export interface NavigationQueueStatus {
    isProcessing: boolean;
    queueLength: number;
    currentRequest?: {
        sessionId: string;
        targetStepId: string;
        timestamp: number;
    };
}
/**
 * Navigation queue manager
 */
declare class NavigationQueue {
    private queue;
    private isProcessing;
    private currentRequest;
    /**
     * Add a navigation request to the queue
     * Returns a promise that resolves when it's this request's turn to execute
     */
    enqueue(sessionId: string, targetStepId: string, revision?: number): Promise<() => void>;
    /**
     * Process the queue sequentially
     */
    private processQueue;
    /**
     * Clear all pending requests
     */
    clear(): void;
    /**
     * Get queue status
     */
    getStatus(): NavigationQueueStatus;
    /**
     * Check if a specific navigation is queued
     */
    isQueued(sessionId: string, targetStepId: string): boolean;
}
export declare const navigationQueue: NavigationQueue;
export {};
