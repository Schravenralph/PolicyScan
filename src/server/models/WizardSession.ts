/**
 * WizardSession Model - MongoDB persistence for wizard session state
 * 
 * This model enables:
 * - Wizard session persistence and resumability
 * - Optimistic concurrency control via revision field
 * - Concurrent edit detection (two tabs scenario)
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import type {
  WizardSessionDocument,
  WizardSessionCreateInput,
  WizardSessionUpdateInput,
} from '../types/WizardSession.js';
import {
  handleDatabaseOperation,
  DatabaseNotFoundError,
} from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'wizard_sessions';
let indexesEnsured = false;

/**
 * Custom error for revision conflicts (optimistic locking)
 */
export class RevisionConflictError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly expectedRevision: number,
    public readonly actualRevision: number
  ) {
    super(
      `Revision conflict for session ${sessionId}: expected revision ${expectedRevision}, but found ${actualRevision}`
    );
    this.name = 'RevisionConflictError';
  }
}

/**
 * Custom error for prerequisite validation failures
 */
export class WizardPrerequisiteError extends Error {
  constructor(
    public readonly message: string,
    public readonly details: {
      type: 'prerequisite_not_met';
      targetStepId: string;
      targetStepName: string;
      missingPrerequisites: string[];
      missingPrerequisiteNames: string[];
      completedSteps: string[];
      currentStepId: string;
      suggestion: string;
    }
  ) {
    super(message);
    this.name = 'WizardPrerequisiteError';
  }
}

/**
 * Custom error for navigation rule violations
 */
export class WizardNavigationError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'WizardNavigationError';
  }
}

/**
 * MongoDB model for wizard sessions
 */
export class WizardSession {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const db = getDB();
    const collection = db.collection<WizardSessionDocument>(COLLECTION_NAME);

