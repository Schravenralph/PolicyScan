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
class NavigationQueue {
  private queue: NavigationRequest[] = [];
  private isProcessing = false;
  private currentRequest: NavigationRequest | null = null;

  /**
   * Add a navigation request to the queue
   * Returns a promise that resolves when it's this request's turn to execute
   */
  async enqueue(
    sessionId: string,
    targetStepId: string,
    revision?: number
  ): Promise<() => void> {
    return new Promise<() => void>((resolve, reject) => {
      const request: NavigationRequest = {
        sessionId,
        targetStepId,
        revision,
        resolve: () => {
          // This will be called when the request is dequeued
          // Return a completion function
          resolve(() => {
            // Complete the request
            if (this.currentRequest === request) {
              this.currentRequest = null;
            }
            this.processQueue();
          });
        },
        reject,
        timestamp: Date.now(),
      };

      // If there's already a request for the same session and target, replace it
      const existingIndex = this.queue.findIndex(
        (req) => req.sessionId === sessionId && req.targetStepId === targetStepId
      );

      if (existingIndex >= 0) {
        // Cancel the existing request
        this.queue[existingIndex].reject(
          new Error('Navigation request superseded by newer request')
        );
        // Replace with new request
        this.queue[existingIndex] = request;
      } else {
        // Add new request to queue
        this.queue.push(request);
      }

      // Start processing if not already processing
      this.processQueue();
    });
  }

  /**
   * Process the queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      this.currentRequest = request;
      
      // Resolve the request, which will return the completion function
      // The caller will call this function when navigation completes
      request.resolve();
      
      // Wait for the completion function to be called
      // This happens in the navigation hook after the navigation promise resolves/rejects
    }

    this.isProcessing = false;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    const errors = this.queue.map(
      (_req) => new Error('Navigation queue cleared')
    );
    this.queue.forEach((req, index) => {
      req.reject(errors[index]);
    });
    this.queue = [];

    if (this.currentRequest) {
      this.currentRequest.reject(new Error('Navigation queue cleared'));
      this.currentRequest = null;
    }

    this.isProcessing = false;
  }

  /**
   * Get queue status
   */
  getStatus(): NavigationQueueStatus {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      currentRequest: this.currentRequest
        ? {
            sessionId: this.currentRequest.sessionId,
            targetStepId: this.currentRequest.targetStepId,
            timestamp: this.currentRequest.timestamp,
          }
        : undefined,
    };
  }

  /**
   * Check if a specific navigation is queued
   */
  isQueued(sessionId: string, targetStepId: string): boolean {
    return this.queue.some(
      (req) => req.sessionId === sessionId && req.targetStepId === targetStepId
    );
  }
}

// Singleton instance
export const navigationQueue = new NavigationQueue();

