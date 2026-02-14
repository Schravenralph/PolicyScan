/**
 * WorkflowMetrics Model - MongoDB persistence for workflow execution metrics
 * 
 * This model enables:
 * - Storing workflow and step execution durations
 * - Tracking execution status (completed, failed, timeout, cancelled)
 * - Historical analysis of workflow performance
 * - Statistics calculation for monitoring and alerting
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Collection, type Filter } from 'mongodb';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'workflow_metrics';
let indexesEnsured = false;

/**
 * Workflow metrics document structure
 */
export interface WorkflowMetricsDocument {
  _id?: ObjectId;
  workflowId: string;
  workflowName: string;
  stepId?: string;
  stepName?: string;
  duration: number; // Duration in milliseconds
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  timestamp: Date;
  metadata?: Record<string, unknown>; // Optional metadata (action, runId, error, etc.)
  createdAt: Date;
}

/**
 * Workflow metrics creation input
 */
export interface WorkflowMetricsCreateInput {
  workflowId: string;
  workflowName: string;
  stepId?: string;
  stepName?: string;
  duration: number;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow metrics statistics
 */
export interface WorkflowMetricsStats {
  workflowId: string;
  workflowName: string;
  stepId?: string;
  stepName?: string;
  count: number;
  averageDuration: number;
  medianDuration: number;
  p95Duration: number;
  p99Duration: number;
  minDuration: number;
  maxDuration: number;
  timeoutRate: number;
  failureRate: number;
  cancelledRate: number;
}

/**
 * WorkflowMetricsModel - MongoDB model for workflow execution metrics
 */
export class WorkflowMetricsModel {
  private collection: Collection<WorkflowMetricsDocument>;

  /**
   * Creates a new WorkflowMetricsModel instance.
   * 
   * Initializes the MongoDB collection and ensures indexes are created
   * for optimal query performance.
   */
  constructor() {
    const db = getDB();
    this.collection = db.collection<WorkflowMetricsDocument>(COLLECTION_NAME);
    // Create indexes for performance (idempotent)
    this.ensureIndexes().catch(err => {
      logger.warn({ error: err }, 'Failed to create workflow_metrics indexes');
    });
  }

  /**
   * Ensure database indexes exist for optimal query performance.
   * 
   * Creates indexes on:
   * - workflowId + timestamp (for workflow queries by date range)
   * - workflowId + stepId + timestamp (for step queries by date range)
   * - status + timestamp (for status-based queries)
   * - timestamp (for time-based queries)
   * 
   * @private
   */
  private async ensureIndexes(): Promise<void> {
    if (indexesEnsured) {
      return;
    }

    try {
      await this.collection.createIndex({ workflowId: 1, timestamp: -1 });
      await this.collection.createIndex({ workflowId: 1, stepId: 1, timestamp: -1 });
      await this.collection.createIndex({ status: 1, timestamp: -1 });
      await this.collection.createIndex({ timestamp: -1 });
      indexesEnsured = true;
      logger.debug('Workflow metrics indexes created');
    } catch (error) {
      // Indexes might already exist, which is fine
      if (error instanceof Error && !error.message.includes('already exists')) {
        logger.error({ error }, 'Failed to create workflow metrics indexes');
        throw error;
      }
      indexesEnsured = true;
    }
  }

  /**
   * Create a new workflow metrics record
   * 
   * @param input - Metrics creation input
   * @returns The created metrics document
   */
  async create(input: WorkflowMetricsCreateInput): Promise<WorkflowMetricsDocument> {
    try {
      const document: WorkflowMetricsDocument = {
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        stepId: input.stepId,
        stepName: input.stepName,
        duration: input.duration,
        status: input.status,
        timestamp: input.timestamp || new Date(),
        metadata: input.metadata,
        createdAt: new Date(),
      };

      const result = await this.collection.insertOne(document);
      return { ...document, _id: result.insertedId };
    } catch (error) {
      logger.error({ error, input }, 'Failed to create workflow metrics');
      throw error;
    }
  }

