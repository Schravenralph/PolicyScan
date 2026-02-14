/**
 * ActionExecution Model - MongoDB persistence for wizard action executions
 * 
 * This model enables:
 * - Action execution tracking for idempotency
 * - Action status monitoring
 * - Audit trail for wizard actions
 */

import { getDB } from '../config/database.js';
import { ObjectId, type UpdateFilter } from 'mongodb';
import { handleDatabaseOperation, DatabaseNotFoundError } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'action_executions';
let indexesEnsured = false;

/**
 * Action type enumeration
 */
export type ActionType = 
  | 'generateSuggestions'
  | 'confirmSelection'
  | 'startScan'
  | 'applyReviewDecisions';

/**
 * Action execution status
 */
export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * MongoDB document interface for action executions
 */
export interface ActionExecutionDocument {
  _id?: ObjectId;
  actionId: string;              // Unique action identifier (indexed)
  sessionId?: string;            // Wizard session ID (if applicable)
  queryId?: string;              // Query ID for idempotency (indexed)
  actionType: ActionType;        // Type of action
  status: ActionStatus;           // Current status
  result?: unknown;               // Action result (JSON)
  workflowRunId?: string;         // Linked workflow run (for startScan)
  createdAt: Date;
  completedAt?: Date;
  error?: string;                 // Error message if failed
}

/**
 * Input for creating an action execution
 */
export interface ActionExecutionCreateInput {
  actionId: string;
  sessionId?: string;
  queryId?: string;
  actionType: ActionType;
  status?: ActionStatus;
  result?: unknown;
  workflowRunId?: string;
  error?: string;
}

/**
 * Input for updating an action execution
 */
export interface ActionExecutionUpdateInput {
  status?: ActionStatus;
  result?: unknown;
  workflowRunId?: string;
  completedAt?: Date;
  error?: string;
}

/**
 * MongoDB model for action executions
 */
export class ActionExecution {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const db = getDB();
    if (!db) {
      throw new Error('Database not initialized');
    }

    const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);

    // Create indexes
    await collection.createIndex({ actionId: 1 }, { unique: true, background: true });
    
    // Compound index for findByQueryIdAndActionType query (queryId + actionType + createdAt sorting)
    await collection.createIndex(
      { queryId: 1, actionType: 1, createdAt: -1 },
      { background: true, name: 'idx_queryId_actionType_createdAt' }
    );
    
    // Compound index for findBySessionId query (sessionId + createdAt sorting)
    await collection.createIndex(
      { sessionId: 1, createdAt: -1 },
      { background: true, name: 'idx_sessionId_createdAt' }
    );
    
    // Index on createdAt for sorting (legacy, kept for backward compatibility)
    await collection.createIndex({ createdAt: 1 }, { background: true });

    indexesEnsured = true;
  }

  /**
   * Create a new action execution
   */
  static async create(input: ActionExecutionCreateInput): Promise<ActionExecutionDocument> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!db) {
        throw new Error('Database not initialized');
      }

      const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);

      const document: ActionExecutionDocument = {
        actionId: input.actionId,
        sessionId: input.sessionId,
        queryId: input.queryId,
        actionType: input.actionType,
        status: input.status || 'pending',
        result: input.result,
        workflowRunId: input.workflowRunId,
        createdAt: new Date(),
        error: input.error,
      };

      const result = await collection.insertOne(document);
      
      if (!result.insertedId) {
        throw new Error('Failed to create action execution');
      }

      return {
        ...document,
        _id: result.insertedId,
      };
    });
  }

  /**
   * Find action execution by actionId
   */
  static async findById(actionId: string): Promise<ActionExecutionDocument | null> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!db) {
        throw new Error('Database not initialized');
      }

      const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);
      const document = await collection.findOne({ actionId });

      return document || null;
    });
  }

  /**
   * Find action execution by queryId and actionType (for idempotency checks)
   */
  static async findByQueryId(
    queryId: string,
    actionType: ActionType
  ): Promise<ActionExecutionDocument | null> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!db) {
        throw new Error('Database not initialized');
      }

      const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);
      const document = await collection.findOne(
        { queryId, actionType },
        { sort: { createdAt: -1 } } // Get most recent
      );

      return document || null;
    });
  }

  /**
   * Find action executions by sessionId
   */
  static async findBySessionId(sessionId: string): Promise<ActionExecutionDocument[]> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!db) {
        throw new Error('Database not initialized');
      }

      const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);
      const documents = await collection
        .find({ sessionId })
        .sort({ createdAt: -1 })
        .toArray();

      return documents;
    });
  }

  /**
   * Update an action execution
   */
  static async update(
    actionId: string,
    updates: ActionExecutionUpdateInput
  ): Promise<ActionExecutionDocument> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!db) {
        throw new Error('Database not initialized');
      }

      const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);

      const updateFilter: UpdateFilter<ActionExecutionDocument> = {
        $set: {
          ...updates,
          ...(updates.completedAt === undefined && 
              (updates.status === 'completed' || updates.status === 'failed')
            ? { completedAt: new Date() }
            : {}),
        },
      };

      const result = await collection.findOneAndUpdate(
        { actionId },
        updateFilter,
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new DatabaseNotFoundError(`Action execution not found: ${actionId}`);
      }

      return result;
    });
  }

  /**
   * Delete an action execution (for cleanup/testing)
   */
  static async delete(actionId: string): Promise<boolean> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!db) {
        throw new Error('Database not initialized');
      }

      const collection = db.collection<ActionExecutionDocument>(COLLECTION_NAME);
      const result = await collection.deleteOne({ actionId });

      return result.deletedCount > 0;
    });
  }
}

