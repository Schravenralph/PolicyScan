import express, { Router, type Request, type Response } from 'express';
import { BenchmarkService } from '../services/testing/BenchmarkService.js';
import { GroundTruthService } from '../services/testing/GroundTruthService.js';
import { BenchmarkConfigTemplateService } from '../services/testing/BenchmarkConfigTemplateService.js';
import { validate } from '../middleware/validation.js';
import { benchmarkSchemas } from '../validation/benchmarkSchemas.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, ServiceUnavailableError, AuthorizationError } from '../types/errors.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { handleDatabaseOperation } from '../utils/databaseErrorHandler.js';

export function createBenchmarkRouter(
  benchmarkService?: BenchmarkService,
  groundTruthService?: GroundTruthService,
  configTemplateService?: BenchmarkConfigTemplateService,
  stepBenchmarkService?: any,
  documentSetBenchmarkService?: any
): Router {
  const router = express.Router();
  const bs = benchmarkService || new BenchmarkService();
  const gts = groundTruthService || new GroundTruthService();
  const cts = configTemplateService || new BenchmarkConfigTemplateService();

  // Lazy load WorkflowComparisonService to avoid circular dependencies
  let workflowComparisonService: import('../services/testing/WorkflowComparisonService.js').WorkflowComparisonService | null = null;
  const getWorkflowComparisonService = async () => {
    if (!workflowComparisonService) {
      const { WorkflowComparisonService } = await import('../services/testing/WorkflowComparisonService.js');
      const { WorkflowEngine } = await import('../services/workflow/WorkflowEngine.js');
      const { RunManager } = await import('../services/workflow/RunManager.js');
      const { getDB } = await import('../config/database.js');
      const db = getDB();
      const runManager = new RunManager(db);
      const workflowEngine = new WorkflowEngine(runManager);
      workflowComparisonService = new WorkflowComparisonService(workflowEngine, runManager);
    }
    return workflowComparisonService;
  };

  // Lazy load WorkflowBenchmarkComparisonService to avoid circular dependencies
  let workflowBenchmarkComparisonService: import('../services/testing/WorkflowBenchmarkComparisonService.js').WorkflowBenchmarkComparisonService | null = null;
  const getWorkflowBenchmarkComparisonService = async () => {
    if (!workflowBenchmarkComparisonService) {
      const { WorkflowBenchmarkComparisonService } = await import('../services/testing/WorkflowBenchmarkComparisonService.js');
      const { WorkflowEngine } = await import('../services/workflow/WorkflowEngine.js');
      const { RunManager } = await import('../services/workflow/RunManager.js');
      const { getDB } = await import('../config/database.js');
      const db = getDB();
      const runManager = new RunManager(db);
      const workflowEngine = new WorkflowEngine(runManager);
      workflowBenchmarkComparisonService = new WorkflowBenchmarkComparisonService(db, workflowEngine, runManager);
    }
    return workflowBenchmarkComparisonService;
  };

  /**
   * POST /api/benchmark/run
   * Run a benchmark with specified types and query
   *
   * Note: This route implements its own error handling instead of relying
   * on the global error middleware so tests can assert on the exact error
   * messages defined in the OpenAPI spec.
   */
  router.post('/run', sanitizeInput, validate(benchmarkSchemas.run), asyncHandler(async (req, res) => {
    const { 
      name, 
      query, 
      queries, 
      benchmarkTypes, 
      workflowIds,
      maxWorkflowTemplates,
      runsPerWorkflow,
      executionMode, 
      maxConcurrent,
      workflowConfigs
    } = req.body;

    // Normalize: prefer queries array, fallback to single query
    const queriesToUse = queries || (query ? [query] : []);

    // Validate database state for non-workflow benchmarks
    if (!benchmarkTypes.includes('workflow') && queriesToUse.length > 0) {
      const firstQuery = queriesToUse[0];
      logger.debug({ query: firstQuery }, 'Validating database state before starting benchmark');
      // Note: Validation is done inside BenchmarkService.executeBenchmarkRun
      // This is just for logging purposes
    }

    try {
      const runId = await bs.startBenchmarkRun({
        name: name || `Benchmark ${new Date().toISOString()}`,
        query,
        queries: queriesToUse,
        benchmarkTypes,
        workflowIds,
        maxWorkflowTemplates,
        runsPerWorkflow,
        executionMode,
        maxConcurrent,
        workflowConfigs,
      });

      return res.json({
        success: true,
        runId,
        message: 'Benchmark started',
      });
    } catch (error) {
      // Let AppError instances (BadRequestError, ValidationError, etc.) pass through to error middleware
      if (error instanceof BadRequestError || error instanceof NotFoundError || 
          error instanceof ServiceUnavailableError || error instanceof AuthorizationError) {
        throw error;
      }

      // Re-throw generic errors to be handled by error middleware
      // This ensures consistent error handling and logging
      throw error;
    }
  }));

  /**
   * GET /api/benchmark/runs
   * List all benchmark runs
   */
  router.get('/runs', asyncHandler(async (_req, res) => {
    const runs = await bs.listBenchmarkRuns();
    res.json(runs);
  }));

  /**
   * GET /api/benchmark/status/:id
   * Get benchmark run status (lightweight for polling)
   */
  router.get('/status/:id', validate(benchmarkSchemas.getRun), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const status = await bs.getBenchmarkStatus(id);

    if (!status) {
      throw new NotFoundError('Benchmark run', id);
    }

    return res.json(status);
  }));

  /**
   * GET /api/benchmark/runs/:id
   * Get a specific benchmark run with results
   */
  router.get('/runs/:id', validate(benchmarkSchemas.getRun), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const run = await bs.getBenchmarkRun(id);
    throwIfNotFound(run, 'Benchmark run', id);

    // Fetch results for this run
    const { getDB } = await import('../config/database.js');
    const { ObjectId } = await import('mongodb');
    const { BENCHMARK_RESULTS_COLLECTION } = await import('../services/testing/BenchmarkConfig.js');
    const db = getDB();
    const resultsCollection = db.collection(BENCHMARK_RESULTS_COLLECTION);
    const maxBenchmarkResults = parseInt(process.env.MAX_BENCHMARK_RESULTS || '1000', 10);
    // Query with ObjectId - try both ObjectId and string to handle different storage formats
    const runObjectId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    // Query with $or to handle both ObjectId and string formats
    // Wrap database operation with retry logic for robustness
    const results = await handleDatabaseOperation(
      async () => {
        return await resultsCollection
          .find({ 
            $or: [
              { benchmarkRunId: runObjectId },
              { benchmarkRunId: id }
            ]
          })
          .limit(maxBenchmarkResults)
          .toArray();
      },
      'BenchmarkRoutes.getResults'
    );

    // Transform results to API format
    const formattedResults = results.map((result: any) => {
      // Access raw metrics - use any type to bypass TypeScript filtering
      const rawMetrics: any = result.metrics;
      
      // Build metrics object - preserve ALL fields from raw MongoDB document
      // Use Object.assign to ensure all properties are copied
      const metrics: Record<string, unknown> = rawMetrics ? Object.assign({}, rawMetrics) : {};
      
      // Explicitly check and copy executionTime/executionTimeMs to ensure they're included
      if (rawMetrics) {
        // Check if executionTime exists in raw document (even if not enumerable)
        if ('executionTime' in rawMetrics || rawMetrics.executionTime !== undefined) {
          metrics.executionTime = rawMetrics.executionTime;
        }
        if ('executionTimeMs' in rawMetrics || rawMetrics.executionTimeMs !== undefined) {
          metrics.executionTimeMs = rawMetrics.executionTimeMs;
        }
      }
      
      // Cross-map for API compatibility
      if (metrics.executionTimeMs !== undefined && metrics.executionTime === undefined) {
        metrics.executionTime = metrics.executionTimeMs;
      }
      if (metrics.executionTime !== undefined && metrics.executionTimeMs === undefined) {
        metrics.executionTimeMs = metrics.executionTime;
      }
      
      return {
        id: result._id.toString(),
        benchmarkType: result.benchmarkType,
        configName: result.configName,
        configSnapshot: result.configSnapshot || {},
        documents: result.documents || [],
        metrics: metrics, // All fields preserved, both executionTime and executionTimeMs available
        createdAt: result.createdAt ? (result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt) : new Date().toISOString(),
      };
    });

    res.json({
      ...run,
      results: formattedResults,
    });
  }));

  /**
   * GET /api/benchmark/results/:id
   * Get detailed results for a specific benchmark result
   */
  router.get('/results/:id', validate(benchmarkSchemas.getResult), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await bs.getBenchmarkResult(id);
    throwIfNotFound(result, 'Benchmark result', id);

    res.json(result);
  }));

  /**
   * POST /api/benchmark/runs/:id/cancel
   * Cancel a running benchmark
   */
  router.post('/runs/:id/cancel', validate(benchmarkSchemas.getRun), asyncHandler(async (req, res) => {
    const { id } = req.params;

    await bs.cancelBenchmarkRun(id);

    res.json({
      success: true,
      message: 'Benchmark cancelled',
    });
  }));

  /**
   * GET /api/benchmark/runs/:id/progress
   * Get benchmark progress
   */
  router.get('/runs/:id/progress', validate(benchmarkSchemas.getRun), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const progress = await bs.getBenchmarkProgress(id);
    throwIfNotFound(progress, 'Benchmark run', id);

    res.json(progress);
  }));

  /**
   * GET /api/benchmark/aggregate
   * Aggregate results by workflow/query combination
   */
  router.get('/aggregate', validate(benchmarkSchemas.aggregate), asyncHandler(async (req, res) => {
    const { query, benchmarkType } = req.query;

    const aggregated = await bs.aggregateResultsByWorkflow(
      query as string | undefined,
      benchmarkType as string | undefined
    );

    res.json(aggregated);
  }));

  /**
   * GET /api/benchmark/compare
   * Compare multiple workflows side-by-side
   */
  router.get('/compare', validate(benchmarkSchemas.compare), asyncHandler(async (req, res) => {
    const { workflowIds, query } = req.query;

    // workflowIds is already validated and transformed to array by schema
    const workflowIdsArray = workflowIds as string[];

    const comparisons = await bs.compareWorkflows(
      workflowIdsArray,
      query as string | undefined
    );

    res.json(comparisons);
  }));

  /**
   * GET /api/benchmark/stats
   * Get statistical metrics for a specific config and query
   */
  router.get('/stats', validate(benchmarkSchemas.stats), asyncHandler(async (req, res) => {
    const { configName, query, benchmarkType } = req.query;

    if (!configName) {
      throw new BadRequestError('configName parameter is required');
    }

    const stats = await bs.getStatisticalMetrics(
      configName as string,
      query as string | undefined,
      benchmarkType as string | undefined
    );

    if (!stats) {
      throw new NotFoundError('Benchmark results', undefined, {
        message: 'No results found for the specified criteria',
      });
    }

    res.json(stats);
  }));

  /**
   * POST /api/benchmark/compare-workflows
   * Start a new workflow comparison
   */
  router.post('/compare-workflows', sanitizeInput, validate(benchmarkSchemas.startWorkflowComparison), asyncHandler(async (req, res) => {
    const service = await getWorkflowComparisonService();
    if (!service) {
      throw new ServiceUnavailableError('Workflow comparison service not available');
    }

    const {
      name,
      description,
      workflowA,
      workflowB,
      query,
      queries,
      querySpace,
      documentSetSpace,
      runsPerQuery,
    } = req.body;

    const comparisonId = await service.startComparison({
      name,
      description,
      workflowA,
      workflowB,
      query,
      queries,
      querySpace,
      documentSetSpace,
      runsPerQuery,
    });

    res.json({
      success: true,
      comparisonId,
      message: 'Workflow comparison started',
    });
  }));

  /**
   * GET /api/benchmark/compare-workflows
   * List workflow comparisons with optional filters
   */
  router.get('/compare-workflows', asyncHandler(async (req, res) => {
    const service = await getWorkflowComparisonService();
    if (!service) {
      throw new ServiceUnavailableError('Workflow comparison service not available');
    }

    const { limit, skip, status } = req.query;

    const comparisons = await service.listComparisons({
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
      status: status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | undefined,
    });

    res.json(comparisons);
  }));

  /**
   * GET /api/benchmark/compare-workflows/:id
   * Get comparison status and results
   */
  router.get('/compare-workflows/:id', validate(benchmarkSchemas.getWorkflowComparison), asyncHandler(async (req, res) => {
    const service = await getWorkflowComparisonService();
    if (!service) {
      throw new ServiceUnavailableError('Workflow comparison service not available');
    }

    const { id } = req.params;
    const comparison = await service.getComparisonStatus(id);

    throwIfNotFound(comparison, 'Comparison', id);

    res.json(comparison);
  }));

  /**
   * GET /api/benchmark/compare-workflows/:id/diff
   * Get paginated diff arrays for a comparison
   * Query params: workflow (A|B), page (default: 1), pageSize (default: 50)
   */
  router.get('/compare-workflows/:id/diff', asyncHandler(async (req, res) => {
    const service = await getWorkflowComparisonService();
    if (!service) {
      throw new ServiceUnavailableError('Workflow comparison service not available');
    }

    const { id } = req.params;
    const workflow = (req.query.workflow as 'A' | 'B') || 'A';
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 500); // Max 500 per page

    if (workflow !== 'A' && workflow !== 'B') {
      throw new BadRequestError('Invalid workflow parameter. Must be "A" or "B"');
    }

    const result = await service.getPaginatedDiff(id, workflow, page, pageSize);

    res.json(result);
  }));

  /**
   * POST /api/benchmark/compare-workflows/:id/score-document
   * Score a document in a diff as relevant or irrelevant
   */
  router.post('/compare-workflows/:id/score-document', sanitizeInput, validate(benchmarkSchemas.scoreDocument), asyncHandler(async (req, res) => {
    const service = await getWorkflowComparisonService();
    if (!service) {
      throw new ServiceUnavailableError('Workflow comparison service not available');
    }

    const { id } = req.params;
    const { workflow, url, relevanceScore, scoredBy } = req.body;

    await service.scoreDocument(id, workflow, url, relevanceScore, scoredBy);

    res.json({
      success: true,
      message: 'Document scored successfully',
    });
  }));

  /**
   * POST /api/benchmark/compare-workflows/:id/score-documents
   * Score multiple documents in a diff as relevant or irrelevant (bulk operation)
   * 
   * Accepts up to 100 documents per request. Processes in batches of 50 for optimal performance.
   * Returns detailed results for each document including success/failure status.
   */
  router.post('/compare-workflows/:id/score-documents', sanitizeInput, validate(benchmarkSchemas.scoreDocuments), asyncHandler(async (req, res) => {
    const service = await getWorkflowComparisonService();
    if (!service) {
      throw new ServiceUnavailableError('Workflow comparison service not available');
    }

    const { id } = req.params;
    const { scores } = req.body;

    // Request size limit is enforced by validation schema (max 100)
    if (scores.length > 100) {
      throw new BadRequestError('Maximum 100 documents per request');
    }

    const result = await service.scoreDocuments(id, scores);

    res.json({
      success: result.failed === 0,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      results: result.results,
    });
  }));

  // Lazy load StepBenchmarkService to avoid circular dependencies
  let stepBenchmarkServiceInstance: import('../services/testing/StepBenchmarkService.js').StepBenchmarkService | null = stepBenchmarkService || null;
  const getStepBenchmarkService = async () => {
    if (!stepBenchmarkServiceInstance) {
      const { StepBenchmarkService } = await import('../services/testing/StepBenchmarkService.js');
      const { WorkflowEngine } = await import('../services/workflow/WorkflowEngine.js');
      const { RunManager } = await import('../services/workflow/RunManager.js');
      const { getDB } = await import('../config/database.js');
      const db = getDB();
      const runManager = new RunManager(db);
      const workflowEngine = new WorkflowEngine(runManager);
      stepBenchmarkServiceInstance = new StepBenchmarkService(workflowEngine, runManager);
    }
    return stepBenchmarkServiceInstance;
  };

  /**
   * POST /api/benchmark/step
   * Start a step benchmark
   */
  router.post('/step', sanitizeInput, validate(benchmarkSchemas.stepBenchmark), asyncHandler(async (req, res) => {
    const service = await getStepBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Step benchmark service not available');
    }

    const {
      workflowId,
      stepId,
      context,
      useRealContext,
      featureFlags,
      query,
      runsPerStep,
      name,
    } = req.body;

    const runId = await service.startStepBenchmark({
      workflowId,
      stepId,
      context,
      useRealContext,
      featureFlags,
      query,
      runsPerStep,
      name,
    });

    res.json({
      success: true,
      runId,
      message: 'Step benchmark started',
    });
  }));

  /**
   * GET /api/benchmark/step/:id
   * Get step benchmark status and results
   */
  router.get('/step/:id', validate(benchmarkSchemas.getStepBenchmark), asyncHandler(async (req, res) => {
    const service = await getStepBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Step benchmark service not available');
    }

    const { id } = req.params;
    const benchmark = await service.getStepBenchmarkStatus(id);

    throwIfNotFound(benchmark, 'Step benchmark', id);

    res.json(benchmark);
  }));

  /**
   * GET /api/benchmark/step
   * List step benchmarks
   */
  router.get('/step', validate(benchmarkSchemas.listStepBenchmarks), asyncHandler(async (req, res) => {
    const service = await getStepBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Step benchmark service not available');
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;

    const benchmarks = await service.listStepBenchmarks(limit, skip);

    res.json(benchmarks);
  }));

  /**
   * POST /api/benchmark/step/:id/cancel
   * Cancel a step benchmark
   */
  router.post('/step/:id/cancel', validate(benchmarkSchemas.cancelStepBenchmark), asyncHandler(async (req, res) => {
    const service = await getStepBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Step benchmark service not available');
    }

    const { id } = req.params;
    await service.cancelStepBenchmark(id);

    res.json({
      success: true,
      message: 'Step benchmark cancelled',
    });
  }));

  // Lazy load DocumentSetBenchmarkService to avoid circular dependencies
  let documentSetBenchmarkServiceInstance: import('../services/testing/DocumentSetBenchmarkService.js').DocumentSetBenchmarkService | null = documentSetBenchmarkService || null;
  const getDocumentSetBenchmarkService = async () => {
    if (!documentSetBenchmarkServiceInstance) {
      const { DocumentSetBenchmarkService } = await import('../services/testing/DocumentSetBenchmarkService.js');
      const { WorkflowEngine } = await import('../services/workflow/WorkflowEngine.js');
      const { RunManager } = await import('../services/workflow/RunManager.js');
      const { getDB } = await import('../config/database.js');
      const db = getDB();
      const runManager = new RunManager(db);
      const workflowEngine = new WorkflowEngine(runManager);
      documentSetBenchmarkServiceInstance = new DocumentSetBenchmarkService(workflowEngine, runManager);
    }
    return documentSetBenchmarkServiceInstance;
  };

  /**
   * POST /api/benchmark/document-set
   * Start a document set benchmark
   */
  router.post('/document-set', sanitizeInput, validate(benchmarkSchemas.documentSetBenchmark), asyncHandler(async (req, res) => {
    const service = await getDocumentSetBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Document set benchmark service not available');
    }

    const {
      name,
      description,
      documentSet,
      workflowId,
      skipSteps,
      featureFlags,
      runsPerBenchmark,
    } = req.body;

    const runId = await service.startDocumentSetBenchmark({
      name,
      description,
      documentSet,
      workflowId,
      skipSteps,
      featureFlags,
      runsPerBenchmark,
    });

    res.json({
      success: true,
      runId,
      message: 'Document set benchmark started',
    });
  }));

  /**
   * GET /api/benchmark/document-set/:id
   * Get document set benchmark status and results
   */
  router.get('/document-set/:id', validate(benchmarkSchemas.getDocumentSetBenchmark), asyncHandler(async (req, res) => {
    const service = await getDocumentSetBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Document set benchmark service not available');
    }

    const { id } = req.params;
    const benchmark = await service.getDocumentSetBenchmarkStatus(id);

    throwIfNotFound(benchmark, 'Document set benchmark', id);

    res.json(benchmark);
  }));

  /**
   * GET /api/benchmark/document-set
   * List document set benchmarks
   */
  router.get('/document-set', validate(benchmarkSchemas.listDocumentSetBenchmarks), asyncHandler(async (req, res) => {
    const service = await getDocumentSetBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Document set benchmark service not available');
    }

    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : (typeof req.query.limit === 'number' ? req.query.limit : 50);
    const skip = typeof req.query.skip === 'string' ? parseInt(req.query.skip, 10) : (typeof req.query.skip === 'number' ? req.query.skip : 0);

    const benchmarks = await service.listDocumentSetBenchmarks(limit, skip);

    res.json(benchmarks);
  }));

  /**
   * POST /api/benchmark/document-set/:id/cancel
   * Cancel a document set benchmark
   */
  router.post('/document-set/:id/cancel', validate(benchmarkSchemas.cancelDocumentSetBenchmark), asyncHandler(async (req, res) => {
    const service = await getDocumentSetBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Document set benchmark service not available');
    }

    const { id } = req.params;
    await service.cancelDocumentSetBenchmark(id);

    res.json({
      success: true,
      message: 'Document set benchmark cancelled',
    });
  }));

  /**
   * GET /api/benchmark/document-sets/available
   * Get available document sets (queries, runs, etc.)
   */
  router.get('/document-sets/available', asyncHandler(async (_req, res) => {
    const service = await getDocumentSetBenchmarkService();
    if (!service) {
      throw new ServiceUnavailableError('Document set benchmark service not available');
    }

    const available = await service.getAvailableDocumentSets();

    res.json(available);
  }));

  // Lazy load QuerySelectionService
  let querySelectionService: import('../services/testing/QuerySelectionService.js').QuerySelectionService | null = null;
  const getQuerySelectionService = async () => {
    if (!querySelectionService) {
      const { QuerySelectionService } = await import('../services/testing/QuerySelectionService.js');
      querySelectionService = new QuerySelectionService();
    }
    return querySelectionService;
  };

  /**
   * GET /api/benchmark/query-sets/presets
   * Get available query set presets
   */
  router.get('/query-sets/presets', asyncHandler(async (_req, res) => {
    const service = await getQuerySelectionService();
    const presets = service.getQuerySetPresets();
    res.json(presets);
  }));

  /**
   * GET /api/benchmark/query-sets
   * List all saved query sets
   */
  router.get('/query-sets', asyncHandler(async (_req, res) => {
    const service = await getQuerySelectionService();
    const querySets = await service.listQuerySets();
    res.json(querySets);
  }));

  /**
   * POST /api/benchmark/query-sets
   * Save a query set for reuse
   */
  router.post('/query-sets', sanitizeInput, asyncHandler(async (req, res) => {
    const { name, queries, description } = req.body;

    if (!name || !Array.isArray(queries) || queries.length === 0) {
      throw new BadRequestError('name and queries (non-empty array) are required');
    }

    const service = await getQuerySelectionService();
    await service.saveQuerySet(name, queries, description);

    res.json({
      success: true,
      message: 'Query set saved',
    });
  }));

  /**
   * GET /api/benchmark/query-sets/:name
   * Load a saved query set
   */
  router.get('/query-sets/:name', asyncHandler(async (req, res) => {
    const { name } = req.params;
    const service = await getQuerySelectionService();
    
    try {
      const queries = await service.loadQuerySet(name);
      res.json({
        name,
        queries,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundError('Query set', name);
      }
      throw error;
    }
  }));

  /**
   * GET /api/benchmark/queries/available
   * Get available queries with optional filters
   */
  router.get('/queries/available', asyncHandler(async (req, res) => {
    const service = await getQuerySelectionService();
    const filters = req.query.filters ? JSON.parse(req.query.filters as string) : undefined;
    const queries = await service.getAvailableQueries(filters);

    res.json(queries);
  }));

  /**
   * POST /api/benchmark/ground-truth/datasets
   * Create a new ground truth dataset
   */
  router.post('/ground-truth/datasets', sanitizeInput, validate(benchmarkSchemas.groundTruthCreate), asyncHandler(async (req, res) => {
    const { name, description, queries } = req.body;
    const created_by = (req as unknown as { user?: { id?: string } }).user?.id;

    const dataset = await gts.createDataset({
      name,
      description,
      queries,
      created_by,
    });

    return res.status(201).json({
      success: true,
      dataset,
    });
  }));

  /**
   * GET /api/benchmark/ground-truth/datasets/:id/exists
   * Check if a ground truth dataset exists
   */
  router.get('/ground-truth/datasets/:id/exists', validate(benchmarkSchemas.groundTruthExists), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const exists = await gts.checkDatasetExists(id);

    return res.json({
      success: true,
      exists,
      id,
    });
  }));

  /**
   * GET /api/benchmark/ground-truth/datasets
   * List ground truth datasets
   */
  router.get('/ground-truth/datasets', validate(benchmarkSchemas.groundTruthList), asyncHandler(async (req, res) => {
    const { name, created_by, search, limit, skip, sort } = req.query;

    // Parse sort string (e.g., "created_at:-1" or "name:1")
    let sortObj: Record<string, 1 | -1> = { created_at: -1 };
    if (sort && typeof sort === 'string') {
      const [field, direction] = sort.split(':');
      if (field && direction) {
        sortObj = { [field]: direction === '-1' ? -1 : 1 };
      }
    }

    const result = await gts.listDatasets({
      name: name as string | undefined,
      created_by: created_by as string | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      skip: skip ? parseInt(skip as string, 10) : undefined,
      sort: sortObj,
    });

    res.json({
      success: true,
      datasets: result.entries,
      total: result.total,
    });
  }));

  /**
   * GET /api/benchmark/ground-truth/datasets/:id
   * Get a specific ground truth dataset
   */
  router.get('/ground-truth/datasets/:id', validate(benchmarkSchemas.groundTruthGet), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const dataset = await gts.getDataset(id);

    if (!dataset) {
      throw new NotFoundError('Ground truth dataset', id, {
        message: `Ground truth dataset with identifier '${id}' not found. Please check available datasets at /api/benchmark/ground-truth/datasets`
      });
    }

    return res.json({
      success: true,
      dataset,
    });
  }));

  /**
   * PUT /api/benchmark/ground-truth/datasets/:id
   * Update a ground truth dataset
   */
  router.put('/ground-truth/datasets/:id', sanitizeInput, validate(benchmarkSchemas.groundTruthUpdate), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, queries } = req.body;

    const dataset = await gts.updateDataset(id, {
      name,
      description,
      queries,
    });

    if (!dataset) {
      throw new NotFoundError('Ground truth dataset', id);
    }

    return res.json({
      success: true,
      dataset,
    });
  }));

  /**
   * DELETE /api/benchmark/ground-truth/datasets/:id
   * Delete a ground truth dataset
   */
  router.delete('/ground-truth/datasets/:id', validate(benchmarkSchemas.groundTruthDelete), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const deleted = await gts.deleteDataset(id);

    if (!deleted) {
      throw new NotFoundError('Ground truth dataset', id);
    }

    return res.json({
      success: true,
      message: 'Ground truth dataset deleted successfully',
    });
  }));

  /**
   * GET /api/benchmark/ground-truth/datasets/:id/statistics
   * Get statistics for a ground truth dataset
   */
  router.get('/ground-truth/datasets/:id/statistics', validate(benchmarkSchemas.groundTruthGet), asyncHandler(async (req, res) => {
    const { id } = req.params;

    const statistics = await gts.getDatasetStatistics(id);

    if (!statistics) {
      throw new NotFoundError('Ground truth dataset', id);
    }

    return res.json({
      success: true,
      statistics,
    });
  }));

  // Lazy load GroundTruthEvaluationService to avoid circular dependencies
  let groundTruthEvaluationService: import('../services/testing/GroundTruthEvaluationService.js').GroundTruthEvaluationService | null = null;
  const getGroundTruthEvaluationService = async () => {
    if (!groundTruthEvaluationService) {
      const { GroundTruthEvaluationService } = await import('../services/testing/GroundTruthEvaluationService.js');
      const { WorkflowEngine } = await import('../services/workflow/WorkflowEngine.js');
      const { RunManager } = await import('../services/workflow/RunManager.js');
      const { getDB } = await import('../config/database.js');
      const db = getDB();
      const runManager = new RunManager(db);
      const workflowEngine = new WorkflowEngine(runManager);
      groundTruthEvaluationService = new GroundTruthEvaluationService(workflowEngine, runManager);
    }
    return groundTruthEvaluationService;
  };

  /**
   * POST /api/benchmark/compare-workflow-ground-truth
   * Compare a workflow against a ground truth dataset
   */
  router.post('/compare-workflow-ground-truth', sanitizeInput, validate(benchmarkSchemas.compareWorkflowGroundTruth), asyncHandler(async (req, res) => {
    const service = await getGroundTruthEvaluationService();
    if (!service) {
      throw new ServiceUnavailableError('Ground truth evaluation service not available');
    }

    const { workflowId, groundTruthId, query, runtimeSettings } = req.body;

    const evaluation = await service.compareWorkflowAgainstGroundTruth(
      workflowId,
      groundTruthId,
      query,
      runtimeSettings
    );

    res.status(201).json({
      success: true,
      evaluation,
    });
  }));

  /**
   * GET /api/benchmark/ground-truth/evaluation/:id
   * Get a ground truth evaluation result
   */
  router.get('/ground-truth/evaluation/:id', validate(benchmarkSchemas.getGroundTruthEvaluation), asyncHandler(async (req, res) => {
    const service = await getGroundTruthEvaluationService();
    if (!service) {
      throw new ServiceUnavailableError('Ground truth evaluation service not available');
    }

    const { id } = req.params;
    const evaluation = await service.getEvaluation(id);
    throwIfNotFound(evaluation, 'Evaluation', id);

    res.json({
      success: true,
      evaluation,
    });
  }));

  /**
   * GET /api/benchmark/ground-truth/evaluations
   * List ground truth evaluations with optional filtering
   */
  router.get('/ground-truth/evaluations', validate(benchmarkSchemas.listGroundTruthEvaluations), asyncHandler(async (req, res) => {
    const service = await getGroundTruthEvaluationService();
    if (!service) {
      throw new ServiceUnavailableError('Ground truth evaluation service not available');
    }

    const { workflowId, groundTruthId, query, limit, skip } = req.query;

    const { evaluations, total } = await service.listEvaluations(
      {
        workflowId: workflowId as string | undefined,
        groundTruthId: groundTruthId as string | undefined,
        query: query as string | undefined,
      },
      {
        limit: limit as number | undefined,
        skip: skip as number | undefined,
      }
    );

    res.json({
      success: true,
      evaluations,
      total,
      limit: limit || 50,
      skip: skip || 0,
    });
  }));

  /**
   * POST /api/benchmark/configs
   * Create a new benchmark configuration template
   */
  router.post('/configs', sanitizeInput, validate(benchmarkSchemas.createConfigTemplate), asyncHandler(async (req, res) => {
    const { name, description, benchmarkTypes, featureFlags, isPublic, isDefault } = req.body;
    const userId = (req as any).user?.userId;
    const createdBy = userId || 'system';

    const template = await cts.createTemplate({
      name,
      description,
      benchmarkTypes,
      featureFlags,
      isPublic,
      isDefault,
      createdBy,
    });

    res.status(201).json({
      success: true,
      template,
    });
  }));

  /**
   * GET /api/benchmark/configs
   * List all benchmark configuration templates
   */
  router.get('/configs', validate(benchmarkSchemas.listConfigTemplates), asyncHandler(async (req, res) => {
    const { name, createdBy, isPublic, isDefault, search, limit, skip } = req.query;
    const currentUser = (req as any).user?.userId;

    // Schema now handles string-to-boolean conversion, so isPublic and isDefault are already booleans
    const isPublicFilter: boolean | undefined = isPublic as boolean | undefined;
    const isDefaultFilter: boolean | undefined = isDefault as boolean | undefined;
    if (isPublicFilter === undefined && !createdBy) {
      // Show user's templates and public templates
      const { entries } = await cts.listTemplates({
        name: name as string | undefined,
        createdBy: currentUser,
        search: search as string | undefined,
        limit: limit as number | undefined,
        skip: skip as number | undefined,
      });

      const { entries: publicEntries } = await cts.listTemplates({
        name: name as string | undefined,
        isPublic: true,
        search: search as string | undefined,
        limit: limit as number | undefined,
        skip: skip as number | undefined,
      });

      // Combine and deduplicate
      const allEntries = [...entries, ...publicEntries.filter(e => e.createdBy !== currentUser)];
      const uniqueEntries = Array.from(
        new Map(allEntries.map(e => [e._id!.toString(), e])).values()
      );

      return res.json({
        success: true,
        templates: uniqueEntries,
        total: uniqueEntries.length,
      });
    }

    // When filtering by isPublic, don't automatically filter by currentUser
    // Only filter by createdBy if it's explicitly provided
    const createdByFilter = createdBy as string | undefined;
    
    const { entries, total } = await cts.listTemplates({
      name: name as string | undefined,
      createdBy: createdByFilter || (isPublicFilter === undefined ? currentUser : undefined),
      isPublic: isPublicFilter,
      isDefault: isDefaultFilter,
      search: search as string | undefined,
      limit: limit as number | undefined,
      skip: skip as number | undefined,
    });

    res.json({
      success: true,
      templates: entries,
      total,
    });
  }));

  /**
   * GET /api/benchmark/configs/:id
   * Get a specific template by ID
   */
  router.get('/configs/:id', validate(benchmarkSchemas.getConfigTemplate), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const template = await cts.getTemplate(id);

    throwIfNotFound(template, 'Template', id);

    // Check permissions: user can access if they created it, it's public, or they're admin
    const currentUser = (req as any).user?.userId;
    const isAdmin = (req as any).user?.role === 'admin';
    const canAccess = template.createdBy === currentUser || template.isPublic || isAdmin;

    if (!canAccess) {
      throw new AuthorizationError('Access denied');
    }

    res.json({
      success: true,
      template,
    });
  }));

  /**
   * PUT /api/benchmark/configs/:id
   * Update an existing template
   */
  router.put('/configs/:id', sanitizeInput, validate(benchmarkSchemas.updateConfigTemplate), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const currentUser = (req as any).user?.userId;
    const isAdmin = (req as any).user?.role === 'admin';

    // Check permissions
    const existing = await cts.getTemplate(id);
    throwIfNotFound(existing, 'Template', id);

    if (existing.createdBy !== currentUser && !isAdmin) {
      throw new AuthorizationError('Access denied');
    }

    const template = await cts.updateTemplate(id, req.body);

    throwIfNotFound(template, 'Template', id);

    res.json({
      success: true,
      template,
    });
  }));

  /**
   * DELETE /api/benchmark/configs/:id
   * Delete a template
   */
  router.delete('/configs/:id', validate(benchmarkSchemas.deleteConfigTemplate), asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = req.user?.userId;
    const isAdmin = req.user?.role === 'admin';

    // Check permissions
    const existing = await cts.getTemplate(id);
    throwIfNotFound(existing, 'Template', id);

    if (existing.createdBy !== currentUser && !isAdmin) {
      throw new AuthorizationError('Access denied');
    }

    const deleted = await cts.deleteTemplate(id);

    if (!deleted) {
      throw new NotFoundError('Template', id);
    }

    res.json({
      success: true,
      message: 'Template deleted',
    });
  }));

  /**
   * POST /api/benchmark/workflow-comparison
   * Start a new workflow comparison with benchmark configurations
   */
  router.post(
    '/workflow-comparison',
    sanitizeInput,
    validate(benchmarkSchemas.workflowComparison),
    asyncHandler(async (req, res) => {
      const service = await getWorkflowBenchmarkComparisonService();
      const { workflowAId, workflowBId, configAName, configBName, query, name } = req.body;

      const comparisonId = await service.startComparison({
        workflowAId,
        workflowBId,
        configAName,
        configBName,
        query,
        name,
      });

      res.status(201).json({
        success: true,
        comparisonId,
        message: 'Workflow comparison started',
      });
    })
  );

  /**
   * GET /api/benchmark/workflow-comparison/:id
   * Get a specific workflow comparison by ID
   */
  router.get(
    '/workflow-comparison/:id',
    validate(benchmarkSchemas.getWorkflowComparison),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const service = await getWorkflowBenchmarkComparisonService();

      const comparison = await service.getComparisonResults(id);
      throwIfNotFound(comparison, 'Workflow comparison', id);

      // Transform MongoDB document to API response format
      const response = {
        id: comparison._id?.toString() || '',
        name: comparison.name,
        workflowAId: comparison.workflowAId,
        workflowBId: comparison.workflowBId,
        configAName: comparison.configAName,
        configBName: comparison.configBName,
        query: comparison.query,
        status: comparison.status,
        workflowARunId: comparison.workflowARunId,
        workflowBRunId: comparison.workflowBRunId,
        results: comparison.results,
        createdAt: comparison.createdAt.toISOString(),
        startedAt: comparison.startedAt?.toISOString(),
        completedAt: comparison.completedAt?.toISOString(),
        error: comparison.error,
      };

      res.json(response);
    })
  );

  /**
   * GET /api/benchmark/workflow-comparison
   * List workflow comparisons with optional filters
   */
  router.get(
    '/workflow-comparison',
    validate(benchmarkSchemas.listWorkflowComparisons),
    asyncHandler(async (req, res) => {
      const service = await getWorkflowBenchmarkComparisonService();
      if (!service) {
        throw new ServiceUnavailableError('Workflow comparison service not available');
      }
      const { limit = 20, skip = 0, workflowId, configName, status } = req.query;

      const filters: {
        status?: 'pending' | 'running' | 'completed' | 'failed';
        workflowAId?: string;
        workflowBId?: string;
        configAName?: string;
        configBName?: string;
        limit?: number;
        skip?: number;
      } = {
        limit: Number(limit),
        skip: Number(skip),
      };

      if (status) {
        filters.status = status as 'pending' | 'running' | 'completed' | 'failed';
      }

      if (workflowId) {
        filters.workflowAId = workflowId as string;
        // Also search in workflowBId
        const comparisons = await service.listComparisons(filters);
        const allComparisons = await service.listComparisons({
          ...filters,
          workflowBId: workflowId as string,
          workflowAId: undefined,
        });
        
        // Combine and deduplicate
        const combined = [...comparisons, ...allComparisons];
        const unique = combined.filter((comp, index, self) =>
          index === self.findIndex(c => c._id?.toString() === comp._id?.toString())
        );
        
        // Sort and apply pagination
        unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const paginated = unique.slice(Number(skip), Number(skip) + Number(limit));

        return res.json({
          comparisons: paginated.map(comp => ({
            id: comp._id?.toString() || '',
            name: comp.name,
            workflowAId: comp.workflowAId,
            workflowBId: comp.workflowBId,
            configAName: comp.configAName,
            configBName: comp.configBName,
            query: comp.query,
            status: comp.status,
            createdAt: comp.createdAt.toISOString(),
          })),
          total: unique.length,
          limit: Number(limit),
          skip: Number(skip),
        });
      }

      if (configName) {
        // Note: listComparisons doesn't support configName filtering directly
        // We'll filter after fetching
        const allComparisons = await service.listComparisons(filters);
        const filtered = allComparisons.filter(comp => 
          comp.configAName === configName || comp.configBName === configName
        );
        
        // Sort and apply pagination
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const paginated = filtered.slice(Number(skip), Number(skip) + Number(limit));

        return res.json({
          comparisons: paginated.map(comp => ({
            id: comp._id?.toString() || '',
            name: comp.name,
            workflowAId: comp.workflowAId,
            workflowBId: comp.workflowBId,
            configAName: comp.configAName,
            configBName: comp.configBName,
            query: comp.query,
            status: comp.status,
            createdAt: comp.createdAt.toISOString(),
          })),
          total: filtered.length,
          limit: Number(limit),
          skip: Number(skip),
        });
      }

      const comparisons = await service.listComparisons(filters);

      res.json({
        comparisons: comparisons.map(comp => ({
          id: comp._id?.toString() || '',
          name: comp.name,
          workflowAId: comp.workflowAId,
          workflowBId: comp.workflowBId,
          configAName: comp.configAName,
          configBName: comp.configBName,
          query: comp.query,
          status: comp.status,
          createdAt: comp.createdAt.toISOString(),
        })),
        total: comparisons.length,
        limit: Number(limit),
        skip: Number(skip),
      });
    })
  );

  return router;
}
