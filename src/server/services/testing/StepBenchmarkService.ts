/**
 * Step Benchmark Service
 * 
 * Enables benchmarking of individual workflow steps in isolation.
 * Supports mock context injection and real context from previous step execution.
 */

import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { FeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import { getWorkflowById } from '../../utils/workflowLookup.js';
import type { Workflow } from '../infrastructure/types.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';

const STEP_BENCHMARK_RUNS_COLLECTION = 'step_benchmark_runs';

export interface StepBenchmarkConfig {
  workflowId: string;
  stepId: string;
  context?: Record<string, unknown>; // Mock or real context
  useRealContext?: boolean; // If true, execute previous steps to get real context
  featureFlags?: Record<string, boolean>;
  query?: string;
  runsPerStep?: number; // Number of times to run the step (default: 1)
  name?: string; // Optional name for the benchmark run
}

export interface StepBenchmarkResult {
  stepId: string;
  stepName: string;
  executionTimeMs: number;
  documentsFound?: number;
  documentsProcessed?: number;
  memoryUsageMB?: number;
  contextSize?: number;
  error?: string;
  featureFlags?: Record<string, boolean>;
  result?: Record<string, unknown>;
}

export interface StepBenchmarkRunDocument {
  _id?: ObjectId;
  name: string;
  workflowId: string;
  stepId: string;
  stepName: string;
  context?: Record<string, unknown>;
  useRealContext: boolean;
  featureFlags?: Record<string, boolean>;
  query?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  results?: StepBenchmarkResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date; // Timestamp when benchmark was cancelled
  error?: string;
}

export class StepBenchmarkService {
  private activeRuns = new Map<string, Promise<void>>();

  constructor(
    private workflowEngine: WorkflowEngine,
    private runManager: RunManager
  ) { }

  /**
   * Start a step benchmark run
   */
  async startStepBenchmark(config: StepBenchmarkConfig): Promise<string> {
    // Validate workflow exists
    const workflow = await getWorkflowById(config.workflowId);
    if (!workflow) {
      throw new NotFoundError('Workflow', config.workflowId);
    }

    // Validate step exists in workflow
    const step = workflow.steps.find(s => s.id === config.stepId);
    if (!step) {
      throw new BadRequestError(`Step not found: ${config.stepId} in workflow ${config.workflowId}`, {
        stepId: config.stepId,
        workflowId: config.workflowId,
      });
    }

    const db = getDB();
    const collection = db.collection<StepBenchmarkRunDocument>(STEP_BENCHMARK_RUNS_COLLECTION);

    const run: StepBenchmarkRunDocument = {
      name: config.name || `Step Benchmark: ${step.name}`,
      workflowId: config.workflowId,
      stepId: config.stepId,
      stepName: step.name,
      context: config.context,
      useRealContext: config.useRealContext || false,
      featureFlags: config.featureFlags,
      query: config.query,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await collection.insertOne(run);
    const runId = result.insertedId.toString();

    // Start benchmark execution asynchronously
    const executionPromise = this.executeStepBenchmark(runId, config)
      .catch((error) => {
        logger.error({ error, runId }, 'Error executing step benchmark');
      })
      .finally(() => {
        this.activeRuns.delete(runId);
      });

    this.activeRuns.set(runId, executionPromise);

    return runId;
  }

  /**
   * Execute step benchmark
   */
  private async executeStepBenchmark(
    runId: string,
    config: StepBenchmarkConfig
  ): Promise<void> {
    const db = getDB();
    const collection = db.collection<StepBenchmarkRunDocument>(STEP_BENCHMARK_RUNS_COLLECTION);

    try {
      // Update status to running
      await collection.updateOne(
        { _id: new ObjectId(runId) },
        {
          $set: {
            status: 'running',
            startedAt: new Date(),
          },
        }
      );

      // Apply feature flags if provided
      const restoreFeatureFlags = await this.applyFeatureFlags(config.featureFlags);

      try {
        // Get workflow
        const workflow = await getWorkflowById(config.workflowId);
        if (!workflow) {
          throw new NotFoundError('Workflow', config.workflowId);
        }

        // Prepare context
        let context: Record<string, unknown> = {};

        if (config.useRealContext) {
          // Execute previous steps to get real context
          context = await this.executePreviousSteps(workflow, config.stepId, config.query);
        } else if (config.context) {
          // Use provided mock context
          context = config.context;
        } else {
          // Use minimal context with query if provided
          context = config.query ? { query: config.query } : {};
        }

        // Run the step multiple times if requested
        const runsPerStep = config.runsPerStep || 1;
        const results: StepBenchmarkResult[] = [];

        for (let i = 0; i < runsPerStep; i++) {
          // Check for cancellation
          const currentRun = await collection.findOne({ _id: new ObjectId(runId) });
          if (currentRun?.status === 'cancelled') {
            logger.info({ runId }, 'Step benchmark cancelled during execution');
            break;
          }

          const result = await this.executeStepWithMetrics(
            workflow,
            config.stepId,
            context,
            runId,
            config.featureFlags
          );
          results.push(result);
        }

        // Check if status is cancelled before marking completed
        const finalCheck = await collection.findOne({ _id: new ObjectId(runId) });
        if (finalCheck?.status === 'cancelled') {
          return;
        }

        // Update status to completed
        await collection.updateOne(
          { _id: new ObjectId(runId) },
          {
            $set: {
              status: 'completed',
              completedAt: new Date(),
              results,
            },
          }
        );

        logger.info(
          { runId, stepId: config.stepId, runsPerStep, resultsCount: results.length },
          'Step benchmark completed successfully'
        );
      } finally {
        // Restore feature flags
        await restoreFeatureFlags();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, runId }, 'Step benchmark failed');

      await collection.updateOne(
        { _id: new ObjectId(runId) },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            error: errorMessage,
          },
        }
      );
    }
  }

  /**
   * Execute previous steps to get real context
   */
  private async executePreviousSteps(
    workflow: Workflow,
    targetStepId: string,
    query?: string
  ): Promise<Record<string, unknown>> {
    let context: Record<string, unknown> = query ? { query } : {};

    // Find the target step index
    const targetStepIndex = workflow.steps.findIndex(s => s.id === targetStepId);
    if (targetStepIndex === -1) {
      throw new BadRequestError(`Step not found: ${targetStepId}`, {
        stepId: targetStepId,
        workflowId: workflow.id,
      });
    }

    // Execute all steps before the target step
    for (let i = 0; i < targetStepIndex; i++) {
      const step = workflow.steps[i];
      const runId = `step-benchmark-${Date.now()}-${i}`;

      try {
        // Create a temporary run for this step
        await this.runManager.createRun(workflow.id, context);

        // Execute the step
        const stepResult = await this.executeStepDirectly(
          workflow,
          step.id,
          context,
          runId
        );

        if (stepResult && stepResult.result) {
          // Merge result into context
          context = {
            ...context,
            ...stepResult.result,
          };
        }
      } catch (error) {
        logger.warn(
          { error, stepId: step.id, workflowId: workflow.id },
          'Error executing previous step for context, continuing with partial context'
        );
        // Continue with partial context
      }
    }

    return context;
  }

  /**
   * Execute step directly (workaround for accessing private executor)
   */
  private async executeStepDirectly(
    workflow: Workflow,
    stepId: string,
    context: Record<string, unknown>,
    runId: string
  ): Promise<{ result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null> {
    // Access executor through WorkflowEngine's internal structure
    // Note: executor is private, but needed for testing. Consider exposing a public method in WorkflowEngine.
    interface WorkflowEngineWithExecutor {
      executor?: {
        executeStep: (
          workflow: Workflow,
          stepId: string,
          context: Record<string, unknown>,
          runId: string
        ) => Promise<{ result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null>;
      };
    }
    const executor = (this.workflowEngine as unknown as WorkflowEngineWithExecutor).executor;
    if (!executor) {
      throw new Error('WorkflowEngine executor not available');
    }

    return await executor.executeStep(workflow, stepId, context, runId);
  }

  /**
   * Execute step with metrics collection
   */
  private async executeStepWithMetrics(
    workflow: Workflow,
    stepId: string,
    context: Record<string, unknown>,
    runId: string,
    featureFlags?: Record<string, boolean>
  ): Promise<StepBenchmarkResult> {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new BadRequestError(`Step not found: ${stepId}`, {
        stepId,
        workflowId: workflow.id,
      });
    }

    // Measure memory before execution
    const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    const startTime = Date.now();
    let error: string | undefined;
    let result: Record<string, unknown> | null | undefined = null;

    try {
      // Execute step directly
      const stepResult = await this.executeStepDirectly(
        workflow,
        stepId,
        context,
        runId
      );

      if (stepResult) {
        result = stepResult.result || null;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error({ error: err, stepId, runId }, 'Error executing step in benchmark');
    }

    const executionTimeMs = Date.now() - startTime;
    const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    const memoryUsageMB = memoryAfter - memoryBefore;

    // Extract document counts from result
    let documentsFound: number | undefined;
    let documentsProcessed: number | undefined;

    if (result) {
      // Try to extract document counts from various possible result structures
      if (Array.isArray(result.documents)) {
        documentsFound = result.documents.length;
        documentsProcessed = result.documents.length;
      } else if (result.scoredDocuments && Array.isArray(result.scoredDocuments)) {
        documentsFound = result.scoredDocuments.length;
        documentsProcessed = result.scoredDocuments.length;
      } else if (result.documentsByCategory && typeof result.documentsByCategory === 'object') {
        const categories = result.documentsByCategory as Record<string, unknown[]>;
        documentsFound = Object.values(categories).reduce(
          (sum, docs) => sum + (Array.isArray(docs) ? docs.length : 0),
          0
        );
        documentsProcessed = documentsFound;
      }
    }

    const contextSize = JSON.stringify(context).length;

    return {
      stepId,
      stepName: step.name,
      executionTimeMs,
      documentsFound,
      documentsProcessed,
      memoryUsageMB,
      contextSize,
      error,
      featureFlags,
      result: result || undefined,
    };
  }

  /**
   * Apply feature flags temporarily
   */
  private async applyFeatureFlags(
    featureFlags?: Record<string, boolean>
  ): Promise<() => Promise<void>> {
    if (!featureFlags || Object.keys(featureFlags).length === 0) {
      return async () => { }; // No-op restore function
    }

    const originalFlags: Record<string, string | undefined> = {};

    // Store original environment variable values
    for (const [flagName, enabled] of Object.entries(featureFlags)) {
      originalFlags[flagName] = process.env[flagName];
      process.env[flagName] = enabled ? 'true' : 'false';
    }

    // Update database cache
    try {
      await FeatureFlag.initializeService();
      await FeatureFlag.setFlags(featureFlags, 'step-benchmark');
    } catch (error) {
      logger.warn({ error }, 'Failed to update feature flags in database');
    }

    // Return restore function
    return async () => {
      // Restore original environment variable values
      for (const [flagName, originalValue] of Object.entries(originalFlags)) {
        if (originalValue === undefined) {
          delete process.env[flagName];
        } else {
          process.env[flagName] = originalValue;
        }
      }

      // Refresh cache to restore original values
      try {
        await FeatureFlag.refreshCache();
      } catch (error) {
        logger.warn({ error }, 'Failed to refresh feature flag cache after restore');
      }
    };
  }

  /**
   * Get step benchmark status
   */
  async getStepBenchmarkStatus(runId: string): Promise<(StepBenchmarkRunDocument & { id: string }) | null> {
    if (!ObjectId.isValid(runId)) {
      throw new BadRequestError(`Invalid runId format: ${runId}`, {
        runId,
      });
    }

    const db = getDB();
    const collection = db.collection<StepBenchmarkRunDocument>(STEP_BENCHMARK_RUNS_COLLECTION);

    const document = await collection.findOne({ _id: new ObjectId(runId) });

    // Transform _id to id for API compatibility
    if (!document) {
      return null;
    }

    // MongoDB documents have _id as ObjectId, convert to string for API
    const idValue = document._id instanceof ObjectId
      ? document._id.toString()
      : (document._id ? String(document._id) : runId);

    // Create result object with explicit id field
    // Manually construct result to ensure id is set
    const result: StepBenchmarkRunDocument & { id: string } = {
      _id: document._id,
      name: document.name,
      workflowId: document.workflowId,
      stepId: document.stepId,
      stepName: document.stepName,
      context: document.context,
      useRealContext: document.useRealContext,
      featureFlags: document.featureFlags,
      query: document.query,
      status: document.status,
      results: document.results,
      createdAt: document.createdAt,
      startedAt: document.startedAt,
      completedAt: document.completedAt,
      cancelledAt: document.cancelledAt,
      error: document.error,
      id: idValue, // Explicitly set id field
    };
    
    return result;
  }

  /**
   * List step benchmarks
   */
  async listStepBenchmarks(limit = 50, skip = 0): Promise<StepBenchmarkRunDocument[]> {
    const db = getDB();
    const collection = db.collection<StepBenchmarkRunDocument>(STEP_BENCHMARK_RUNS_COLLECTION);

    return await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Cancel a step benchmark
   */
  async cancelStepBenchmark(runId: string): Promise<void> {
    const db = getDB();
    const collection = db.collection<StepBenchmarkRunDocument>(STEP_BENCHMARK_RUNS_COLLECTION);

    logger.info({ runId }, 'Cancelling step benchmark');

    // Check if benchmark exists
    const run = await collection.findOne({ _id: new ObjectId(runId) });
    if (!run) {
      logger.info({ runId }, 'Step benchmark not found for cancellation');
      throw new NotFoundError('Step benchmark run', runId);
    }

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(runId) },
      {
        $set: {
          status: 'cancelled',
          completedAt: new Date(),
          cancelledAt: new Date(), // Add cancelledAt for API compatibility
        },
      }
    );

    logger.info({ runId, modifiedCount: updateResult.modifiedCount }, 'Step benchmark cancelled');
  }

  /**
   * Wait for a benchmark run to complete
   */
  async waitForBenchmark(runId: string): Promise<void> {
    const promise = this.activeRuns.get(runId);
    if (promise) {
      await promise;
    }
  }

  /**
   * Cancel a benchmark run and wait for it to complete
   */
  async cancelAndWaitForBenchmark(runId: string): Promise<void> {
    try {
      await this.cancelStepBenchmark(runId);
    } catch (error) {
      // Ignore errors if run is not cancellable (e.g. already finished or not found)
      if (error instanceof Error && !error.message.includes('with status') && !(error instanceof NotFoundError)) {
        throw error;
      }
    }
    await this.waitForBenchmark(runId);
  }

  /**
   * Cancel all active benchmark runs and wait for them to complete
   */
  async cancelAllActiveRunsAndWait(): Promise<void> {
    const promises: Promise<void>[] = [];

    // Create copy of keys to iterate since map will be modified in finally blocks
    const activeRunIds = Array.from(this.activeRuns.keys());

    for (const runId of activeRunIds) {
      const promise = this.activeRuns.get(runId);
      if (promise) {
        promises.push(promise);
        // Cancel the run
        this.cancelStepBenchmark(runId).catch(() => {
          // Ignore cancellation errors
        });
      }
    }

    await Promise.allSettled(promises);
  }
}
