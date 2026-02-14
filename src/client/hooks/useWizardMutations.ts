/**
 * useWizardMutations Hook
 * 
 * Centralized tracking of pending wizard mutations and request cancellation.
 * Prevents double-clicks, multi-tab issues, and navigation mid-request bugs.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseWizardMutationsReturn {
  isPending: boolean;
  pendingOperations: Set<string>;
  startOperation: (operationId: string) => AbortController;
  completeOperation: (operationId: string) => void;
  cancelOperation: (operationId: string) => void;
  cancelAll: () => void;
  hasUnsavedChanges: boolean;
}

/**
 * Custom hook for tracking wizard mutations and managing request cancellation
 */
export function useWizardMutations(): UseWizardMutationsReturn {
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel all pending operations on unmount
      abortControllersRef.current.forEach((controller) => {
        controller.abort();
      });
      abortControllersRef.current.clear();
    };
  }, []);

  const startOperation = useCallback((operationId: string): AbortController => {
    // Cancel any existing operation with the same ID
    const existingController = abortControllersRef.current.get(operationId);
    if (existingController) {
      existingController.abort();
    }

    // Create new AbortController for this operation
    const controller = new AbortController();
    abortControllersRef.current.set(operationId, controller);

    setPendingOperations((prev) => {
      const next = new Set(prev);
      next.add(operationId);
      return next;
    });

    return controller;
  }, []);

  const completeOperation = useCallback((operationId: string) => {
    abortControllersRef.current.delete(operationId);
    setPendingOperations((prev) => {
      const next = new Set(prev);
      next.delete(operationId);
      return next;
    });
  }, []);

  const cancelOperation = useCallback((operationId: string) => {
    const controller = abortControllersRef.current.get(operationId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(operationId);
      setPendingOperations((prev) => {
        const next = new Set(prev);
        next.delete(operationId);
        return next;
      });
    }
  }, []);

  const cancelAll = useCallback(() => {
    abortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    abortControllersRef.current.clear();
    setPendingOperations(new Set());
  }, []);

  const isPending = pendingOperations.size > 0;
  const hasUnsavedChanges = isPending;

  return {
    isPending,
    pendingOperations,
    startOperation,
    completeOperation,
    cancelOperation,
    cancelAll,
    hasUnsavedChanges,
  };
}
