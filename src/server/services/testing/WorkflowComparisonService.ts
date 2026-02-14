/**
 * Workflow Comparison Service
 * 
 * Compares two workflows side-by-side with independent feature flags and runtime settings.
 * This allows benchmarking different workflow configurations against each other.
 */

import { ObjectId, type ClientSession } from 'mongodb';
import { getDB, getClient } from '../../config/database.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import type { Workflow, Run } from '../infrastructure/types.js';
import { getWorkflowById, getWorkflowNameById } from '../../utils/workflowLookup.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import { QuerySelectionService, type QuerySpaceSelection } from './QuerySelectionService.js';
import { DocumentSelectionService, type DocumentSetSpaceConfig } from './DocumentSelectionService.js';
import { BadRequestError, NotFoundError, RevisionConflictError } from '../../types/errors.js';

const WORKFLOW_COMPARISONS_COLLECTION = 'workflow_comparisons';

/**
 * Cache configuration for comparison results
 */
const CACHE_TTL_MS = parseInt(process.env.COMPARISON_CACHE_TTL_MS || '300000', 10); // Default: 5 minutes
const MAX_CACHE_SIZE = parseInt(process.env.COMPARISON_CACHE_MAX_SIZE || '100', 10); // Default: 100 entries

/**
 * Cached comparison result
 */
interface ComparisonCacheEntry {
  comparisonId: string;
  results: ComparisonMetrics;
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * Cache metrics for monitoring
 */
interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

/**
 * Runtime settings that can be configured per workflow
 */
export interface WorkflowRuntimeSettings {
  // Feature flags
  featureFlags?: Record<string, boolean>;

  // Workflow-specific parameters
  params?: Record<string, unknown>;

  // Performance settings
  timeout?: number; // Timeout in milliseconds
  maxRetries?: number;

  // Resource limits
  maxMemoryMB?: number;
  maxConcurrentRequests?: number;

  // Other configurable settings
  [key: string]: unknown;
}

/**
 * Workflow configuration for comparison
 */
export interface WorkflowComparisonConfig {
  workflowId: string;
  workflowName: string;
  workflow: Workflow;
  runtimeSettings: WorkflowRuntimeSettings;
  label?: string; // Optional label for display (e.g., "Baseline", "Optimized")
}

/**
 * Comparison run document
 */
interface WorkflowComparisonRunDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  workflowA: WorkflowComparisonConfig;
  workflowB: WorkflowComparisonConfig;
  query?: string;
  queries?: string[];
  querySpace?: QuerySpaceSelection;
  documentSetSpace?: DocumentSetSpaceConfig; // New: configurable document set space
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  error?: string;
  currentRunIds?: {
    workflowA?: string;
    workflowB?: string;
  };
  results?: {
    workflowA: WorkflowComparisonResult;
    workflowB: WorkflowComparisonResult;
    comparison: ComparisonMetrics;
  };
  scoringConfig?: {
    relevantScore: number; // Points for relevant documents (default: +5)
    irrelevantScore: number; // Points for irrelevant documents (default: -1)
  };
}

/**
 * Result for a single workflow execution
 */
export interface WorkflowComparisonResult {
  workflowId: string;
  workflowName: string;
  label?: string;
  runId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  executionTimeMs: number;
  documentsFound: number;
  documents: Array<{
    url: string;
    title: string;
    score?: number;
    rank?: number;
  }>;
  metrics: {
    averageScore?: number;
    topScore?: number;
    documentsWithScores?: number;
  };
  error?: string;
  featureFlags?: Record<string, boolean>;
  runtimeSettings?: WorkflowRuntimeSettings;
}

/**
 * Document in a diff (unique to one workflow)
 */
export interface DiffDocument {
  url: string;
  title: string;
  score?: number;
  rank?: number;
  relevanceScore?: 'relevant' | 'irrelevant' | 'pending'; // User-scored relevance
  scoredBy?: string; // User who scored it
  scoredAt?: Date; // When it was scored
  brondocument?: {
    titel: string;
    url: string;
    website_url: string;
    samenvatting: string;
    'relevantie voor zoekopdracht': string;
    type_document: string;
    subjects?: string[];
    themes?: string[];
  }; // Full brondocument data if available
}

/**
 * Comparison metrics between two workflows
 */
export interface ComparisonMetrics {
  executionTimeDiff: number; // Difference in ms (positive = B slower, negative = B faster)
  executionTimeDiffPercent: number; // Percentage difference
  documentsFoundDiff: number; // Difference in document count
  documentsFoundDiffPercent: number; // Percentage difference
  averageScoreDiff?: number; // Difference in average score
  uniqueDocumentsA: number; // Documents only in A
  uniqueDocumentsB: number; // Documents only in B
  commonDocuments: number; // Documents in both
  jaccardSimilarity: number; // Similarity between result sets (0-1)
  winner?: 'A' | 'B' | 'tie'; // Overall winner based on configurable criteria
  // Diff scoring
  diffA: DiffDocument[]; // Documents in A but not in B
  diffB: DiffDocument[]; // Documents in B but not in A
  scoring: {
    workflowAScore: number; // Total score for workflow A based on diff scoring
    workflowBScore: number; // Total score for workflow B based on diff scoring
    relevantScore: number; // Points for relevant documents (default: +5)
    irrelevantScore: number; // Points for irrelevant documents (default: -1)
    workflowARelevant: number; // Count of relevant documents in diff A
    workflowAIrrelevant: number; // Count of irrelevant documents in diff A
    workflowBRelevant: number; // Count of relevant documents in diff B
    workflowBIrrelevant: number; // Count of irrelevant documents in diff B
    workflowAPending: number; // Count of unscored documents in diff A
    workflowBPending: number; // Count of unscored documents in diff B
  };
}

/**
 * Parameters for starting a workflow comparison
 */
export interface StartWorkflowComparisonParams {
  name: string;
  description?: string;
  workflowA: WorkflowComparisonConfig;
  workflowB: WorkflowComparisonConfig;
  query?: string; // Deprecated: use querySpace instead
  queries?: string[]; // Deprecated: use querySpace instead
  querySpace?: QuerySpaceSelection; // New: configurable query space
  documentSetSpace?: DocumentSetSpaceConfig; // New: configurable document set space
  runsPerQuery?: number; // Number of times to run each workflow per query (default: 1)
}

/**
 * Document score storage interface
 */
interface DocumentScore {
  _id?: ObjectId;
  comparisonRunId: ObjectId;
  workflow: 'A' | 'B';
  url: string;
  relevanceScore: 'relevant' | 'irrelevant';
  scoredBy: string;
  scoredAt: Date;
  version?: number; // Version field for optimistic locking (defaults to 0 for existing documents)
}

const DOCUMENT_SCORES_COLLECTION = 'workflow_comparison_document_scores';

