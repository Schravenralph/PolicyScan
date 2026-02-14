/**
 * Learning Progress Service
 * 
 * Manages progress state for learning operations to enable resuming
 * interrupted operations. Stores progress in MongoDB.
 */

import { getDB, ensureDBConnection } from '../../config/database.js';
import type { Db } from '../../config/database.js';
import { ObjectId } from 'mongodb';

export interface LearningProgressState {
  _id?: string;
  operation: 'full-cycle' | 'ranking-boosts' | 'discover-terms' | 'update-sources' | 'pattern-analysis';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep?: string;
  stepNumber?: number;
  totalSteps?: number;
  message?: string;
  
  // Operation-specific state
  state: {
    // For discover-terms
    processedDocumentIds?: string[];
    discoveredTerms?: unknown[];
    currentBatch?: number;
    totalBatches?: number;
    
    // For update-sources
    processedSourceUrls?: string[];
    sourceUpdates?: unknown[];
    
    // For full-cycle
    completedOperations?: string[];
    operationResults?: Record<string, unknown>;
    
    // Generic checkpoint data
    checkpoint?: Record<string, unknown>;
  };
  
  // Results (partial or complete)
  results?: {
    rankingBoosts?: unknown[];
    dictionaryUpdates?: unknown[];
    sourceUpdates?: unknown[];
    metrics?: unknown;
    patternEffectiveness?: unknown;
  };
  
