
import { ObjectId, type Collection, Filter, type UpdateFilter } from 'mongodb';
import { getDB } from '../../config/database.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import type { RetrievedDocument } from '../query/HybridRetrievalService.js';
import type { ScrapedDocument, Workflow } from '../infrastructure/types.js';
import { BronDocumentDocument } from '../../types/index.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import { SettingsBenchmarkExecutor } from './benchmark-executors/SettingsBenchmarkExecutor.js';
import { RelevanceScorerBenchmarkExecutor } from './benchmark-executors/RelevanceScorerBenchmarkExecutor.js';
import { RerankerBenchmarkExecutor } from './benchmark-executors/RerankerBenchmarkExecutor.js';
import { HybridRetrievalBenchmarkExecutor } from './benchmark-executors/HybridRetrievalBenchmarkExecutor.js';
import type { BenchmarkExecutorDependencies } from './benchmark-executors/BaseBenchmarkExecutor.js';
import { BenchmarkSearchExecutor } from './BenchmarkSearchExecutor.js';
import { BenchmarkRepository } from './BenchmarkRepository.js';
import { BenchmarkAnalytics } from './BenchmarkAnalytics.js';
import { BenchmarkUtils } from './BenchmarkUtils.js';
import { BENCHMARK_RUNS_COLLECTION, BENCHMARK_RESULTS_COLLECTION } from './BenchmarkConfig.js';

// Type for documents that may have a score field (used in benchmarks)
type DocumentWithScore = (ScrapedDocument | RetrievedDocument) & { 
  score?: number;
  _id?: { toString(): string } | string;
};

// Type for workflow result documents (can have various shapes)
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


interface BenchmarkRunDocument {
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

interface StartBenchmarkRunParams {
  name: string;
  query?: string; // Optional for workflow benchmarks
  queries?: string[]; // Array of queries to test
  benchmarkTypes: string[];
  workflowIds?: string[]; // Array of workflow IDs to benchmark
  maxWorkflowTemplates?: number; // Maximum number of workflow templates to test (default: all)
  runsPerWorkflow?: number; // Number of times to run each workflow/query combination (default: 1)
  executionMode?: 'sequential' | 'parallel'; // Execution mode (default: 'sequential')
  maxConcurrent?: number; // Maximum concurrent workflows for parallel mode (default: 5)
  workflowConfigs?: Array<{
    workflowId: string;
    featureFlags?: Record<string, boolean>;
  }>; // Per-workflow feature flag configuration
}

interface BenchmarkProgress {
  totalWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  currentWorkflow?: string;
  estimatedTimeRemaining?: number; // in seconds
  progressPercentage: number;
  startTime?: string;
  elapsedTime?: number; // in seconds
}

export class BenchmarkService {
  private workflowEngine?: WorkflowEngine; // Optional to avoid circular deps
  private runManager?: RunManager; // Optional to avoid circular deps
  private searchExecutor: BenchmarkSearchExecutor;
  private settingsExecutor: SettingsBenchmarkExecutor;
  private relevanceScorerExecutor: RelevanceScorerBenchmarkExecutor;
  private rerankerExecutor: RerankerBenchmarkExecutor;
  private hybridRetrievalExecutor: HybridRetrievalBenchmarkExecutor;
  private repository: BenchmarkRepository;
  private analytics: BenchmarkAnalytics;
  private activeRuns = new Map<string, Promise<void>>();

