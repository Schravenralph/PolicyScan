/**
 * Operation Lock Utility
 * 
 * Provides utilities for locking operations to prevent concurrent execution.
 */

import React from 'react';

export interface OperationLock {
  isLocked: boolean;
  operationId: string | null;
  lockTime: number | null;
}

class OperationLockManager {
  private locks: Map<string, OperationLock> = new Map();

  /**
   * Lock an operation
   */
  lock(operationId: string): boolean {
    const existingLock = this.locks.get(operationId);
    if (existingLock?.isLocked) {
      return false; // Already locked
    }

    this.locks.set(operationId, {
      isLocked: true,
      operationId,
      lockTime: Date.now(),
    });

    return true;
  }

  /**
   * Unlock an operation
   */
  unlock(operationId: string): boolean {
    const lock = this.locks.get(operationId);
    if (!lock || !lock.isLocked) {
      return false; // Not locked
    }

    this.locks.set(operationId, {
      isLocked: false,
      operationId: null,
      lockTime: null,
    });

    return true;
  }

  /**
   * Check if an operation is locked
   */
  isLocked(operationId: string): boolean {
    const lock = this.locks.get(operationId);
    return lock?.isLocked ?? false;
  }

  /**
   * Get lock status
   */
  getLockStatus(operationId: string): OperationLock {
    return (
      this.locks.get(operationId) ?? {
        isLocked: false,
        operationId: null,
        lockTime: null,
      }
    );
  }

  /**
   * Clear all locks (useful for cleanup)
   */
  clearAll(): void {
    this.locks.clear();
  }

  /**
   * Clear expired locks (locks older than maxAge)
   */
  clearExpired(maxAge: number = 5 * 60 * 1000): void {
    const now = Date.now();
    for (const [operationId, lock] of this.locks.entries()) {
      if (lock.isLocked && lock.lockTime && now - lock.lockTime > maxAge) {
        this.unlock(operationId);
      }
    }
  }
}

// Singleton instance
const operationLockManager = new OperationLockManager();

// Clean up expired locks periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    operationLockManager.clearExpired();
  }, 60000); // Check every minute
}

/**
 * Lock an operation
 */
export function lockOperation(operationId: string): boolean {
  return operationLockManager.lock(operationId);
}

/**
 * Unlock an operation
 */
export function unlockOperation(operationId: string): boolean {
  return operationLockManager.unlock(operationId);
}

/**
 * Check if an operation is locked
 */
export function isOperationLocked(operationId: string): boolean {
  return operationLockManager.isLocked(operationId);
}

/**
 * Get lock status
 */
export function getLockStatus(operationId: string): OperationLock {
  return operationLockManager.getLockStatus(operationId);
}

/**
 * Execute an operation with automatic locking
 */
export async function withOperationLock<T>(
  operationId: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!lockOperation(operationId)) {
    throw new Error(`Operation ${operationId} is already in progress`);
  }

  try {
    return await operation();
  } finally {
    unlockOperation(operationId);
  }
}

/**
 * React hook for operation locking
 */
export function useOperationLock(operationId: string) {
  const [isLocked, setIsLocked] = React.useState(false);

  React.useEffect(() => {
    const checkLock = () => {
      setIsLocked(isOperationLocked(operationId));
    };

    checkLock();
    const interval = setInterval(checkLock, 100);
    return () => clearInterval(interval);
  }, [operationId]);

  const lock = React.useCallback(() => {
    const success = lockOperation(operationId);
    if (success) {
      setIsLocked(true);
    }
    return success;
  }, [operationId]);

  const unlock = React.useCallback(() => {
    const success = unlockOperation(operationId);
    if (success) {
      setIsLocked(false);
    }
    return success;
  }, [operationId]);

  return {
    isLocked,
    lock,
    unlock,
  };
}

