/**
 * Workflow Transaction Service
 * 
 * Provides transaction support for workflow database operations.
 * Uses MongoDB sessions to ensure atomicity for multi-step operations.
 */

import { getDB } from '../../config/database.js';
import { ClientSession } from 'mongodb';
import { logger } from '../../utils/logger.js';

/**
 * Transaction options
 */
export interface TransactionOptions {
  /**
   * Maximum time to wait for transaction commit (milliseconds)
   * Default: 30 seconds
   */
  maxCommitTimeMS?: number;
  
  /**
   * Read concern level
   * Default: 'majority' for read operations
   */
  readConcern?: 'local' | 'available' | 'majority' | 'snapshot' | 'linearizable';
  
  /**
   * Write concern level
   * Default: 'majority' for write operations
   */
  writeConcern?: { w: number | 'majority'; wtimeout?: number };
}

/**
 * Result of a transaction operation
 */
export interface TransactionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
}

/**
 * Service for managing workflow database transactions
 */
export class WorkflowTransactionService {
  /**
   * Execute a function within a MongoDB transaction
   * 
   * @param operation - Function to execute within transaction
   * @param options - Transaction options
   * @returns Transaction result
   */
  async executeInTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const db = getDB();
    const session = db.client.startSession();
    
    const {
      maxCommitTimeMS = 30000,
      readConcern = 'majority',
      writeConcern = { w: 'majority', wtimeout: 5000 }
    } = options;

    try {
      // Start transaction
      session.startTransaction({
        readConcern: { level: readConcern },
        writeConcern,
        maxTimeMS: maxCommitTimeMS,
      });

      // Execute operation
      const result = await operation(session);

      // Commit transaction
      await session.commitTransaction();
      
      logger.debug('Transaction committed successfully');
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      // Abort transaction on error
      try {
        await session.abortTransaction();
        logger.debug('Transaction aborted due to error');
      } catch (abortError) {
        logger.error({ error: abortError }, 'Failed to abort transaction');
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, errorMessage }, 'Transaction failed');

      return {
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    } finally {
      // End session
      await session.endSession();
    }
  }

  /**
   * Check if transactions are supported by the MongoDB deployment
   * 
   * @returns True if transactions are supported (replica set or sharded cluster)
   */
  async isTransactionSupported(): Promise<boolean> {
    try {
      const db = getDB();
      const adminDb = db.admin();
      const serverStatus = await adminDb.serverStatus();
      
      // Transactions require replica set or sharded cluster
      // Standalone MongoDB instances don't support transactions
      return serverStatus.repl !== undefined || serverStatus.process === 'mongos';
    } catch (error) {
      logger.warn({ error }, 'Could not determine transaction support, assuming false');
      return false;
    }
  }
}

// Singleton instance
let transactionService: WorkflowTransactionService | null = null;

/**
 * Get the singleton WorkflowTransactionService instance
 */
export function getWorkflowTransactionService(): WorkflowTransactionService {
  if (!transactionService) {
    transactionService = new WorkflowTransactionService();
  }
  return transactionService;
}


