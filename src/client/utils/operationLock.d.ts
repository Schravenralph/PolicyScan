/**
 * Operation Lock Utility
 *
 * Provides utilities for locking operations to prevent concurrent execution.
 */
export interface OperationLock {
    isLocked: boolean;
    operationId: string | null;
    lockTime: number | null;
}
/**
 * Lock an operation
 */
export declare function lockOperation(operationId: string): boolean;
/**
 * Unlock an operation
 */
export declare function unlockOperation(operationId: string): boolean;
/**
 * Check if an operation is locked
 */
export declare function isOperationLocked(operationId: string): boolean;
/**
 * Get lock status
 */
export declare function getLockStatus(operationId: string): OperationLock;
/**
 * Execute an operation with automatic locking
 */
export declare function withOperationLock<T>(operationId: string, operation: () => Promise<T>): Promise<T>;
/**
 * React hook for operation locking
 */
export declare function useOperationLock(operationId: string): {
    isLocked: boolean;
    lock: () => boolean;
    unlock: () => boolean;
};
