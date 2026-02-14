/**
 * StepState Model - MongoDB persistence for step state
 */

import { getDB } from '../config/database.js';
import { type Filter } from 'mongodb';
import type { StepStateDocument, StepStateCreateInput, StepStateUpdateInput } from '../types/StepState.js';

const COLLECTION_NAME = 'step_states';
let indexesEnsured = false;

export class StepStateModel {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;
    
    const db = getDB();
    const collection = db.collection<StepStateDocument>(COLLECTION_NAME);
    
    try {
      // Index on runId for lookups
      await collection.createIndex({ runId: 1 }, { background: true });
      
      // Index on stepId for step-specific queries
      await collection.createIndex({ stepId: 1 }, { background: true });
      
      // Compound index for runId + stepId (unique constraint)
      await collection.createIndex({ runId: 1, stepId: 1 }, { unique: true, background: true });
      
      // Index on status for filtering
      await collection.createIndex({ status: 1 }, { background: true });
      
      // Index on createdAt for sorting
      await collection.createIndex({ createdAt: -1 }, { background: true });
      
      indexesEnsured = true;
    } catch (error) {
      console.warn('Warning: Could not create all step_state indexes:', error);
    }
  }

  /**
   * Create a new step state
   */
  static async create(input: StepStateCreateInput): Promise<StepStateDocument> {
    await this.ensureIndexes();
    const db = getDB();
    const now = new Date();

    const stepState: StepStateDocument = {
      runId: input.runId,
      stepId: input.stepId,
      status: 'pending',
      params: input.params,
      createdAt: now,
      updatedAt: now,
      userId: input.userId,
      context: input.context,
      retryCount: 0,
    };

    const result = await db.collection<StepStateDocument>(COLLECTION_NAME).insertOne(stepState);
    return { ...stepState, _id: result.insertedId };
  }

  /**
   * Find step state by runId and stepId
   */
  static async findByRunAndStep(runId: string, stepId: string): Promise<StepStateDocument | null> {
    await this.ensureIndexes();
    const db = getDB();
    return await db.collection<StepStateDocument>(COLLECTION_NAME).findOne({ runId, stepId });
  }

  /**
   * Find all step states for a run
   */
  static async findByRun(runId: string): Promise<StepStateDocument[]> {
    await this.ensureIndexes();
    const db = getDB();
    
    // Limit to prevent memory exhaustion when loading step states for a run
    // Default limit: 1000 step states, configurable via environment variable
    const MAX_STEP_STATES = parseInt(process.env.MAX_STEP_STATES || '1000', 10);
    
    const stepStates = await db.collection<StepStateDocument>(COLLECTION_NAME)
      .find({ runId })
      .sort({ createdAt: 1 })
      .limit(MAX_STEP_STATES)
      .toArray();
    
    if (stepStates.length === MAX_STEP_STATES) {
      console.warn(
        `[StepStateModel] findByRun() query may have been truncated at ${MAX_STEP_STATES} entries for runId: ${runId}. ` +
        `Consider increasing MAX_STEP_STATES if workflows have more than ${MAX_STEP_STATES} steps.`
      );
    }
    
    return stepStates;
  }

  /**
   * Update step state
   */
  static async update(
    runId: string,
    stepId: string,
    input: StepStateUpdateInput
  ): Promise<StepStateDocument | null> {
    await this.ensureIndexes();
    const db = getDB();
    const now = new Date();

    const update: Partial<StepStateDocument> = {
      updatedAt: now,
    };

    if (input.status !== undefined) {
      update.status = input.status;
      if (input.status === 'in_progress' && !update.startedAt) {
        update.startedAt = now;
      }
      if (input.status === 'completed' || input.status === 'failed' || input.status === 'skipped') {
        update.completedAt = now;
        if (update.startedAt) {
          update.metadata = {
            ...update.metadata,
            duration: now.getTime() - (update.startedAt as Date).getTime(),
          };
        }
      }
    }

    if (input.params !== undefined) update.params = input.params;
    if (input.result !== undefined) update.result = input.result;
    if (input.error !== undefined) update.error = input.error;
    if (input.context !== undefined) update.context = input.context;
    if (input.metadata !== undefined) {
      update.metadata = { ...update.metadata, ...input.metadata };
    }

    const filter: Filter<StepStateDocument> = { runId, stepId };
    await db.collection<StepStateDocument>(COLLECTION_NAME).updateOne(
      filter,
      { $set: update }
    );

    return await this.findByRunAndStep(runId, stepId);
  }

  /**
   * Delete step state
   */
  static async delete(runId: string, stepId: string): Promise<boolean> {
    await this.ensureIndexes();
    const db = getDB();
    const result = await db.collection<StepStateDocument>(COLLECTION_NAME).deleteOne({ runId, stepId });
    return result.deletedCount > 0;
  }

  /**
   * Delete all step states for a run
   */
  static async deleteByRun(runId: string): Promise<number> {
    await this.ensureIndexes();
    const db = getDB();
    const result = await db.collection<StepStateDocument>(COLLECTION_NAME).deleteMany({ runId });
    return result.deletedCount;
  }
}


