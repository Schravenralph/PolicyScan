/**
 * Workflow Monitoring Routes
 * 
 * API endpoints for monitoring stuck workflows and currently running workflows.
 * Provides endpoints for the workflow monitoring dashboard.
 */

import { Router, Request, Response } from 'express';
import { RunManager } from '../services/workflow/RunManager.js';
import { WorkflowModel } from '../models/Workflow.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { parsePaginationParams, createPaginatedResponse } from '../utils/pagination.js';

/**
 * Enriched run data with timeout information
 */
interface EnrichedRun {
  _id: string;
  runId: string;
  workflowId?: string;
  workflowName?: string;
  status: string;
  startTime: Date;
  elapsedTime: number; // milliseconds
  workflowTimeout: number; // milliseconds
  percentageUsed: number; // percentage
  isApproachingTimeout: boolean; // >= 80%
  isStuck: boolean; // exceeded timeout by threshold
  percentageOverTimeout?: number; // if stuck, percentage over timeout
  currentStepId?: string;
  params?: Record<string, unknown>;
}

/**
 * Create workflow monitoring router
 * 
 * @param runManager - RunManager instance
 * @returns Express router with monitoring endpoints
 */
export function createWorkflowMonitoringRouter(runManager: RunManager): Router {
  const router = Router();

  /**
   * GET /api/workflows/admin/workflows/running
   * Get currently running workflows with timeout information
   * 
   * Query parameters:
   * - limit: Number of results (default: 50)
   * - skip: Number of results to skip (default: 0)
   * - workflowId: Filter by workflow ID (optional)
   */
  router.get('/admin/workflows/running', asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const { workflowId } = req.query;

    // Build filter for running workflows
    const filter: Record<string, unknown> = {
      status: 'running',
    };

    if (workflowId) {
      filter['params.workflowId'] = workflowId;
    }

    // Get running runs
    const runs = await runManager.getRunHistory({
      status: 'running',
      limit,
      skip,
    });

    // Enrich runs with timeout information
    const enrichedRuns: EnrichedRun[] = [];

    for (const run of runs) {
      try {
        const runWorkflowId = run.params?.workflowId as string | undefined;
        if (!runWorkflowId) {
          // Skip runs without workflow ID
          continue;
        }

        // Get workflow to determine timeout
        const workflow = await WorkflowModel.findById(runWorkflowId);
        if (!workflow) {
          // Workflow not found - use default timeout
          const defaultTimeout = 2 * 60 * 60 * 1000; // 2 hours
          const startTime = run.startTime || new Date();
          const elapsedTime = Date.now() - startTime.getTime();
          const percentageUsed = (elapsedTime / defaultTimeout) * 100;

          enrichedRuns.push({
            _id: run._id?.toString() || '',
            runId: run._id?.toString() || '',
            workflowId: runWorkflowId,
            status: run.status || 'unknown',
            startTime,
            elapsedTime,
            workflowTimeout: defaultTimeout,
            percentageUsed,
            isApproachingTimeout: percentageUsed >= 80,
            isStuck: elapsedTime > defaultTimeout * 1.2,
            percentageOverTimeout: elapsedTime > defaultTimeout * 1.2
              ? ((elapsedTime / defaultTimeout) - 1) * 100
              : undefined,
            currentStepId: run.params?.__resumeStepId as string | undefined,
            params: run.params,
          });
          continue;
        }

        // Calculate timeout information
        const workflowTimeout = workflow.timeout || 2 * 60 * 60 * 1000; // Default 2 hours
        const startTime = run.startTime || new Date();
        const elapsedTime = Date.now() - startTime.getTime();
        const percentageUsed = (elapsedTime / workflowTimeout) * 100;
        const stuckThreshold = workflowTimeout * 1.2; // 20% over timeout
        const isStuck = elapsedTime > stuckThreshold;

        enrichedRuns.push({
          _id: run._id?.toString() || '',
          runId: run._id?.toString() || '',
          workflowId: runWorkflowId,
          workflowName: workflow.name,
          status: run.status || 'unknown',
          startTime,
          elapsedTime,
          workflowTimeout,
          percentageUsed,
          isApproachingTimeout: percentageUsed >= 80,
          isStuck,
          percentageOverTimeout: isStuck
            ? ((elapsedTime / workflowTimeout) - 1) * 100
            : undefined,
          currentStepId: run.params?.__resumeStepId as string | undefined,
          params: run.params,
        });
      } catch (error) {
        logger.error(
          { error, runId: run._id?.toString() },
          'Error enriching run with timeout information'
        );
        // Continue with other runs
      }
    }

    // Get total count
    const total = await runManager.countRuns({
      status: 'running',
    });

    const response = createPaginatedResponse(
      enrichedRuns,
      total,
      limit,
      page,
      skip
    );

    res.json(response);
  }));

  /**
   * GET /api/workflows/admin/workflows/stuck
   * Get stuck workflows (exceeded timeout by threshold)
   * 
   * Query parameters:
   * - threshold: Multiplier for timeout (default: 1.2, meaning 20% over timeout)
   * - limit: Number of results (default: 50)
   * - skip: Number of results to skip (default: 0)
   */
  router.get('/admin/workflows/stuck', asyncHandler(async (req: Request, res: Response) => {
    const { limit, skip, page } = parsePaginationParams(req.query, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    const threshold = parseFloat((req.query.threshold as string) || '1.2');

    // Get all running workflows
    const runs = await runManager.getRunHistory({
      status: 'running',
      limit: 1000, // Get more to filter for stuck ones
      skip: 0,
    });

    // Filter for stuck workflows
    const stuckRuns: EnrichedRun[] = [];

    for (const run of runs) {
      try {
        const runWorkflowId = run.params?.workflowId as string | undefined;
        if (!runWorkflowId) {
          continue;
        }

        // Get workflow to determine timeout
        const workflow = await WorkflowModel.findById(runWorkflowId);
        if (!workflow) {
          continue;
        }

        const workflowTimeout = workflow.timeout || 2 * 60 * 60 * 1000; // Default 2 hours
        const startTime = run.startTime || new Date();
        const elapsedTime = Date.now() - startTime.getTime();
        const stuckThreshold = workflowTimeout * threshold;

        if (elapsedTime > stuckThreshold) {
          const percentageOverTimeout = ((elapsedTime / workflowTimeout) - 1) * 100;

          stuckRuns.push({
            _id: run._id?.toString() || '',
            runId: run._id?.toString() || '',
            workflowId: runWorkflowId,
            workflowName: workflow.name,
            status: run.status || 'unknown',
            startTime,
            elapsedTime,
            workflowTimeout,
            percentageUsed: (elapsedTime / workflowTimeout) * 100,
            isApproachingTimeout: true,
            isStuck: true,
            percentageOverTimeout,
            currentStepId: run.params?.__resumeStepId as string | undefined,
            params: run.params,
          });
        }
      } catch (error) {
        logger.error(
          { error, runId: run._id?.toString() },
          'Error checking if run is stuck'
        );
        // Continue with other runs
      }
    }

    // Sort by percentage over timeout (most stuck first)
    stuckRuns.sort((a, b) => {
      const aOver = a.percentageOverTimeout || 0;
      const bOver = b.percentageOverTimeout || 0;
      return bOver - aOver;
    });

    // Apply pagination
    const paginatedRuns = stuckRuns.slice(skip, skip + limit);
    const total = stuckRuns.length;

    const response = createPaginatedResponse(
      paginatedRuns,
      total,
      limit,
      page,
      skip
    );

    res.json(response);
  }));

  /**
   * GET /api/workflows/admin/workflows/stats
   * Get workflow monitoring statistics
   */
  router.get('/admin/workflows/stats', asyncHandler(async (_req: Request, res: Response) => {
    // Get counts
    const runningCount = await runManager.countRuns({ status: 'running' });
    const pendingCount = await runManager.countRuns({ status: 'pending' });
    const completedCount = await runManager.countRuns({ status: 'completed' });
    const failedCount = await runManager.countRuns({ status: 'failed' });

    // Get running workflows to calculate approaching timeout count
    const runningRuns = await runManager.getRunHistory({
      status: 'running',
      limit: 1000, // Get all to count approaching timeout
    });

    let approachingTimeoutCount = 0;
    let stuckCount = 0;

    for (const run of runningRuns) {
      try {
        const runWorkflowId = run.params?.workflowId as string | undefined;
        if (!runWorkflowId) {
          continue;
        }

        const workflow = await WorkflowModel.findById(runWorkflowId);
        if (!workflow) {
          continue;
        }

        const workflowTimeout = workflow.timeout || 2 * 60 * 60 * 1000;
        const startTime = run.startTime || new Date();
        const elapsedTime = Date.now() - startTime.getTime();
        const percentageUsed = (elapsedTime / workflowTimeout) * 100;

        if (percentageUsed >= 80) {
          approachingTimeoutCount++;
        }

        if (elapsedTime > workflowTimeout * 1.2) {
          stuckCount++;
        }
      } catch (_error) {
        // Continue with other runs
      }
    }

    res.json({
      running: runningCount,
      pending: pendingCount,
      completed: completedCount,
      failed: failedCount,
      approachingTimeout: approachingTimeoutCount,
      stuck: stuckCount,
    });
  }));

  return router;
}