    try {
      // Unique index on sessionId
      await collection.createIndex({ sessionId: 1 }, { unique: true, background: true });

      // Compound index on wizardDefinitionId + wizardDefinitionVersion
      await collection.createIndex(
        { wizardDefinitionId: 1, wizardDefinitionVersion: 1 },
        { background: true }
      );

      // Compound index for findByWizardDefinition query (wizardDefinitionId + wizardDefinitionVersion + createdAt sorting)
      await collection.createIndex(
        { wizardDefinitionId: 1, wizardDefinitionVersion: 1, createdAt: -1 },
        { background: true, name: 'idx_wizardDefinition_createdAt' }
      );

      // Index on status for filtering
      await collection.createIndex({ status: 1 }, { background: true });

      // Compound index for findByStatus query (status + createdAt sorting)
      await collection.createIndex(
        { status: 1, createdAt: -1 },
        { background: true, name: 'idx_status_createdAt' }
      );

      // Index on createdAt for sorting
      await collection.createIndex({ createdAt: -1 }, { background: true });

      indexesEnsured = true;
    } catch (error) {
      console.warn('Warning: Could not create all wizard_sessions indexes:', error);
    }
  }

  /**
   * Create a new wizard session
   */
  static async create(input: WizardSessionCreateInput): Promise<WizardSessionDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const now = new Date();

      const session: WizardSessionDocument = {
        sessionId: input.sessionId,
        wizardDefinitionId: input.wizardDefinitionId,
        wizardDefinitionVersion: input.wizardDefinitionVersion,
        currentStepId: input.currentStepId || 'query-configuration',
        completedSteps: input.completedSteps || [],
        context: input.context || {},
        linkedQueryId: input.linkedQueryId
          ? new ObjectId(input.linkedQueryId)
          : undefined,
        linkedRunId: input.linkedRunId,
        status: input.status || 'active',
        revision: 1, // Start at revision 1
        createdAt: now,
        updatedAt: now,
      };

      const result = await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .insertOne(session);
      return { ...session, _id: result.insertedId };
    }, 'WizardSession.create');
  }

  /**
   * Find a wizard session by sessionId
   */
  static async findBySessionId(sessionId: string): Promise<WizardSessionDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .findOne({ sessionId });
    }, 'WizardSession.findBySessionId');
  }

  /**
   * Find wizard sessions by wizard definition
   */
  static async findByWizardDefinition(
    wizardDefinitionId: string,
    wizardDefinitionVersion?: number
  ): Promise<WizardSessionDocument[]> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const filter: Filter<WizardSessionDocument> = { wizardDefinitionId };
      if (wizardDefinitionVersion !== undefined) {
        filter.wizardDefinitionVersion = wizardDefinitionVersion;
      }
      return await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();
    }, 'WizardSession.findByWizardDefinition');
  }

  /**
   * Find wizard sessions by status
   */
  static async findByStatus(status: WizardSessionDocument['status']): Promise<WizardSessionDocument[]> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .find({ status })
        .sort({ createdAt: -1 })
        .toArray();
    }, 'WizardSession.findByStatus');
  }

  /**
   * Update a wizard session with optimistic locking
   * 
   * @param sessionId - The session ID to update
   * @param input - The update data (must include revision for optimistic locking)
   * @returns The updated session document
   * @throws RevisionConflictError if revision mismatch (409 conflict)
   */
  static async update(
    sessionId: string,
    input: WizardSessionUpdateInput
  ): Promise<WizardSessionDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const now = new Date();

      // Build update document (excluding revision - we'll increment it atomically)
      const update: Partial<WizardSessionDocument> = {
        updatedAt: now,
      };

      if (input.currentStepId !== undefined) {
        update.currentStepId = input.currentStepId;
      }
      if (input.completedSteps !== undefined) {
        update.completedSteps = input.completedSteps;
      }
      if (input.context !== undefined) {
        update.context = input.context;
      }
      if (input.linkedQueryId !== undefined) {
        update.linkedQueryId = input.linkedQueryId
          ? new ObjectId(input.linkedQueryId)
          : undefined;
      }
      if (input.linkedRunId !== undefined) {
        update.linkedRunId = input.linkedRunId;
      }
      if (input.status !== undefined) {
        update.status = input.status;
      }

      // STRUCTURAL FIX: ATOMIC UPDATE with revision in filter
      // This ensures the update only happens if revision hasn't changed between read and write
      // The filter includes revision when provided, making the check atomic at the database level
      const filter: Filter<WizardSessionDocument> = { 
        sessionId,
        // Include revision in filter for atomic optimistic locking
        // If revision is provided, only update if it matches (atomic check)
        // If not provided, update regardless (for operations that don't need locking)
        ...(input.revision !== undefined ? { revision: input.revision } : {})
      };

      // Build update filter: set fields and atomically increment revision
      // Use $inc to atomically increment revision (prevents race conditions)
      const updateFilter: UpdateFilter<WizardSessionDocument> = {
        $set: update,
        $inc: { revision: 1 }
      };

      // ATOMIC OPERATION: findOneAndUpdate with revision in filter
      // If revision was provided and doesn't match, this returns null (no document updated)
      // This is the key structural fix - the revision check happens atomically at the DB level
      const result = await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .findOneAndUpdate(filter, updateFilter, { returnDocument: 'after' });

      // If result is null, it means the filter didn't match
      // This happens when: (1) session doesn't exist, or (2) revision mismatch (conflict)
      if (!result) {
        // Re-fetch to determine the actual reason
        const actualSession = await db
          .collection<WizardSessionDocument>(COLLECTION_NAME)
          .findOne({ sessionId });
        
        if (!actualSession) {
          throw new DatabaseNotFoundError(`Wizard session not found: ${sessionId}`);
        }

        // If we get here, the session exists but the filter didn't match
        // This means either:
        // 1. Revision was provided and didn't match (revision conflict)
        // 2. Some other filter condition didn't match (shouldn't happen for our current filters)
        if (input.revision !== undefined) {
          // Revision conflict: the atomic update failed because the revision in the filter didn't match
          throw new RevisionConflictError(
            sessionId,
            input.revision,
            actualSession.revision
          );
        }

        // If revision wasn't provided, the filter should have matched (only sessionId in filter)
        // This shouldn't happen, but handle gracefully
        throw new DatabaseNotFoundError(`Wizard session update failed: ${sessionId}`);
      }

      return result;
    }, 'WizardSession.update');
  }

  /**
   * Delete a wizard session
   */
  static async delete(sessionId: string): Promise<boolean> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .deleteOne({ sessionId });
      return result.deletedCount > 0;
    }, 'WizardSession.delete');
  }

  /**
   * Count total number of wizard sessions
   */
  static async count(filter?: Filter<WizardSessionDocument>): Promise<number> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db
        .collection<WizardSessionDocument>(COLLECTION_NAME)
        .countDocuments(filter || {});
    }, 'WizardSession.count');
  }
}

