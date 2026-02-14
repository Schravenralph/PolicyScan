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
  priority?: number; // Higher priority updates are processed first
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
class StateUpdateQueue<T> {
  private queue: StateUpdate<T>[] = [];
  private isProcessing = false;
  private currentUpdate: StateUpdate<T> | null = null;
  private currentState: T;

  constructor(initialState: T) {
    this.currentState = initialState;
  }

  /**
   * Update current state (for tracking)
   */
  setState(state: T): void {
    this.currentState = state;
  }

  /**
   * Get current state
   */
  getState(): T {
    return this.currentState;
  }

  /**
   * Enqueue a state update
   * Returns a promise that resolves with the updated state
   */
  async enqueue(
    updateFn: (prevState: T) => T,
    options?: { id?: string; priority?: number }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = options?.id || `update-${Date.now()}-${Math.random()}`;
      const update: StateUpdate<T> = {
        id,
        updateFn,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: options?.priority || 0,
      };

      // If priority is specified, insert in priority order
      if (options?.priority !== undefined && options.priority > 0) {
        const insertIndex = this.queue.findIndex(
          (u) => (u.priority || 0) < options.priority!
        );
        if (insertIndex >= 0) {
          this.queue.splice(insertIndex, 0, update);
        } else {
          this.queue.push(update);
        }
      } else {
        this.queue.push(update);
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
      const update = this.queue.shift();
      if (!update) {
        break;
      }

      this.currentUpdate = update;

      try {
        // Apply update using functional update pattern
        const newState = update.updateFn(this.currentState);
        this.currentState = newState;
        update.resolve(newState);
      } catch (error) {
        update.reject(
          error instanceof Error ? error : new Error(String(error))
        );
      }

      this.currentUpdate = null;
    }

    this.isProcessing = false;
  }

  /**
   * Clear all pending updates
   */
  clear(): void {
    const errors = this.queue.map(
      (_update) => new Error('State update queue cleared')
    );
    this.queue.forEach((update, index) => {
      update.reject(errors[index]);
    });
    this.queue = [];

    if (this.currentUpdate) {
      this.currentUpdate.reject(new Error('State update queue cleared'));
      this.currentUpdate = null;
    }

    this.isProcessing = false;
  }

  /**
   * Get queue status
   */
  getStatus(): StateUpdateQueueStatus {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      currentUpdate: this.currentUpdate
        ? {
            id: this.currentUpdate.id,
            timestamp: this.currentUpdate.timestamp,
          }
        : undefined,
    };
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0 && !this.isProcessing;
  }
}

/**
 * Create a state update queue instance
 */
export function createStateUpdateQueue<T>(initialState: T): StateUpdateQueue<T> {
  return new StateUpdateQueue<T>(initialState);
}