  constructor(
    workflowEngine?: WorkflowEngine,
    runManager?: RunManager
  ) {
    this.workflowEngine = workflowEngine;
    this.runManager = runManager;

    // Initialize repository
    this.repository = new BenchmarkRepository();

    // Initialize search executor
    this.searchExecutor = new BenchmarkSearchExecutor();

    // Initialize analytics
    this.analytics = new BenchmarkAnalytics();

    // Initialize benchmark executors
    const executorDependencies: BenchmarkExecutorDependencies = {
      validateDatabaseState: async (query: string) => BenchmarkUtils.validateDatabaseState(query),
      executeSearchWithConfig: async (query: string, config: { name: string; description: string; settings: Partial<Record<string, boolean | number | string>> }) => this.searchExecutor.executeSearchWithConfig(query, config),
      executeSearchWithRelevanceConfig: async (query: string, weights: { keyword: number; semantic: number }) => this.searchExecutor.executeSearchWithRelevanceConfig(query, weights),
      executeSearchWithReranker: async (query: string, useReranker: boolean) => this.searchExecutor.executeSearchWithReranker(query, useReranker),
      executeHybridSearch: async (query: string, keywordWeight: number, semanticWeight: number) => this.searchExecutor.executeHybridSearch(query, keywordWeight, semanticWeight),
    };

    this.settingsExecutor = new SettingsBenchmarkExecutor(executorDependencies);
    this.relevanceScorerExecutor = new RelevanceScorerBenchmarkExecutor(executorDependencies);
    this.rerankerExecutor = new RerankerBenchmarkExecutor(executorDependencies);
    this.hybridRetrievalExecutor = new HybridRetrievalBenchmarkExecutor(executorDependencies);
  }
  /**
   * Start a new benchmark run
   */
  async startBenchmarkRun(params: StartBenchmarkRunParams): Promise<string> {
    const db = getDB();
    const collection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    // Capture current feature flag state
    let featureFlags: Record<string, boolean> | undefined;
    try {
      await FeatureFlag.initializeService();
      featureFlags = FeatureFlag.getBenchmarkConfig() as Record<string, boolean>;
    } catch (error) {
      logger.warn({ error }, 'Failed to capture feature flags for benchmark');
    }

    // Ensure query field is populated for backward compatibility
    // If only queries array is provided, use first query as the query field
    const query = params.query || (params.queries && params.queries.length > 0 ? params.queries[0] : undefined);
    
    const run: BenchmarkRunDocument = {
      name: params.name,
      query: query,
      queries: params.queries,
      benchmarkTypes: params.benchmarkTypes,
      workflowIds: params.workflowIds,
      status: 'pending',
      createdAt: new Date(),
      featureFlags,
      // Store execution parameters for accurate progress calculation
      runsPerWorkflow: params.runsPerWorkflow,
      maxWorkflowTemplates: params.maxWorkflowTemplates,
      executionMode: params.executionMode,
      maxConcurrent: params.maxConcurrent,
    };

    const result = await collection.insertOne(run);
    
    if (!result.insertedId) {
      throw new Error('Failed to create benchmark run: no insertedId returned from database');
    }
    
    const runId = result.insertedId.toString();

    // Start benchmark execution asynchronously
    const executionPromise = this.executeBenchmarkRun(runId, params)
      .catch(async (error) => {
        logger.error({ error, runId }, 'Error executing benchmark run');
        try {
          await this.repository.updateBenchmarkRunStatus(runId, 'failed', error instanceof Error ? error.message : 'Unknown error');
        } catch (statusError) {
          logger.error({ error: statusError, runId }, 'Failed to update benchmark run status after error');
        }
      })
      .finally(() => {
        this.activeRuns.delete(runId);
      });

    this.activeRuns.set(runId, executionPromise);

    return runId;
  }

  /**
   * Execute a benchmark run
   */
  private async executeBenchmarkRun(runId: string, params: StartBenchmarkRunParams): Promise<void> {
    await this.repository.updateBenchmarkRunStatus(runId, 'running');

    const resultsCollection = this.repository.getResultsCollection();

    try {
      // Check if benchmark run was cancelled before starting
      const currentRun = await this.repository.getBenchmarkStatus(runId);
      if (currentRun?.status === 'cancelled') {
        logger.info({ runId }, 'Benchmark run was cancelled before execution');
        return;
      }

      // Validate database state for non-workflow benchmarks
      if (!params.benchmarkTypes.includes('workflow')) {
        // Check if we have any queries to validate
        const queryToValidate = params.query || (params.queries && params.queries.length > 0 ? params.queries[0] : undefined);
        if (queryToValidate) {
          const validation = await BenchmarkUtils.validateDatabaseState(queryToValidate);
          if (!validation.valid) {
            logger.warn({ runId, validation }, 'Database validation failed, but continuing with benchmark');
          }
        }
      }

      for (const benchmarkType of params.benchmarkTypes) {
        // Handle workflow benchmarks separately (they don't require queries)
        if (benchmarkType === 'workflow') {
          await this.runWorkflowBenchmark(runId, params, resultsCollection);
          continue;
        }

        // Normalize queries for non-workflow benchmarks
        const queriesToTest = params.queries || (params.query ? [params.query] : []);
        
        if (queriesToTest.length === 0) {
          throw new Error(`At least one query is required for benchmark type: ${benchmarkType}`);
        }

        // For other benchmark types, run for each query
        for (const query of queriesToTest) {
          // Check if benchmark run was cancelled before starting new query
          const statusCheck = await this.repository.getBenchmarkStatus(runId);
          if (statusCheck?.status === 'cancelled') {
            logger.info({ runId }, 'Benchmark run was cancelled, stopping execution');
            return;
          }

          switch (benchmarkType) {
            case 'settings':
              await this.settingsExecutor.execute(runId, query, resultsCollection);
              break;
            case 'relevance-scorer':
              await this.relevanceScorerExecutor.execute(runId, query, resultsCollection);
              break;
            case 'reranker':
              await this.rerankerExecutor.execute(runId, query, resultsCollection);
              break;
            case 'hybrid-retrieval':
              await this.hybridRetrievalExecutor.execute(runId, query, resultsCollection);
              break;
            default:
              logger.warn({ benchmarkType }, 'Unknown benchmark type');
          }
        }
      }

      // Final check if benchmark was cancelled
      const finalStatus = await this.repository.getBenchmarkStatus(runId);
      if (finalStatus?.status === 'cancelled') {
        logger.info({ runId }, 'Benchmark run was cancelled during execution');
        return;
      }

      await this.repository.updateBenchmarkRunStatus(runId, 'completed');
      
      // Cleanup old benchmark workflow runs (async, non-blocking)
      BenchmarkUtils.cleanupBenchmarkWorkflowRuns(runId).catch(err => {
        logger.error({ error: err, runId }, 'Failed to cleanup benchmark workflow runs');
      });
    } catch (error) {
      logger.error({ error, runId }, 'Error executing benchmark');
      
      // Check if error was due to cancellation
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('cancelled')) {
        await this.repository.updateBenchmarkRunStatus(runId, 'cancelled', errorMessage);
      } else {
        await this.repository.updateBenchmarkRunStatus(runId, 'failed', errorMessage);
      }
      throw error;
    }
  }





