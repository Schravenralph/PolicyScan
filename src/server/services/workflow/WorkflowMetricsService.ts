/**
 * WorkflowMetricsService
 * 
 * Service for collecting and managing workflow execution metrics.
 * Provides methods to record metrics and calculate statistics for monitoring
 * and performance analysis.
 */

import { getWorkflowMetricsModel, type WorkflowMetricsCreateInput, type WorkflowMetricsStats } from '../../models/WorkflowMetrics.js';
import { logger } from '../../utils/logger.js';

/**
 * Service for managing workflow execution metrics
 */
export class WorkflowMetricsService {
  private metricsModel = getWorkflowMetricsModel();

  /**
   * Record a workflow execution metric
   * 
   * This method is fire-and-forget - it doesn't block workflow execution
   * if metrics recording fails.
   * 
   * @param input - Metrics data to record
   */
  async recordExecution(input: WorkflowMetricsCreateInput): Promise<void> {
    try {
      await this.metricsModel.create(input);
    } catch (error) {
      // Don't throw - metrics recording failure shouldn't break workflow execution
      logger.error(
        { error, workflowId: input.workflowId, stepId: input.stepId },
        'Failed to record workflow metrics'
      );
    }
  }

  /**
   * Record a workflow execution metric (non-blocking)
   * 
   * Fire-and-forget version that doesn't await the result
   * 
   * @param input - Metrics data to record
   */
  recordExecutionAsync(input: WorkflowMetricsCreateInput): void {
    this.recordExecution(input).catch(error => {
      logger.error(
        { error, workflowId: input.workflowId, stepId: input.stepId },
        'Failed to record workflow metrics (async)'
      );
    });
  }

  /**
   * Get workflow statistics
   * 
   * @param workflowId - Workflow ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Statistics or null if no metrics found
   */
  async getWorkflowStats(
    workflowId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<WorkflowMetricsStats | null> {
    try {
      return await this.metricsModel.calculateWorkflowStats(workflowId, startDate, endDate);
    } catch (error) {
      logger.error({ error, workflowId, startDate, endDate }, 'Failed to get workflow stats');
      throw error;
    }
  }

  /**
   * Get step statistics
   * 
   * @param workflowId - Workflow ID
   * @param stepId - Step ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Statistics or null if no metrics found
   */
  async getStepStats(
    workflowId: string,
    stepId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<WorkflowMetricsStats | null> {
    try {
      return await this.metricsModel.calculateStepStats(workflowId, stepId, startDate, endDate);
    } catch (error) {
      logger.error({ error, workflowId, stepId, startDate, endDate }, 'Failed to get step stats');
      throw error;
    }
  }
}

/**
 * Get or create a singleton instance of WorkflowMetricsService
 */
let metricsServiceInstance: WorkflowMetricsService | null = null;

export function getWorkflowMetricsService(): WorkflowMetricsService {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new WorkflowMetricsService();
  }
  return metricsServiceInstance;
}


