/**
 * WorkflowHistoryService
 * 
 * Service for storing and managing workflow execution history.
 * Provides methods to create history entries from completed runs.
 */

import { getWorkflowHistoryModel, type WorkflowHistoryCreateInput, type StepExecutionHistory } from '../../models/WorkflowHistory.js';
import { Run } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Service for managing workflow execution history
 */
export class WorkflowHistoryService {
  private historyModel = getWorkflowHistoryModel();

  /**
   * Create history entry from a completed run
   * 
   * This method extracts execution history from a run and stores it
   * for historical analysis and audit purposes.
   * 
   * @param run - The completed run
   * @param workflowId - The workflow ID
   * @param workflowName - The workflow name
   * @param steps - Optional step execution history (if available)
   */
  async createHistoryFromRun(
    run: Run,
    workflowId: string,
    workflowName: string,
    steps?: StepExecutionHistory[]
  ): Promise<void> {
    try {
      if (!run._id) {
        logger.warn({ runId: run._id }, 'Cannot create history: run has no _id');
        return;
      }

      const runId = run._id.toString();
      const startedAt = run.startTime;
      const completedAt = run.endTime || new Date();
      const duration = completedAt.getTime() - startedAt.getTime();

      // Determine status from run status
      let historyStatus: 'completed' | 'failed' | 'cancelled' | 'timeout' = 'completed';
      if (run.status === 'failed' || run.status === 'timeout') {
        historyStatus = run.status === 'timeout' ? 'timeout' : 'failed';
      } else if (run.status === 'cancelled') {
        historyStatus = 'cancelled';
      }

      // Extract step history from logs if not provided
      const stepHistory = steps || this.extractStepHistoryFromLogs(run.logs);

      // Extract metadata from run params
      const metadata = {
        userId: run.params?.userId as string | undefined,
        ipAddress: run.params?.ipAddress as string | undefined,
        userAgent: run.params?.userAgent as string | undefined,
        workflowVersion: run.params?.workflowVersion as string | undefined,
      };

      const historyInput: WorkflowHistoryCreateInput = {
        runId,
        workflowId,
        workflowName,
        status: historyStatus,
        startedAt,
        completedAt,
        duration,
        steps: stepHistory,
        params: run.params || {},
        result: run.result,
        error: run.error,
        metadata,
      };

      await this.historyModel.create(historyInput);
      logger.debug({ runId, workflowId }, 'Workflow execution history stored');
    } catch (error) {
      // Don't throw - history storage failure shouldn't break workflow execution
      logger.error(
        { error, runId: run._id?.toString(), workflowId },
        'Failed to create workflow execution history'
      );
    }
  }

  /**
   * Extract step execution history from run logs
   * 
   * Attempts to reconstruct step execution history from log messages.
   * This is a fallback when step history is not directly tracked.
   */
  private extractStepHistoryFromLogs(logs: Array<{ timestamp: Date; level: string; message: string; metadata?: Record<string, unknown> }>): StepExecutionHistory[] {
    const stepHistory: StepExecutionHistory[] = [];
    const stepMap = new Map<string, { start?: Date; end?: Date; status?: string; error?: string }>();

    // Parse logs to extract step execution information
    for (const log of logs) {
      const message = log.message.toLowerCase();
      
      // Look for step start messages
      if (message.includes('executing step:') || message.includes('step started:')) {
        const stepId = log.metadata?.stepId as string || log.metadata?.step_id as string;
        const stepName = log.metadata?.stepName as string || log.metadata?.step_name as string || 'Unknown';
        const action = log.metadata?.action as string || 'unknown';
        
        if (stepId) {
          stepMap.set(stepId, {
            start: log.timestamp,
            status: 'completed',
          });
          
          // Create entry if it doesn't exist
          if (!stepHistory.find(s => s.stepId === stepId)) {
            stepHistory.push({
              stepId,
              stepName,
              action,
              status: 'completed',
              startedAt: log.timestamp,
              duration: 0,
            });
          }
        }
      }
      
      // Look for step completion messages
      if (message.includes('step completed:') || message.includes('step finished:')) {
        const stepId = log.metadata?.stepId as string || log.metadata?.step_id as string;
        if (stepId) {
          const entry = stepHistory.find(s => s.stepId === stepId);
          if (entry) {
            entry.completedAt = log.timestamp;
            entry.duration = entry.completedAt.getTime() - entry.startedAt.getTime();
          }
        }
      }
      
      // Look for step failure messages
      if (message.includes('step failed:') || message.includes('step error:')) {
        const stepId = log.metadata?.stepId as string || log.metadata?.step_id as string;
        if (stepId) {
          const entry = stepHistory.find(s => s.stepId === stepId);
          if (entry) {
            entry.status = 'failed';
            entry.completedAt = log.timestamp;
            entry.duration = entry.completedAt.getTime() - entry.startedAt.getTime();
            entry.error = log.message;
          }
        }
      }
    }

    // Calculate durations for entries without completion
    for (const entry of stepHistory) {
      if (!entry.completedAt) {
        entry.completedAt = entry.startedAt;
        entry.duration = 0;
      }
    }

    return stepHistory;
  }
}

/**
 * Get or create a singleton instance of WorkflowHistoryService
 */
let historyServiceInstance: WorkflowHistoryService | null = null;

export function getWorkflowHistoryService(): WorkflowHistoryService {
  if (!historyServiceInstance) {
    historyServiceInstance = new WorkflowHistoryService();
  }
  return historyServiceInstance;
}

