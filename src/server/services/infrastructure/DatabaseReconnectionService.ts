/**
 * Database Reconnection Service
 * 
 * Provides enhanced reconnection functionality with operation queue
 * for maintaining operations during disconnection.
 */

import { ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { mongodbReconnectionAttempts } from '../../utils/metrics.js';

export interface QueuedOperation<T> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  context?: string;
}

export class DatabaseReconnectionService {
  private operationQueue: QueuedOperation<unknown>[] = [];
  private isProcessingQueue = false;
  private maxQueueSize = 1000;
  private maxOperationAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Queue an operation to be executed after reconnection
   */
  async queueOperation<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Check queue size
      if (this.operationQueue.length >= this.maxQueueSize) {
        reject(new Error('Operation queue is full. Please try again later.'));
        return;
      }

      const queuedOperation: QueuedOperation<T> = {
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
        context,
      };

      this.operationQueue.push(queuedOperation as QueuedOperation<unknown>);
      
      logger.debug(
        { queueLength: this.operationQueue.length, context },
        'Operation queued for execution after reconnection'
      );

      // Start processing queue if not already processing
      this.processQueue().catch(error => {
        logger.error({ error }, 'Failed to process operation queue');
      });
    });
  }

  /**
   * Process queued operations after reconnection
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Ensure connection is active before processing
      await ensureDBConnection();

      // Process operations in order
      while (this.operationQueue.length > 0) {
        const queuedOp = this.operationQueue.shift();
        if (!queuedOp) {
          continue;
        }

        // Check if operation is too old
        const age = Date.now() - queuedOp.timestamp;
        if (age > this.maxOperationAge) {
          logger.warn(
            { age, context: queuedOp.context },
            'Skipping queued operation that is too old'
          );
          queuedOp.reject(new Error('Operation timed out while waiting for reconnection'));
          continue;
        }

        try {
          const result = await queuedOp.operation();
          queuedOp.resolve(result);
          
          logger.debug(
            { context: queuedOp.context, queueLength: this.operationQueue.length },
            'Queued operation executed successfully'
          );
        } catch (error) {
          logger.error(
            { error, context: queuedOp.context },
            'Queued operation failed'
          );
          queuedOp.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to process operation queue');
      // Reject all remaining operations
      while (this.operationQueue.length > 0) {
        const queuedOp = this.operationQueue.shift();
        if (queuedOp) {
          queuedOp.reject(
            error instanceof Error ? error : new Error('Failed to reconnect to database')
          );
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    oldestOperationAge?: number;
  } {
    const oldestOperation = this.operationQueue[0];
    return {
      queueLength: this.operationQueue.length,
      isProcessing: this.isProcessingQueue,
      oldestOperationAge: oldestOperation
        ? Date.now() - oldestOperation.timestamp
        : undefined,
    };
  }

  /**
   * Clear operation queue
   */
  clearQueue(): void {
    const count = this.operationQueue.length;
    while (this.operationQueue.length > 0) {
      const queuedOp = this.operationQueue.shift();
      if (queuedOp) {
        queuedOp.reject(new Error('Operation queue cleared'));
      }
    }
    logger.info({ clearedCount: count }, 'Operation queue cleared');
  }

  /**
   * Wait for reconnection and retry operation
   */
  async waitForReconnection(
    operation: () => Promise<unknown>,
    maxWaitTime: number = 30000, // 30 seconds
    _context?: string
  ): Promise<unknown> {
    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = 10;

    while (Date.now() - startTime < maxWaitTime && attempt < maxAttempts) {
      try {
        await ensureDBConnection();
        // Connection is active, execute operation
        return await operation();
      } catch (error) {
        attempt++;
        const elapsed = Date.now() - startTime;
        const remaining = maxWaitTime - elapsed;

        if (remaining <= 0 || attempt >= maxAttempts) {
          throw new Error(
            `Failed to reconnect after ${attempt} attempts (${elapsed}ms). ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), remaining);
        await new Promise(resolve => setTimeout(resolve, delay));

        mongodbReconnectionAttempts.inc();
      }
    }

    throw new Error('Reconnection timeout exceeded');
  }
}

// Singleton instance
let reconnectionServiceInstance: DatabaseReconnectionService | null = null;

export function getDatabaseReconnectionService(): DatabaseReconnectionService {
  if (!reconnectionServiceInstance) {
    reconnectionServiceInstance = new DatabaseReconnectionService();
  }
  return reconnectionServiceInstance;
}


