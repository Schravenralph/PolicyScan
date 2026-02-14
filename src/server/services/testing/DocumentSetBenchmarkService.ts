/**
 * Document Set Benchmark Service
 * 
 * Enables benchmarking workflows against pre-selected document sets.
 * Supports document selection by URLs, queryId, runId, or filters.
 * Executes only processing steps (skips discovery steps).
 */

import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { FeatureFlag } from '../../models/FeatureFlag.js';
import { getFeatureFlagsService } from '../knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { logger } from '../../utils/logger.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import { getWorkflowById } from '../../utils/workflowLookup.js';
import type { Workflow } from '../infrastructure/types.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';

const DOCUMENT_SET_BENCHMARK_RUNS_COLLECTION = 'document_set_benchmark_runs';

export interface DocumentSetSelection {
  type: 'urls' | 'queryId' | 'runId' | 'filter';
  urls?: string[]; // For type: 'urls'
  queryId?: string; // For type: 'queryId'
  runId?: string; // For type: 'runId'
  filters?: { // For type: 'filter'
    type_document?: string;
    dateRange?: { start: Date; end: Date };
    source?: string[];
    minScore?: number;
    maxScore?: number;
  };
  sampling?: {
    strategy: 'all' | 'random' | 'top-n' | 'stratified';
    count?: number; // For random, top-n
    seed?: number; // For random (reproducibility)
  };
}

export interface DocumentSetBenchmarkConfig {
  name: string;
  description?: string;
  documentSet: DocumentSetSelection;
  workflowId: string;
  skipSteps?: string[]; // Steps to skip (typically discovery steps)
  featureFlags?: Record<string, boolean>;
  runsPerBenchmark?: number;
}

export interface DocumentSetBenchmarkResult {
  executionTimeMs: number;
  documentsProcessed: number;
  averageScore?: number;
  categorizationResults?: Record<string, number>;
  error?: string;
}

export interface DocumentSetBenchmarkRunDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  documentSet: DocumentSetSelection;
  documentCount: number;
  workflowId: string;
  skipSteps?: string[];
  featureFlags?: Record<string, boolean>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  results?: DocumentSetBenchmarkResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export class DocumentSetBenchmarkService {
  private activeRuns = new Map<string, Promise<void>>();

  constructor(
    private workflowEngine: WorkflowEngine,
    private runManager: RunManager
  ) {}

  /**
   * Start a document set benchmark run
   */
  async startDocumentSetBenchmark(config: DocumentSetBenchmarkConfig): Promise<string> {
    // Validate workflow exists
    const workflow = await getWorkflowById(config.workflowId);
    if (!workflow) {
      throw new NotFoundError('Workflow', config.workflowId);
    }

    // Select documents
    const documents = await this.selectDocuments(config.documentSet);
    if (documents.length === 0) {
      throw new BadRequestError('No documents found matching selection criteria', {
        documentSet: config.documentSet,
      });
    }

    const db = getDB();
    const collection = db.collection<DocumentSetBenchmarkRunDocument>(DOCUMENT_SET_BENCHMARK_RUNS_COLLECTION);

    const run: DocumentSetBenchmarkRunDocument = {
      name: config.name,
      description: config.description,
      documentSet: config.documentSet,
      documentCount: documents.length,
      workflowId: config.workflowId,
      skipSteps: config.skipSteps || [],
      featureFlags: config.featureFlags,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await collection.insertOne(run);
    const runId = result.insertedId.toString();

    // Start benchmark execution asynchronously
    const executionPromise = this.executeDocumentSetBenchmark(runId, config, documents)
      .catch((error) => {
        logger.error({ error, runId }, 'Error executing document set benchmark');
      })
      .finally(() => {
        this.activeRuns.delete(runId);
      });

    this.activeRuns.set(runId, executionPromise);

    return runId;
  }

  /**
   * Select documents based on selection criteria
   */
  private async selectDocuments(selection: DocumentSetSelection): Promise<Array<Record<string, unknown>>> {
    let documents: Array<Record<string, unknown>> = [];

    switch (selection.type) {
      case 'urls':
        if (!selection.urls || selection.urls.length === 0) {
          throw new Error('URLs must be provided for type: urls');
        }
        documents = await this.selectDocumentsByUrls(selection.urls);
        break;

      case 'queryId':
        if (!selection.queryId) {
          throw new Error('queryId must be provided for type: queryId');
        }
        documents = await this.selectDocumentsByQueryId(selection.queryId);
        break;

      case 'runId':
        if (!selection.runId) {
          throw new Error('runId must be provided for type: runId');
        }
        documents = await this.selectDocumentsByRunId(selection.runId);
        break;

      case 'filter':
        if (!selection.filters) {
          throw new Error('filters must be provided for type: filter');
        }
        documents = await this.selectDocumentsByFilters(selection.filters);
        break;

      default: {
        const unknownType = selection && typeof selection === 'object' && 'type' in selection 
          ? String(selection.type) 
          : 'unknown';
        throw new Error(`Unknown selection type: ${unknownType}`);
      }
    }

    // Apply sampling if specified
    if (selection.sampling && selection.sampling.strategy !== 'all') {
      documents = this.applySampling(documents, selection.sampling);
    }

    return documents;
  }

  /**
   * Select documents by URLs
   */
  private async selectDocumentsByUrls(urls: string[]): Promise<Array<Record<string, unknown>>> {
    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
    const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
    const documentService = getCanonicalDocumentService();
    const documents: Array<Record<string, unknown>> = [];

    // Process URLs in batches to avoid hitting limits
    const BATCH_SIZE = 1000;
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batchUrls = urls.slice(i, i + BATCH_SIZE);
      const canonicalDocs = await documentService.findByUrls(batchUrls);

      // Transform to legacy format for compatibility
      const batchDocs = transformCanonicalArrayToLegacy(canonicalDocs);
      documents.push(...(batchDocs as unknown as Array<Record<string, unknown>>));
    }

    return documents;
  }

  /**
   * Select documents by queryId
   */
  private async selectDocumentsByQueryId(queryId: string): Promise<Array<Record<string, unknown>>> {
    if (!ObjectId.isValid(queryId)) {
      throw new BadRequestError(`Invalid queryId format: ${queryId}`, {
        queryId,
      });
    }

    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
    const documentService = getCanonicalDocumentService();
    const canonicalDocs = await documentService.findByQueryId(queryId, { limit: 10000 }); // Large limit for benchmarking
    
    // Transform to legacy format for benchmarking compatibility
    const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
    const documents = transformCanonicalArrayToLegacy(canonicalDocs);
    return documents as unknown as Array<Record<string, unknown>>;
  }

  /**
   * Select documents by runId
   */
  private async selectDocumentsByRunId(runId: string): Promise<Array<Record<string, unknown>>> {
    const run = await this.runManager.getRun(runId);
    if (!run || !run.params?.queryId) {
      throw new BadRequestError(`Run not found or has no queryId: ${runId}`, {
        runId,
        hasRun: !!run,
        hasQueryId: !!run?.params?.queryId,
      });
    }

    return await this.selectDocumentsByQueryId(run.params.queryId as string);
  }

  /**
   * Select documents by filters
   */
  private async selectDocumentsByFilters(filters: DocumentSetSelection['filters']): Promise<Array<Record<string, unknown>>> {
    const query: Record<string, unknown> = {};

    if (filters?.type_document) {
      query.type_document = filters.type_document;
    }

    if (filters?.source && filters.source.length > 0) {
      query.website_url = { $in: filters.source };
    }

    if (filters?.minScore !== undefined || filters?.maxScore !== undefined) {
      query.score = {};
      if (filters.minScore !== undefined) {
        query.score = { ...query.score as Record<string, unknown>, $gte: filters.minScore };
      }
      if (filters.maxScore !== undefined) {
        query.score = { ...query.score as Record<string, unknown>, $lte: filters.maxScore };
      }
    }

    if (filters?.dateRange) {
      query.createdAt = {
        $gte: filters.dateRange.start,
        $lte: filters.dateRange.end,
      };
    }

    // Use canonical document service with filters
    const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
    const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
    const documentService = getCanonicalDocumentService();
    
    // Map filters to canonical document filters
    const canonicalFilters: Record<string, unknown> = {};
    if (filters?.type_document) {
      canonicalFilters.documentType = filters.type_document;
    }
    if (filters?.source && filters.source.length > 0) {
      // Map source URLs to document sources (simplified - may need more sophisticated mapping)
      canonicalFilters.source = filters.source[0]; // Use first source for now
    }
    if (filters?.dateRange) {
      // Use findByDateRange for date filtering
      const canonicalDocs = await documentService.findByDateRange(
        filters.dateRange.start,
        filters.dateRange.end,
        { limit: 10000 }
      );
      const documents = transformCanonicalArrayToLegacy(canonicalDocs);
      // Apply additional filters (score, etc.) that aren't in canonical model
      return (documents as unknown as Array<Record<string, unknown>>).filter(doc => {
        if (filters?.minScore !== undefined && (doc as { score?: number }).score !== undefined) {
          if ((doc as { score?: number }).score! < filters.minScore) return false;
        }
        if (filters?.maxScore !== undefined && (doc as { score?: number }).score !== undefined) {
          if ((doc as { score?: number }).score! > filters.maxScore) return false;
        }
        return true;
      }) as Array<Record<string, unknown>>;
    }
    
    // For non-date-range queries, use findByQuery
    const canonicalDocs = await documentService.findByQuery(canonicalFilters, { limit: 10000 });
    const documents = transformCanonicalArrayToLegacy(canonicalDocs);
    
    // Apply score filters that aren't in canonical model
    return (documents as unknown as Array<Record<string, unknown>>).filter(doc => {
      if (filters?.minScore !== undefined && (doc as { score?: number }).score !== undefined) {
        if ((doc as { score?: number }).score! < filters.minScore) return false;
      }
      if (filters?.maxScore !== undefined && (doc as { score?: number }).score !== undefined) {
        if ((doc as { score?: number }).score! > filters.maxScore) return false;
      }
      return true;
    }) as Array<Record<string, unknown>>;
  }

  /**
   * Apply sampling strategy to documents
   */
  private applySampling(
    documents: Array<Record<string, unknown>>,
    sampling: DocumentSetSelection['sampling']
  ): Array<Record<string, unknown>> {
    if (!sampling || sampling.strategy === 'all') {
      return documents;
    }

    switch (sampling.strategy) {
      case 'random':
        return this.randomSample(documents, sampling.count || documents.length, sampling.seed);

      case 'top-n':
        return this.topNSample(documents, sampling.count || 10);

      case 'stratified':
        return this.stratifiedSample(documents, sampling.count || documents.length);

      default:
        logger.warn({ strategy: sampling.strategy }, 'Unknown sampling strategy, returning all documents');
        return documents;
    }
  }

  /**
   * Random sample with optional seed for reproducibility
   */
  private randomSample(
    documents: Array<Record<string, unknown>>,
    count: number,
    seed?: number
  ): Array<Record<string, unknown>> {
    if (count >= documents.length) {
      return documents;
    }

    // Simple seeded random (for reproducibility)
    let random: () => number;
    if (seed !== undefined) {
      let seedValue = seed;
      random = () => {
        seedValue = (seedValue * 9301 + 49297) % 233280;
        return seedValue / 233280;
      };
    } else {
      random = Math.random;
    }

    const shuffled = [...documents].sort(() => random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Safely extract numeric score from document
   */
  private getDocumentScore(doc: Record<string, unknown>): number {
    if (typeof doc.score === 'number') {
      return doc.score;
    }
    if (typeof doc.relevanceScore === 'number') {
      return doc.relevanceScore;
    }
    return 0;
  }

  /**
   * Top N documents by score
   */
  private topNSample(
    documents: Array<Record<string, unknown>>,
    count: number
  ): Array<Record<string, unknown>> {
    const sorted = [...documents].sort((a, b) => {
      const scoreA = this.getDocumentScore(a);
      const scoreB = this.getDocumentScore(b);
      return scoreB - scoreA;
    });

    return sorted.slice(0, count);
  }

  /**
   * Stratified sample (sample from each category/type)
   */
  private stratifiedSample(
    documents: Array<Record<string, unknown>>,
    count: number
  ): Array<Record<string, unknown>> {
    // Group by type_document
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const doc of documents) {
      const type = typeof doc.type_document === 'string' ? doc.type_document : 'unknown';
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(doc);
    }

    // Sample from each group
    const perGroup = Math.floor(count / groups.size);
    const result: Array<Record<string, unknown>> = [];

    for (const [type, groupDocs] of groups) {
      const sampleSize = Math.min(perGroup, groupDocs.length);
      const sampled = this.randomSample(groupDocs, sampleSize);
      result.push(...sampled);
    }

    // Fill remaining slots if needed
    if (result.length < count) {
      const remaining = documents.filter(doc => !result.includes(doc));
      const additional = this.randomSample(remaining, count - result.length);
      result.push(...additional);
    }

    return result.slice(0, count);
  }

  /**
   * Execute document set benchmark
   */
  private async executeDocumentSetBenchmark(
    runId: string,
    config: DocumentSetBenchmarkConfig,
    documents: Array<Record<string, unknown>>
  ): Promise<void> {
    const db = getDB();
    const collection = db.collection<DocumentSetBenchmarkRunDocument>(DOCUMENT_SET_BENCHMARK_RUNS_COLLECTION);

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

        // Prepare context with pre-selected documents
        const context: Record<string, unknown> = {
          query: config.documentSet.queryId || config.documentSet.runId || 'document-set-benchmark',
          documents: documents,
          preSelectedDocuments: true, // Flag to indicate these are pre-selected
        };

        // Run the benchmark multiple times if requested
        const runsPerBenchmark = config.runsPerBenchmark || 1;
        const results: DocumentSetBenchmarkResult[] = [];

        for (let i = 0; i < runsPerBenchmark; i++) {
          // Check for cancellation
          const currentRun = await collection.findOne({ _id: new ObjectId(runId) });
          if (currentRun?.status === 'cancelled') {
            logger.info({ runId }, 'Document set benchmark cancelled during execution');
            break;
          }

          const result = await this.executeProcessingSteps(
            workflow,
            config.skipSteps || [],
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
          { runId, workflowId: config.workflowId, documentCount: documents.length, runsPerBenchmark, resultsCount: results.length },
          'Document set benchmark completed successfully'
        );
      } finally {
        // Restore feature flags
        await restoreFeatureFlags();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, runId }, 'Document set benchmark failed');

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
   * Execute processing steps only (skip discovery steps)
   */
  private async executeProcessingSteps(
    workflow: Workflow,
    skipSteps: string[],
    context: Record<string, unknown>,
    runId: string,
    _featureFlags?: Record<string, boolean>
  ): Promise<DocumentSetBenchmarkResult> {
    const startTime = Date.now();
    let error: string | undefined;
    let documentsProcessed = 0;
    let averageScore: number | undefined;
    let categorizationResults: Record<string, number> | undefined;

    try {
      // Filter out discovery steps
      const processingSteps = workflow.steps.filter(step => !skipSteps.includes(step.id));

      // Execute processing steps
      for (const step of processingSteps) {
        const stepResult = await this.executeStepDirectly(workflow, step.id, context, runId);
        
        if (stepResult && stepResult.result) {
          // Merge result into context
          context = {
            ...context,
            ...stepResult.result,
          };

          // Extract metrics from result
          if (stepResult.result.documents && Array.isArray(stepResult.result.documents)) {
            documentsProcessed = stepResult.result.documents.length;
          } else if (stepResult.result.scoredDocuments && Array.isArray(stepResult.result.scoredDocuments)) {
            documentsProcessed = stepResult.result.scoredDocuments.length;
            
            // Calculate average score
            const scores = stepResult.result.scoredDocuments
              .map((doc: any) => doc.score || doc.relevanceScore)
              .filter((score: any) => typeof score === 'number') as number[];
            
            if (scores.length > 0) {
              averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
            }
          }

          // Extract categorization results
          if (stepResult.result.documentsByCategory && typeof stepResult.result.documentsByCategory === 'object') {
            const categories = stepResult.result.documentsByCategory as Record<string, unknown[]>;
            categorizationResults = {};
            for (const [category, docs] of Object.entries(categories)) {
              if (Array.isArray(docs)) {
                categorizationResults[category] = docs.length;
              }
            }
          }
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error({ error: err, runId }, 'Error executing processing steps in benchmark');
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      executionTimeMs,
      documentsProcessed,
      averageScore,
      categorizationResults,
      error,
    };
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
   * Apply feature flags temporarily
   */
  private async applyFeatureFlags(
    featureFlags?: Record<string, boolean>
  ): Promise<() => Promise<void>> {
    if (!featureFlags || Object.keys(featureFlags).length === 0) {
      return async () => {}; // No-op restore function
    }

    // Initialize service to ensure cache is ready
    try {
      await FeatureFlag.initializeService();
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize feature flag service');
    }

    const originalFlags: Record<string, string | undefined> = {};
    const originalDbFlags: Record<string, boolean> = {};

    // Capture original values
    const featureFlagsService = getFeatureFlagsService();
    for (const [flagName, _enabled] of Object.entries(featureFlags)) {
      // Capture DB/Cache state (before env var change)
      // Use FeatureFlagsService which accepts string flags, not just enum values
      originalDbFlags[flagName] = featureFlagsService.isEnabled(flagName);

      // Capture Env var state
      originalFlags[flagName] = process.env[flagName];
    }

    // Apply new values

    // 1. Env vars
    for (const [flagName, enabled] of Object.entries(featureFlags)) {
      process.env[flagName] = enabled ? 'true' : 'false';
    }

    // 2. DB
    try {
      await FeatureFlag.setFlags(featureFlags, 'document-set-benchmark');
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

      // Restore original database values
      try {
        if (Object.keys(originalDbFlags).length > 0) {
          await FeatureFlag.setFlags(originalDbFlags, 'document-set-benchmark-restore');
        } else {
          await FeatureFlag.refreshCache();
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to restore feature flags in database');
      }
    };
  }

  /**
   * Get document set benchmark status
   */
  async getDocumentSetBenchmarkStatus(runId: string): Promise<(DocumentSetBenchmarkRunDocument & { id: string }) | null> {
    const db = getDB();
    const collection = db.collection<DocumentSetBenchmarkRunDocument>(DOCUMENT_SET_BENCHMARK_RUNS_COLLECTION);

    const document = await collection.findOne({ _id: new ObjectId(runId) });

    if (!document) {
      return null;
    }

    // MongoDB documents have _id as ObjectId, convert to string for API
    const idValue = document._id instanceof ObjectId
      ? document._id.toString()
      : (document._id ? String(document._id) : runId);

    // Create result object with explicit id field
    return {
      ...document,
      id: idValue,
    };
  }

  /**
   * List document set benchmarks
   */
  async listDocumentSetBenchmarks(limit = 50, skip = 0): Promise<DocumentSetBenchmarkRunDocument[]> {
    const db = getDB();
    const collection = db.collection<DocumentSetBenchmarkRunDocument>(DOCUMENT_SET_BENCHMARK_RUNS_COLLECTION);

    return await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Cancel a document set benchmark
   */
  async cancelDocumentSetBenchmark(runId: string): Promise<void> {
    const db = getDB();
    const collection = db.collection<DocumentSetBenchmarkRunDocument>(DOCUMENT_SET_BENCHMARK_RUNS_COLLECTION);

    // Check if benchmark exists
    const run = await collection.findOne({ _id: new ObjectId(runId) });
    if (!run) {
      throw new NotFoundError('Document set benchmark run', runId);
    }

    await collection.updateOne(
      { _id: new ObjectId(runId) },
      {
        $set: {
          status: 'cancelled',
          completedAt: new Date(),
        },
      }
    );
  }

  /**
   * Get available document sets (queries, runs, etc.)
   */
  async getAvailableDocumentSets(): Promise<{
    queries: Array<{ id: string; query: string; documentCount: number }>;
    runs: Array<{ id: string; workflowId: string; documentCount: number }>;
  }> {
    // This is a simplified version - can be enhanced to query actual data
    return {
      queries: [],
      runs: [],
    };
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
      await this.cancelDocumentSetBenchmark(runId);
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
        this.cancelDocumentSetBenchmark(runId).catch(() => {
          // Ignore cancellation errors
        });
      }
    }

    await Promise.allSettled(promises);
  }
}

