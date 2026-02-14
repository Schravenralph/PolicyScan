/**
 * Workflow Service
 * 
 * High-level service layer for workflow operations.
 * Wraps WorkflowApiService to provide a cleaner interface.
 */

import { api } from '../api';
import { logError } from '../../utils/errorHandler';
import { getApiBaseUrl } from '../../utils/apiUrl';
import { validateWorkflowParams } from '../../utils/validation';

/**
 * Workflow Service
 * 
 * Provides high-level methods for workflow operations, wrapping WorkflowApiService
 * to provide a cleaner interface and centralized error handling.
 */
export class WorkflowService {
  /**
   * Run a workflow
   * 
   * Validates required parameters (like onderwerp) before sending to API.
   * Provides early feedback if validation fails.
   * 
   * @param workflowId - The workflow ID to run
   * @param params - Workflow parameters (flexible - backend accepts any parameters via passthrough)
   *                 Common parameters: mode, query, queryId, selectedWebsites, onderwerp, overheidsinstantie, etc.
   *                 For workflows requiring onderwerp, must include non-empty onderwerp or query parameter.
   * 
   * @throws Error if validation fails (e.g., missing required onderwerp)
   */
  async runWorkflow(
    workflowId: string,
    params: {
      mode?: string;
      reviewMode?: boolean;
      query?: string;
      queryId?: string;
      selectedWebsites?: string[];
      overheidstype?: string;
      overheidsinstantie?: string;
      onderwerp?: string;
      thema?: string;
      randomness?: number;
      [key: string]: unknown; // Allow any additional workflow-specific parameters
    }
  ): Promise<{
    message: string;
    workflowId: string;
    runId: string;
    reviewMode?: boolean;
  }> {
    try {
      // Validate workflow parameters before sending to API
      const validation = validateWorkflowParams(workflowId, params);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid workflow parameters');
      }

      const result = await api.workflow.runWorkflow(workflowId, params);
      return {
        message: 'Workflow started successfully',
        workflowId,
        runId: result.runId,
        reviewMode: params.mode === 'review' || params.reviewMode === true,
      };
    } catch (error) {
      logError(error as Error, 'workflow-service-run-workflow');
      throw error;
    }
  }

  /**
   * Get workflow run status
   */
  async getRunStatus(runId: string): Promise<{
    _id: string;
    status: string;
    [key: string]: unknown;
  }> {
    try {
      const run = await api.workflow.getRun(runId);
      if (!run) {
        throw new Error('Run not found');
      }
      return {
        ...run,
        _id: run._id,
        status: run.status,
      };
    } catch (error) {
      logError(error as Error, 'workflow-service-get-run-status');
      throw error;
    }
  }

  /**
   * Get all workflow runs
   */
  async getRuns(params?: {
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    page?: number;
    skip?: number;
  }): Promise<Array<{
    _id: string;
    status: string;
    [key: string]: unknown;
  }>> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      if (params?.type) queryParams.append('type', params.type);
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.skip) queryParams.append('skip', params.skip.toString());
      
      const response = await fetch(`${getApiBaseUrl()}/runs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const runs = await response.json() as Array<{ _id: string; status: string; [key: string]: unknown }>;
      return runs;
    } catch (error) {
      logError(error as Error, 'workflow-service-get-runs');
      throw error;
    }
  }

  /**
   * Cancel a workflow run
   */
  async cancelRun(runId: string): Promise<void> {
    try {
      await api.workflow.cancelRun(runId);
    } catch (error) {
      logError(error as Error, 'workflow-service-cancel-run');
      throw error;
    }
  }

  /**
   * Pause a workflow run
   */
  async pauseRun(runId: string): Promise<void> {
    try {
      await api.workflow.pauseRun(runId);
    } catch (error) {
      logError(error as Error, 'workflow-service-pause-run');
      throw error;
    }
  }

  /**
   * Resume a paused workflow run
   */
  async resumeRun(runId: string): Promise<void> {
    try {
      await api.workflow.resumeRun(runId);
    } catch (error) {
      logError(error as Error, 'workflow-service-resume-run');
      throw error;
    }
  }
}

/**
 * Singleton instance of WorkflowService
 */
export const workflowService = new WorkflowService();