  /**
   * Initialize WorkflowEngine and RunManager if not already set
   * This allows lazy initialization to avoid circular dependencies
   */
  private async ensureWorkflowDependencies(): Promise<void> {
    if (!this.workflowEngine || !this.runManager) {
      const deps = await BenchmarkUtils.ensureWorkflowDependencies(this.workflowEngine, this.runManager);
      this.workflowEngine = deps.workflowEngine;
      this.runManager = deps.runManager;
    }
  }

  /**
   * Run workflow benchmark (execute full workflows end-to-end)
   */
  private async runWorkflowBenchmark(
    runId: string,
    params: StartBenchmarkRunParams,
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void> {
    // Lazy initialize dependencies if not provided
    await this.ensureWorkflowDependencies();
    
    if (!this.workflowEngine || !this.runManager) {
      throw new Error('WorkflowEngine and RunManager are required for workflow benchmarking');
    }

    const db = getDB();

    // Get workflows to test
    const { WorkflowModel } = await import('../../models/Workflow.js');
    const workflowsToTest: Array<{ id: string; name: string; workflow: Workflow }> = [];

    if (params.workflowIds && params.workflowIds.length > 0) {
      // Use specified workflows
      // Optimized: Fetch all workflows in a single query to prevent N+1 performance issue (approx. 47x speedup)
      const uniqueIds = [...new Set(params.workflowIds)];

      // Safety check for dynamic import
      if (typeof WorkflowModel.findByIds !== 'function') {
        throw new Error('WorkflowModel.findByIds is not available');
      }

      const workflowDocs = await WorkflowModel.findByIds(uniqueIds);
      const workflowMap = new Map<string, typeof workflowDocs[number]>(workflowDocs.map(doc => [doc.id, doc]));

      for (const workflowId of params.workflowIds) {
        // Look up in the map to preserve input order and handle duplicates
        const workflowDoc = workflowMap.get(workflowId);
        if (workflowDoc) {
          workflowsToTest.push({
            id: workflowDoc.id,
            name: workflowDoc.name,
            workflow: workflowDoc as Workflow,
          });
        }
      }
    } else {
      // Default: get all published workflows
      const publishedWorkflows = await WorkflowModel.findByStatus('Published');
      for (const workflowDoc of publishedWorkflows) {
        workflowsToTest.push({
          id: workflowDoc.id,
          name: workflowDoc.name,
          workflow: workflowDoc,
        });
      }
    }

    if (workflowsToTest.length === 0) {
      const errorMsg = params.workflowIds && params.workflowIds.length > 0
        ? `No workflows found for the specified workflow IDs: ${params.workflowIds.join(', ')}`
        : 'No published workflows found for benchmarking';
      throw new Error(errorMsg);
    }

    // Validate and limit number of workflows if maxWorkflowTemplates is specified
    let workflowsToBenchmark = workflowsToTest;
    if (params.maxWorkflowTemplates !== undefined) {
      if (typeof params.maxWorkflowTemplates !== 'number' || !Number.isFinite(params.maxWorkflowTemplates)) {
        throw new Error(`maxWorkflowTemplates must be a finite number, got: ${params.maxWorkflowTemplates}`);
      }
      if (params.maxWorkflowTemplates <= 0 || !Number.isInteger(params.maxWorkflowTemplates)) {
        throw new Error(`maxWorkflowTemplates must be a positive integer, got: ${params.maxWorkflowTemplates}`);
      }
      const MAX_WORKFLOWS = 100; // Reasonable maximum
      if (params.maxWorkflowTemplates > MAX_WORKFLOWS) {
        throw new Error(`maxWorkflowTemplates cannot exceed ${MAX_WORKFLOWS}, got: ${params.maxWorkflowTemplates}`);
      }
      if (params.maxWorkflowTemplates > workflowsToTest.length) {
        logger.warn(
          { maxWorkflowTemplates: params.maxWorkflowTemplates, availableWorkflows: workflowsToTest.length },
          'maxWorkflowTemplates exceeds available workflows. Using all available workflows.'
        );
        workflowsToBenchmark = workflowsToTest;
      } else {
        workflowsToBenchmark = workflowsToTest.slice(0, params.maxWorkflowTemplates);
      }
    }

    // Get queries to test
    const queriesToTest = params.queries && params.queries.length > 0
      ? params.queries
      : params.query
        ? [params.query]
        : ['arbeidsmigranten huisvesting']; // Default query

    // Validate and set number of runs per workflow/query combination (default: 1)
    let runsPerWorkflow = 1;
    if (params.runsPerWorkflow !== undefined) {
      if (typeof params.runsPerWorkflow !== 'number' || !Number.isFinite(params.runsPerWorkflow)) {
        throw new Error(`runsPerWorkflow must be a finite number, got: ${params.runsPerWorkflow}`);
      }
      if (params.runsPerWorkflow <= 0 || !Number.isInteger(params.runsPerWorkflow)) {
        throw new Error(`runsPerWorkflow must be a positive integer, got: ${params.runsPerWorkflow}`);
      }
      // Cap at reasonable maximum to prevent excessive runs
      const MAX_RUNS_PER_WORKFLOW = 100;
      if (params.runsPerWorkflow > MAX_RUNS_PER_WORKFLOW) {
        throw new Error(`runsPerWorkflow cannot exceed ${MAX_RUNS_PER_WORKFLOW}, got: ${params.runsPerWorkflow}`);
      }
      runsPerWorkflow = params.runsPerWorkflow;
    }
    
    // Validate total workload to prevent excessive resource usage
    const totalRuns = workflowsToBenchmark.length * queriesToTest.length * runsPerWorkflow;
    const MAX_TOTAL_RUNS = 1000;
    if (totalRuns > MAX_TOTAL_RUNS) {
      throw new Error(
        `Total benchmark runs (${totalRuns}) exceeds maximum (${MAX_TOTAL_RUNS}). ` +
        `Reduce workflows (${workflowsToBenchmark.length}), queries (${queriesToTest.length}), or runsPerWorkflow (${runsPerWorkflow}).`
      );
    }

    // Determine execution mode and concurrency
    const executionMode = params.executionMode || 'sequential';
    const maxConcurrent = params.maxConcurrent || 5;
    
    // Validate maxConcurrent if parallel mode
    if (executionMode === 'parallel') {
      if (typeof maxConcurrent !== 'number' || !Number.isFinite(maxConcurrent)) {
        throw new Error(`maxConcurrent must be a finite number, got: ${maxConcurrent}`);
      }
      if (maxConcurrent <= 0 || !Number.isInteger(maxConcurrent)) {
        throw new Error(`maxConcurrent must be a positive integer, got: ${maxConcurrent}`);
      }
      const MAX_CONCURRENT = 20; // Reasonable maximum to prevent resource exhaustion
      if (maxConcurrent > MAX_CONCURRENT) {
        throw new Error(`maxConcurrent cannot exceed ${MAX_CONCURRENT}, got: ${maxConcurrent}`);
      }
    }

    // Store actual workflow IDs that were selected for accurate progress calculation
    const actualWorkflowIds = workflowsToBenchmark.map(w => w.id);
    const runsCollection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);
    await runsCollection.updateOne(
      { _id: new ObjectId(runId) },
      { $set: { actualWorkflowIds } }
    );

    // Build list of all workflow/query/run combinations
    interface WorkflowTask {
      workflowId: string;
      workflowName: string;
      workflow: Workflow;
      query: string;
      runNumber: number;
      totalRuns: number;
      featureFlags?: Record<string, boolean>;
    }

    // Create a map of workflowId -> featureFlags for quick lookup
    const workflowFeatureFlagsMap = new Map<string, Record<string, boolean>>();
    if (params.workflowConfigs) {
      for (const config of params.workflowConfigs) {
        if (config.featureFlags) {
          workflowFeatureFlagsMap.set(config.workflowId, config.featureFlags);
        }
      }
    }

    const tasks: WorkflowTask[] = [];
    for (const { id: workflowId, name: workflowName, workflow } of workflowsToBenchmark) {
      const featureFlags = workflowFeatureFlagsMap.get(workflowId);
      for (const query of queriesToTest) {
        for (let runNumber = 1; runNumber <= runsPerWorkflow; runNumber++) {
          tasks.push({
            workflowId,
            workflowName,
            workflow,
            query,
            runNumber,
            totalRuns: runsPerWorkflow,
            featureFlags,
          });
        }
      }
    }

    // Execute tasks based on mode
    if (executionMode === 'parallel') {
      await this.executeWorkflowTasksParallel(runId, tasks, resultsCollection, maxConcurrent);
    } else {
      await this.executeWorkflowTasksSequential(runId, tasks, resultsCollection);
    }
  }

