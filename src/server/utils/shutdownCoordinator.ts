import { logger } from './logger.js';

type ShutdownHandler = () => Promise<void> | void;
type CleanupOperation = {
  name: string;
  handler: ShutdownHandler;
  timeout?: number; // Optional timeout in milliseconds
};

/**
 * Shutdown coordinator for managing graceful shutdown operations
 * 
 * Ensures all cleanup operations are executed in the correct order
 * with proper timeout handling and error recovery.
 */
export class ShutdownCoordinator {
  private cleanupOperations: CleanupOperation[] = [];
  private isShuttingDown = false;
  private shutdownTimeout: number;
  
  constructor(shutdownTimeoutMs: number = 30000) {
    this.shutdownTimeout = shutdownTimeoutMs;
  }

  /**
   * Register a cleanup operation to be executed during shutdown
   * @param name - Descriptive name for the cleanup operation
   * @param handler - Async function to execute during shutdown
   * @param timeout - Optional timeout in milliseconds for this specific operation
   */
  register(name: string, handler: ShutdownHandler, timeout?: number): void {
    this.cleanupOperations.push({ name, handler, timeout });
  }

  /**
   * Execute all registered cleanup operations in order
   * @param signal - Signal that triggered shutdown (for logging)
   * @returns Promise that resolves when shutdown completes
   */
  async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, forcing exit');
      return;
    }

    this.isShuttingDown = true;
    logger.info({ signal, operationsCount: this.cleanupOperations.length }, 'Starting graceful shutdown');

    const shutdownTimeout = setTimeout(() => {
      logger.error({ reason: 'timeout' }, 'Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Execute all cleanup operations in order
      for (const operation of this.cleanupOperations) {
        await this.executeOperation(operation);
      }

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed successfully');
    } catch (error) {
      logger.error({ error }, 'Error during graceful shutdown');
      clearTimeout(shutdownTimeout);
      // Still exit even if there were errors
      throw error;
    }
  }

  /**
   * Execute a single cleanup operation with optional timeout
   */
  private async executeOperation(operation: CleanupOperation): Promise<void> {
    const { name, handler, timeout } = operation;
    
    try {
      if (timeout) {
        // Execute with timeout
        await Promise.race([
          Promise.resolve(handler()),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Operation ${name} timed out after ${timeout}ms`)), timeout)
          )
        ]);
      } else {
        // Execute without timeout
        await Promise.resolve(handler());
      }
      logger.debug({ operation: name }, 'Cleanup operation completed');
    } catch (error) {
      // Log error but continue with other operations
      logger.error({ error, operation: name }, 'Error during cleanup operation (continuing with shutdown)');
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDownStatus(): boolean {
    return this.isShuttingDown;
  }
}

// Singleton instance
let shutdownCoordinatorInstance: ShutdownCoordinator | null = null;

/**
 * Get or create the shutdown coordinator singleton
 */
export function getShutdownCoordinator(): ShutdownCoordinator {
  if (!shutdownCoordinatorInstance) {
    shutdownCoordinatorInstance = new ShutdownCoordinator();
  }
  return shutdownCoordinatorInstance;
}

/**
 * Reset the shutdown coordinator (mainly for testing)
 */
export function resetShutdownCoordinator(): void {
  shutdownCoordinatorInstance = null;
}
