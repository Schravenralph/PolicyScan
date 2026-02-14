/**
 * Workflow Benchmark Comparison Service
 * 
 * Service for comparing workflows with benchmark configurations.
 * Executes workflows with different configs, tracks progress, and compares results.
 */

import { ObjectId, type Collection } from 'mongodb';
import { getDB } from '../../config/database.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import type { Workflow, Run } from '../infrastructure/types.js';
import { getWorkflowById } from '../../utils/workflowLookup.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import { BENCHMARK_CONFIGS, type BenchmarkConfig, type BenchmarkSettings } from '../../../../scripts/benchmarks/settings-benchmark.js';

const WORKFLOW_BENCHMARK_COMPARISONS_COLLECTION = 'workflow_benchmark_comparisons';

/**
 * Workflow benchmark result for a single workflow execution
 */
export interface WorkflowBenchmarkResult {
  workflowId: string;
  workflowName: string;
  configName: string;
  configDescription: string;
  runId: string;
  status: 'completed' | 'failed' | 'cancelled';
  executionTimeMs: number;
  documentsFound: number;
  documents: Array<{
    url: string;
    title: string;
    score: number;
    rank: number;
  }>;
  metrics: {
    averageScore?: number;
    topScore?: number;
    documentsWithScores: number;
  };
  error?: string;
}

/**
 * Comparison metrics between two workflow results
 */
export interface ComparisonMetrics {
  executionTimeDiff: number;
  executionTimeDiffPercent: number;
  documentsFoundDiff: number;
  averageScoreDiff?: number;
  topScoreDiff?: number;
  commonDocuments: number;
  uniqueToA: number;
  uniqueToB: number;
}

/**
 * Workflow benchmark comparison document
 */
interface WorkflowBenchmarkComparisonDocument {
  _id?: ObjectId;
  name?: string;
  workflowAId: string;
  workflowBId: string;
  configAName: string;
  configBName: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workflowARunId?: string;
  workflowBRunId?: string;
  results?: {
    workflowA: WorkflowBenchmarkResult;
    workflowB: WorkflowBenchmarkResult;
    comparison: ComparisonMetrics;
  };
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Parameters for starting a comparison
 */
export interface StartComparisonParams {
  name?: string;
  workflowAId: string;
  workflowBId: string;
  configAName: string;
  configBName: string;
  query: string;
}

/**
 * Workflow Benchmark Comparison Service
 */
export class WorkflowBenchmarkComparisonService {
  private comparisonsCollection: Collection<WorkflowBenchmarkComparisonDocument>;

  constructor(
    private db: ReturnType<typeof getDB>,
    private workflowEngine: WorkflowEngine,
    private runManager: RunManager
  ) {
    this.comparisonsCollection = this.db.collection<WorkflowBenchmarkComparisonDocument>(
      WORKFLOW_BENCHMARK_COMPARISONS_COLLECTION
    );
  }

  /**
   * Get benchmark config by name
   */
  private getBenchmarkConfigByName(name: string): BenchmarkConfig | undefined {
    return BENCHMARK_CONFIGS.find(config => config.name === name);
  }

