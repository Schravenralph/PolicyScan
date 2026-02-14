/**
 * TimeoutEventLogger
 * 
 * Provides consistent timeout event logging across all timeout scenarios
 * to enable monitoring, debugging, and analysis of workflow execution patterns.
 */

import { IRunManager } from './interfaces/IRunManager.js';
import { logger } from '../../utils/logger.js';

/**
 * Timeout event types
 */
export type TimeoutEventType =
  | 'step_timeout'
  | 'workflow_timeout'
  | 'parallel_step_timeout'
  | 'queue_timeout'
  | 'review_timeout';

/**
 * Timeout event data structure
 */
export interface TimeoutEvent {
  type: TimeoutEventType;
  runId: string;
  workflowId?: string;
  workflowName?: string;
  stepId?: string;
  stepName?: string;
  timeoutMs: number;
  elapsedMs: number;
  percentageUsed: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Timeout warning event (before timeout occurs)
 */
export interface TimeoutWarningEvent {
  type: TimeoutEventType;
  runId: string;
  workflowId?: string;
  workflowName?: string;
  stepId?: string;
  stepName?: string;
  timeoutMs: number;
  elapsedMs: number;
  percentageUsed: number;
  warningThreshold: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Service for logging timeout events consistently
 */
export class TimeoutEventLogger {
  constructor(private runManager: IRunManager) {}

  /**
   * Log a timeout event
   * 
   * @param event - Timeout event data
   */
  async logTimeoutEvent(event: TimeoutEvent): Promise<void> {
    const message = this.formatTimeoutMessage(event);
    
    // Log to run logs
    await this.runManager.log(event.runId, message, 'error');
    
    // Log to application logger with structured data
    logger.error(
      {
        type: 'timeout',
        eventType: event.type,
        runId: event.runId,
        workflowId: event.workflowId,
        workflowName: event.workflowName,
        stepId: event.stepId,
        stepName: event.stepName,
        timeoutMs: event.timeoutMs,
        elapsedMs: event.elapsedMs,
        percentageUsed: event.percentageUsed,
        metadata: event.metadata,
      },
      message
    );
    
    // Emit event for monitoring systems (fire-and-forget)
    this.emitTimeoutEvent(event).catch((error) => {
      logger.warn({ runId: event.runId, error }, 'Failed to emit timeout event');
    });
  }

  /**
   * Log a timeout warning (before timeout occurs)
   * 
   * @param event - Timeout warning event data
   */
  async logTimeoutWarning(event: TimeoutWarningEvent): Promise<void> {
    const message = this.formatTimeoutWarningMessage(event);
    
    // Log to run logs
    await this.runManager.log(event.runId, message, 'warn');
    
    // Log to application logger with structured data
    logger.warn(
      {
        type: 'timeout_warning',
        eventType: event.type,
        runId: event.runId,
        workflowId: event.workflowId,
        workflowName: event.workflowName,
        stepId: event.stepId,
        stepName: event.stepName,
        timeoutMs: event.timeoutMs,
        elapsedMs: event.elapsedMs,
        percentageUsed: event.percentageUsed,
        warningThreshold: event.warningThreshold,
        metadata: event.metadata,
      },
      message
    );
    
    // Emit warning event for monitoring systems (fire-and-forget)
    this.emitTimeoutWarning(event).catch((error) => {
      logger.warn({ runId: event.runId, error }, 'Failed to emit timeout warning event');
    });
  }

  /**
   * Format timeout message for logging
   * 
   * @param event - Timeout event
   * @returns Formatted message
   */
  private formatTimeoutMessage(event: TimeoutEvent): string {
    const parts: string[] = [];
    
    // Event type
    parts.push(`Timeout: ${this.formatEventType(event.type)}`);
    
    // Workflow information
    if (event.workflowName) {
      parts.push(`Workflow: ${event.workflowName}`);
    }
    if (event.workflowId && event.workflowId !== event.workflowName) {
      parts.push(`(${event.workflowId})`);
    }
    
    // Step information
    if (event.stepName) {
      parts.push(`Step: ${event.stepName}`);
    }
    if (event.stepId && event.stepId !== event.stepName) {
      parts.push(`(${event.stepId})`);
    }
    
    // Timeout details
    parts.push(`Timeout: ${this.formatDuration(event.timeoutMs)}`);
    parts.push(`Elapsed: ${this.formatDuration(event.elapsedMs)}`);
    parts.push(`Percentage: ${Math.round(event.percentageUsed)}%`);
    
    return parts.join(' | ');
  }

