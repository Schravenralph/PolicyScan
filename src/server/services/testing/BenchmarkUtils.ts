/**
 * Benchmark Utilities
 * Utility methods for benchmark operations
 */

import { ObjectId, type Filter, type Collection } from 'mongodb';
import { getDB } from '../../config/database.js';
import { FeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import { BronDocumentDocument } from '../../types/index.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import type { Workflow } from '../infrastructure/types.js';
import type { BenchmarkRepository } from './BenchmarkRepository.js';
import type { BenchmarkResultDocument } from './BenchmarkRepository.js';
import { DEFAULT_BENCHMARK_CONFIG } from './BenchmarkConfig.js';

export interface DatabaseValidationResult {
  valid: boolean;
  message?: string;
  documentCount?: number;
  matchingCount?: number;
}

/**
 * Utility functions for benchmark operations
 */
export class BenchmarkUtils {
  /**
   * Validate database state before running benchmarks
   */
  static async validateDatabaseState(query: string): Promise<DatabaseValidationResult> {
    try {
      const db = getDB();
      const collection = db.collection<BronDocumentDocument>('brondocumenten');
      
      // Check total document count
      const totalCount = await collection.countDocuments();
      logger.debug({ totalCount }, 'Database validation: total document count');
      
      if (totalCount === 0) {
        return {
          valid: false,
          message: 'Database is empty. Please seed the database with documents before running benchmarks.',
          documentCount: 0,
        };
      }
      
      // Check if query matches any documents
      const queryFilter: Filter<BronDocumentDocument> = {
        $or: [
          { titel: { $regex: query, $options: 'i' } },
          { samenvatting: { $regex: query, $options: 'i' } },
        ],
      };
      const matchingCount = await collection.countDocuments(queryFilter);
      logger.debug({ query, matchingCount }, 'Database validation: query matching count');
      
      if (matchingCount === 0) {
        return {
          valid: false,
          message: `Query "${query}" does not match any documents in the database. Please use a query that matches existing documents.`,
          documentCount: totalCount,
          matchingCount: 0,
        };
      }
      
      return {
        valid: true,
        documentCount: totalCount,
        matchingCount,
      };
    } catch (error) {
      logger.error({ error }, 'Error validating database state');
      return {
        valid: false,
        message: `Error validating database: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Initialize WorkflowEngine and RunManager if not already set
   * This allows lazy initialization to avoid circular dependencies
   */
  static async ensureWorkflowDependencies(
    workflowEngine?: WorkflowEngine,
    runManager?: RunManager
  ): Promise<{ workflowEngine: WorkflowEngine; runManager: RunManager }> {
    if (!workflowEngine || !runManager) {
      const { WorkflowEngine } = await import('../workflow/WorkflowEngine.js');
      const { RunManager } = await import('../workflow/RunManager.js');
      const { getDB } = await import('../../config/database.js');
      const db = getDB();
      const runManagerInstance = new RunManager(db);
      const workflowEngineInstance = new WorkflowEngine(runManagerInstance);
      return {
        workflowEngine: workflowEngineInstance,
        runManager: runManagerInstance,
      };
    }
    return { workflowEngine, runManager };
  }

  /**
   * Apply feature flags temporarily
   * Returns a restore function to revert changes
   */
  static async applyFeatureFlags(
    featureFlags?: Record<string, boolean>
  ): Promise<() => Promise<void>> {
    if (!featureFlags || Object.keys(featureFlags).length === 0) {
      return async () => {}; // No-op restore function
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
      await FeatureFlag.setFlags(featureFlags, 'benchmark-service');
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
   * Cleanup benchmark workflow runs older than retention period
   * 
   * @param benchmarkRunId - Optional: cleanup runs for a specific benchmark run
   * @param retentionDays - Number of days to retain runs (default: 7)
   */
  static async cleanupBenchmarkWorkflowRuns(
    benchmarkRunId?: string,
    retentionDays: number = 7
  ): Promise<number> {
    const db = getDB();
    const runsCollection = db.collection('runs');
    
    // Ensure index exists for performance (idempotent - safe to call multiple times)
    try {
      await runsCollection.createIndex(
        { 'params.benchmarkRunId': 1, 'params.isBenchmark': 1, startTime: 1 },
        { background: true, name: 'benchmark_cleanup_idx' }
      );
    } catch (error) {
      // Index might already exist, which is fine
      logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'Index creation result (may already exist)');
    }
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    // Build filter: find runs marked as benchmarks that are older than retention period
    const filter: Filter<unknown> = {
      'params.isBenchmark': true,
      'params.benchmarkRunId': benchmarkRunId ? benchmarkRunId : { $exists: true },
      startTime: { $lt: cutoffDate },
    };
    
    // If specific benchmark run ID provided, only cleanup runs for that benchmark
    if (benchmarkRunId) {
      filter['params.benchmarkRunId'] = benchmarkRunId;
    }
    
    try {
      const result = await runsCollection.deleteMany(filter);
      const deletedCount = result.deletedCount || 0;
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} benchmark workflow run(s) older than ${retentionDays} days${benchmarkRunId ? ` for benchmark ${benchmarkRunId}` : ''}`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error({ error }, 'Error cleaning up benchmark workflow runs');
      throw error;
    }
  }

  /**
   * Execute a single workflow task for benchmarking
   * Extracted from BenchmarkService for better organization
   */
  static async executeSingleWorkflowTask(
    runId: string,
    task: {
      workflowId: string;
      workflowName: string;
      workflow: Workflow;
      query: string;
      runNumber: number;
      totalRuns: number;
      featureFlags?: Record<string, boolean>;
    },
    resultsCollection: Collection<BenchmarkResultDocument>,
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    repository: BenchmarkRepository
  ): Promise<void> {
    const { workflowId, workflowName, workflow, query, runNumber, totalRuns, featureFlags } = task;
    const startTime = Date.now();
    
    // Apply feature flags if provided
    const restoreFeatureFlags = await BenchmarkUtils.applyFeatureFlags(featureFlags);
    
    try {
      // Execute workflow with the query
      const workflowParams = {
        query,
        onderwerp: query,
        thema: '',
        overheidslaag: '',
        // Mark workflow run as benchmark run for cleanup
        benchmarkRunId: runId,
        isBenchmark: true,
      };

      // Validate workflow before execution
      if (!workflow || !workflow.id || !workflow.steps || workflow.steps.length === 0) {
        throw new Error(`Invalid workflow: ${workflowId} - missing required fields`);
      }

      const runIdForWorkflow = await workflowEngine.startWorkflow(workflow, workflowParams);
      
      if (!runIdForWorkflow) {
        throw new Error(`Failed to start workflow ${workflowId} - no run ID returned`);
      }
      
      // Wait for workflow to complete (polling with timeout)
      let workflowRun = await runManager.getRun(runIdForWorkflow);
      let attempts = 0;
      const maxAttempts = DEFAULT_BENCHMARK_CONFIG.maxAttempts;
      const pollInterval = DEFAULT_BENCHMARK_CONFIG.pollInterval;
      const startPollTime = Date.now();
      
      while (workflowRun && workflowRun.status === 'running' && attempts < maxAttempts) {
        // Check if benchmark run was cancelled
        const benchmarkStatus = await repository.getBenchmarkStatus(runId);
        if (benchmarkStatus?.status === 'cancelled') {
          logger.info(`Benchmark run ${runId} was cancelled, stopping workflow ${workflowId}`);
          try {
            await runManager.updateStatus(runIdForWorkflow, 'cancelled');
          } catch (cancelError) {
            logger.error({ error: cancelError }, `Failed to cancel workflow run ${runIdForWorkflow}`);
          }
          throw new Error(`Benchmark run ${runId} was cancelled`);
        }
        
        // Exponential backoff for polling (starts at 2s, max 10s)
        const currentPollInterval = Math.min(pollInterval * Math.pow(1.1, Math.floor(attempts / 10)), 10000);
        await new Promise(resolve => setTimeout(resolve, currentPollInterval));
        workflowRun = await runManager.getRun(runIdForWorkflow);
        attempts++;
        
        // Check for timeout (30 minutes)
        if (Date.now() - startPollTime > DEFAULT_BENCHMARK_CONFIG.timeoutMs) {
          logger.warn(`Workflow ${workflowId} timed out after 30 minutes`);
          // Try to cancel the workflow run
          try {
            await runManager.updateStatus(runIdForWorkflow, 'cancelled');
          } catch (cancelError) {
            logger.error({ error: cancelError }, `Failed to cancel workflow run ${runIdForWorkflow}`);
          }
          break;
        }
      }
      
      // Check if workflow timed out or was cancelled
      if (!workflowRun) {
        throw new Error(`Workflow ${workflowId} run not found: ${runIdForWorkflow}`);
      }
      
      if (workflowRun.status === 'running') {
        throw new Error(`Workflow ${workflowId} timed out after 30 minutes`);
      }
      
      if (workflowRun.status === 'cancelled') {
        throw new Error(`Workflow ${workflowId} was cancelled`);
      }

      const executionTime = Date.now() - startTime;

      // Extract documents from workflow output
      let documents: Array<{
        url: string;
        titel: string;
        samenvatting: string;
        score: number;
        rank: number;
        documentId?: string;
      }> = [];

      if (workflowRun && workflowRun.status === 'completed') {
        // Try to extract documents from workflow run result
        try {
          // Extract from run.result.documents if available
          if (workflowRun.result && workflowRun.result.documents && Array.isArray(workflowRun.result.documents)) {
            type WorkflowResultDocument = {
              url?: string;
              link?: string;
              titel?: string;
              title?: string;
              name?: string;
              samenvatting?: string;
              snippet?: string;
              description?: string;
              summary?: string;
              relevanceScore?: number;
              score?: number;
              id?: string;
              _id?: { toString(): string } | string | { toString(): string };
            };
            
            documents = (workflowRun.result.documents as WorkflowResultDocument[]).map((doc, index: number) => ({
              url: doc.url || doc.link || '',
              titel: doc.titel || doc.title || doc.name || '',
              samenvatting: doc.samenvatting || doc.snippet || doc.description || doc.summary || '',
              score: doc.relevanceScore || doc.score || 0,
              rank: index + 1,
              documentId: doc.id || doc._id?.toString(),
            }));
          }
        } catch (outputError) {
          logger.warn({ error: outputError }, 'Could not extract workflow output');
        }
      }

      const result: BenchmarkResultDocument = {
        benchmarkRunId: new ObjectId(runId),
        benchmarkType: 'workflow',
        configName: totalRuns > 1 
          ? `${workflowName} (${workflowId}) - Run ${runNumber}/${totalRuns}`
          : `${workflowName} (${workflowId})`,
        configSnapshot: {
          workflowId,
          workflowName,
          query,
          workflowSteps: workflow.steps?.length || 0,
          runNumber: totalRuns > 1 ? runNumber : undefined,
          totalRuns: totalRuns > 1 ? totalRuns : undefined,
          featureFlags: featureFlags ? { ...featureFlags } : undefined, // Store per-workflow feature flags
        },
        documents,
        metrics: {
          documentsFound: documents.length,
          averageScore: documents.length > 0
            ? documents.reduce((sum, doc) => sum + doc.score, 0) / documents.length
            : 0,
          executionTimeMs: executionTime,
        },
        createdAt: new Date(),
      };

      await resultsCollection.insertOne(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error({ error, workflowId, query }, `Error benchmarking workflow ${workflowId} with query "${query}"`);
      
      // Still record the error as a result for analysis
      const result: BenchmarkResultDocument = {
        benchmarkRunId: new ObjectId(runId),
        benchmarkType: 'workflow',
        configName: totalRuns > 1 
          ? `${workflowName} (${workflowId}) - Run ${runNumber}/${totalRuns}`
          : `${workflowName} (${workflowId})`,
        configSnapshot: {
          workflowId,
          workflowName,
          query,
          runNumber: totalRuns > 1 ? runNumber : undefined,
          totalRuns: totalRuns > 1 ? totalRuns : undefined,
          error: errorMessage,
          errorDetails: errorStack ? { stack: errorStack } : undefined,
          featureFlags: featureFlags ? { ...featureFlags } : undefined, // Store per-workflow feature flags even on error
        },
        documents: [],
        metrics: {
          documentsFound: 0,
          averageScore: 0,
          executionTimeMs: Date.now() - startTime,
        },
        createdAt: new Date(),
      };
      await resultsCollection.insertOne(result);
    } finally {
      // Always restore feature flags, even on error
      await restoreFeatureFlags();
    }
  }
}
