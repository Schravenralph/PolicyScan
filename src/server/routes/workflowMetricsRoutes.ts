/**
 * Workflow Metrics Routes
 * 
 * API endpoints for querying workflow execution metrics and statistics.
 * Provides endpoints for monitoring workflow performance and analyzing execution patterns.
 */

import express from 'express';
import { getWorkflowMetricsService } from '../services/workflow/WorkflowMetricsService.js';
import { getWorkflowHistoryModel } from '../models/WorkflowHistory.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { getPerformanceMetricsCollector } from '../services/performance/PerformanceMetrics.js';
import type { StepIdentifier } from '../types/performanceConfig.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';

/**
 * Create workflow metrics router
 * 
 * @returns Express router with metrics endpoints
 */
export function createWorkflowMetricsRouter(authService?: AuthService): express.Router {
  const router = express.Router();

  /**
   * GET /api/workflows/metrics/stats/:workflowId
   * Get workflow statistics
   * 
   * Query parameters:
   * - startDate: ISO date string (optional)
   * - endDate: ISO date string (optional)
   */
  router.get('/stats/:workflowId', asyncHandler(async (req, res) => {
    const { workflowId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    // Validate dates
    if (start && isNaN(start.getTime())) {
      throw new BadRequestError('Invalid startDate format. Use ISO date string.');
    }
    if (end && isNaN(end.getTime())) {
      throw new BadRequestError('Invalid endDate format. Use ISO date string.');
    }

    const metricsService = getWorkflowMetricsService();
    const stats = await metricsService.getWorkflowStats(workflowId, start, end);

    if (!stats) {
      throw new NotFoundError('Workflow metrics', workflowId);
    }

    res.json(stats);
  }));

  /**
   * GET /api/workflows/metrics/stats/:workflowId/steps/:stepId
   * Get step statistics
   * 
   * Query parameters:
   * - startDate: ISO date string (optional)
   * - endDate: ISO date string (optional)
   */
  router.get('/stats/:workflowId/steps/:stepId', asyncHandler(async (req, res) => {
    const { workflowId, stepId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    // Validate dates
    if (start && isNaN(start.getTime())) {
      throw new BadRequestError('Invalid startDate format. Use ISO date string.');
    }
    if (end && isNaN(end.getTime())) {
      throw new BadRequestError('Invalid endDate format. Use ISO date string.');
    }

    const metricsService = getWorkflowMetricsService();
    const stats = await metricsService.getStepStats(workflowId, stepId, start, end);

    if (!stats) {
      throw new NotFoundError('Step metrics', `${workflowId}/${stepId}`);
    }

    res.json(stats);
  }));

  /**
   * GET /api/workflows/metrics/history
   * Query workflow execution history
   * 
   * Query parameters:
   * - workflowId: Workflow ID (optional)
   * - userId: User ID (optional)
   * - status: Execution status (optional: completed, failed, cancelled, timeout)
   * - startDate: ISO date string (optional)
   * - endDate: ISO date string (optional)
   * - limit: Number of results (optional, default: 100)
   * - offset: Pagination offset (optional, default: 0)
   */
  router.get('/history', authenticate(authService!), asyncHandler(async (req, res) => {
    const { workflowId, userId, status, startDate, endDate, limit, offset } = req.query;

    const filters: {
      workflowId?: string;
      userId?: string;
      status?: 'completed' | 'failed' | 'cancelled' | 'timeout';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {};

    if (workflowId) filters.workflowId = workflowId as string;
    if (userId) filters.userId = userId as string;
    if (status) {
      const validStatuses = ['completed', 'failed', 'cancelled', 'timeout'];
      if (validStatuses.includes(status as string)) {
        filters.status = status as 'completed' | 'failed' | 'cancelled' | 'timeout';
      }
    }
    if (startDate) {
      const date = new Date(startDate as string);
      if (!isNaN(date.getTime())) {
        filters.startDate = date;
      }
    }
    if (endDate) {
      const date = new Date(endDate as string);
      if (!isNaN(date.getTime())) {
        filters.endDate = date;
      }
    }
    if (limit) filters.limit = parseInt(limit as string, 10);
    if (offset) filters.offset = parseInt(offset as string, 10);

    const historyModel = getWorkflowHistoryModel();
    const [history, total] = await Promise.all([
      historyModel.query(filters),
      historyModel.count(filters),
    ]);

    res.json({
      history,
      total,
      limit: filters.limit || 100,
      offset: filters.offset || 0,
    });
  }));

  /**
   * GET /api/workflows/metrics/history/:runId
   * Get workflow execution history by runId
   */
  router.get('/history/:runId', authenticate(authService!), asyncHandler(async (req, res) => {
    const { runId } = req.params;
    const historyModel = getWorkflowHistoryModel();
    const history = await historyModel.getByRunId(runId);

    if (!history) {
      throw new NotFoundError('Workflow execution history', runId);
    }

    res.json(history);
  }));

  /**
   * GET /api/workflows/metrics/history/export
   * Export workflow execution history as JSON
   * 
   * Query parameters: Same as /history endpoint
   */
  router.get('/history/export', authenticate(authService!), asyncHandler(async (req, res) => {
    const { workflowId, userId, status, startDate, endDate } = req.query;

    const filters: {
      workflowId?: string;
      userId?: string;
      status?: 'completed' | 'failed' | 'cancelled' | 'timeout';
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (workflowId) filters.workflowId = workflowId as string;
    if (userId) filters.userId = userId as string;
    if (status) {
      const validStatuses = ['completed', 'failed', 'cancelled', 'timeout'];
      if (validStatuses.includes(status as string)) {
        filters.status = status as 'completed' | 'failed' | 'cancelled' | 'timeout';
      }
    }
    if (startDate) {
      const date = new Date(startDate as string);
      if (!isNaN(date.getTime())) {
        filters.startDate = date;
      }
    }
    if (endDate) {
      const date = new Date(endDate as string);
      if (!isNaN(date.getTime())) {
        filters.endDate = date;
      }
    }

    const historyModel = getWorkflowHistoryModel();
    const history = await historyModel.exportHistory(filters);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="workflow-history-${Date.now()}.json"`);
    res.json(history);
  }));

  /**
   * GET /api/workflows/metrics/performance/:runId
   * Get performance metrics for a workflow run
   * 
   * Returns performance metrics for all steps in a workflow run.
   */
  router.get('/performance/:runId', authenticate(authService!), asyncHandler(async (req, res) => {
    const { runId } = req.params;
    const metricsCollector = getPerformanceMetricsCollector();
    const metrics = await metricsCollector.getRunMetrics(runId);

    res.json({
      runId,
      metrics,
      count: metrics.length,
    });
  }));

  /**
   * GET /api/workflows/metrics/performance/steps/:stepIdentifier
   * Get performance statistics for a workflow step
   * 
   * Query parameters:
   * - limit: Number of recent executions to analyze (optional, default: 100)
   * 
   * Returns aggregated statistics for a specific step across multiple executions.
   */
  router.get('/performance/steps/:stepIdentifier', authenticate(authService!), asyncHandler(async (req, res) => {
    const { stepIdentifier } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    // Validate step identifier
    const validSteps: StepIdentifier[] = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7', 'step8'];
    if (!validSteps.includes(stepIdentifier as StepIdentifier)) {
      throw new BadRequestError(`Invalid step identifier. Valid steps: ${validSteps.join(', ')}`);
    }

    const metricsCollector = getPerformanceMetricsCollector();
    const stats = await metricsCollector.getStepStatistics(stepIdentifier as StepIdentifier, limit);

    res.json(stats);
  }));

  return router;
}