  /**
   * Find metrics by workflow ID
   * 
   * @param workflowId - Workflow ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Array of metrics documents
   */
  async findByWorkflowId(
    workflowId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<WorkflowMetricsDocument[]> {
    try {
      const filter: Filter<WorkflowMetricsDocument> = { workflowId };
      
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) {
          filter.timestamp.$gte = startDate;
        }
        if (endDate) {
          filter.timestamp.$lte = endDate;
        }
      }

      return await this.collection.find(filter).sort({ timestamp: -1 }).toArray();
    } catch (error) {
      logger.error({ error, workflowId, startDate, endDate }, 'Failed to find workflow metrics');
      throw error;
    }
  }

  /**
   * Find metrics by workflow ID and step ID
   * 
   * @param workflowId - Workflow ID
   * @param stepId - Step ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Array of metrics documents
   */
  async findByWorkflowAndStep(
    workflowId: string,
    stepId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<WorkflowMetricsDocument[]> {
    try {
      const filter: Filter<WorkflowMetricsDocument> = { workflowId, stepId };
      
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) {
          filter.timestamp.$gte = startDate;
        }
        if (endDate) {
          filter.timestamp.$lte = endDate;
        }
      }

      return await this.collection.find(filter).sort({ timestamp: -1 }).toArray();
    } catch (error) {
      logger.error({ error, workflowId, stepId, startDate, endDate }, 'Failed to find step metrics');
      throw error;
    }
  }

  /**
   * Calculate statistics for a workflow
   * 
   * @param workflowId - Workflow ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Statistics or null if no metrics found
   */
  async calculateWorkflowStats(
    workflowId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<WorkflowMetricsStats | null> {
    try {
      const metrics = await this.findByWorkflowId(workflowId, startDate, endDate);
      
      if (metrics.length === 0) {
        return null;
      }

      // Filter out step-level metrics (only workflow-level)
      const workflowMetrics = metrics.filter(m => !m.stepId);
      
      if (workflowMetrics.length === 0) {
        return null;
      }

      return this.calculateStats(workflowMetrics);
    } catch (error) {
      logger.error({ error, workflowId, startDate, endDate }, 'Failed to calculate workflow stats');
      throw error;
    }
  }

  /**
   * Calculate statistics for a step
   * 
   * @param workflowId - Workflow ID
   * @param stepId - Step ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Statistics or null if no metrics found
   */
  async calculateStepStats(
    workflowId: string,
    stepId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<WorkflowMetricsStats | null> {
    try {
      const metrics = await this.findByWorkflowAndStep(workflowId, stepId, startDate, endDate);
      
      if (metrics.length === 0) {
        return null;
      }

      return this.calculateStats(metrics);
    } catch (error) {
      logger.error({ error, workflowId, stepId, startDate, endDate }, 'Failed to calculate step stats');
      throw error;
    }
  }

  /**
   * Calculate statistics from metrics array
   * 
   * @private
   */
  private calculateStats(metrics: WorkflowMetricsDocument[]): WorkflowMetricsStats {
    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const timeouts = metrics.filter(m => m.status === 'timeout').length;
    const failures = metrics.filter(m => m.status === 'failed').length;
    const cancelled = metrics.filter(m => m.status === 'cancelled').length;
    const count = metrics.length;

    const averageDuration = durations.reduce((a, b) => a + b, 0) / count;
    const medianIndex = Math.floor(count / 2);
    const medianDuration = count % 2 === 0
      ? (durations[medianIndex - 1] + durations[medianIndex]) / 2
      : durations[medianIndex];
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);
    const p95Duration = durations[Math.min(p95Index, count - 1)];
    const p99Duration = durations[Math.min(p99Index, count - 1)];

    return {
      workflowId: metrics[0].workflowId,
      workflowName: metrics[0].workflowName,
      stepId: metrics[0].stepId,
      stepName: metrics[0].stepName,
      count,
      averageDuration,
      medianDuration,
      p95Duration,
      p99Duration,
      minDuration: durations[0],
      maxDuration: durations[count - 1],
      timeoutRate: timeouts / count,
      failureRate: failures / count,
      cancelledRate: cancelled / count,
    };
  }
}

/**
 * Get or create a singleton instance of WorkflowMetricsModel
 */
let metricsModelInstance: WorkflowMetricsModel | null = null;

export function getWorkflowMetricsModel(): WorkflowMetricsModel {
  if (!metricsModelInstance) {
    metricsModelInstance = new WorkflowMetricsModel();
  }
  return metricsModelInstance;
}
