/**
 * ActionExecutionService - Service for tracking wizard action executions
 * 
 * This service provides a high-level interface for tracking action executions,
 * enabling idempotency checks and action status monitoring.
 */

import {
  ActionExecution,
  type ActionExecutionDocument,
  type ActionExecutionCreateInput,
  type ActionExecutionUpdateInput,
  type ActionType,
  type ActionStatus,
} from '../../models/ActionExecution.js';
import { generateActionId } from '../../utils/actionIdGenerator.js';
import { logger } from '../../utils/logger.js';

/**
 * Service for managing action executions
 */
export class ActionExecutionService {
  /**
   * Record the start of an action execution
   * 
   * @param actionType - Type of action
   * @param params - Parameters for generating action ID
   * @param additionalData - Additional data to store
   * @returns The created action execution document
   */
  async recordAction(
    actionType: ActionType,
    params: Record<string, unknown>,
    additionalData?: {
      result?: unknown;
      workflowRunId?: string;
      status?: ActionStatus;
    }
  ): Promise<ActionExecutionDocument> {
    const actionId = generateActionId(actionType, params);
    
    const createInput: ActionExecutionCreateInput = {
      actionId,
      actionType,
      sessionId: params.sessionId as string | undefined,
      queryId: params.queryId as string | undefined,
      status: additionalData?.status || 'pending',
      result: additionalData?.result,
      workflowRunId: additionalData?.workflowRunId,
    };

    logger.debug(
      { actionId, actionType, sessionId: params.sessionId, queryId: params.queryId },
      'Recording action execution'
    );

    return await ActionExecution.create(createInput);
  }

  /**
   * Get action execution by actionId
   * 
   * @param actionId - The action ID
   * @returns The action execution document or null if not found
   */
  async getAction(actionId: string): Promise<ActionExecutionDocument | null> {
    return await ActionExecution.findById(actionId);
  }

  /**
   * Find action execution by queryId and actionType (for idempotency checks)
   * 
   * @param queryId - The query ID
   * @param actionType - The action type
   * @returns The most recent action execution or null if not found
   */
  async findActionByQueryId(
    queryId: string,
    actionType: ActionType
  ): Promise<ActionExecutionDocument | null> {
    return await ActionExecution.findByQueryId(queryId, actionType);
  }

  /**
   * Find action executions by sessionId
   * 
   * @param sessionId - The session ID
   * @returns Array of action executions for the session
   */
  async findActionsBySessionId(sessionId: string): Promise<ActionExecutionDocument[]> {
    return await ActionExecution.findBySessionId(sessionId);
  }

  /**
   * Update action execution status and result
   * 
   * @param actionId - The action ID
   * @param updates - Updates to apply
   * @returns The updated action execution document
   */
  async updateAction(
    actionId: string,
    updates: ActionExecutionUpdateInput
  ): Promise<ActionExecutionDocument> {
    logger.debug(
      { actionId, status: updates.status, hasResult: !!updates.result },
      'Updating action execution'
    );

    return await ActionExecution.update(actionId, updates);
  }

  /**
   * Check if an action can be executed idempotently
   * 
   * @param actionType - Type of action
   * @param params - Parameters for generating action ID
   * @returns The existing action execution if found, null otherwise
   */
  async checkIdempotency(
    actionType: ActionType,
    params: Record<string, unknown>
  ): Promise<ActionExecutionDocument | null> {
    // For startScan, check by queryId
    if (actionType === 'startScan' && params.queryId) {
      return await this.findActionByQueryId(String(params.queryId), actionType);
    }
    
    // For other actions, check by actionId
    const actionId = generateActionId(actionType, params);
    return await this.getAction(actionId);
  }

  /**
   * Mark action as in progress
   * 
   * @param actionId - The action ID
   * @param workflowRunId - Optional workflow run ID to link
   */
  async markInProgress(actionId: string, workflowRunId?: string): Promise<void> {
    await this.updateAction(actionId, {
      status: 'in_progress',
      workflowRunId,
    });
  }

  /**
   * Mark action as completed
   * 
   * @param actionId - The action ID
   * @param result - Optional result data
   * @param workflowRunId - Optional workflow run ID to link
   */
  async markCompleted(
    actionId: string,
    result?: unknown,
    workflowRunId?: string
  ): Promise<void> {
    await this.updateAction(actionId, {
      status: 'completed',
      result,
      workflowRunId,
      completedAt: new Date(),
    });
  }

  /**
   * Mark action as failed
   * 
   * @param actionId - The action ID
   * @param error - Error message
   */
  async markFailed(actionId: string, error: string): Promise<void> {
    await this.updateAction(actionId, {
      status: 'failed',
      error,
      completedAt: new Date(),
    });
  }
}

/**
 * Singleton instance of ActionExecutionService
 */
let actionExecutionServiceInstance: ActionExecutionService | null = null;

/**
 * Get the ActionExecutionService instance
 * 
 * @returns The singleton ActionExecutionService instance
 */
export function getActionExecutionService(): ActionExecutionService {
  if (!actionExecutionServiceInstance) {
    actionExecutionServiceInstance = new ActionExecutionService();
  }
  return actionExecutionServiceInstance;
}

