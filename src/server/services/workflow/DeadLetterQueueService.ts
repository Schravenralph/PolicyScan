/**
 * Dead Letter Queue Service
 * 
 * Stores failed workflow steps that cannot be retried for later analysis and recovery.
 * This helps track persistent failures and enables manual intervention or batch processing.
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { Collection, ObjectId } from 'mongodb';

export interface DeadLetterQueueEntry {
  _id?: ObjectId;
  runId: string;
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  action: string;
  error: string;
  errorStack?: string;
  context?: Record<string, unknown>;
  params?: Record<string, unknown>;
  retryAttempts: number;
  lastAttemptAt: Date;
  createdAt: Date;
  resolved?: boolean;
  resolvedAt?: Date;
  resolutionNote?: string;
}

/**
 * Service for managing dead letter queue entries
 */
export class DeadLetterQueueService {
  private collection: Collection<DeadLetterQueueEntry>;

  constructor() {
    const db = getDB();
    this.collection = db.collection<DeadLetterQueueEntry>('deadLetterQueue');
    
    // Create indexes for efficient queries
    this.collection.createIndex({ runId: 1 });
    this.collection.createIndex({ workflowId: 1, stepId: 1 });
    this.collection.createIndex({ resolved: 1, createdAt: -1 });
    this.collection.createIndex({ createdAt: -1 });
  }

  /**
   * Add a failed step to the dead letter queue
   */
  async addFailedStep(
    runId: string,
    workflowId: string,
    workflowName: string,
    stepId: string,
    stepName: string,
    action: string,
    error: Error | string,
    context?: Record<string, unknown>,
    params?: Record<string, unknown>,
    retryAttempts: number = 0
  ): Promise<string> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const entry: DeadLetterQueueEntry = {
      runId,
      workflowId,
      workflowName,
      stepId,
      stepName,
      action,
      error: errorMessage,
      errorStack,
      context: context ? this.sanitizeContext(context) : undefined,
      params: params ? this.sanitizeParams(params) : undefined,
      retryAttempts,
      lastAttemptAt: new Date(),
      createdAt: new Date(),
      resolved: false,
    };

    const result = await this.collection.insertOne(entry);
    
    logger.warn(
      {
        runId,
        workflowId,
        stepId,
        action,
        retryAttempts,
        entryId: result.insertedId.toString(),
      },
      `Added failed step to dead letter queue: ${stepName} (${stepId})`
    );

    return result.insertedId.toString();
  }

  /**
   * Get unresolved entries for a workflow
   */
  async getUnresolvedEntries(workflowId?: string): Promise<DeadLetterQueueEntry[]> {
    const query: Record<string, unknown> = { resolved: false };
    if (workflowId) {
      query.workflowId = workflowId;
    }
    
    return await this.collection.find(query).sort({ createdAt: -1 }).toArray();
  }

  /**
   * Get all entries for a run
   */
  async getEntriesForRun(runId: string): Promise<DeadLetterQueueEntry[]> {
    return await this.collection.find({ runId }).sort({ createdAt: -1 }).toArray();
  }

  /**
   * Mark an entry as resolved
   */
  async markResolved(
    entryId: string,
    resolutionNote?: string
  ): Promise<void> {
    await this.collection.updateOne(
      { _id: entryId as unknown as ObjectId },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolutionNote,
        },
      }
    );

    logger.info({ entryId }, 'Marked dead letter queue entry as resolved');
  }

  /**
   * Get statistics about dead letter queue
   */
  async getStatistics(): Promise<{
    total: number;
    unresolved: number;
    resolved: number;
    byWorkflow: Record<string, number>;
    byAction: Record<string, number>;
  }> {
    const total = await this.collection.countDocuments();
    const unresolved = await this.collection.countDocuments({ resolved: false });
    const resolved = total - unresolved;

    // Group by workflow
    const workflowStats = await this.collection.aggregate([
      { $group: { _id: '$workflowId', count: { $sum: 1 } } },
    ]).toArray();
    const byWorkflow: Record<string, number> = {};
    for (const stat of workflowStats) {
      byWorkflow[stat._id as string] = stat.count as number;
    }

    // Group by action
    const actionStats = await this.collection.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]).toArray();
    const byAction: Record<string, number> = {};
    for (const stat of actionStats) {
      byAction[stat._id as string] = stat.count as number;
    }

    return {
      total,
      unresolved,
      resolved,
      byWorkflow,
      byAction,
    };
  }

  /**
   * Clean up old resolved entries (older than specified days)
   */
  async cleanupOldEntries(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.collection.deleteMany({
      resolved: true,
      resolvedAt: { $lt: cutoffDate },
    });

    logger.info(
      { deletedCount: result.deletedCount, cutoffDate },
      'Cleaned up old dead letter queue entries'
    );

    return result.deletedCount;
  }

  /**
   * Sanitize context to remove sensitive data and limit size
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'authorization'];
    const maxSize = 10000; // 10KB limit per context

    for (const [key, value] of Object.entries(context)) {
      // Skip sensitive keys
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        continue;
      }

      // Limit string values
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '... (truncated)';
      } else {
        sanitized[key] = value;
      }
    }

    // Check total size
    const size = JSON.stringify(sanitized).length;
    if (size > maxSize) {
      // Remove largest entries until under limit
      const entries = Object.entries(sanitized).sort((a, b) => {
        const aSize = JSON.stringify(a[1]).length;
        const bSize = JSON.stringify(b[1]).length;
        return bSize - aSize;
      });

      const result: Record<string, unknown> = {};
      let currentSize = 0;
      for (const [key, value] of entries) {
        const entrySize = JSON.stringify({ [key]: value }).length;
        if (currentSize + entrySize <= maxSize) {
          result[key] = value;
          currentSize += entrySize;
        }
      }
      return result;
    }

    return sanitized;
  }

  /**
   * Sanitize params to remove sensitive data and limit size
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    return this.sanitizeContext(params);
  }
}

// Singleton instance
let deadLetterQueueService: DeadLetterQueueService | null = null;

/**
 * Get the singleton DeadLetterQueueService instance
 */
export function getDeadLetterQueueService(): DeadLetterQueueService {
  if (!deadLetterQueueService) {
    deadLetterQueueService = new DeadLetterQueueService();
  }
  return deadLetterQueueService;
}