export class WorkflowComparisonService {
  // In-memory cache for comparison results
  private comparisonCache = new Map<string, ComparisonCacheEntry>();
  private cacheMetrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };
  private querySelectionService: QuerySelectionService;
  private documentSelectionService: DocumentSelectionService;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private workflowEngine?: WorkflowEngine, // Optional to avoid circular deps
    private runManager?: RunManager // Optional to avoid circular deps
  ) {
    // Start periodic cache cleanup (every minute)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredEntries(), 60000);
    this.querySelectionService = new QuerySelectionService();
    this.documentSelectionService = new DocumentSelectionService();
  }

  /**
   * Clean up resources and stop periodic tasks.
   * Important for tests to prevent hanging intervals.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.comparisonCache.clear();
    logger.debug('WorkflowComparisonService destroyed');
  }

  /**
   * Get cache metrics for monitoring
   */
  getCacheMetrics(): CacheMetrics & { hitRate: number } {
    const total = this.cacheMetrics.hits + this.cacheMetrics.misses;
    return {
      ...this.cacheMetrics,
      size: this.comparisonCache.size,
      hitRate: total > 0 ? this.cacheMetrics.hits / total : 0,
    };
  }

  /**
   * Get cached comparison result if available and valid
   */
  private getCachedResult(comparisonRunId: string): ComparisonMetrics | null {
    const cacheKey = `comparison:${comparisonRunId}`;
    const entry = this.comparisonCache.get(cacheKey);

    if (!entry) {
      this.cacheMetrics.misses++;
      return null;
    }

    // Check if entry has expired
    if (new Date() > entry.expiresAt) {
      this.comparisonCache.delete(cacheKey);
      this.cacheMetrics.misses++;
      this.cacheMetrics.size = this.comparisonCache.size;
      return null;
    }

    // Cache hit
    this.cacheMetrics.hits++;
    logger.debug({ comparisonRunId, cacheKey }, 'Cache hit for comparison result');
    return entry.results;
  }

  /**
   * Store comparison result in cache
   */
  private setCachedResult(comparisonRunId: string, results: ComparisonMetrics): void {
    const cacheKey = `comparison:${comparisonRunId}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    // Evict oldest entries if cache is full
    if (this.comparisonCache.size >= MAX_CACHE_SIZE && !this.comparisonCache.has(cacheKey)) {
      this.evictOldestEntry();
    }

    this.comparisonCache.set(cacheKey, {
      comparisonId: comparisonRunId,
      results,
      cachedAt: now,
      expiresAt,
    });

    this.cacheMetrics.size = this.comparisonCache.size;
    logger.debug({ comparisonRunId, cacheKey, expiresAt }, 'Cached comparison result');
  }

  /**
   * Invalidate cache entry for a comparison
   */
  private invalidateCache(comparisonRunId: string): void {
    const cacheKey = `comparison:${comparisonRunId}`;
    const deleted = this.comparisonCache.delete(cacheKey);
    if (deleted) {
      this.cacheMetrics.size = this.comparisonCache.size;
      logger.debug({ comparisonRunId, cacheKey }, 'Invalidated cache entry');
    }
  }

  /**
   * Evict the oldest cache entry (LRU-like strategy)
   */
  private evictOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.comparisonCache.entries()) {
      if (entry.cachedAt.getTime() < oldestTime) {
        oldestTime = entry.cachedAt.getTime();
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.comparisonCache.delete(oldestKey);
      this.cacheMetrics.evictions++;
      this.cacheMetrics.size = this.comparisonCache.size;
      logger.debug({ evictedKey: oldestKey }, 'Evicted oldest cache entry');
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.comparisonCache.entries()) {
      if (now > entry.expiresAt) {
        this.comparisonCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.cacheMetrics.size = this.comparisonCache.size;
      logger.debug({ cleaned }, 'Cleaned up expired cache entries');
    }
  }

  /**
   * Ensure database indexes exist for efficient querying
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<DocumentScore>(DOCUMENT_SCORES_COLLECTION);

    try {
      await collection.createIndex(
        { comparisonRunId: 1, workflow: 1, url: 1 },
        { unique: true, name: 'idx_comparison_workflow_url', background: true }
      );

      await collection.createIndex(
        { comparisonRunId: 1 },
        { name: 'idx_comparison_run_id', background: true }
      );

      await collection.createIndex(
        { scoredAt: -1 },
        { name: 'idx_scored_at', background: true }
      );

      logger.debug('WorkflowComparisonService indexes created successfully');
    } catch (error) {
      logger.warn({ error }, 'Some WorkflowComparisonService indexes may already exist');
    }
  }

  /**
   * Start a new workflow comparison
   */
  async startComparison(params: StartWorkflowComparisonParams): Promise<string> {
    const db = getDB();
    const collection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    // Resolve workflows by ID
    const workflowAObj = await getWorkflowById(params.workflowA.workflowId);
    if (!workflowAObj) {
      const { NotFoundError } = await import('../../types/errors.js');
      throw new NotFoundError('Workflow A', params.workflowA.workflowId, {
        workflowLabel: 'A',
        workflowId: params.workflowA.workflowId,
      });
    }

    const workflowBObj = await getWorkflowById(params.workflowB.workflowId);
    if (!workflowBObj) {
      const { NotFoundError } = await import('../../types/errors.js');
      throw new NotFoundError('Workflow B', params.workflowB.workflowId, {
        workflowLabel: 'B',
        workflowId: params.workflowB.workflowId,
      });
    }

    // Get workflow names if not provided
    const workflowAName = params.workflowA.workflowName || await getWorkflowNameById(params.workflowA.workflowId) || params.workflowA.workflowId;
    const workflowBName = params.workflowB.workflowName || await getWorkflowNameById(params.workflowB.workflowId) || params.workflowB.workflowId;

    // Determine queries to use
    let queries: string[] = [];
    if (params.querySpace) {
      // Use query space configuration
      queries = await this.querySelectionService.selectQueries(params.querySpace);
      if (queries.length === 0) {
        throw new Error('No queries selected from query space configuration');
      }
    } else if (params.queries && params.queries.length > 0) {
      // Fallback to queries array (backward compatibility)
      queries = params.queries;
    } else if (params.query) {
      // Fallback to single query (backward compatibility)
      queries = [params.query];
    } else {
      throw new Error('No queries specified. Provide either querySpace, queries, or query parameter.');
    }

    const run: WorkflowComparisonRunDocument = {
      name: params.name,
      description: params.description,
      workflowA: {
        ...params.workflowA,
        workflow: workflowAObj,
        workflowName: workflowAName,
      },
      workflowB: {
        ...params.workflowB,
        workflow: workflowBObj,
        workflowName: workflowBName,
      },
      query: params.query,
      queries: queries, // Use resolved queries
      querySpace: params.querySpace,
      documentSetSpace: params.documentSetSpace,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await collection.insertOne(run);
    const runId = result.insertedId.toString();

    // Start comparison execution asynchronously
    this.executeComparison(runId, {
      ...params,
      queries, // Pass resolved queries
      workflowA: run.workflowA,
      workflowB: run.workflowB,
    }).catch((error) => {
      logger.error({ error, runId }, 'Error executing workflow comparison');
      collection.updateOne(
        { _id: result.insertedId },
        {
          $set: {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          },
        }
      );
    });

    return runId;
  }

  /**
   * Execute the workflow comparison
   */
  private async executeComparison(
    runId: string,
    params: StartWorkflowComparisonParams & {
      workflowA: WorkflowComparisonConfig & { workflow: Workflow };
      workflowB: WorkflowComparisonConfig & { workflow: Workflow };
    }
  ): Promise<void> {
    const db = getDB();
    const collection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    try {
      // Update status to running ONLY if currently pending
      // This prevents overwriting a 'cancelled' status set by cancelComparison
      const updateResult = await collection.updateOne(
        { _id: new ObjectId(runId), status: 'pending' },
        {
          $set: {
            status: 'running',
            startedAt: new Date(),
          },
        }
      );

      if (updateResult.matchedCount === 0) {
        // If we couldn't update, check if it was cancelled
        const currentRun = await collection.findOne({ _id: new ObjectId(runId) });
        if (currentRun?.status === 'cancelled') {
          logger.info({ runId }, 'Comparison was cancelled before execution started');
          return;
        }
        // If it's already running or completed (shouldn't happen in normal flow but for safety), log warning
        logger.warn({ runId, status: currentRun?.status }, 'Comparison execution started but status was not pending');
      }

      // Queries are already resolved in startComparison and passed in params
      const queries = params.queries || [];

      if (queries.length === 0) {
        // Should not happen if startComparison validation works, but safety check
        throw new Error('No queries provided for execution');
      }

      const runsPerQuery = params.runsPerQuery || 1;

      // Execute both workflows for each query
      const allResults: {
        workflowA: WorkflowComparisonResult[];
        workflowB: WorkflowComparisonResult[];
      } = {
        workflowA: [],
        workflowB: [],
      };

      for (const query of queries) {
        for (let runNumber = 1; runNumber <= runsPerQuery; runNumber++) {
          logger.info(
            { runId, query, runNumber, totalRuns: runsPerQuery },
            `Executing workflow comparison run ${runNumber}/${runsPerQuery} for query: ${query}`
          );

          // Check if comparison was cancelled
          const currentRun = await this.getComparisonStatus(runId);
          if (currentRun?.status === 'cancelled') {
            logger.info({ runId }, 'Comparison was cancelled, stopping execution');
            return;
          }

          // Execute workflow A
          const resultA = await this.executeWorkflowWithSettings(
            params.workflowA,
            query,
            runId,
            'A',
            params.documentSetSpace
          );
          allResults.workflowA.push(resultA);

          // Execute workflow B
          const resultB = await this.executeWorkflowWithSettings(
            params.workflowB,
            query,
            runId,
            'B',
            params.documentSetSpace
          );
          allResults.workflowB.push(resultB);
        }
      }

      // Calculate aggregate results (average across all runs)
      const aggregateA = this.aggregateResults(allResults.workflowA);
      const aggregateB = this.aggregateResults(allResults.workflowB);

      // Get scoring config from run document
      const runDoc = await collection.findOne({ _id: new ObjectId(runId) });
      const scoringConfig = runDoc?.scoringConfig || {
        relevantScore: 5,
        irrelevantScore: -1,
      };

      // Calculate comparison metrics with diffs
      const comparison = await this.calculateComparisonMetrics(
        aggregateA,
        aggregateB,
        runId,
        scoringConfig
      );

      // Update run with results
      await collection.updateOne(
        { _id: new ObjectId(runId) },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            results: {
              workflowA: aggregateA,
              workflowB: aggregateB,
              comparison,
            },
            scoringConfig,
          },
        }
      );

      logger.info({ runId, comparison }, 'Workflow comparison completed');
    } catch (error) {
      logger.error({ error, runId }, 'Error executing workflow comparison');
      await collection.updateOne(
        { _id: new ObjectId(runId) },
        {
          $set: {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          },
        }
      );
      throw error;
    }
  }

  /**
   * Execute a workflow with specific runtime settings
   */
  private async executeWorkflowWithSettings(
    config: WorkflowComparisonConfig,
    query: string,
    comparisonRunId: string,
    label: string,
    documentSetSpace?: DocumentSetSpaceConfig
  ): Promise<WorkflowComparisonResult> {
    const startTime = Date.now();

    // Apply feature flags
    const restoreFeatureFlags = await this.applyFeatureFlags(config.runtimeSettings.featureFlags);

    try {
      // Prepare workflow parameters
      const workflowParams = {
        query,
        onderwerp: query,
        thema: '',
        overheidslaag: '',
        benchmarkRunId: comparisonRunId,
        isBenchmark: true,
        isComparison: true,
        comparisonLabel: label,
        ...config.runtimeSettings.params,
      };

      // Validate workflow
      if (!config.workflow || !config.workflow.id || !config.workflow.steps || config.workflow.steps.length === 0) {
        throw new BadRequestError(`Invalid workflow: ${config.workflowId} - missing required fields`, {
          workflowId: config.workflowId,
          hasWorkflow: !!config.workflow,
          hasId: !!config.workflow?.id,
          hasSteps: !!config.workflow?.steps,
          stepsLength: config.workflow?.steps?.length || 0,
        });
      }

      // Ensure workflowEngine and runManager are available
      if (!this.workflowEngine || !this.runManager) {
        throw new Error('WorkflowEngine or RunManager not initialized');
      }

      // Execute workflow
      const workflowRunId = await this.workflowEngine.startWorkflow(config.workflow, workflowParams);

      if (!workflowRunId) {
        throw new Error(`Failed to start workflow ${config.workflowId} - no run ID returned`);
      }

      // Store runId immediately in comparison document for real-time log viewing
      const db = getDB();
      const collection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);
      if (label === 'A') {
        await collection.updateOne(
          { _id: new ObjectId(comparisonRunId) },
          {
            $set: {
              'currentRunIds.workflowA': workflowRunId,
            },
          }
        );
      } else if (label === 'B') {
        await collection.updateOne(
          { _id: new ObjectId(comparisonRunId) },
          {
            $set: {
              'currentRunIds.workflowB': workflowRunId,
            },
          }
        );
      }

      // Wait for completion
      const timeout = config.runtimeSettings.timeout || 30 * 60 * 1000; // Default 30 minutes
      const workflowRun = await this.waitForWorkflowCompletion(workflowRunId, timeout);

      const executionTimeMs = Date.now() - startTime;

      // Extract results
      let documents = await this.extractDocumentsFromRun(workflowRunId);

      // Apply document set space configuration if provided
      if (documentSetSpace) {
        logger.debug(
          { comparisonRunId, label, documentSetSpace, originalDocumentCount: documents.length },
          'Applying document set space configuration'
        );
        const selected = await this.documentSelectionService.selectDocuments(documents, documentSetSpace);

        // Map back to correct type, ensuring title is string or empty string
        documents = selected.map(doc => ({
          url: doc.url,
          title: typeof doc.title === 'string' ? doc.title : '',
          score: typeof doc.score === 'number' ? doc.score : undefined,
        }));

        logger.debug(
          { comparisonRunId, label, selectedDocumentCount: documents.length },
          'Document set space configuration applied'
        );
      }

      const documentsFound = documents.length;

      // Calculate metrics
      const scores = documents.map((d) => d.score || 0).filter((s) => s > 0);
      const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
      const topScore = scores.length > 0 ? Math.max(...scores) : undefined;

      return {
        workflowId: config.workflowId,
        workflowName: config.workflowName,
        label: config.label,
        runId: workflowRunId,
        status: (workflowRun && workflowRun.status === 'completed') ? 'completed' : 'failed',
        executionTimeMs,
        documentsFound,
        documents: documents.map((d, index) => ({
          url: d.url,
          title: d.title,
          score: d.score,
          rank: index + 1,
        })),
        metrics: {
          averageScore,
          topScore,
          documentsWithScores: scores.length,
        },
        featureFlags: config.runtimeSettings.featureFlags,
        runtimeSettings: config.runtimeSettings,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      logger.error({ error, workflowId: config.workflowId, label }, 'Error executing workflow in comparison');

      return {
        workflowId: config.workflowId,
        workflowName: config.workflowName,
        label: config.label,
        runId: '',
        status: 'failed',
        executionTimeMs,
        documentsFound: 0,
        documents: [],
        metrics: {},
        error: error instanceof Error ? error.message : String(error),
        featureFlags: config.runtimeSettings.featureFlags,
        runtimeSettings: config.runtimeSettings,
      };
    } finally {
      // Restore feature flags
      await restoreFeatureFlags();
    }
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
      for (const [flagName, enabled] of Object.entries(featureFlags)) {
        try {
          const kgFlagValues = Object.values(KGFeatureFlag);
          if (kgFlagValues.includes(flagName as KGFeatureFlag)) {
            await FeatureFlag.setKGFlag(flagName as KGFeatureFlag, enabled, 'workflow-comparison');
          } else {
            await FeatureFlag.upsert({
              name: flagName,
              enabled,
              updatedBy: 'workflow-comparison',
            });
          }
        } catch (e) {
          logger.warn({ error: e, flagName }, 'Failed to set feature flag');
        }
      }
      await FeatureFlag.refreshCache();
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
   * Wait for workflow completion with timeout
   */
  private async waitForWorkflowCompletion(
    runId: string,
    timeout: number
  ): Promise<Run | null> {
    let workflowRun = await this.runManager!.getRun(runId);
    let attempts = 0;
    const maxAttempts = Math.ceil(timeout / 2000); // Poll every 2 seconds
    const pollInterval = 2000;

    while (workflowRun && workflowRun.status === 'running' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      workflowRun = await this.runManager!.getRun(runId);
      attempts++;
    }

    if (workflowRun && workflowRun.status === 'running') {
      throw new Error(`Workflow timed out after ${timeout}ms`);
    }

    return workflowRun;
  }

  /**
   * Extract documents from workflow run
   */
  private async extractDocumentsFromRun(runId: string): Promise<Array<{ url: string; title: string; score?: number }>> {
    try {
      const run = await this.runManager!.getRun(runId);
      if (!run || !run.result) {
        return [];
      }

      // Try to extract documents from various possible result structures
      const result = run.result;
      const documents: Array<{ url: string; title: string; score?: number }> = [];

      // Check for scoredDocuments
      if (result.scoredDocuments && Array.isArray(result.scoredDocuments)) {
        for (const doc of result.scoredDocuments) {
          documents.push({
            url: doc.url || '',
            title: doc.title || doc.titel || '',
            score: doc.score || doc.authorityScore,
          });
        }
      }

      // Check for documentsByCategory
      if (result.documentsByCategory) {
        for (const category of Object.values(result.documentsByCategory)) {
          if (Array.isArray(category)) {
            for (const doc of category) {
              documents.push({
                url: doc.url || '',
                title: doc.title || doc.titel || '',
                score: doc.score || doc.authorityScore,
              });
            }
          }
        }
      }

      // Check for rawDocumentsBySource
      if (result.rawDocumentsBySource) {
        for (const source of Object.values(result.rawDocumentsBySource)) {
          if (Array.isArray(source)) {
            for (const doc of source) {
              documents.push({
                url: doc.url || '',
                title: doc.title || doc.titel || '',
                score: doc.score || doc.authorityScore,
              });
            }
          }
        }
      }

      return documents;
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to extract documents from workflow run');
      return [];
    }
  }

  /**
   * Aggregate results across multiple runs
   */
  private aggregateResults(results: WorkflowComparisonResult[]): WorkflowComparisonResult {
    if (results.length === 0) {
      throw new Error('Cannot aggregate empty results');
    }

    // Average execution time
    const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length;

    // Average documents found
    const avgDocumentsFound = Math.round(
      results.reduce((sum, r) => sum + r.documentsFound, 0) / results.length
    );

    // Combine all documents (deduplicate by URL)
    const documentMap = new Map<string, { url: string; title: string; score?: number }>();
    for (const result of results) {
      for (const doc of result.documents) {
        if (!documentMap.has(doc.url)) {
          documentMap.set(doc.url, doc);
        } else {
          // Keep document with higher score if available
          const existing = documentMap.get(doc.url)!;
          if (doc.score && (!existing.score || doc.score > existing.score)) {
            documentMap.set(doc.url, doc);
          }
        }
      }
    }

    // Calculate average metrics
    const scores = Array.from(documentMap.values())
      .map((d) => d.score || 0)
      .filter((s) => s > 0);
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
    const topScore = scores.length > 0 ? Math.max(...scores) : undefined;

    return {
      ...results[0], // Use first result as base
      executionTimeMs: Math.round(avgExecutionTime),
      documentsFound: avgDocumentsFound,
      documents: Array.from(documentMap.values()),
      metrics: {
        averageScore,
        topScore,
        documentsWithScores: scores.length,
      },
    };
  }

  /**
   * Extract brondocuments from workflow run using queryId
   */
  private async extractBrondocumentsFromRun(runId: string): Promise<Array<{
    url: string;
    titel: string;
    website_url: string;
    samenvatting: string;
    'relevantie voor zoekopdracht': string;
    type_document: string;
    subjects?: string[];
    themes?: string[];
  }>> {
    try {
      const run = await this.runManager!.getRun(runId);
      if (!run || !run.params?.queryId) {
        return [];
      }

      // Use canonical document service
      const { getCanonicalDocumentService } = await import('../../services/canonical/CanonicalDocumentService.js');
      const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
      const documentService = getCanonicalDocumentService();

      // Ensure queryId is a string
      const queryId = typeof run.params.queryId === 'string' ? run.params.queryId : String(run.params.queryId || '');
      if (!queryId) {
        return [];
      }

      const canonicalDocs = await documentService.findByQueryId(queryId);

      // Transform to legacy format for compatibility
      const documents = transformCanonicalArrayToLegacy(canonicalDocs);

      return documents.map(doc => ({
        url: doc.url,
        titel: doc.titel,
        website_url: doc.website_url,
        samenvatting: doc.samenvatting,
        'relevantie voor zoekopdracht': doc['relevantie voor zoekopdracht'],
        type_document: doc.type_document,
        subjects: doc.subjects,
        themes: doc.themes,
      }));
    } catch (error) {
      logger.warn({ error, runId }, 'Failed to extract brondocuments from workflow run');
      return [];
    }
  }

  /**
   * Calculate comparison metrics between two workflow results
   * Uses cache to avoid recalculating metrics on every request
   */
  private async calculateComparisonMetrics(
    resultA: WorkflowComparisonResult,
    resultB: WorkflowComparisonResult,
    comparisonRunId: string,
    scoringConfig: { relevantScore: number; irrelevantScore: number },
    session?: ClientSession
  ): Promise<ComparisonMetrics> {
    const startTime = Date.now();

    // Check cache first (only if no session is active, as we want fresh data in transaction)
    if (!session) {
      const cached = this.getCachedResult(comparisonRunId);
      if (cached) {
        const cacheHitTime = Date.now() - startTime;
        logger.debug({ comparisonRunId, cacheHitTime }, 'Cache hit - returning cached comparison metrics');
        return cached;
      }
    }

    // Cache miss - calculate metrics
    logger.debug({ comparisonRunId }, 'Cache miss - calculating comparison metrics');
    // Execution time comparison
    const executionTimeDiff = resultB.executionTimeMs - resultA.executionTimeMs;
    const executionTimeDiffPercent =
      resultA.executionTimeMs > 0
        ? (executionTimeDiff / resultA.executionTimeMs) * 100
        : 0;

    // Documents found comparison
    const documentsFoundDiff = resultB.documentsFound - resultA.documentsFound;
    const documentsFoundDiffPercent =
      resultA.documentsFound > 0 ? (documentsFoundDiff / resultA.documentsFound) * 100 : 0;

    // Average score comparison
    const averageScoreDiff =
      resultA.metrics.averageScore && resultB.metrics.averageScore
        ? resultB.metrics.averageScore - resultA.metrics.averageScore
        : undefined;

    // Document set comparison
    const urlsA = new Set(resultA.documents.map((d) => d.url));
    const urlsB = new Set(resultB.documents.map((d) => d.url));

    const uniqueUrlsA = Array.from(urlsA).filter((url) => !urlsB.has(url));
    const uniqueUrlsB = Array.from(urlsB).filter((url) => !urlsA.has(url));
    const commonDocuments = Array.from(urlsA).filter((url) => urlsB.has(url)).length;

    // Create document maps for efficient lookup
    const docMapA = new Map(resultA.documents.map(d => [d.url, d]));
    const docMapB = new Map(resultB.documents.map(d => [d.url, d]));

    // Extract brondocuments for both workflows (batch queries - one per workflow)
    // Performance: These queries are already batched (one query per workflow run)
    const brondocExtractionStart = Date.now();
    const [brondocsA, brondocsB] = await Promise.all([
      resultA.runId ? this.extractBrondocumentsFromRun(resultA.runId) : Promise.resolve([]),
      resultB.runId ? this.extractBrondocumentsFromRun(resultB.runId) : Promise.resolve([]),
    ]);
    const brondocExtractionTime = Date.now() - brondocExtractionStart;
    logger.debug(
      { comparisonRunId, brondocExtractionTime, brondocsACount: brondocsA.length, brondocsBCount: brondocsB.length },
      'Brondocument extraction completed'
    );

    const brondocMapA = new Map(brondocsA.map(d => [d.url, d]));
    const brondocMapB = new Map(brondocsB.map(d => [d.url, d]));

    // Build diff A (documents in A but not in B)
    const diffA: DiffDocument[] = uniqueUrlsA.map(url => {
      const doc = docMapA.get(url);
      const brondoc = brondocMapA.get(url);
      return {
        url,
        title: doc?.title || brondoc?.titel || url,
        score: doc?.score,
        rank: doc?.rank,
        relevanceScore: 'pending' as const,
        brondocument: brondoc ? {
          titel: brondoc.titel,
          url: brondoc.url,
          website_url: brondoc.website_url,
          samenvatting: brondoc.samenvatting,
          'relevantie voor zoekopdracht': brondoc['relevantie voor zoekopdracht'],
          type_document: brondoc.type_document,
          subjects: brondoc.subjects,
          themes: brondoc.themes,
        } : undefined,
      };
    });

    // Build diff B (documents in B but not in A)
    const diffB: DiffDocument[] = uniqueUrlsB.map(url => {
      const doc = docMapB.get(url);
      const brondoc = brondocMapB.get(url);
      return {
        url,
        title: doc?.title || brondoc?.titel || url,
        score: doc?.score,
        rank: doc?.rank,
        relevanceScore: 'pending' as const,
        brondocument: brondoc ? {
          titel: brondoc.titel,
          url: brondoc.url,
          website_url: brondoc.website_url,
          samenvatting: brondoc.samenvatting,
          'relevantie voor zoekopdracht': brondoc['relevantie voor zoekopdracht'],
          type_document: brondoc.type_document,
          subjects: brondoc.subjects,
          themes: brondoc.themes,
        } : undefined,
      };
    });

    // Load existing scores from database using optimized aggregation
    const scoresLoadStart = Date.now();
    const existingScores = await this.loadDocumentScores(comparisonRunId, session);
    const scoresLoadTime = Date.now() - scoresLoadStart;
    logger.debug({ comparisonRunId, scoresLoadTime, scoresCount: existingScores.length }, 'Document scores loaded');

    const scoreMapA = new Map(existingScores.filter(s => s.workflow === 'A').map(s => [s.url, s]));
    const scoreMapB = new Map(existingScores.filter(s => s.workflow === 'B').map(s => [s.url, s]));

    // Apply existing scores to diffs
    for (const doc of diffA) {
      const score = scoreMapA.get(doc.url);
      if (score) {
        doc.relevanceScore = score.relevanceScore;
        doc.scoredBy = score.scoredBy;
        doc.scoredAt = score.scoredAt;
      }
    }

    for (const doc of diffB) {
      const score = scoreMapB.get(doc.url);
      if (score) {
        doc.relevanceScore = score.relevanceScore;
        doc.scoredBy = score.scoredBy;
        doc.scoredAt = score.scoredAt;
      }
    }

    // Calculate scoring metrics
    const workflowARelevant = diffA.filter(d => d.relevanceScore === 'relevant').length;
    const workflowAIrrelevant = diffA.filter(d => d.relevanceScore === 'irrelevant').length;
    const workflowAPending = diffA.filter(d => d.relevanceScore === 'pending').length;
    const workflowBRelevant = diffB.filter(d => d.relevanceScore === 'relevant').length;
    const workflowBIrrelevant = diffB.filter(d => d.relevanceScore === 'irrelevant').length;
    const workflowBPending = diffB.filter(d => d.relevanceScore === 'pending').length;

    const workflowAScore = (workflowARelevant * scoringConfig.relevantScore) +
      (workflowAIrrelevant * scoringConfig.irrelevantScore);
    const workflowBScore = (workflowBRelevant * scoringConfig.relevantScore) +
      (workflowBIrrelevant * scoringConfig.irrelevantScore);

    // Jaccard similarity
    const union = new Set([...urlsA, ...urlsB]).size;
    const jaccardSimilarity = union > 0 ? commonDocuments / union : 0;

    // Determine winner (configurable criteria - for now: faster + more documents + better scores)
    let winner: 'A' | 'B' | 'tie' = 'tie';
    const scoreA = (resultA.metrics.averageScore || 0) * resultA.documentsFound;
    const scoreB = (resultB.metrics.averageScore || 0) * resultB.documentsFound;

    if (executionTimeDiff < 0 && documentsFoundDiff <= 0 && (averageScoreDiff || 0) <= 0) {
      winner = 'B'; // B is faster, has same/more documents, and same/better scores
    } else if (executionTimeDiff > 0 && documentsFoundDiff >= 0 && (averageScoreDiff || 0) >= 0) {
      winner = 'A'; // A is faster, has same/more documents, and same/better scores
    } else if (scoreB > scoreA * 1.1) {
      winner = 'B'; // B has significantly better overall score
    } else if (scoreA > scoreB * 1.1) {
      winner = 'A'; // A has significantly better overall score
    }

    const metrics: ComparisonMetrics = {
      executionTimeDiff,
      executionTimeDiffPercent,
      documentsFoundDiff,
      documentsFoundDiffPercent,
      averageScoreDiff,
      uniqueDocumentsA: diffA.length,
      uniqueDocumentsB: diffB.length,
      commonDocuments,
      jaccardSimilarity,
      winner,
      diffA,
      diffB,
      scoring: {
        workflowAScore,
        workflowBScore,
        relevantScore: scoringConfig.relevantScore,
        irrelevantScore: scoringConfig.irrelevantScore,
        workflowARelevant,
        workflowAIrrelevant,
        workflowBRelevant,
        workflowBIrrelevant,
        workflowAPending,
        workflowBPending,
      },
    };

    // Cache the result
    this.setCachedResult(comparisonRunId, metrics);

    const totalDuration = Date.now() - startTime;
    const documentCount = diffA.length + diffB.length;

    // Performance monitoring and logging
    logger.info(
      {
        comparisonRunId,
        durationMs: totalDuration,
        documentCount,
        diffACount: diffA.length,
        diffBCount: diffB.length,
        brondocExtractionTime,
        scoresLoadTime,
      },
      'Comparison metrics calculated'
    );

    // Alert on slow operations (> 5 seconds)
    if (totalDuration > 5000) {
      logger.warn(
        {
          comparisonRunId,
          durationMs: totalDuration,
          documentCount,
          threshold: 5000,
        },
        'Slow comparison metrics calculation detected'
      );
    }

    return metrics;
  }

  /**
   * Score a document in a diff as relevant or irrelevant
   */
  async scoreDocument(
    comparisonRunId: string,
    workflow: 'A' | 'B',
    url: string,
    relevanceScore: 'relevant' | 'irrelevant',
    scoredBy: string
  ): Promise<void> {
    // Validate inputs
    if (!comparisonRunId || typeof comparisonRunId !== 'string') {
      throw new BadRequestError('Invalid comparisonRunId: must be a non-empty string', {
        comparisonRunId,
      });
    }

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new BadRequestError('Invalid url: must be a non-empty string', {
        url,
      });
    }

    if (!scoredBy || typeof scoredBy !== 'string' || scoredBy.trim().length === 0) {
      throw new BadRequestError('Invalid scoredBy: must be a non-empty string', {
        scoredBy,
      });
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(comparisonRunId)) {
      throw new BadRequestError(`Invalid comparisonRunId format: ${comparisonRunId}`, {
        comparisonRunId,
      });
    }

    const db = getDB();
    const comparisonsCollection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    // Verify comparison exists
    const comparison = await comparisonsCollection.findOne({ _id: new ObjectId(comparisonRunId) });
    if (!comparison) {
      throw new NotFoundError('Comparison', comparisonRunId);
    }

    // Verify comparison has results (completed)
    if (!comparison.results) {
      throw new BadRequestError(`Comparison not completed yet: ${comparisonRunId}`, {
        comparisonRunId,
        status: comparison.status,
      });
    }

    // Verify document exists in the appropriate diff
    const diff = workflow === 'A' ? comparison.results.comparison.diffA : comparison.results.comparison.diffB;
    const documentExists = diff.some(doc => doc.url === url);
    if (!documentExists) {
      throw new NotFoundError('Document in workflow diff', url, {
        comparisonRunId,
        workflow,
      });
    }

    // Use MongoDB transaction to ensure atomicity if supported, otherwise fall back to non-transactional
    // Use getClient() to access the MongoClient instance for transactions
    const client = getClient();
    const session = client.startSession();
    const useTransaction = await this.isTransactionSupported(db);

    logger.debug(
      { comparisonRunId, workflow, url, relevanceScore, scoredBy, useTransaction },
      useTransaction ? 'Starting transaction for scoreDocument' : 'Using non-transactional operations for scoreDocument'
    );

    const executeOperation = async (session?: ClientSession) => {
      // Step 1: Load current document score for optimistic locking
      const collection = db.collection<DocumentScore>(DOCUMENT_SCORES_COLLECTION);
      logger.debug(
        { comparisonRunId, workflow, url },
        'Transaction: Loading current document score for optimistic locking'
      );

      const current = await collection.findOne(
        {
          comparisonRunId: new ObjectId(comparisonRunId),
          workflow,
          url,
        },
        { session }
      );

      const expectedVersion = current?.version ?? 0;
      const currentScore = current?.relevanceScore;
      const scoreChanged = currentScore !== relevanceScore;

      logger.debug(
        { comparisonRunId, workflow, url, expectedVersion, currentScore, newScore: relevanceScore, scoreChanged },
        'Transaction: Current version loaded, attempting update'
      );

      // Optimization: If score hasn't changed, skip update and cache invalidation
      if (!scoreChanged && current) {
        logger.debug(
          { comparisonRunId, workflow, url, relevanceScore },
          'Transaction: Score unchanged, skipping update and cache invalidation'
        );
        return; // No changes needed, exit transaction early
      }

      // Step 2: Update with version check (optimistic locking)
      let updateResult;
      try {
        updateResult = await collection.updateOne(
          {
            comparisonRunId: new ObjectId(comparisonRunId),
            workflow,
            url,
            version: expectedVersion, // Only update if version matches
          },
          {
            $set: {
              relevanceScore,
              scoredBy,
              scoredAt: new Date(),
              version: expectedVersion + 1, // Increment version
            },
          },
          { upsert: true, ...(session ? { session } : {}) }
        );
      } catch (error: any) {
        // Handle race condition where another process inserted the document
        if (error.code === 11000) {
          logger.warn(
            { comparisonRunId, workflow, url, error },
            'Transaction: Duplicate key error detected (race condition)'
          );
          throw new RevisionConflictError(
            'Document was modified by another user (concurrent insert). Please refresh and try again.',
            { comparisonRunId, workflow, url }
          );
        }
        throw error;
      }

      // Check if update succeeded (version matched)
      if (updateResult.matchedCount === 0 && current) {
        // This handles the case where the document exists but version doesn't match
        logger.warn(
          { comparisonRunId, workflow, url, expectedVersion, currentVersion: current.version },
          'Transaction: Optimistic lock conflict detected (version mismatch)'
        );
        throw new RevisionConflictError(
          'Document score was modified by another user. Please refresh and try again.',
          { comparisonRunId, workflow, url, expectedVersion, currentVersion: current.version }
        );
      }

      logger.debug(
        { comparisonRunId, workflow, url, newVersion: expectedVersion + 1, scoreChanged },
        'Transaction: Document score updated successfully with optimistic locking'
      );

      // Step 3: Recalculate comparison metrics and update the comparison document
      if (scoreChanged) {
        logger.debug(
          { comparisonRunId },
          'Transaction: Score changed, recalculating comparison scores'
        );
        await this.recalculateComparisonScores(comparisonRunId, session);
      } else {
        logger.debug(
          { comparisonRunId },
          'Transaction: Score unchanged, skipping recalculation'
        );
      }

      logger.debug(
        { comparisonRunId, workflow, url },
        'Successfully completed scoreDocument operations'
      );
    };

    try {
      if (useTransaction) {
        await session.withTransaction(
          () => executeOperation(session),
          {
            maxTimeMS: 30000, // 30 second timeout
          }
        );
        logger.info(
          { comparisonRunId, workflow, url, relevanceScore, scoredBy },
          'Transaction committed successfully for scoreDocument'
        );
      } else {
        // Execute without transaction (for standalone MongoDB in test environment)
        await executeOperation();
        logger.info(
          { comparisonRunId, workflow, url, relevanceScore, scoredBy },
          'ScoreDocument operation completed successfully (non-transactional)'
        );
      }
    } catch (error) {

      logger.error(
        {
          error,
          comparisonRunId,
          workflow,
          url,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        useTransaction
          ? 'Transaction failed for scoreDocument - all changes have been rolled back'
          : 'ScoreDocument operation failed'
      );

      // Re-throw the original error
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Check if transactions are supported on the current MongoDB connection
   * Protected to allow overriding in tests
   */
  protected async isTransactionSupported(db: any): Promise<boolean> {
    // Check if transactions are supported (replica set or sharded cluster)
    try {
      const client = getClient();
      const adminDb = client.db('admin');
      const serverStatus = await adminDb.command({ serverStatus: 1 });
      // Transactions are only supported on replica sets or sharded clusters
      return serverStatus.repl?.setName !== undefined || serverStatus.process === 'mongos';
    } catch (error) {
      // If we can't determine, assume transactions are not supported in test environment
      logger.warn({ error }, 'Failed to determine transaction support, assuming false');
      return false;
    }
  }

  /**
   * Score multiple documents in a diff as relevant or irrelevant (bulk operation)
   */
  async scoreDocuments(
    comparisonRunId: string,
    scores: Array<{
      workflow: 'A' | 'B';
      url: string;
      relevanceScore: 'relevant' | 'irrelevant';
      scoredBy: string;
    }>
  ): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    results: Array<{
      workflow: 'A' | 'B';
      url: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    // Validate inputs
    if (!comparisonRunId || typeof comparisonRunId !== 'string') {
      throw new BadRequestError('Invalid comparisonRunId: must be a non-empty string', {
        comparisonRunId,
      });
    }

    if (!Array.isArray(scores) || scores.length === 0) {
      throw new BadRequestError('Invalid scores: must be a non-empty array', {
        scoresType: typeof scores,
        scoresLength: Array.isArray(scores) ? scores.length : undefined,
      });
    }

    if (scores.length > 100) {
      throw new Error('Maximum 100 documents per request');
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(comparisonRunId)) {
      throw new BadRequestError(`Invalid comparisonRunId format: ${comparisonRunId}`, {
        comparisonRunId,
      });
    }

    const db = getDB();
    const comparisonsCollection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    // Verify comparison exists and is completed (validate once for all scores)
    const comparison = await comparisonsCollection.findOne({ _id: new ObjectId(comparisonRunId) });
    if (!comparison) {
      throw new NotFoundError('Comparison', comparisonRunId);
    }

    if (!comparison.results) {
      throw new BadRequestError(`Comparison not completed yet: ${comparisonRunId}`, {
        comparisonRunId,
        status: comparison.status,
      });
    }

    // Pre-validate all documents exist in their respective diffs
    const diffA = comparison.results.comparison.diffA;
    const diffB = comparison.results.comparison.diffB;
    const diffAUrls = new Set(diffA.map(doc => doc.url));
    const diffBUrls = new Set(diffB.map(doc => doc.url));

    const validationErrors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < scores.length; i++) {
      const score = scores[i];
      const diffUrls = score.workflow === 'A' ? diffAUrls : diffBUrls;
      if (!diffUrls.has(score.url)) {
        validationErrors.push({
          index: i,
          error: `Document not found in workflow ${score.workflow} diff: ${score.url}`,
        });
      }
    }

    // If validation errors exist, return them before processing
    if (validationErrors.length > 0) {
      const results = scores.map((score, index) => {
        const error = validationErrors.find(e => e.index === index);
        return {
          workflow: score.workflow,
          url: score.url,
          success: false,
          error: error?.error || 'Validation failed',
        };
      });
      return {
        processed: scores.length,
        succeeded: 0,
        failed: scores.length,
        results,
      };
    }

    // Process scores in batches of 50 to avoid transaction size limits
    const BATCH_SIZE = 50;
    const allResults: Array<{ workflow: 'A' | 'B'; url: string; success: boolean; error?: string }> = [];
    let totalSucceeded = 0;
    let totalFailed = 0;
    const operationStartTime = Date.now();

    logger.info(
      { comparisonRunId, totalScores: scores.length, batchSize: BATCH_SIZE },
      'Starting bulk scoring operation'
    );

    for (let i = 0; i < scores.length; i += BATCH_SIZE) {
      const batch = scores.slice(i, i + BATCH_SIZE);
      const batchStartTime = Date.now();

      logger.debug(
        { comparisonRunId, batchNumber: Math.floor(i / BATCH_SIZE) + 1, batchSize: batch.length },
        'Processing batch of scores'
      );

      // Process each score in the batch
      const batchResults = await Promise.allSettled(
        batch.map(score =>
          this.scoreDocument(
            comparisonRunId,
            score.workflow,
            score.url,
            score.relevanceScore,
            score.scoredBy
          )
        )
      );

      // Process batch results
      for (let j = 0; j < batch.length; j++) {
        const result = batchResults[j];
        const score = batch[j];
        if (result.status === 'fulfilled') {
          allResults.push({
            workflow: score.workflow,
            url: score.url,
            success: true,
          });
          totalSucceeded++;
        } else {
          const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
          allResults.push({
            workflow: score.workflow,
            url: score.url,
            success: false,
            error: errorMessage,
          });
          totalFailed++;
        }
      }

      const batchTime = Date.now() - batchStartTime;
      logger.debug(
        { comparisonRunId, batchNumber: Math.floor(i / BATCH_SIZE) + 1, batchTime, succeeded: batchResults.filter(r => r.status === 'fulfilled').length, failed: batchResults.filter(r => r.status === 'rejected').length },
        'Batch processing completed'
      );
    }

    const totalTime = Date.now() - operationStartTime;
    logger.info(
      { comparisonRunId, totalScores: scores.length, totalSucceeded, totalFailed, totalTime },
      'Bulk scoring operation completed'
    );

    return {
      processed: scores.length,
      succeeded: totalSucceeded,
      failed: totalFailed,
      results: allResults,
    };
  }

  /**
   * Load existing document scores for a comparison
   * Optimized to use efficient query with projection
   */
  private async loadDocumentScores(
    comparisonRunId: string,
    session?: ClientSession
  ): Promise<Array<{
    workflow: 'A' | 'B';
    url: string;
    relevanceScore: 'relevant' | 'irrelevant';
    scoredBy: string;
    scoredAt: Date;
  }>> {
    const db = getDB();
    const collection = db.collection<DocumentScore>(DOCUMENT_SCORES_COLLECTION);

    // Use projection to only fetch needed fields (performance optimization)
    const findOptions = session ? { session } : {};
    const scores = await collection.find(
      {
        comparisonRunId: new ObjectId(comparisonRunId),
      },
      {
        ...findOptions,
        projection: {
          workflow: 1,
          url: 1,
          relevanceScore: 1,
          scoredBy: 1,
          scoredAt: 1,
        },
      }
    ).toArray();

    return scores.map(s => ({
      workflow: s.workflow,
      url: s.url,
      relevanceScore: s.relevanceScore,
      scoredBy: s.scoredBy,
      scoredAt: s.scoredAt,
    }));
  }

  /**
   * Get paginated diff arrays for a comparison
   * Performance optimization: Returns only requested page of documents
   */
  async getPaginatedDiff(
    comparisonRunId: string,
    workflow: 'A' | 'B',
    page: number = 1,
    pageSize: number = 50
  ): Promise<{
    diff: DiffDocument[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const comparison = await this.getComparisonStatus(comparisonRunId);
    if (!comparison || !comparison.results) {
      throw new NotFoundError('Comparison', comparisonRunId, {
        hasComparison: !!comparison,
        hasResults: !!comparison?.results,
      });
    }

    const fullDiff = workflow === 'A' ? comparison.results.comparison.diffA : comparison.results.comparison.diffB;
    const total = fullDiff.length;
    const skip = (page - 1) * pageSize;
    const paginatedDiff = fullDiff.slice(skip, skip + pageSize);
    const hasMore = skip + pageSize < total;

    return {
      diff: paginatedDiff,
      total,
      page,
      pageSize,
      hasMore,
    };
  }

  /**
   * Recalculate comparison scores after a document is scored
   * Invalidates cache to ensure fresh results
   */
  private async recalculateComparisonScores(
    comparisonRunId: string,
    session?: ClientSession
  ): Promise<void> {
    // Invalidate cache since scores have changed
    this.invalidateCache(comparisonRunId);
    const db = getDB();
    const comparisonsCollection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    const findOptions = session ? { session } : {};
    const updateOptions = session ? { session } : {};

    const comparison = await comparisonsCollection.findOne(
      { _id: new ObjectId(comparisonRunId) },
      findOptions
    );
    if (!comparison || !comparison.results) {
      return;
    }

    const scoringConfig = comparison.scoringConfig || {
      relevantScore: 5,
      irrelevantScore: -1,
    };

    // Recalculate metrics with updated scores
    const updatedComparison = await this.calculateComparisonMetrics(
      comparison.results.workflowA,
      comparison.results.workflowB,
      comparisonRunId,
      scoringConfig,
      session
    );

    // Update the comparison document
    await comparisonsCollection.updateOne(
      { _id: new ObjectId(comparisonRunId) },
      {
        $set: {
          'results.comparison': updatedComparison,
        },
      },
      updateOptions
    );
  }

  /**
   * Get comparison status
   */
  async getComparisonStatus(runId: string): Promise<WorkflowComparisonRunDocument | null> {
    const db = getDB();
    const collection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    return await collection.findOne({ _id: new ObjectId(runId) });
  }

  /**
   * List all comparisons with optional filters
   */
  async listComparisons(options?: {
    limit?: number;
    skip?: number;
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  }): Promise<WorkflowComparisonRunDocument[]> {
    const db = getDB();
    const collection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    const limit = options?.limit ?? 50;
    const skip = options?.skip ?? 0;
    const query: Record<string, unknown> = {};

    if (options?.status) {
      query.status = options.status;
    }

    return await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray();
  }

  /**
   * Cancel a comparison
   */
  async cancelComparison(runId: string): Promise<void> {
    const db = getDB();
    const collection = db.collection<WorkflowComparisonRunDocument>(WORKFLOW_COMPARISONS_COLLECTION);

    await collection.updateOne(
      { _id: new ObjectId(runId) },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      }
    );
  }
}
