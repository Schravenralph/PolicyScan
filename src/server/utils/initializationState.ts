/**
 * Utility for tracking async initialization state
 * 
 * Provides a pattern for tracking whether async operations have completed,
 * failed, or are still in progress. This helps prevent using services
 * before they're ready and provides better error messages.
 */

export enum InitializationStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface InitializationState {
  status: InitializationStatus;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Tracks initialization state for async operations
 */
export class InitializationTracker {
  private state: InitializationStatus = InitializationStatus.NOT_STARTED;
  private error: Error | undefined;
  private startedAt: Date | undefined;
  private completedAt: Date | undefined;
  private retryCount = 0;
  private maxRetries: number;
  private retryDelay: number;

  constructor(options: { maxRetries?: number; retryDelay?: number } = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
  }

  /**
   * Mark initialization as started
   */
  start(): void {
    this.state = InitializationStatus.IN_PROGRESS;
    this.startedAt = new Date();
    this.error = undefined;
  }

  /**
   * Mark initialization as completed
   */
  complete(): void {
    this.state = InitializationStatus.COMPLETED;
    this.completedAt = new Date();
    this.error = undefined;
  }

  /**
   * Mark initialization as failed
   */
  fail(error: Error): void {
    this.state = InitializationStatus.FAILED;
    this.error = error;
    this.completedAt = new Date();
  }

  /**
   * Get current state
   */
  getState(): InitializationState {
    return {
      status: this.state,
      error: this.error,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }

  /**
   * Check if initialization is completed
   */
  isReady(): boolean {
    return this.state === InitializationStatus.COMPLETED;
  }

  /**
   * Check if initialization has failed
   */
  hasFailed(): boolean {
    return this.state === InitializationStatus.FAILED;
  }

  /**
   * Check if initialization is in progress
   */
  isInProgress(): boolean {
    return this.state === InitializationStatus.IN_PROGRESS;
  }

  /**
   * Ensure service is ready, throw if not
   */
  ensureReady(serviceName: string): void {
    if (!this.isReady()) {
      if (this.hasFailed()) {
        throw new Error(
          `${serviceName} initialization failed: ${this.error?.message ?? 'Unknown error'}. ` +
          `Started at: ${this.startedAt?.toISOString()}, Failed at: ${this.completedAt?.toISOString()}`
        );
      }
      if (this.isInProgress()) {
        throw new Error(
          `${serviceName} is still initializing. Started at: ${this.startedAt?.toISOString()}`
        );
      }
      throw new Error(`${serviceName} has not been initialized`);
    }
  }

  /**
   * Reset state (useful for retries)
   */
  reset(): void {
    this.state = InitializationStatus.NOT_STARTED;
    this.error = undefined;
    this.startedAt = undefined;
    this.completedAt = undefined;
  }

  /**
   * Increment retry count
   */
  incrementRetry(): number {
    this.retryCount++;
    return this.retryCount;
  }

  /**
   * Check if more retries are allowed
   */
  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  /**
   * Get retry delay with exponential backoff
   */
  getRetryDelay(): number {
    return this.retryDelay * Math.pow(2, this.retryCount);
  }
}

/**
 * Wrapper for async initialization with retry logic
 */
export async function initializeWithRetry<T>(
  tracker: InitializationTracker,
  initFn: () => Promise<T>,
  serviceName: string
): Promise<T> {
  while (true) {
    try {
      tracker.start();
      const result = await initFn();
      tracker.complete();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      tracker.fail(err);

      if (!tracker.canRetry()) {
        throw new Error(
          `${serviceName} initialization failed after ${tracker.incrementRetry()} attempts: ${err.message}`
        );
      }

      const delay = tracker.getRetryDelay();
      tracker.incrementRetry();
      tracker.reset();

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Wrapper for fire-and-forget async operations with proper error handling
 */
export function fireAndForget(
  promise: Promise<unknown>,
  context: { service: string; operation: string; logger?: { error: (obj: unknown, msg: string) => void } }
): void {
  promise.catch((error) => {
    const errorContext = {
      service: context.service,
      operation: context.operation,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };

    if (context.logger) {
      context.logger.error(errorContext, `Fire-and-forget operation failed: ${context.service}.${context.operation}`);
    } else {
      console.error('Fire-and-forget operation failed:', errorContext);
    }
  });
}