  error?: string;
  errorDetails?: unknown;
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export class LearningProgressService {
  private _db: Db | null = null;
  private readonly collectionName = 'learning_progress';

  /**
   * Get database instance (lazy initialization)
   */
  private async getDB(): Promise<Db> {
    if (!this._db) {
      this._db = await ensureDBConnection();
    }
    return this._db;
  }

  /**
   * Create a new progress state
   */
  async createProgress(
    operation: LearningProgressState['operation'],
    initialState?: Partial<LearningProgressState['state']>
  ): Promise<string> {
    const db = await this.getDB();
    const now = new Date();
    
    const progress: Omit<LearningProgressState, '_id'> = {
      operation,
      status: 'pending',
      progress: 0,
      state: {
        ...initialState,
      },
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection(this.collectionName).insertOne(progress);
    return result.insertedId.toString();
  }

  /**
   * Get progress state by ID
   */
  async getProgress(progressId: string): Promise<LearningProgressState | null> {
    const db = await this.getDB();
    const progress = await db.collection(this.collectionName).findOne({
      _id: new ObjectId(progressId),
    });

    if (!progress) {
      return null;
    }

    // Type assertion needed because MongoDB document may have additional fields
    const progressDoc = progress as unknown as LearningProgressState & {
      _id: ObjectId;
      createdAt: Date | string;
      updatedAt: Date | string;
      completedAt?: Date | string;
    };

    return {
      _id: progressDoc._id.toString(),
      operation: progressDoc.operation,
      status: progressDoc.status,
      progress: progressDoc.progress,
      state: progressDoc.state,
      currentStep: progressDoc.currentStep,
      stepNumber: progressDoc.stepNumber,
      totalSteps: progressDoc.totalSteps,
      message: progressDoc.message,
      results: progressDoc.results,
      error: progressDoc.error,
      errorDetails: progressDoc.errorDetails,
      createdAt: progressDoc.createdAt instanceof Date ? progressDoc.createdAt : new Date(progressDoc.createdAt),
      updatedAt: progressDoc.updatedAt instanceof Date ? progressDoc.updatedAt : new Date(progressDoc.updatedAt),
      completedAt: progressDoc.completedAt
        ? progressDoc.completedAt instanceof Date
          ? progressDoc.completedAt
          : new Date(progressDoc.completedAt)
        : undefined,
    };
  }

  /**
   * Update progress state
   */
  async updateProgress(
    progressId: string,
    updates: Partial<Omit<LearningProgressState, '_id' | 'createdAt'>>
  ): Promise<void> {
    const db = await this.getDB();
    await db.collection(this.collectionName).updateOne(
      { _id: new ObjectId(progressId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Update progress with state merge (for nested state updates)
   */
  async updateProgressState(
    progressId: string,
    stateUpdates: Partial<LearningProgressState['state']>,
    progressUpdates?: Partial<Omit<LearningProgressState, '_id' | 'createdAt' | 'state'>>
  ): Promise<void> {
    const db = await this.getDB();
    const update: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Merge state updates
    if (stateUpdates) {
      const currentProgress = await this.getProgress(progressId);
      if (currentProgress) {
        update['state'] = {
          ...currentProgress.state,
          ...stateUpdates,
        };
      }
    }

    // Add other progress updates
    if (progressUpdates) {
      Object.assign(update, progressUpdates);
    }

    await db.collection(this.collectionName).updateOne(
      { _id: new ObjectId(progressId) },
      { $set: update }
    );
  }

  /**
   * Mark progress as completed
   */
  async completeProgress(
    progressId: string,
    results?: LearningProgressState['results']
  ): Promise<void> {
    await this.updateProgress(progressId, {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
      results,
    });
  }

  /**
   * Mark progress as failed
   */
  async failProgress(
    progressId: string,
    error: string,
    errorDetails?: unknown
  ): Promise<void> {
    await this.updateProgress(progressId, {
      status: 'failed',
      error,
      errorDetails,
    });
  }

  /**
   * Pause progress (for resuming later)
   */
  async pauseProgress(progressId: string): Promise<void> {
    await this.updateProgress(progressId, {
      status: 'paused',
    });
  }

  /**
   * Resume progress (change status from paused to running)
   */
  async resumeProgress(progressId: string): Promise<void> {
    await this.updateProgress(progressId, {
      status: 'running',
    });
  }

  /**
   * Get all progress states for an operation type
   */
  async getProgressByOperation(
    operation: LearningProgressState['operation'],
    status?: LearningProgressState['status']
  ): Promise<LearningProgressState[]> {
    const db = await this.getDB();
    const query: Record<string, unknown> = { operation };
    if (status) {
      query.status = status;
    }

    // Limit results to prevent memory exhaustion (progress collection should be small, but add limit for safety)
    const maxProgressDocs = parseInt(process.env.MAX_PROGRESS_DOCS || '1000', 10);
    const progressDocs = await db
      .collection(this.collectionName)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(maxProgressDocs)
      .toArray();

    return progressDocs.map((doc) => {
      // Type assertion needed because MongoDB document may have additional fields
      const progressDoc = doc as unknown as LearningProgressState & {
        _id: ObjectId;
        createdAt: Date | string;
        updatedAt: Date | string;
        completedAt?: Date | string;
      };

      return {
        _id: progressDoc._id.toString(),
        operation: progressDoc.operation,
        status: progressDoc.status,
        progress: progressDoc.progress,
        state: progressDoc.state,
        currentStep: progressDoc.currentStep,
        stepNumber: progressDoc.stepNumber,
        totalSteps: progressDoc.totalSteps,
        message: progressDoc.message,
        results: progressDoc.results,
        error: progressDoc.error,
        errorDetails: progressDoc.errorDetails,
        createdAt: progressDoc.createdAt instanceof Date ? progressDoc.createdAt : new Date(progressDoc.createdAt),
        updatedAt: progressDoc.updatedAt instanceof Date ? progressDoc.updatedAt : new Date(progressDoc.updatedAt),
        completedAt: progressDoc.completedAt
          ? progressDoc.completedAt instanceof Date
            ? progressDoc.completedAt
            : new Date(progressDoc.completedAt)
          : undefined,
      };
    });
  }

  /**
   * Clean up old completed/failed progress states
   */
  async cleanupOldProgress(olderThanDays: number = 30): Promise<number> {
    const db = await this.getDB();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db.collection(this.collectionName).deleteMany({
      status: { $in: ['completed', 'failed'] },
      updatedAt: { $lt: cutoffDate },
    });

    return result.deletedCount;
  }
}

// Singleton instance
let learningProgressServiceInstance: LearningProgressService | null = null;

/**
 * Get or create the LearningProgressService singleton
 */
export function getLearningProgressService(): LearningProgressService {
  if (!learningProgressServiceInstance) {
    learningProgressServiceInstance = new LearningProgressService();
  }
  return learningProgressServiceInstance;
}



