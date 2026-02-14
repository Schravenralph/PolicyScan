/**
 * Benchmark Repository
 * Handles all database operations for benchmark runs and results
 */

import { ObjectId, type Collection, Filter } from 'mongodb';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { BENCHMARK_RUNS_COLLECTION, BENCHMARK_RESULTS_COLLECTION } from './BenchmarkConfig.js';

export interface BenchmarkRunDocument {
  _id?: ObjectId;
  name: string;
  query?: string; // Optional for workflow benchmarks
  queries?: string[]; // Array of queries tested
  benchmarkTypes: string[];
  workflowIds?: string[]; // Array of workflow IDs benchmarked
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  error?: string;
  featureFlags?: Record<string, boolean>; // Snapshot of feature flags at time of run
  // Execution parameters for accurate progress calculation
  runsPerWorkflow?: number; // Number of times to run each workflow/query combination
  maxWorkflowTemplates?: number; // Maximum number of workflow templates tested
  executionMode?: 'sequential' | 'parallel'; // Execution mode used
  maxConcurrent?: number; // Maximum concurrent workflows for parallel mode
  actualWorkflowIds?: string[]; // Actual workflow IDs that were selected for benchmarking
}

export interface BenchmarkResultDocument {
  _id?: ObjectId;
  benchmarkRunId: ObjectId;
  benchmarkType: string;
  configName: string;
  configSnapshot: Record<string, unknown>;
  documents: Array<{
    url: string;
    titel: string;
    samenvatting: string;
    score: number;
    rank: number;
    documentId?: string;
  }>;
  metrics: {
    documentsFound: number;
    averageScore: number;
    executionTimeMs: number;
  };
  createdAt: Date;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

export interface BenchmarkProgress {
  totalWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  currentWorkflow?: string;
  estimatedTimeRemaining?: number; // in seconds
  progressPercentage: number;
  startTime?: string;
  elapsedTime?: number; // in seconds
}

/**
 * Repository for benchmark database operations
 */
export class BenchmarkRepository {
  /**
   * Update benchmark run status
   */
  async updateBenchmarkRunStatus(
    runId: string,
    status: BenchmarkRunDocument['status'],
    error?: string
  ): Promise<void> {
    const db = getDB();
    const collection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    const updatePayload: Partial<BenchmarkRunDocument> = {
      status,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled' 
        ? { completedAt: new Date() } 
        : {}),
      ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}),
      ...(error ? { error } : {}),
    };

    const update = {
      $set: updatePayload
    };
    await collection.updateOne({ _id: new ObjectId(runId) }, update);
  }

  /**
   * Cancel a running benchmark
   */
  async cancelBenchmarkRun(runId: string): Promise<void> {
    const db = getDB();
    const collection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    const run = await collection.findOne({ _id: new ObjectId(runId) });
    if (!run) {
      const { NotFoundError } = await import('../../types/errors.js');
      throw new NotFoundError('Benchmark run', runId);
    }

    if (run.status !== 'pending' && run.status !== 'running') {
      throw new Error(`Cannot cancel benchmark run ${runId} with status: ${run.status}`);
    }

    await this.updateBenchmarkRunStatus(runId, 'cancelled', 'Cancelled by user');
  }

  /**
   * List all benchmark runs
   */
  async listBenchmarkRuns(): Promise<Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    completedAt?: string;
    queries?: string[]; // Include queries array if present
  }>> {
    const db = getDB();
    const collection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    const runs = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return runs.map((run) => ({
      id: run._id!.toString(),
      name: run.name,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      ...(run.queries && { queries: run.queries }), // Include queries if present
    }));
  }

  /**
   * Get benchmark status
   */
  async getBenchmarkStatus(runId: string): Promise<{
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  } | null> {
    const db = getDB();
    const collection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    const run = await collection.findOne({ _id: new ObjectId(runId) });

    if (!run) {
      return null;
    }

    return {
      id: run._id!.toString(),
      status: run.status,
    };
  }

  /**
   * Get benchmark run details
   */
  async getBenchmarkRun(runId: string): Promise<{
    id: string;
    name: string;
    query?: string;
    queries?: string[];
    benchmarkTypes: string[];
    workflowIds?: string[];
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    completedAt?: string;
    cancelledAt?: string;
    error?: string;
    featureFlags?: Record<string, boolean>;
  } | null> {
    const db = getDB();
    const collection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    const run = await collection.findOne({ _id: new ObjectId(runId) });

    if (!run) {
      return null;
    }

    return {
      id: run._id!.toString(),
      name: run.name,
      query: run.query,
      queries: run.queries,
      benchmarkTypes: run.benchmarkTypes,
      workflowIds: run.workflowIds,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      cancelledAt: run.cancelledAt?.toISOString(),
      error: run.error,
      featureFlags: run.featureFlags,
    };
  }

  /**
   * Get benchmark result
   */
  async getBenchmarkResult(resultId: string): Promise<{
    id: string;
    benchmarkRunId: string;
    benchmarkType: string;
    configName: string;
    configSnapshot: Record<string, unknown>;
    documents: BenchmarkResultDocument['documents'];
    metrics: BenchmarkResultDocument['metrics'];
    createdAt: string;
  } | null> {
    const db = getDB();
    const collection = db.collection<BenchmarkResultDocument>(BENCHMARK_RESULTS_COLLECTION);

    const result = await collection.findOne({ _id: new ObjectId(resultId) });

    if (!result) {
      return null;
    }

    return {
      id: result._id!.toString(),
      benchmarkRunId: result.benchmarkRunId.toString(),
      benchmarkType: result.benchmarkType,
      configName: result.configName,
      configSnapshot: result.configSnapshot,
      documents: result.documents,
      metrics: result.metrics,
      createdAt: result.createdAt.toISOString(),
    };
  }

  /**
   * Get benchmark progress
   */
  async getBenchmarkProgress(runId: string): Promise<BenchmarkProgress | null> {
    const db = getDB();
    const runsCollection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);
    const resultsCollection = db.collection<BenchmarkResultDocument>(BENCHMARK_RESULTS_COLLECTION);

    const run = await runsCollection.findOne({ _id: new ObjectId(runId) });

    if (!run) {
      return null;
    }

    // Get all results for this benchmark run
    const maxBenchmarkResults = parseInt(process.env.MAX_BENCHMARK_RESULTS || '1000', 10);
    const results = await resultsCollection
      .find({ benchmarkRunId: run._id! })
      .limit(maxBenchmarkResults)
      .toArray();

    // Calculate total expected workflows/queries
    let totalWorkflows = 0;

    // For workflow benchmarks, calculate based on stored parameters
    if (run.benchmarkTypes.includes('workflow')) {
      const queriesToTest = run.queries && run.queries.length > 0
        ? run.queries
        : run.query
          ? [run.query]
          : ['arbeidsmigranten huisvesting']; // Default query

      // Use stored parameters for accurate calculation
      const runsPerWorkflow = run.runsPerWorkflow || 1;
      
      // Use actual workflow IDs if stored, otherwise estimate from results
      if (run.actualWorkflowIds && run.actualWorkflowIds.length > 0) {
        // Accurate calculation using stored parameters
        totalWorkflows = run.actualWorkflowIds.length * queriesToTest.length * runsPerWorkflow;
      } else {
        // Fallback: estimate from results if parameters not stored (for older runs)
        const workflowResults = results.filter(r => r.benchmarkType === 'workflow');
        
        if (workflowResults.length > 0) {
          // Count unique workflow-query combinations from results
          const uniqueCombinations = new Set<string>();
          for (const result of workflowResults) {
            const workflowId = result.configSnapshot.workflowId as string | undefined;
            const query = result.configSnapshot.query as string | undefined;
            if (workflowId && query) {
              uniqueCombinations.add(`${workflowId}:${query}`);
            }
          }
          
          // Estimate total based on unique combinations and runs per workflow
          const maxRunNumber = Math.max(
            ...workflowResults.map(r => (r.configSnapshot.runNumber as number) || 1),
            1
          );
          totalWorkflows = uniqueCombinations.size * maxRunNumber;
        } else {
          // Conservative estimate if no results yet
          totalWorkflows = queriesToTest.length * runsPerWorkflow * 10; // Assume ~10 workflows by default
        }
      }
    } else {
      // For non-workflow benchmarks, count based on benchmark types and queries
      const queriesToTest = run.queries && run.queries.length > 0
        ? run.queries
        : run.query
          ? [run.query]
          : [];

      // Each benchmark type × query combination is one "workflow"
      for (const benchmarkType of run.benchmarkTypes) {
        if (benchmarkType === 'settings') {
          totalWorkflows += queriesToTest.length * 3; // 3 configs per query
        } else if (benchmarkType === 'relevance-scorer') {
          totalWorkflows += queriesToTest.length * 3; // 3 configs per query
        } else if (benchmarkType === 'reranker') {
          totalWorkflows += queriesToTest.length * 2; // 2 configs per query
        } else if (benchmarkType === 'hybrid-retrieval') {
          totalWorkflows += queriesToTest.length * 3; // 3 configs per query
        } else {
          totalWorkflows += queriesToTest.length; // 1 per query for unknown types
        }
      }
    }

    // Count completed and failed workflows
    const completedWorkflows = results.filter(r => !r.error).length;
    const failedWorkflows = results.filter(r => r.error).length;

    // Calculate progress percentage
    const progressPercentage = totalWorkflows > 0
      ? Math.round((completedWorkflows / totalWorkflows) * 100)
      : 0;

    // Calculate elapsed time
    const startTime = run.createdAt;
    const elapsedTime = Math.floor((Date.now() - startTime.getTime()) / 1000); // in seconds

    // Calculate ETA based on average execution time
    let estimatedTimeRemaining: number | undefined;
    if (completedWorkflows > 0 && totalWorkflows > completedWorkflows) {
      const averageExecutionTime = results
        .filter(r => !r.error && r.metrics.executionTimeMs)
        .reduce((sum, r) => sum + (r.metrics.executionTimeMs || 0), 0) / completedWorkflows;

      const remainingWorkflows = totalWorkflows - completedWorkflows;
      estimatedTimeRemaining = Math.round((averageExecutionTime * remainingWorkflows) / 1000); // in seconds
    }

    // Get current workflow from most recent result (if any)
    let currentWorkflow: string | undefined;
    if (results.length > 0) {
      const mostRecent = results.sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      )[0];
      
      if (mostRecent.benchmarkType === 'workflow') {
        const workflowName = mostRecent.configSnapshot.workflowName as string | undefined;
        const query = mostRecent.configSnapshot.query as string | undefined;
        if (workflowName && query) {
          currentWorkflow = `${workflowName} - ${query}`;
        }
      } else {
        currentWorkflow = `${mostRecent.benchmarkType} - ${mostRecent.configName}`;
      }
    }

    return {
      totalWorkflows,
      completedWorkflows,
      failedWorkflows,
      currentWorkflow,
      estimatedTimeRemaining,
      progressPercentage,
      startTime: startTime.toISOString(),
      elapsedTime,
    };
  }

  /**
   * Get results collection for inserting results
   */
  getResultsCollection(): Collection<BenchmarkResultDocument> {
    const db = getDB();
    return db.collection<BenchmarkResultDocument>(BENCHMARK_RESULTS_COLLECTION);
  }

  /**
   * Get runs collection for querying runs
   */
  getRunsCollection(): Collection<BenchmarkRunDocument> {
    const db = getDB();
    return db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);
  }
}

