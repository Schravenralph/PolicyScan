/**
 * WorkflowHistory Model
 * 
 * Stores historical snapshots of completed workflow executions for audit trail,
 * debugging, and historical analysis.
 */

import { Db, Collection, ObjectId, Filter } from 'mongodb';
import { getDB } from '../config/database.js';
import { logger } from '../utils/logger.js';

export interface StepExecutionHistory {
  stepId: string;
  stepName: string;
  action: string;
  status: 'completed' | 'failed' | 'skipped' | 'timeout' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  duration: number;
  error?: string;
  result?: unknown;
}

export interface WorkflowExecutionHistory {
  _id?: ObjectId;
  runId: string;
  workflowId: string;
  workflowName: string;
  version?: number;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  startedAt: Date;
  completedAt: Date;
  duration: number;
  steps: StepExecutionHistory[];
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  metadata: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    workflowVersion?: string;
  };
  createdAt: Date;
  expiresAt?: Date; // For TTL index (retention policy)
}

export interface WorkflowHistoryCreateInput {
  runId: string;
  workflowId: string;
  workflowName: string;
  version?: number;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  startedAt: Date;
  completedAt: Date;
  duration: number;
  steps: StepExecutionHistory[];
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  metadata?: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    workflowVersion?: string;
  };
}

export interface WorkflowHistoryQueryFilters {
  workflowId?: string;
  userId?: string;
  status?: 'completed' | 'failed' | 'cancelled' | 'timeout';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * WorkflowHistory Model
 * 
 * Manages workflow execution history storage and retrieval
 */
export class WorkflowHistory {
  private collection: Collection<WorkflowExecutionHistory>;

  constructor(private db: Db) {
    this.collection = this.db.collection<WorkflowExecutionHistory>('workflow_history');
  }

  /**
   * Ensure indexes are created (TTL index for retention policy)
   */
  async ensureIndexes(): Promise<void> {
    try {
      // TTL index for automatic deletion after retention period
      // Default retention: 90 days (configurable via WORKFLOW_HISTORY_RETENTION_DAYS)
      const retentionDays = parseInt(process.env.WORKFLOW_HISTORY_RETENTION_DAYS || '90', 10);
      
      await this.collection.createIndex(
        { expiresAt: 1 },
        { 
          expireAfterSeconds: 0, // TTL index - documents expire when expiresAt date is reached
          name: 'workflow_history_ttl_index'
        }
      );

      // Indexes for common queries
      await this.collection.createIndex({ workflowId: 1, completedAt: -1 });
      await this.collection.createIndex({ 'metadata.userId': 1, completedAt: -1 });
      await this.collection.createIndex({ status: 1, completedAt: -1 });
      await this.collection.createIndex({ runId: 1 }, { unique: true });
      await this.collection.createIndex({ completedAt: -1 });

      logger.info({ retentionDays }, 'WorkflowHistory indexes created');
    } catch (error) {
      logger.error({ error }, 'Failed to create WorkflowHistory indexes');
      throw error;
    }
  }

  /**
   * Create a workflow execution history entry
   */
  async create(input: WorkflowHistoryCreateInput): Promise<WorkflowExecutionHistory> {
    try {
      // Calculate retention date (default: 90 days)
      const retentionDays = parseInt(process.env.WORKFLOW_HISTORY_RETENTION_DAYS || '90', 10);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + retentionDays);

      const history: WorkflowExecutionHistory = {
        runId: input.runId,
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        version: input.version,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        duration: input.duration,
        steps: input.steps,
        params: input.params,
        result: input.result,
        error: input.error,
        metadata: {
          userId: input.metadata?.userId,
          ipAddress: input.metadata?.ipAddress,
          userAgent: input.metadata?.userAgent,
          workflowVersion: input.metadata?.workflowVersion,
        },
        createdAt: new Date(),
        expiresAt,
      };

      const result = await this.collection.insertOne(history);
      return { ...history, _id: result.insertedId };
    } catch (error) {
      logger.error({ error, runId: input.runId, workflowId: input.workflowId }, 'Failed to create workflow history');
      throw error;
    }
  }

  /**
   * Get workflow execution history by runId
   */
  async getByRunId(runId: string): Promise<WorkflowExecutionHistory | null> {
    try {
      return await this.collection.findOne({ runId });
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get workflow history by runId');
      throw error;
    }
  }

  /**
   * Query workflow execution history with filters
   */
  async query(filters: WorkflowHistoryQueryFilters): Promise<WorkflowExecutionHistory[]> {
    try {
      const query: Filter<WorkflowExecutionHistory> = {};

      if (filters.workflowId) {
        query.workflowId = filters.workflowId;
      }

      if (filters.userId) {
        query['metadata.userId'] = filters.userId;
      }

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.startDate || filters.endDate) {
        query.completedAt = {};
        if (filters.startDate) {
          query.completedAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.completedAt.$lte = filters.endDate;
        }
      }

      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      return await this.collection
        .find(query)
        .sort({ completedAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    } catch (error) {
      logger.error({ error, filters }, 'Failed to query workflow history');
      throw error;
    }
  }

  /**
   * Get count of workflow executions matching filters
   */
  async count(filters: WorkflowHistoryQueryFilters): Promise<number> {
    try {
      const query: Filter<WorkflowExecutionHistory> = {};

      if (filters.workflowId) {
        query.workflowId = filters.workflowId;
      }

      if (filters.userId) {
        query['metadata.userId'] = filters.userId;
      }

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.startDate || filters.endDate) {
        query.completedAt = {};
        if (filters.startDate) {
          query.completedAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.completedAt.$lte = filters.endDate;
        }
      }

      return await this.collection.countDocuments(query);
    } catch (error) {
      logger.error({ error, filters }, 'Failed to count workflow history');
      throw error;
    }
  }

  /**
   * Delete old history entries (manual cleanup, TTL index handles automatic cleanup)
   */
  async cleanupOldHistory(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.collection.deleteMany({
        completedAt: { $lt: cutoffDate },
      });

      logger.info({ deletedCount: result.deletedCount, retentionDays }, 'Cleaned up old workflow history');
      return result.deletedCount;
    } catch (error) {
      logger.error({ error, retentionDays }, 'Failed to cleanup old workflow history');
      throw error;
    }
  }

  /**
   * Export history as JSON
   */
  async exportHistory(filters: WorkflowHistoryQueryFilters): Promise<WorkflowExecutionHistory[]> {
    try {
      // For export, don't limit results
      const exportFilters = { ...filters };
      delete exportFilters.limit;
      delete exportFilters.offset;

      return await this.query(exportFilters);
    } catch (error) {
      logger.error({ error, filters }, 'Failed to export workflow history');
      throw error;
    }
  }
}

/**
 * Get or create a singleton instance of WorkflowHistory model
 */
let workflowHistoryInstance: WorkflowHistory | null = null;

export function getWorkflowHistoryModel(): WorkflowHistory {
  if (!workflowHistoryInstance) {
    const db = getDB();
    workflowHistoryInstance = new WorkflowHistory(db);
  }
  return workflowHistoryInstance;
}

