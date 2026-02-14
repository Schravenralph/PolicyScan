/**
 * Request Cancellation Utility
 * 
 * Provides utilities for cancelling in-flight requests when navigating away.
 */

import React from 'react';

export interface CancellableRequest {
  abortController: AbortController;
  requestId: string;
  timestamp: number;
}

class RequestCancellationManager {
  private requests: Map<string, CancellableRequest> = new Map();

  /**
   * Register a cancellable request
   */
  register(requestId: string, abortController: AbortController): void {
    this.requests.set(requestId, {
      abortController,
      requestId,
      timestamp: Date.now(),
    });
  }

  /**
   * Cancel a specific request
   */
  cancel(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request) {
      return false;
    }

    request.abortController.abort();
    this.requests.delete(requestId);
    return true;
  }

  /**
   * Cancel all requests
   */
  cancelAll(): void {
    for (const request of this.requests.values()) {
      request.abortController.abort();
    }
    this.requests.clear();
  }

  /**
   * Cancel requests matching a pattern
   */
  cancelMatching(pattern: string | RegExp): number {
    let cancelled = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const [requestId, request] of this.requests.entries()) {
      if (regex.test(requestId)) {
        request.abortController.abort();
        this.requests.delete(requestId);
        cancelled++;
      }
    }

    return cancelled;
  }

  /**
   * Unregister a request (when it completes)
   */
  unregister(requestId: string): boolean {
    return this.requests.delete(requestId);
  }

  /**
   * Get active request count
   */
  getActiveCount(): number {
    return this.requests.size;
  }
}

// Singleton instance
const requestCancellationManager = new RequestCancellationManager();

/**
 * Register a cancellable request
 */
export function registerCancellableRequest(
  requestId: string,
  abortController: AbortController
): void {
  requestCancellationManager.register(requestId, abortController);
}

/**
 * Cancel a specific request
 */
export function cancelRequest(requestId: string): boolean {
  return requestCancellationManager.cancel(requestId);
}

/**
 * Cancel all requests
 */
export function cancelAllRequests(): void {
  requestCancellationManager.cancelAll();
}

/**
 * Cancel requests matching a pattern
 */
export function cancelMatchingRequests(pattern: string | RegExp): number {
  return requestCancellationManager.cancelMatching(pattern);
}

/**
 * Unregister a request
 */
export function unregisterRequest(requestId: string): boolean {
  return requestCancellationManager.unregister(requestId);
}

/**
 * Get active request count
 */
export function getActiveRequestCount(): number {
  return requestCancellationManager.getActiveCount();
}

/**
 * Create a cancellable fetch request
 */
export function createCancellableFetch(
  requestId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const abortController = new AbortController();
  const signal = abortController.signal;

  registerCancellableRequest(requestId, abortController);

  return fetch(url, {
    ...options,
    signal,
  })
    .finally(() => {
      unregisterRequest(requestId);
    });
}

/**
 * React hook for request cancellation on navigation
 */
export function useRequestCancellationOnNavigation() {
  React.useEffect(() => {
    // Cancel requests when component unmounts (navigation)
    return () => {
      cancelAllRequests();
    };
  }, []);
}