  /**
   * Format timeout warning message for logging
   * 
   * @param event - Timeout warning event
   * @returns Formatted message
   */
  private formatTimeoutWarningMessage(event: TimeoutWarningEvent): string {
    const parts: string[] = [];
    
    // Warning indicator
    parts.push(`Warning: ${this.formatEventType(event.type)} approaching timeout`);
    
    // Workflow information
    if (event.workflowName) {
      parts.push(`Workflow: ${event.workflowName}`);
    }
    
    // Step information
    if (event.stepName) {
      parts.push(`Step: ${event.stepName}`);
    }
    
    // Timeout details
    parts.push(`${Math.round(event.percentageUsed)}% used`);
    parts.push(`(${this.formatDuration(event.elapsedMs)} / ${this.formatDuration(event.timeoutMs)})`);
    
    return parts.join(' | ');
  }

  /**
   * Format event type for display
   * 
   * @param type - Event type
   * @returns Formatted event type string
   */
  private formatEventType(type: TimeoutEventType): string {
    const typeMap: Record<TimeoutEventType, string> = {
      step_timeout: 'Step timeout',
      workflow_timeout: 'Workflow timeout',
      parallel_step_timeout: 'Parallel step timeout',
      queue_timeout: 'Queue timeout',
      review_timeout: 'Review timeout',
    };
    return typeMap[type] || type;
  }

  /**
   * Format duration in milliseconds to human-readable string
   * 
   * @param ms - Duration in milliseconds
   * @returns Formatted duration string
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ${seconds % 60}s`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ${minutes % 60}m`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  /**
   * Emit timeout event to monitoring systems
   * 
   * @param event - Timeout event
   */
  private async emitTimeoutEvent(event: TimeoutEvent): Promise<void> {
    try {
      // Try to emit via ProgressService if available
      const { getProgressService } = await import('../progress/ProgressService.js');
      const progressService = getProgressService();
      
      // Create a progress event for timeout
      await progressService.recordProgress({
        type: 'job_failed',
        jobId: event.runId,
        jobType: 'workflow',
        queryId: undefined,
        timestamp: event.timestamp,
        data: {
          status: 'failed',
          error: `Timeout: ${this.formatEventType(event.type)}`,
          errorDetails: {
            eventType: event.type,
            workflowId: event.workflowId,
            workflowName: event.workflowName,
            stepId: event.stepId,
            stepName: event.stepName,
            timeoutMs: event.timeoutMs,
            elapsedMs: event.elapsedMs,
            percentageUsed: event.percentageUsed,
            metadata: event.metadata,
          },
        },
      });
    } catch (error) {
      // If ProgressService is not available or fails, log but don't throw
      logger.debug({ runId: event.runId, error }, 'Could not emit timeout event via ProgressService');
    }
  }

  /**
   * Emit timeout warning event to monitoring systems
   * 
   * @param event - Timeout warning event
   */
  private async emitTimeoutWarning(event: TimeoutWarningEvent): Promise<void> {
    try {
      // Try to emit via ProgressService if available
      const { getProgressService } = await import('../progress/ProgressService.js');
      const progressService = getProgressService();
      
      // Create a progress event for timeout warning
      await progressService.recordProgress({
        type: 'job_progress',
        jobId: event.runId,
        jobType: 'workflow',
        queryId: undefined,
        timestamp: event.timestamp,
        data: {
          progress: Math.min(90, Math.round(event.percentageUsed)),
          message: `Warning: ${this.formatEventType(event.type)} approaching timeout (${Math.round(event.percentageUsed)}% used)`,
          metadata: {
            eventType: event.type,
            workflowId: event.workflowId,
            workflowName: event.workflowName,
            stepId: event.stepId,
            stepName: event.stepName,
            timeoutMs: event.timeoutMs,
            elapsedMs: event.elapsedMs,
            percentageUsed: event.percentageUsed,
            warningThreshold: event.warningThreshold,
            ...(event.metadata ? { originalMetadata: event.metadata } : {}),
          },
        },
      });
    } catch (error) {
      // If ProgressService is not available or fails, log but don't throw
      logger.debug({ runId: event.runId, error }, 'Could not emit timeout warning event via ProgressService');
    }
  }
}


