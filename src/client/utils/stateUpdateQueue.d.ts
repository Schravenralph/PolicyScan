/**
 * State Update Queue - Prevents race conditions in async state updates
 *
 * Queues state updates and processes them sequentially to prevent
 * race conditions from concurrent async operations.
 */
export interface StateUpdate<T> {
    id: string;
    updateFn: (prevState: T) => T;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
    priority?: number;
}
export interface StateUpdateQueueStatus {
    isProcessing: boolean;
    queueLength: number;
    currentUpdate?: {
        id: string;
        timestamp: number;
    };
}
/**
 * Generic state update queue manager
 */
declare class StateUpdateQueue<T> {
    private queue;
    private isProcessing;
    private currentUpdate;
    private currentState;
    constructor(initialState: T);
    /**
     * Update current state (for tracking)
     */
    setState(state: T): void;
    /**
     * Get current state
     */
    getState(): T;
    /**
     * Enqueue a state update
     * Returns a promise that resolves with the updated state
     */
    enqueue(updateFn: (prevState: T) => T, options?: {
        id?: string;
        priority?: number;
    }): Promise<T>;
    /**
     * Process the queue sequentially
     */
    private processQueue;
    /**
     * Clear all pending updates
     */
    clear(): void;
    /**
     * Get queue status
     */
    getStatus(): StateUpdateQueueStatus;
    /**
     * Check if queue is empty
     */
    isEmpty(): boolean;
}
/**
 * Create a state update queue instance
 */
export declare function createStateUpdateQueue<T>(initialState: T): StateUpdateQueue<T>;
export {};