  /**
   * Convert benchmark settings to feature flags
   */
  private settingsToFeatureFlags(settings: Partial<BenchmarkSettings>): Record<string, boolean> {
    const featureFlags: Record<string, boolean> = {};
    
    Object.entries(settings).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        featureFlags[key] = value;
      }
    });
    
    return featureFlags;
  }

  /**
   * Apply feature flags temporarily and return restore function
   */
  private async applyFeatureFlags(
    featureFlags: Record<string, boolean>
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
      for (const [flagName, enabled] of Object.entries(featureFlags)) {
        try {
          const kgFlagValues = Object.values(KGFeatureFlag);
          if (kgFlagValues.includes(flagName as KGFeatureFlag)) {
            await FeatureFlag.setKGFlag(flagName as KGFeatureFlag, enabled, 'workflow-benchmark');
          } else {
            await FeatureFlag.upsert({
              name: flagName,
              enabled,
              updatedBy: 'workflow-benchmark',
            });
          }
        } catch (e) {
          logger.warn({ error: e, flagName }, 'Failed to set feature flag');
        }
      }
      await FeatureFlag.refreshCache();
    } catch (error) {
      logger.warn({ error }, 'Failed to update feature flag cache');
    }

    // Return restore function
    return async () => {
      // Restore environment variables
      for (const [flagName, value] of Object.entries(originalFlags)) {
        if (value === undefined) {
          delete process.env[flagName];
        } else {
          process.env[flagName] = value;
        }
      }

      // Restore database flags
      try {
        await FeatureFlag.initializeService();
        for (const [flagName, enabled] of Object.entries(featureFlags)) {
          try {
            const kgFlagValues = Object.values(KGFeatureFlag);
            if (kgFlagValues.includes(flagName as KGFeatureFlag)) {
              const originalValue = originalFlags[flagName];
              if (originalValue !== undefined) {
                await FeatureFlag.setKGFlag(
                  flagName as KGFeatureFlag,
                  originalValue === 'true',
                  'workflow-benchmark-restore'
                );
              }
            } else {
              const originalValue = originalFlags[flagName];
              if (originalValue !== undefined) {
                await FeatureFlag.upsert({
                  name: flagName,
                  enabled: originalValue === 'true',
                  updatedBy: 'workflow-benchmark-restore',
                });
              }
            }
          } catch (e) {
            logger.warn({ error: e, flagName }, 'Failed to restore feature flag');
          }
        }
        await FeatureFlag.refreshCache();
      } catch (error) {
        logger.warn({ error }, 'Failed to refresh feature flag cache after restore');
      }
    };
  }

  /**
   * Execute workflow with benchmark config
   */
  private async executeWorkflowWithConfig(
    workflow: Workflow,
    config: BenchmarkConfig,
    query: string,
    timeoutMs: number = 30 * 60 * 1000 // 30 minutes default
  ): Promise<WorkflowBenchmarkResult> {
    const startTime = Date.now();
    
    // Convert settings to feature flags
    const featureFlags = this.settingsToFeatureFlags(config.settings);
    
    // Apply feature flags
    const restoreFeatureFlags = await this.applyFeatureFlags(featureFlags);
    
    try {
      // Prepare workflow parameters
      const workflowParams = {
        query,
        onderwerp: query,
        thema: '',
        overheidslaag: '',
        isBenchmark: true,
      };

      // Execute workflow
      const runId = await this.workflowEngine.startWorkflow(workflow, workflowParams);
      
      if (!runId) {
        throw new Error(`Failed to start workflow ${workflow.id} - no run ID returned`);
      }

      // Wait for completion (polling with timeout)
      let workflowRun = await this.runManager.getRun(runId);
      let attempts = 0;
      const maxAttempts = 900; // 30 minutes max (900 * 2 seconds = 1800 seconds)
      const pollInterval = 2000; // Poll every 2 seconds
      const startPollTime = Date.now();
      
      while (workflowRun && workflowRun.status === 'running' && attempts < maxAttempts) {
        // Exponential backoff for polling (starts at 2s, max 10s)
        const currentPollInterval = Math.min(
          pollInterval * Math.pow(1.1, Math.floor(attempts / 10)),
          10000
        );
        await new Promise(resolve => setTimeout(resolve, currentPollInterval));
        workflowRun = await this.runManager.getRun(runId);
        attempts++;
        
        // Check for timeout
        if (Date.now() - startPollTime > timeoutMs) {
          logger.warn(`Workflow ${workflow.id} timed out after ${timeoutMs}ms`);
          try {
            await this.runManager.updateStatus(runId, 'cancelled');
          } catch (cancelError) {
            logger.error({ error: cancelError }, `Failed to cancel workflow run ${runId}`);
          }
          break;
        }
      }
      
      // Check if workflow timed out or was cancelled
      if (!workflowRun) {
        throw new Error(`Workflow ${workflow.id} run not found: ${runId}`);
      }
      
      if (workflowRun.status === 'running') {
        throw new Error(`Workflow ${workflow.id} timed out after ${timeoutMs}ms`);
      }
      
      if (workflowRun.status === 'cancelled') {
        throw new Error(`Workflow ${workflow.id} was cancelled`);
      }

      const executionTimeMs = Date.now() - startTime;

      // Extract documents from workflow output
      let documents: Array<{
        url: string;
        title: string;
        score: number;
        rank: number;
      }> = [];

      if (workflowRun && workflowRun.status === 'completed') {
        try {
          if (workflowRun.result && workflowRun.result.documents && Array.isArray(workflowRun.result.documents)) {
            documents = (workflowRun.result.documents as unknown[]).map((doc: unknown, index: number) => {
              const d = doc as Record<string, unknown>;
              return {
                url: (d.url || d.link || '') as string,
                title: (d.titel || d.title || d.name || '') as string,
                score: (d.relevanceScore || d.score || 0) as number,
                rank: index + 1,
              };
            });
          }
        } catch (outputError) {
          logger.warn({ error: outputError }, 'Could not extract workflow output');
        }
      }

      const scores = documents.map((d) => d.score).filter((s) => s > 0);
      const averageScore = scores.length > 0 
        ? scores.reduce((a, b) => a + b, 0) / scores.length 
        : undefined;
      const topScore = scores.length > 0 ? Math.max(...scores) : undefined;

      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        configName: config.name,
        configDescription: config.description,
        runId,
        status: workflowRun.status === 'completed' ? 'completed' : 'failed',
        executionTimeMs,
        documentsFound: documents.length,
        documents,
        metrics: {
          averageScore,
          topScore,
          documentsWithScores: scores.length,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, workflowId: workflow.id, configName: config.name }, 'Error executing workflow');
      
      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        configName: config.name,
        configDescription: config.description,
        runId: '',
        status: 'failed',
        executionTimeMs,
        documentsFound: 0,
        documents: [],
        metrics: {
          documentsWithScores: 0,
        },
        error: errorMessage,
      };
    } finally {
      // Always restore feature flags
      await restoreFeatureFlags();
    }
  }

  /**
   * Compare two workflow benchmark results
   */
  private compareResults(
    resultA: WorkflowBenchmarkResult,
    resultB: WorkflowBenchmarkResult
  ): ComparisonMetrics {
    const executionTimeDiff = resultB.executionTimeMs - resultA.executionTimeMs;
    const executionTimeDiffPercent = resultA.executionTimeMs > 0
      ? (executionTimeDiff / resultA.executionTimeMs) * 100
      : 0;
    
    const documentsFoundDiff = resultB.documentsFound - resultA.documentsFound;
    
    const averageScoreDiff = resultA.metrics.averageScore !== undefined && resultB.metrics.averageScore !== undefined
      ? resultB.metrics.averageScore - resultA.metrics.averageScore
      : undefined;
    
    const topScoreDiff = resultA.metrics.topScore !== undefined && resultB.metrics.topScore !== undefined
      ? resultB.metrics.topScore - resultA.metrics.topScore
      : undefined;
    
    // Find common documents (by URL)
    const urlsA = new Set(resultA.documents.map(d => d.url));
    const urlsB = new Set(resultB.documents.map(d => d.url));
    const commonUrls = new Set([...urlsA].filter(url => urlsB.has(url)));
    const commonDocuments = commonUrls.size;
    const uniqueToA = urlsA.size - commonDocuments;
    const uniqueToB = urlsB.size - commonDocuments;
    
    return {
      executionTimeDiff,
      executionTimeDiffPercent,
      documentsFoundDiff,
      averageScoreDiff,
      topScoreDiff,
      commonDocuments,
      uniqueToA,
      uniqueToB,
    };
  }

  /**
   * Start a new comparison
   */
  async startComparison(params: StartComparisonParams): Promise<string> {
    // Validate inputs
    const configA = this.getBenchmarkConfigByName(params.configAName);
    if (!configA) {
      throw new Error(`Benchmark config not found: ${params.configAName}`);
    }

    const configB = this.getBenchmarkConfigByName(params.configBName);
    if (!configB) {
      throw new Error(`Benchmark config not found: ${params.configBName}`);
    }

    const workflowA = await getWorkflowById(params.workflowAId);
    if (!workflowA) {
      throw new Error(`Workflow not found: ${params.workflowAId}`);
    }

    const workflowB = await getWorkflowById(params.workflowBId);
    if (!workflowB) {
      throw new Error(`Workflow not found: ${params.workflowBId}`);
    }

    // Create comparison document
    const comparisonDoc: WorkflowBenchmarkComparisonDocument = {
      name: params.name,
      workflowAId: params.workflowAId,
      workflowBId: params.workflowBId,
      configAName: params.configAName,
      configBName: params.configBName,
      query: params.query,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await this.comparisonsCollection.insertOne(comparisonDoc);
    const comparisonId = result.insertedId.toString();

    // Start execution asynchronously (don't await)
    this.executeComparison(comparisonId, workflowA, workflowB, configA, configB, params.query)
      .catch(error => {
        logger.error({ error, comparisonId }, 'Error executing comparison');
      });

    return comparisonId;
  }

  /**
   * Execute comparison (internal method)
   */
  private async executeComparison(
    comparisonId: string,
    workflowA: Workflow,
    workflowB: Workflow,
    configA: BenchmarkConfig,
    configB: BenchmarkConfig,
    query: string
  ): Promise<void> {
    const id = new ObjectId(comparisonId);

    try {
      // Update status to running
      await this.comparisonsCollection.updateOne(
        { _id: id },
        {
          $set: {
            status: 'running',
            startedAt: new Date(),
          },
        }
      );

      // Execute workflow A
      logger.info({ comparisonId, workflowId: workflowA.id, configName: configA.name }, 'Executing workflow A');
      const resultA = await this.executeWorkflowWithConfig(workflowA, configA, query);

      // Execute workflow B
      logger.info({ comparisonId, workflowId: workflowB.id, configName: configB.name }, 'Executing workflow B');
      const resultB = await this.executeWorkflowWithConfig(workflowB, configB, query);

      // Compare results
      const comparison = this.compareResults(resultA, resultB);

      // Update with results
      await this.comparisonsCollection.updateOne(
        { _id: id },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            workflowARunId: resultA.runId,
            workflowBRunId: resultB.runId,
            results: {
              workflowA: resultA,
              workflowB: resultB,
              comparison,
            },
          },
        }
      );

      logger.info({ comparisonId }, 'Comparison completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, comparisonId }, 'Comparison failed');

      await this.comparisonsCollection.updateOne(
        { _id: id },
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
   * Get comparison status
   */
  async getComparisonStatus(id: string): Promise<WorkflowBenchmarkComparisonDocument | null> {
    const comparison = await this.comparisonsCollection.findOne({ _id: new ObjectId(id) });
    return comparison;
  }

  /**
   * Get comparison results
   */
  async getComparisonResults(id: string): Promise<WorkflowBenchmarkComparisonDocument | null> {
    const comparison = await this.comparisonsCollection.findOne({ _id: new ObjectId(id) });
    return comparison;
  }

  /**
   * List comparisons with optional filters
   */
  async listComparisons(filters?: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    workflowAId?: string;
    workflowBId?: string;
    limit?: number;
    skip?: number;
  }): Promise<WorkflowBenchmarkComparisonDocument[]> {
    const query: Record<string, unknown> = {};
    
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.workflowAId) {
      query.workflowAId = filters.workflowAId;
    }
    if (filters?.workflowBId) {
      query.workflowBId = filters.workflowBId;
    }

    const cursor = this.comparisonsCollection.find(query)
      .sort({ createdAt: -1 });

    if (filters?.skip) {
      cursor.skip(filters.skip);
    }
    if (filters?.limit) {
      cursor.limit(filters.limit);
    }

    return cursor.toArray();
  }
}