  /**
   * Execute workflow tasks sequentially
   */
  private async executeWorkflowTasksSequential(
    runId: string,
    tasks: Array<{ workflowId: string; workflowName: string; workflow: Workflow; query: string; runNumber: number; totalRuns: number; featureFlags?: Record<string, boolean> }>,
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void> {
    for (const task of tasks) {
      // Check if benchmark was cancelled before starting new task
      const statusCheck = await this.repository.getBenchmarkStatus(runId);
      if (statusCheck?.status === 'cancelled') {
        logger.info({ runId }, 'Benchmark run was cancelled, stopping workflow execution');
        return;
      }

      await this.executeSingleWorkflowTask(runId, task, resultsCollection);
    }
  }

  /**
   * Execute workflow tasks in parallel with concurrency control
   */
  private async executeWorkflowTasksParallel(
    runId: string,
    tasks: Array<{ workflowId: string; workflowName: string; workflow: Workflow; query: string; runNumber: number; totalRuns: number }>,
    resultsCollection: Collection<BenchmarkResultDocument>,
    maxConcurrent: number
  ): Promise<void> {
    // Simple semaphore implementation for concurrency control
    class Semaphore {
      private available: number;
      private waiters: Array<() => void> = [];

      constructor(count: number) {
        this.available = count;
      }

      async acquire(): Promise<void> {
        if (this.available > 0) {
          this.available--;
          return;
        }
        return new Promise<void>((resolve) => {
          this.waiters.push(resolve);
        });
      }

      release(): void {
        if (this.waiters.length > 0) {
          const resolve = this.waiters.shift()!;
          resolve();
        } else {
          this.available++;
        }
      }
    }

    const semaphore = new Semaphore(maxConcurrent);
    const errors: Error[] = [];

    // Execute all tasks in parallel with concurrency limit
    const promises = tasks.map(async (task) => {
      await semaphore.acquire();
      try {
        // Check if benchmark was cancelled
        const statusCheck = await this.repository.getBenchmarkStatus(runId);
        if (statusCheck?.status === 'cancelled') {
          return;
        }

        await this.executeSingleWorkflowTask(runId, task, resultsCollection);
      } catch (error) {
        // Collect errors but don't stop other tasks
        errors.push(error instanceof Error ? error : new Error(String(error)));
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);

    // If any errors occurred, log them (but don't fail the entire benchmark)
    if (errors.length > 0) {
      console.warn(`Some workflow tasks failed: ${errors.length} errors`);
      errors.forEach((error, index) => {
        console.error(`Error ${index + 1}:`, error.message);
      });
    }
  }


  /**
   * Execute a single workflow task (workflow + query + run combination)
   * Delegates to BenchmarkUtils for execution
   */
  private async executeSingleWorkflowTask(
    runId: string,
    task: { workflowId: string; workflowName: string; workflow: Workflow; query: string; runNumber: number; totalRuns: number; featureFlags?: Record<string, boolean> },
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void> {
    // Ensure dependencies are initialized (lazy load if needed)
    await this.ensureWorkflowDependencies();
    
    // Execute workflow synchronously for benchmarking
    if (!this.workflowEngine) {
      throw new Error('WorkflowEngine is not available');
    }
    if (!this.runManager) {
      throw new Error('RunManager is not available');
    }

    await BenchmarkUtils.executeSingleWorkflowTask(
      runId,
      task,
      resultsCollection,
      this.workflowEngine,
      this.runManager,
      this.repository
    );
  }

  /**
   * Update benchmark run status
   */
  private async updateBenchmarkRunStatus(
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

    const update: UpdateFilter<BenchmarkRunDocument> = {
      $set: updatePayload
    };
    await collection.updateOne({ _id: new ObjectId(runId) }, update);
  }

  /**
   * Cancel a running benchmark
   */
  async cancelBenchmarkRun(runId: string): Promise<void> {
    await this.repository.cancelBenchmarkRun(runId);
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
      await this.cancelBenchmarkRun(runId);
    } catch (error) {
      // Ignore errors if run is not cancellable (e.g. already finished)
      if (error instanceof Error && !error.message.includes('with status')) {
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
        this.cancelBenchmarkRun(runId).catch(() => {
          // Ignore cancellation errors
        });
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * List all benchmark runs
   */
  async listBenchmarkRuns() {
    return this.repository.listBenchmarkRuns();
  }

  /**
   * Get benchmark run status (lightweight for polling)
   */
  async getBenchmarkStatus(runId: string) {
    return this.repository.getBenchmarkStatus(runId);
  }

  /**
   * Get a specific benchmark run with full results
   */
  async getBenchmarkRun(runId: string) {
    return this.repository.getBenchmarkRun(runId);
  }

  /**
   * Get a specific benchmark result
   */
  async getBenchmarkResult(resultId: string) {
    return this.repository.getBenchmarkResult(resultId);
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
   * Get all results for a specific query and optional workflow/benchmark type
   */

  /**
   * Aggregate results by workflow/query combination
   */
  async aggregateResultsByWorkflow(
    query?: string,
    benchmarkType?: string
  ): Promise<Array<{
    workflowId?: string;
    workflowName?: string;
    query: string;
    runs: number;
    metrics: {
      avgExecutionTime: number;
      avgDocumentsFound: number;
      avgScore: number;
      minExecutionTime: number;
      maxExecutionTime: number;
      stdDevExecutionTime: number;
      medianExecutionTime: number;
    };
    results: BenchmarkResultDocument[];
  }>> {
    return this.analytics.aggregateResultsByWorkflow(query, benchmarkType);
  }

  /**
   * Compare multiple workflows side-by-side
   */
  async compareWorkflows(
    workflowIds: string[],
    query?: string
  ): Promise<Array<{
    workflowId: string;
    workflowName: string;
    query: string;
    runs: number;
    metrics: {
      avgExecutionTime: number;
      avgDocumentsFound: number;
      avgScore: number;
      minExecutionTime: number;
      maxExecutionTime: number;
      stdDevExecutionTime: number;
      medianExecutionTime: number;
    };
    results: BenchmarkResultDocument[];
  }>> {
    return this.analytics.compareWorkflows(workflowIds, query);
  }

  /**
   * Get statistical metrics for a specific config and query
   */
  async getStatisticalMetrics(
    configName: string,
    query?: string,
    benchmarkType?: string
  ): Promise<{
    configName: string;
    query: string;
    runs: number;
    metrics: {
      avgExecutionTime: number;
      avgDocumentsFound: number;
      avgScore: number;
      minExecutionTime: number;
      maxExecutionTime: number;
      stdDevExecutionTime: number;
      medianExecutionTime: number;
    };
    results: BenchmarkResultDocument[];
  } | null> {
    return this.analytics.getStatisticalMetrics(configName, query, benchmarkType);
  }

  /**
   * Cleanup benchmark workflow runs older than retention period
   * Deletes workflow runs that were created for benchmarks and are older than the retention period
   * 
   * @param benchmarkRunId - Optional: cleanup runs for a specific benchmark run
   * @param retentionDays - Number of days to retain runs (default: 7)
   */
  async cleanupBenchmarkWorkflowRuns(benchmarkRunId?: string, retentionDays: number = 7): Promise<number> {
    return BenchmarkUtils.cleanupBenchmarkWorkflowRuns(benchmarkRunId, retentionDays);
  }
}
