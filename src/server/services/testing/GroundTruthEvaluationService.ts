import { ObjectId } from 'mongodb';
import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { GroundTruthService } from './GroundTruthService.js';
import type { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import type { RunManager } from '../workflow/RunManager.js';
import type { WorkflowRuntimeSettings } from './WorkflowComparisonService.js';
import { DocumentIdentifierMatchingService } from '../identity/DocumentIdentifierMatchingService.js';
import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';

const GROUND_TRUTH_EVALUATIONS_COLLECTION = 'ground_truth_evaluations';

export interface GroundTruthEvaluationMetrics {
  precision_at_k: {
    k1: number;
    k5: number;
    k10: number;
  };
  recall_at_k: {
    k1: number;
    k5: number;
    k10: number;
  };
  f1_score: number;
  ndcg: {
    ndcg_at_k: {
      k1: number;
      k5: number;
      k10: number;
    };
    mean_ndcg: number;
  };
  map: number;
}

export interface GroundTruthEvaluation {
  _id?: ObjectId;
  evaluationId: string;
  workflowId: string;
  workflowName: string;
  groundTruthId: string;
  groundTruthName: string;
  query: string;
  metrics: GroundTruthEvaluationMetrics;
  relevant_documents_found: number;
  total_relevant_documents: number;
  retrieved_documents: number;
  execution_time_ms: number;
  created_at: Date;
}

export interface WorkflowResultDocument {
  url: string;
  documentId?: string; // Optional: MongoDB ObjectId of canonical document (for ID-based matching)
  score?: number;
  rank?: number;
  title?: string;
  [key: string]: unknown;
}

/**
 * Ground Truth Evaluation Service
 * 
 * Service for evaluating workflow results against ground truth datasets.
 * Calculates standard information retrieval metrics including:
 * - Precision@K (K=1, 5, 10)
 * - Recall@K (K=1, 5, 10)
 * - F1 Score
 * - NDCG@K (Normalized Discounted Cumulative Gain)
 * - MAP (Mean Average Precision)
 * 
 * @example
 * ```typescript
 * const service = new GroundTruthEvaluationService(workflowEngine, runManager);
 * const evaluation = await service.compareWorkflowAgainstGroundTruth(
 *   'workflow-id',
 *   'ground-truth-dataset-id',
 *   'test query',
 *   { featureFlags: { 'FLAG_NAME': true } }
 * );
 * console.log(`Precision@10: ${evaluation.metrics.precision_at_k.k10}`);
 * ```
 */
export class GroundTruthEvaluationService {
  private workflowEngine: WorkflowEngine;
  private runManager: RunManager;
  private identifierMatchingService: DocumentIdentifierMatchingService | null = null;
  private cacheCleanupInterval: NodeJS.Timeout | null = null;
  
  // Cache for ground truth datasets to avoid repeated database queries
  private groundTruthCache = new Map<string, { dataset: Awaited<ReturnType<GroundTruthService['getDataset']>>; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Get or create identifier matching service
   */
  private getIdentifierMatchingService(): DocumentIdentifierMatchingService {
    if (!this.identifierMatchingService) {
      const documentService = getCanonicalDocumentService();
      this.identifierMatchingService = new DocumentIdentifierMatchingService(documentService);
      
      // Start periodic cache cleanup (10 minute intervals)
      this.cacheCleanupInterval = this.identifierMatchingService.startCacheCleanup();
    }
    return this.identifierMatchingService;
  }
  
  /**
   * Cleanup resources (stop cache cleanup interval)
   * Should be called when service is being shut down
   */
  cleanup(): void {
    if (this.cacheCleanupInterval && this.identifierMatchingService) {
      this.identifierMatchingService.stopCacheCleanup(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  /**
   * Creates a new GroundTruthEvaluationService instance
   * 
   * @param workflowEngine - WorkflowEngine instance for executing workflows
   * @param runManager - RunManager instance for managing workflow runs
   */
  constructor(workflowEngine: WorkflowEngine, runManager: RunManager) {
    this.workflowEngine = workflowEngine;
    this.runManager = runManager;
  }

  /**
   * Compare workflow results against ground truth dataset
   * 
   * Executes a workflow with the given query and compares the results against
   * a ground truth dataset. Calculates comprehensive evaluation metrics.
   * 
   * @param workflowId - ID of the workflow to evaluate
   * @param groundTruthId - ID of the ground truth dataset
   * @param query - Query string to execute the workflow with
   * @param runtimeSettings - Optional runtime settings (feature flags, timeout, etc.)
   * @returns Promise resolving to evaluation results with metrics
   * @throws {Error} If workflow or ground truth dataset not found
   * @throws {Error} If no ground truth found for the query
   * @throws {Error} If workflow execution fails
   * 
   * @example
   * ```typescript
   * const evaluation = await service.compareWorkflowAgainstGroundTruth(
   *   'beleidsscan-wizard-step1-search-dso',
   *   '507f1f77bcf86cd799439040',
   *   'klimaatadaptatie',
   *   {
   *     featureFlags: { HYBRID_RETRIEVAL_ENABLED: true },
   *     timeout: 60000
   *   }
   * );
   * ```
   */
  async compareWorkflowAgainstGroundTruth(
    workflowId: string,
    groundTruthId: string,
    query: string,
    runtimeSettings?: WorkflowRuntimeSettings
  ): Promise<GroundTruthEvaluation> {
    const startTime = Date.now();
    const MAX_QUERY_LENGTH = 1000; // Maximum query length to prevent DoS
    const MIN_QUERY_LENGTH = 1; // Minimum query length

    // Input validation with length checks
    if (!workflowId || typeof workflowId !== 'string' || workflowId.trim().length === 0) {
      throw new Error('Invalid workflowId: must be a non-empty string');
    }
    if (workflowId.length > 200) {
      throw new Error(`Invalid workflowId: exceeds maximum length of 200 characters (got ${workflowId.length})`);
    }
    
    if (!groundTruthId || typeof groundTruthId !== 'string' || groundTruthId.trim().length === 0) {
      const { BadRequestError } = await import('../../types/errors.js');
      throw new BadRequestError('Invalid groundTruthId: must be a non-empty string', {
        provided: groundTruthId,
        providedType: typeof groundTruthId,
        parameter: 'groundTruthId',
        suggestion: 'Provide a valid MongoDB ObjectId string (24 hexadecimal characters)'
      });
    }
    if (!ObjectId.isValid(groundTruthId)) {
      const { BadRequestError } = await import('../../types/errors.js');
      throw new BadRequestError(`Invalid groundTruthId: must be a valid MongoDB ObjectId (got: ${groundTruthId})`, {
        provided: groundTruthId,
        providedType: typeof groundTruthId,
        parameter: 'groundTruthId',
        example: '507f1f77bcf86cd799439011',
        suggestion: 'MongoDB ObjectIds must be exactly 24 hexadecimal characters',
        help: 'If you need to create a dataset, use POST /api/benchmark/ground-truth/datasets'
      });
    }
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Invalid query: must be a non-empty string');
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      throw new Error(`Invalid query: must be at least ${MIN_QUERY_LENGTH} character(s) long`);
    }
    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
      throw new Error(`Invalid query: exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${trimmedQuery.length})`);
    }
    
    // Sanitize query: remove control characters and normalize whitespace
    const sanitizedQuery = trimmedQuery
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (sanitizedQuery.length === 0) {
      throw new Error('Invalid query: query contains only invalid characters');
    }

    logger.info({ 
      workflowId, 
      groundTruthId, 
      query: sanitizedQuery,
      queryLength: sanitizedQuery.length 
    }, 'Starting ground truth evaluation');

    // Get ground truth dataset
    const groundTruthService = new (await import('./GroundTruthService.js')).GroundTruthService();
    const dataset = await groundTruthService.getDataset(groundTruthId);
    if (!dataset) {
      logger.error({ groundTruthId }, 'Ground truth dataset not found');
      throw new Error(`Ground truth dataset ${groundTruthId} not found`);
    }

           // Get ground truth for this query (use sanitized query)
           const groundTruth = await this.getGroundTruthForQuery(groundTruthId, sanitizedQuery);
    if (!groundTruth || groundTruth.length === 0) {
      logger.error({ groundTruthId, query }, 'No ground truth found for query');
      throw new Error(`No ground truth found for query: "${query}" in dataset "${dataset.name}"`);
    }

           logger.info({ 
             workflowId, 
             groundTruthId, 
             query: sanitizedQuery, 
             groundTruthCount: groundTruth.length 
           }, 'Ground truth loaded, executing workflow');

           // Execute workflow (use sanitized query)
           let workflowResults: unknown;
           try {
             workflowResults = await this.executeWorkflow(workflowId, sanitizedQuery, runtimeSettings);
    } catch (error) {
      logger.error({ workflowId, query, error }, 'Workflow execution failed during ground truth evaluation');
      throw new Error(`Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Extract documents from workflow results (now async to support identifier matching)
    const retrievedDocuments = await this.extractDocuments(workflowResults);
           logger.info({ 
             workflowId, 
             query: sanitizedQuery, 
             retrievedCount: retrievedDocuments.length 
           }, 'Documents extracted from workflow results');

    if (retrievedDocuments.length === 0) {
      logger.warn({ workflowId, query }, 'No documents retrieved from workflow');
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(retrievedDocuments, groundTruth);

    // Get workflow name
    const workflowName = await this.getWorkflowName(workflowId);

    const executionTime = Date.now() - startTime;

    // Calculate actual relevant documents found (not just based on recall)
    // Use documentId matching first, then fall back to URL matching
    const groundTruthById = new Set(
      groundTruth
        .filter((gt: { url: string; relevance: number; documentId?: string; source?: string }): gt is { url: string; relevance: number; documentId: string; source?: string } => !!gt.documentId)
        .map((gt) => gt.documentId)
    );
    const groundTruthUrls = new Set(
      groundTruth.map((gt: { url: string; relevance: number }) => this.normalizeUrl(gt.url))
    );
    
    const relevantFound = retrievedDocuments.filter(doc => {
      // Try documentId match first (more reliable)
      if (doc.documentId && groundTruthById.has(doc.documentId)) {
        return true;
      }
      // Fall back to URL match
      return groundTruthUrls.has(this.normalizeUrl(doc.url));
    }).length;

    // Create evaluation result
    const evaluation: GroundTruthEvaluation = {
      evaluationId: new ObjectId().toString(),
      workflowId,
      workflowName,
      groundTruthId,
      groundTruthName: dataset.name,
      query,
      metrics,
      relevant_documents_found: relevantFound,
      total_relevant_documents: groundTruth.length,
      retrieved_documents: retrievedDocuments.length,
      execution_time_ms: executionTime,
      created_at: new Date(),
    };

    logger.info({ 
      evaluationId: evaluation.evaluationId,
      workflowId,
      query,
      precisionAt10: metrics.precision_at_k.k10,
      recallAt10: metrics.recall_at_k.k10,
      f1Score: metrics.f1_score,
      relevantFound,
      totalRelevant: groundTruth.length,
      executionTimeMs: executionTime
    }, 'Ground truth evaluation completed');

    // Store evaluation (with error handling to ensure we return the result even if storage fails)
    try {
      await this.storeEvaluation(evaluation);
    } catch (storageError) {
      logger.error({ 
        evaluationId: evaluation.evaluationId, 
        error: storageError 
      }, 'Failed to store evaluation, but returning result anyway');
      // Continue - we still want to return the evaluation result even if storage fails
    }

    return evaluation;
  }

  /**
   * Execute workflow and get results
   */
  private async executeWorkflow(
    workflowId: string,
    query: string,
    runtimeSettings?: WorkflowRuntimeSettings
  ): Promise<unknown> {
    // Import workflow lookup
    const { getWorkflowById } = await import('../../utils/workflowLookup.js');
    
    const workflow = await getWorkflowById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Store original feature flags to restore later
    const originalFeatureFlags: Record<string, boolean | null | undefined> = {};
    let featureFlagsRestored = false;

    try {
      // Apply feature flags if provided
      if (runtimeSettings?.featureFlags) {
        const { FeatureFlag, KGFeatureFlag } = await import('../../models/FeatureFlag.js');
        await FeatureFlag.initializeService();
        
        for (const [flagName, enabled] of Object.entries(runtimeSettings.featureFlags)) {
          // Store original value
          const currentFlag = await FeatureFlag.findByName(flagName);
          if (currentFlag) {
            originalFeatureFlags[flagName] = currentFlag.enabled;
          } else {
            originalFeatureFlags[flagName] = null;
          }
          
          // Set new value
          const kgFlagValues = Object.values(KGFeatureFlag) as string[];
          if (kgFlagValues.includes(flagName)) {
            await FeatureFlag.setKGFlag(flagName as typeof KGFeatureFlag[keyof typeof KGFeatureFlag], enabled, 'ground-truth-evaluation');
          } else {
            await FeatureFlag.upsert({
              name: flagName,
              enabled,
              updatedBy: 'ground-truth-evaluation',
            });
          }
        }
        
        await FeatureFlag.refreshCache();
      }

      // Prepare workflow parameters
      const workflowParams = {
        query,
        onderwerp: query,
        thema: '',
        overheidslaag: '',
        isBenchmark: true,
        isGroundTruthEvaluation: true,
        ...runtimeSettings?.params,
      };

      logger.info({ workflowId, query }, 'Executing workflow for ground truth evaluation');

      // Execute workflow
      const runId = await this.workflowEngine.startWorkflow(workflow, workflowParams);
      if (!runId) {
        throw new Error(`Failed to start workflow ${workflowId}`);
      }

      // Wait for completion (with optional cancellation support)
      const timeout = runtimeSettings?.timeout || 30 * 60 * 1000; // Default 30 minutes
      const abortController = new AbortController();
      
      // Set up timeout to abort if exceeded
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeout);
      
      try {
        const run = await this.waitForWorkflowCompletion(runId, timeout, abortController.signal);
        clearTimeout(timeoutId);
        
        if (run.status !== 'completed') {
          throw new Error(`Workflow execution ${run.status}: ${run.error || 'Unknown error'}`);
        }
        
        logger.info({ workflowId, query, runId, executionTime: Date.now() }, 'Workflow execution completed for ground truth evaluation');
        return run.result;
      } catch (error) {
        clearTimeout(timeoutId);
        if (abortController.signal.aborted && error instanceof Error && error.message.includes('cancelled')) {
          logger.warn({ workflowId, query, runId }, 'Workflow execution cancelled or timed out');
          throw new Error(`Workflow execution cancelled or timed out: ${error.message}`);
        }
        throw error;
      }
    } finally {
      // Restore original feature flags
      if (Object.keys(originalFeatureFlags).length > 0 && !featureFlagsRestored) {
        try {
          const { FeatureFlag } = await import('../../models/FeatureFlag.js');
          for (const [key, value] of Object.entries(originalFeatureFlags)) {
            // Skip if value is null or undefined (flag didn't exist before)
            if (value === null || value === undefined) {
              continue;
            }
            // Try setKGFlag first, fallback to upsert
            try {
              const { KGFeatureFlag: KGFeatureFlagRestore } = await import('../../models/FeatureFlag.js');
              const kgFlagValues = Object.values(KGFeatureFlagRestore) as string[];
              if (kgFlagValues.includes(key)) {
                await FeatureFlag.setKGFlag(key as typeof KGFeatureFlagRestore[keyof typeof KGFeatureFlagRestore], value, 'ground-truth-evaluation');
              } else {
                await FeatureFlag.upsert({
                  name: key,
                  enabled: value,
                  updatedBy: 'ground-truth-evaluation',
                });
              }
            } catch {
              await FeatureFlag.upsert({
                name: key,
                enabled: value,
                updatedBy: 'ground-truth-evaluation',
              });
            }
          }
          featureFlagsRestored = true;
        } catch (error) {
          logger.warn({ error }, 'Failed to restore feature flags after ground truth evaluation');
        }
      }
    }
  }

  /**
   * Wait for workflow completion with exponential backoff
   * 
   * Polls the workflow run status with exponential backoff to reduce database load.
   * Handles timeouts, cancellations, and failures gracefully.
   * Supports cancellation via AbortSignal for resource cleanup.
   * 
   * @param runId - Workflow run ID to monitor
   * @param timeout - Maximum time to wait in milliseconds
   * @param abortSignal - Optional AbortSignal for cancellation
   * @returns Promise resolving to run status and result
   * @throws {Error} If run not found, timeout exceeded, or operation aborted
   */
  private async waitForWorkflowCompletion(
    runId: string, 
    timeout: number,
    abortSignal?: AbortSignal
  ): Promise<{ status: string; result?: unknown; error?: string }> {
    const startTime = Date.now();
    const basePollInterval = 2000; // Start with 2 seconds
    const maxPollInterval = 10000; // Max 10 seconds between polls
    let lastStatus: string | null = null;
    let attempts = 0;
    const timeoutId: NodeJS.Timeout | null = null;
    let pollTimeoutId: NodeJS.Timeout | null = null;

    // Set up abort signal listener for cleanup
    const abortHandler = () => {
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

    try {
      while (Date.now() - startTime < timeout) {
        // Check for cancellation
        if (abortSignal?.aborted) {
          logger.warn({ runId, elapsedMs: Date.now() - startTime }, 'Workflow monitoring cancelled');
          throw new Error(`Workflow monitoring cancelled for run ${runId}`);
        }

        const run = await this.runManager.getRun(runId);
        if (!run) {
          throw new Error(`Run ${runId} not found`);
        }

        // Log status changes
        if (run.status !== lastStatus) {
          logger.debug({ 
            runId, 
            status: run.status, 
            previousStatus: lastStatus,
            elapsedMs: Date.now() - startTime 
          }, 'Workflow status changed');
          lastStatus = run.status;
        }

        // Check for completion
        if (run.status === 'completed') {
          const elapsedMs = Date.now() - startTime;
          logger.info({ runId, elapsedMs }, 'Workflow completed successfully');
          return { status: run.status, result: run.result };
        }

        // Check for failure or cancellation
        if (run.status === 'failed' || run.status === 'cancelled') {
          const elapsedMs = Date.now() - startTime;
          logger.warn({ 
            runId, 
            status: run.status, 
            error: run.error,
            elapsedMs 
          }, 'Workflow failed or was cancelled');
          return { 
            status: run.status, 
            result: run.result,
            error: run.error || `Workflow ${run.status}`
          };
        }

        // Exponential backoff: increase poll interval gradually (max 10s)
        const currentPollInterval = Math.min(
          basePollInterval * Math.pow(1.1, Math.floor(attempts / 10)),
          maxPollInterval
        );
        
        // Log progress every 30 seconds
        const elapsedMs = Date.now() - startTime;
        if (attempts % 15 === 0 && elapsedMs > 30000) {
          logger.debug({ 
            runId, 
            status: run.status, 
            elapsedMs,
            remainingMs: timeout - elapsedMs,
            pollInterval: currentPollInterval
          }, 'Waiting for workflow completion');
        }

        // Use Promise with timeout cleanup and abort handling
        await new Promise<void>((resolve, reject) => {
          let abortCheckInterval: NodeJS.Timeout | null = null;
          
          pollTimeoutId = setTimeout(() => {
            if (abortCheckInterval) {
              clearInterval(abortCheckInterval);
            }
            pollTimeoutId = null;
            resolve();
          }, currentPollInterval);

          // Handle abort during wait
          if (abortSignal) {
            abortCheckInterval = setInterval(() => {
              if (abortSignal.aborted) {
                if (pollTimeoutId) {
                  clearTimeout(pollTimeoutId);
                  pollTimeoutId = null;
                }
                if (abortCheckInterval) {
                  clearInterval(abortCheckInterval);
                }
                reject(new Error(`Workflow monitoring cancelled for run ${runId}`));
              }
            }, 100);
          }
        }).catch((error) => {
          // Clean up poll timeout if abort occurred
          if (pollTimeoutId) {
            clearTimeout(pollTimeoutId);
            pollTimeoutId = null;
          }
          throw error;
        });
        
        attempts++;
      }

      // Timeout exceeded
      const elapsedMs = Date.now() - startTime;
      logger.error({ 
        runId, 
        timeout, 
        elapsedMs,
        attempts 
      }, 'Workflow execution timeout');
      throw new Error(`Workflow execution timeout after ${timeout}ms (${Math.round(timeout / 1000)}s)`);
    } finally {
      // Cleanup: remove abort listener and clear any pending timeouts
      if (abortSignal) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
    }
  }

  /**
   * Extract documents from workflow results
   * Handles various result structures similar to WorkflowComparisonService
   * 
   * Supports multiple document formats:
   * - scoredDocuments: Array of scored documents
   * - documentsByCategory: Documents organized by category
   * - rawDocumentsBySource: Documents organized by source
   * - documents: Array of documents (from WorkflowOutput)
   * - results: Array of results
   * 
   * Now uses DocumentIdentifierMatchingService to find canonical document IDs
   * for better matching with ground truth datasets.
   * 
   * @param workflowResult - Workflow execution result
   * @returns Array of extracted documents with normalized URLs and documentIds
   */
  private async extractDocuments(workflowResult: unknown): Promise<WorkflowResultDocument[]> {
    const documents: WorkflowResultDocument[] = [];

    if (!workflowResult || typeof workflowResult !== 'object') {
      logger.warn('Invalid workflow result: not an object');
      return documents;
    }

    const result = workflowResult as Record<string, unknown>;
    
    // Helper function to extract document from various formats
    const extractDocumentFromObject = (docObj: Record<string, unknown>): WorkflowResultDocument | null => {
      const url = (docObj.url || docObj.link) as string | undefined;
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return null;
      }

      // Extract documentId from various possible field names
      let documentId: string | undefined;
      if (docObj.documentId && typeof docObj.documentId === 'string') {
        documentId = docObj.documentId;
      } else if (docObj._id) {
        // Handle MongoDB ObjectId objects
        if (typeof docObj._id === 'string') {
          documentId = docObj._id;
        } else if (docObj._id && typeof docObj._id === 'object' && 'toString' in docObj._id) {
          documentId = (docObj._id as { toString(): string }).toString();
        }
      } else if (docObj.id && typeof docObj.id === 'string') {
        documentId = docObj.id;
      } else if (docObj.canonicalDocumentId && typeof docObj.canonicalDocumentId === 'string') {
        documentId = docObj.canonicalDocumentId;
      }

      return {
        url: url.trim(),
        documentId, // Include documentId if available
        score: typeof docObj.score === 'number' && isFinite(docObj.score) ? docObj.score : 
               typeof docObj.authorityScore === 'number' && isFinite(docObj.authorityScore) ? docObj.authorityScore :
               typeof docObj.relevanceScore === 'number' && isFinite(docObj.relevanceScore) ? docObj.relevanceScore : undefined,
        rank: typeof docObj.rank === 'number' && isFinite(docObj.rank) && docObj.rank >= 0 ? docObj.rank : undefined,
        title: typeof docObj.title === 'string' ? docObj.title : 
               typeof docObj.titel === 'string' ? docObj.titel : 
               typeof docObj.name === 'string' ? docObj.name : undefined,
      };
    };

    // Check for scoredDocuments (most common structure)
    if (result.scoredDocuments && Array.isArray(result.scoredDocuments)) {
      for (const doc of result.scoredDocuments) {
        if (doc && typeof doc === 'object') {
          const extracted = extractDocumentFromObject(doc as Record<string, unknown>);
          if (extracted) {
            documents.push(extracted);
          }
        }
      }
    }

    // Check for documentsByCategory
    if (result.documentsByCategory && typeof result.documentsByCategory === 'object') {
      for (const category of Object.values(result.documentsByCategory)) {
        if (Array.isArray(category)) {
          for (const doc of category) {
            if (doc && typeof doc === 'object') {
              const extracted = extractDocumentFromObject(doc as Record<string, unknown>);
              if (extracted) {
                documents.push(extracted);
              }
            }
          }
        }
      }
    }

    // Check for rawDocumentsBySource
    if (result.rawDocumentsBySource && typeof result.rawDocumentsBySource === 'object') {
      for (const source of Object.values(result.rawDocumentsBySource)) {
        if (Array.isArray(source)) {
          for (const doc of source) {
            if (doc && typeof doc === 'object') {
              const extracted = extractDocumentFromObject(doc as Record<string, unknown>);
              if (extracted) {
                documents.push(extracted);
              }
            }
          }
        }
      }
    }

    // Check for documents array (from WorkflowOutput structure)
    if (Array.isArray(result.documents)) {
      for (const doc of result.documents) {
        if (doc && typeof doc === 'object') {
          const extracted = extractDocumentFromObject(doc as Record<string, unknown>);
          if (extracted) {
            documents.push(extracted);
          }
        }
      }
    }

    // Check for results array
    if (Array.isArray(result.results)) {
      for (const doc of result.results) {
        if (doc && typeof doc === 'object') {
          const extracted = extractDocumentFromObject(doc as Record<string, unknown>);
          if (extracted) {
            documents.push(extracted);
          }
        }
      }
    }

    // Deduplicate by URL (keep first occurrence with highest score/rank)
    const urlMap = new Map<string, WorkflowResultDocument>();
    for (const doc of documents) {
      const normalizedUrl = this.normalizeUrl(doc.url);
      const existing = urlMap.get(normalizedUrl);
      
      if (!existing) {
        urlMap.set(normalizedUrl, doc);
      } else {
        // Keep the document with higher score, or if scores are equal, keep the one with lower rank
        if (doc.score !== undefined && existing.score !== undefined) {
          if (doc.score > existing.score) {
            urlMap.set(normalizedUrl, doc);
          }
        } else if (doc.rank !== undefined && existing.rank !== undefined) {
          if (doc.rank < existing.rank) {
            urlMap.set(normalizedUrl, doc);
          }
        } else if (doc.score !== undefined && existing.score === undefined) {
          urlMap.set(normalizedUrl, doc);
        }
      }
    }

    const uniqueDocuments = Array.from(urlMap.values());

    // Sort by score (descending) or rank (ascending)
    uniqueDocuments.sort((a, b) => {
      if (a.score !== undefined && b.score !== undefined) {
        return b.score - a.score;
      }
      if (a.rank !== undefined && b.rank !== undefined) {
        return a.rank - b.rank;
      }
      if (a.score !== undefined && b.score === undefined) {
        return -1; // a comes first
      }
      if (a.score === undefined && b.score !== undefined) {
        return 1; // b comes first
      }
      return 0;
    });

    // Try to find canonical document IDs for each document using identifier matching
    // This enables better matching with ground truth datasets
    const matchingService = this.getIdentifierMatchingService();
    const documentsWithIds = await Promise.all(
      uniqueDocuments.map(async (doc) => {
        // If documentId is already present, keep it
        if (doc.documentId) {
          return doc;
        }
        
        // Try to find canonical document by URL
        if (doc.url) {
          try {
            const canonicalDoc = await matchingService.findDocument(doc.url);
            if (canonicalDoc) {
              return {
                ...doc,
                documentId: canonicalDoc._id,
              };
            }
          } catch (error) {
            logger.warn({ error, url: doc.url }, 'Error finding canonical document for URL');
          }
        }
        
        return doc;
      })
    );

    logger.debug({ 
      totalExtracted: documents.length, 
      uniqueCount: uniqueDocuments.length,
      withDocumentId: documentsWithIds.filter(d => d.documentId).length
    }, 'Documents extracted, deduplicated, and matched with canonical documents');

    return documentsWithIds;
  }

  /**
   * Calculate evaluation metrics
   */
  private calculateMetrics(
    retrieved: WorkflowResultDocument[],
    groundTruth: Array<{ url: string; relevance: number; documentId?: string; source?: string }>
  ): GroundTruthEvaluationMetrics {
    // Validate inputs
    if (!retrieved || !Array.isArray(retrieved)) {
      logger.warn('Invalid retrieved documents array, using empty array');
      retrieved = [];
    }

    if (!groundTruth || !Array.isArray(groundTruth) || groundTruth.length === 0) {
      logger.warn('Invalid or empty ground truth array');
      // Return zero metrics if no ground truth
      return {
        precision_at_k: { k1: 0, k5: 0, k10: 0 },
        recall_at_k: { k1: 0, k5: 0, k10: 0 },
        f1_score: 0,
        ndcg: { ndcg_at_k: { k1: 0, k5: 0, k10: 0 }, mean_ndcg: 0 },
        map: 0,
      };
    }

    // Create ground truth maps for both documentId (preferred) and URL (fallback)
    // documentId matching is more reliable than URL matching
    const groundTruthById = new Map<string, number>();
    const groundTruthByUrl = new Map<string, number>();
    
    for (const gt of groundTruth) {
      if (!gt) {
        logger.warn({ gt }, 'Skipping invalid ground truth entry');
        continue;
      }
      
      const relevance = typeof gt.relevance === 'number' && isFinite(gt.relevance) 
        ? gt.relevance 
        : 0; // Default to 0 if invalid
      
      // Prefer documentId matching (more reliable)
      if (gt.documentId && typeof gt.documentId === 'string' && gt.documentId.trim().length > 0) {
        groundTruthById.set(gt.documentId.trim(), relevance);
      }
      
      // Also index by URL for fallback matching
      if (gt.url && typeof gt.url === 'string' && gt.url.trim().length > 0) {
        groundTruthByUrl.set(this.normalizeUrl(gt.url), relevance);
      }
    }
    
    // Create a unified map that will be used for matching
    // We'll match by documentId first, then fall back to URL
    const groundTruthMap = new Map<string, number>();
    
    // Helper to get relevance for a document (tries documentId first, then URL)
    const getRelevance = (doc: WorkflowResultDocument): number | undefined => {
      // Try documentId match first (more reliable)
      if (doc.documentId && groundTruthById.has(doc.documentId)) {
        return groundTruthById.get(doc.documentId);
      }
      // Fall back to URL match
      if (doc.url && groundTruthByUrl.has(this.normalizeUrl(doc.url))) {
        return groundTruthByUrl.get(this.normalizeUrl(doc.url));
      }
      return undefined;
    };
    
    // Build map of matched documents for metric calculations
    // Use documentId as key if available, otherwise use normalized URL
    for (const doc of retrieved) {
      const relevance = getRelevance(doc);
      if (relevance !== undefined) {
        const key = doc.documentId || this.normalizeUrl(doc.url);
        groundTruthMap.set(key, relevance);
      }
    }

    if (groundTruthMap.size === 0) {
      logger.warn('No valid ground truth entries after filtering');
      return {
        precision_at_k: { k1: 0, k5: 0, k10: 0 },
        recall_at_k: { k1: 0, k5: 0, k10: 0 },
        f1_score: 0,
        ndcg: { ndcg_at_k: { k1: 0, k5: 0, k10: 0 }, mean_ndcg: 0 },
        map: 0,
      };
    }

    // Calculate precision and recall at K
    const precisionAtK = {
      k1: this.calculatePrecisionAtK(retrieved, groundTruthMap, 1),
      k5: this.calculatePrecisionAtK(retrieved, groundTruthMap, 5),
      k10: this.calculatePrecisionAtK(retrieved, groundTruthMap, 10),
    };

    const recallAtK = {
      k1: this.calculateRecallAtK(retrieved, groundTruthMap, 1),
      k5: this.calculateRecallAtK(retrieved, groundTruthMap, 5),
      k10: this.calculateRecallAtK(retrieved, groundTruthMap, 10),
    };

    // Calculate F1 score (using K=10)
    const f1Score = this.calculateF1Score(precisionAtK.k10, recallAtK.k10);

    // Calculate NDCG
    const ndcg = {
      ndcg_at_k: {
        k1: this.calculateNDCG(retrieved, groundTruthMap, 1),
        k5: this.calculateNDCG(retrieved, groundTruthMap, 5),
        k10: this.calculateNDCG(retrieved, groundTruthMap, 10),
      },
      mean_ndcg: 0, // Will be calculated below
    };
    ndcg.mean_ndcg = (ndcg.ndcg_at_k.k1 + ndcg.ndcg_at_k.k5 + ndcg.ndcg_at_k.k10) / 3;

    // Calculate MAP
    const map = this.calculateMAP(retrieved, groundTruthMap);

    return {
      precision_at_k: precisionAtK,
      recall_at_k: recallAtK,
      f1_score: f1Score,
      ndcg,
      map,
    };
  }

  /**
   * Calculate Precision@K
   * Precision@K = (Relevant documents in top K) / K
   */
  private calculatePrecisionAtK(
    retrieved: WorkflowResultDocument[],
    groundTruthMap: Map<string, number>,
    k: number
  ): number {
    // Validate K
    if (k <= 0 || !Number.isInteger(k)) {
      logger.warn({ k }, 'Invalid K value for Precision@K, defaulting to 0');
      return 0;
    }

    if (!retrieved || retrieved.length === 0) {
      return 0;
    }

    const topK = retrieved.slice(0, k);
    if (topK.length === 0) {
      return 0;
    }

    let relevantCount = 0;
    for (const doc of topK) {
      if (!doc || !doc.url) {
        continue; // Skip invalid documents
      }
      // Use documentId as key if available, otherwise normalized URL
      const key = doc.documentId || this.normalizeUrl(doc.url);
      if (groundTruthMap.has(key)) {
        relevantCount++;
      }
    }

    return relevantCount / topK.length;
  }

  /**
   * Calculate Recall@K
   * Recall@K = (Relevant documents in top K) / (Total relevant documents)
   */
  private calculateRecallAtK(
    retrieved: WorkflowResultDocument[],
    groundTruthMap: Map<string, number>,
    k: number
  ): number {
    // Validate K
    if (k <= 0 || !Number.isInteger(k)) {
      logger.warn({ k }, 'Invalid K value for Recall@K, defaulting to 0');
      return 0;
    }

    const totalRelevant = groundTruthMap.size;
    if (totalRelevant === 0) {
      return 0;
    }

    if (!retrieved || retrieved.length === 0) {
      return 0;
    }

    const topK = retrieved.slice(0, k);
    let relevantFound = 0;
    for (const doc of topK) {
      if (!doc || !doc.url) {
        continue; // Skip invalid documents
      }
      // Use documentId as key if available, otherwise normalized URL
      const key = doc.documentId || this.normalizeUrl(doc.url);
      if (groundTruthMap.has(key)) {
        relevantFound++;
      }
    }

    return relevantFound / totalRelevant;
  }

  /**
   * Calculate F1 Score
   * F1 = 2 * (Precision * Recall) / (Precision + Recall)
   */
  private calculateF1Score(precision: number, recall: number): number {
    // Validate inputs
    if (typeof precision !== 'number' || typeof recall !== 'number') {
      logger.warn({ precision, recall }, 'Invalid precision or recall values for F1 score, defaulting to 0');
      return 0;
    }

    if (isNaN(precision) || isNaN(recall) || !isFinite(precision) || !isFinite(recall)) {
      return 0;
    }

    if (precision + recall === 0) {
      return 0;
    }

    return (2 * precision * recall) / (precision + recall);
  }

  /**
   * Calculate NDCG@K (Normalized Discounted Cumulative Gain)
   * DCG@K = Σ(rel_i / log2(i+1)) for i=1 to K
   * NDCG@K = DCG@K / IDCG@K
   */
  private calculateNDCG(
    retrieved: WorkflowResultDocument[],
    groundTruthMap: Map<string, number>,
    k: number
  ): number {
    // Validate K
    if (k <= 0 || !Number.isInteger(k)) {
      logger.warn({ k }, 'Invalid K value for NDCG@K, defaulting to 0');
      return 0;
    }

    if (!retrieved || retrieved.length === 0) {
      return 0;
    }

    const topK = retrieved.slice(0, k);
    if (topK.length === 0) {
      return 0;
    }

    // Calculate DCG
    let dcg = 0;
    for (let i = 0; i < topK.length; i++) {
      const doc = topK[i];
      if (!doc || !doc.url) {
        continue; // Skip invalid documents
      }
      // Use documentId as key if available, otherwise normalized URL
      const key = doc.documentId || this.normalizeUrl(doc.url);
      const relevance = groundTruthMap.get(key) || 0;
      // Ensure relevance is a valid number
      const relValue = typeof relevance === 'number' && isFinite(relevance) ? relevance : 0;
      dcg += relValue / Math.log2(i + 2); // i+2 because log2(1) = 0, we want log2(2) = 1
    }

    // Calculate IDCG (ideal DCG - sorted by relevance descending)
    const idealRelevances = Array.from(groundTruthMap.values())
      .filter((rel): rel is number => typeof rel === 'number' && isFinite(rel))
      .sort((a, b) => b - a)
      .slice(0, k);
    
    if (idealRelevances.length === 0) {
      return 0;
    }
    
    let idcg = 0;
    for (let i = 0; i < idealRelevances.length; i++) {
      idcg += idealRelevances[i] / Math.log2(i + 2);
    }

    if (idcg === 0) {
      return 0;
    }

    const ndcg = dcg / idcg;
    // Ensure result is valid
    return isNaN(ndcg) || !isFinite(ndcg) ? 0 : ndcg;
  }

  /**
   * Calculate MAP (Mean Average Precision)
   * AP = (1/R) × Σ(Precision@i) for each relevant document i
   * MAP = Average of AP across all queries (here, single query)
   */
  private calculateMAP(
    retrieved: WorkflowResultDocument[],
    groundTruthMap: Map<string, number>
  ): number {
    const totalRelevant = groundTruthMap.size;
    if (totalRelevant === 0) {
      return 0;
    }

    if (!retrieved || retrieved.length === 0) {
      return 0;
    }

    let relevantFound = 0;
    let sumPrecision = 0;

    for (let i = 0; i < retrieved.length; i++) {
      const doc = retrieved[i];
      if (!doc || !doc.url) {
        continue; // Skip invalid documents
      }
      // Use documentId as key if available, otherwise normalized URL
      const key = doc.documentId || this.normalizeUrl(doc.url);
      if (groundTruthMap.has(key)) {
        relevantFound++;
        const precisionAtI = relevantFound / (i + 1);
        sumPrecision += precisionAtI;
      }
    }

    if (relevantFound === 0) {
      return 0;
    }

    const map = sumPrecision / totalRelevant;
    // Ensure result is valid
    return isNaN(map) || !isFinite(map) ? 0 : map;
  }

  /**
   * Normalize URL for comparison
   * Handles various URL formats and edge cases
   */
  private normalizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    try {
      const urlObj = new URL(url);
      // Normalize: lowercase, remove trailing slash, remove fragment
      let normalized = urlObj.href.toLowerCase().trim();
      // Remove fragment
      normalized = normalized.split('#')[0];
      // Remove trailing slash (except for root)
      if (normalized.endsWith('/') && normalized.length > urlObj.origin.length + 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      // If URL parsing fails, just normalize the string
      return url.toLowerCase().trim();
    }
  }

  /**
   * Get ground truth documents for a specific query
   * 
   * Uses caching to avoid repeated database queries for the same dataset.
   * Cache expires after 5 minutes to ensure fresh data.
   * 
   * @param groundTruthId - ID of the ground truth dataset
   * @param query - Query string to find ground truth for
   * @returns Promise resolving to array of relevant documents with relevance scores
   */
  private async getGroundTruthForQuery(
    groundTruthId: string,
    query: string
  ): Promise<Array<{ url: string; relevance: number; documentId?: string; source?: string }>> {
    // Check cache first
    const cached = this.groundTruthCache.get(groundTruthId);
    const now = Date.now();
    
    let dataset: Awaited<ReturnType<GroundTruthService['getDataset']>> | null = null;
    
    if (cached && (now - cached.cachedAt) < this.CACHE_TTL_MS) {
      dataset = cached.dataset;
      logger.debug({ groundTruthId, query }, 'Using cached ground truth dataset');
    } else {
      // Fetch from database
      const groundTruthService = new GroundTruthService();
      dataset = await groundTruthService.getDataset(groundTruthId);
      
      if (dataset) {
        // Update cache
        this.groundTruthCache.set(groundTruthId, { dataset, cachedAt: now });
        logger.debug({ groundTruthId }, 'Cached ground truth dataset');
      }
    }
    
    if (!dataset) {
      logger.error({ groundTruthId }, 'Ground truth dataset not found');
      return [];
    }

    // Find matching query (case-insensitive, trimmed)
    const normalizedQuery = query.toLowerCase().trim();
    const matchingQuery = dataset.queries.find(
      (q) => q.query.toLowerCase().trim() === normalizedQuery
    );

    if (!matchingQuery) {
      logger.warn({ 
        groundTruthId, 
        query,
        availableQueries: dataset.queries.map(q => q.query).slice(0, 5) // Log first 5 for debugging
      }, 'No ground truth found for query');
      return [];
    }

    if (!matchingQuery.relevant_documents || matchingQuery.relevant_documents.length === 0) {
      logger.warn({ groundTruthId, query }, 'Ground truth query found but has no relevant documents');
      return [];
    }

    // Return documents with documentId and source if available
    return matchingQuery.relevant_documents.map((doc: { url: string; relevance: number; documentId?: string; source?: string }) => ({
      url: doc.url,
      relevance: doc.relevance,
      ...(doc.documentId && { documentId: doc.documentId }),
      ...(doc.source && { source: doc.source }),
    }));
  }

  /**
   * Get workflow name
   */
  private async getWorkflowName(workflowId: string): Promise<string> {
    const { getWorkflowNameById } = await import('../../utils/workflowLookup.js');
    return (await getWorkflowNameById(workflowId)) || workflowId;
  }

  /**
   * Store evaluation result
   * 
   * Stores the evaluation result in the database. Includes error handling
   * and validation to ensure data integrity.
   * 
   * @param evaluation - Evaluation result to store
   * @throws {Error} If database operation fails
   */
  private async storeEvaluation(evaluation: GroundTruthEvaluation): Promise<void> {
    const db = getDB();
    const collection = db.collection<GroundTruthEvaluation>(GROUND_TRUTH_EVALUATIONS_COLLECTION);
    
    try {
      await collection.insertOne(evaluation);
      logger.info({ 
        evaluationId: evaluation.evaluationId,
        workflowId: evaluation.workflowId,
        groundTruthId: evaluation.groundTruthId,
        query: evaluation.query
      }, 'Stored ground truth evaluation');
    } catch (error) {
      logger.error({ 
        evaluationId: evaluation.evaluationId, 
        error 
      }, 'Failed to store ground truth evaluation');
      throw new Error(`Failed to store evaluation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get evaluation by ID
   * 
   * Retrieves a stored evaluation result by its evaluation ID or MongoDB ObjectId.
   * 
   * @param evaluationId - Evaluation ID (string) or MongoDB ObjectId
   * @returns Promise resolving to evaluation or null if not found
   * 
   * @example
   * ```typescript
   * const evaluation = await service.getEvaluation('507f1f77bcf86cd799439040');
   * if (evaluation) {
   *   console.log(`F1 Score: ${evaluation.metrics.f1_score}`);
   * }
   * ```
   */
  async getEvaluation(evaluationId: string): Promise<GroundTruthEvaluation | null> {
    // Validate input
    if (!evaluationId || typeof evaluationId !== 'string' || evaluationId.trim().length === 0) {
      throw new Error('Invalid evaluationId: must be a non-empty string');
    }

    const sanitizedId = evaluationId.trim();
    const db = getDB();
    const collection = db.collection<GroundTruthEvaluation>(GROUND_TRUTH_EVALUATIONS_COLLECTION);
    
    // Try ObjectId lookup first if valid
    if (ObjectId.isValid(sanitizedId)) {
      try {
        const result = await collection.findOne({ _id: new ObjectId(sanitizedId) });
        if (result) {
          return result;
        }
      } catch (error) {
        logger.warn({ evaluationId: sanitizedId, error }, 'Failed to lookup evaluation by ObjectId, trying evaluationId');
      }
    }
    
    // Fallback to evaluationId lookup
    return await collection.findOne({ evaluationId: sanitizedId });
  }

  /**
   * List evaluations with optional filtering
   * 
   * Retrieves a list of evaluations with optional filtering by workflow, ground truth dataset, or query.
   * Supports pagination for large result sets.
   * 
   * @param filters - Optional filters for workflowId, groundTruthId, or query
   * @param options - Optional pagination options (limit, skip)
   * @returns Promise resolving to list of evaluations and total count
   * 
   * @example
   * ```typescript
   * const { evaluations, total } = await service.listEvaluations(
   *   { workflowId: 'workflow-1' },
   *   { limit: 10, skip: 0 }
   * );
   * ```
   */
  async listEvaluations(
    filters: {
      workflowId?: string;
      groundTruthId?: string;
      query?: string;
    } = {},
    options: { limit?: number; skip?: number } = {}
  ): Promise<{ evaluations: GroundTruthEvaluation[]; total: number }> {
    // Validate and sanitize inputs
    const MAX_LIMIT = 1000;
    const MAX_SKIP = 100000;
    
    const limit = Math.min(Math.max(1, options.limit || 50), MAX_LIMIT);
    const skip = Math.max(0, Math.min(options.skip || 0, MAX_SKIP));

    // Validate filter inputs
    const sanitizedFilters: Record<string, string> = {};
    if (filters.workflowId !== undefined) {
      if (typeof filters.workflowId !== 'string' || filters.workflowId.trim().length === 0) {
        throw new Error('Invalid workflowId filter: must be a non-empty string');
      }
      sanitizedFilters.workflowId = filters.workflowId.trim();
    }
    if (filters.groundTruthId !== undefined) {
      if (typeof filters.groundTruthId !== 'string' || filters.groundTruthId.trim().length === 0) {
        throw new Error('Invalid groundTruthId filter: must be a non-empty string');
      }
      sanitizedFilters.groundTruthId = filters.groundTruthId.trim();
    }
    if (filters.query !== undefined) {
      if (typeof filters.query !== 'string' || filters.query.trim().length === 0) {
        throw new Error('Invalid query filter: must be a non-empty string');
      }
      sanitizedFilters.query = filters.query.trim();
    }

    const db = getDB();
    const collection = db.collection<GroundTruthEvaluation>(GROUND_TRUTH_EVALUATIONS_COLLECTION);
    
    const query: Record<string, unknown> = {};
    if (sanitizedFilters.workflowId) {
      query.workflowId = sanitizedFilters.workflowId;
    }
    if (sanitizedFilters.groundTruthId) {
      query.groundTruthId = sanitizedFilters.groundTruthId;
    }
    if (sanitizedFilters.query) {
      query.query = sanitizedFilters.query;
    }

    // Use Promise.all for parallel execution of find and count
    const [evaluations, total] = await Promise.all([
      collection
        .find(query)
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .toArray(),
      collection.countDocuments(query),
    ]);

    logger.debug({ 
      filters: sanitizedFilters, 
      limit, 
      skip, 
      resultCount: evaluations.length, 
      total 
    }, 'Listed ground truth evaluations');

    return { evaluations, total };
  }

  /**
   * Ensure database indexes exist for efficient querying
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<GroundTruthEvaluation>(GROUND_TRUTH_EVALUATIONS_COLLECTION);

    try {
      // Index on evaluationId for lookups
      await collection.createIndex(
        { evaluationId: 1 },
        { background: true, name: 'idx_evaluation_id' }
      );

      // Index on workflowId for filtering by workflow
      await collection.createIndex(
        { workflowId: 1 },
        { background: true, name: 'idx_workflow_id' }
      );

      // Index on groundTruthId for filtering by dataset
      await collection.createIndex(
        { groundTruthId: 1 },
        { background: true, name: 'idx_ground_truth_id' }
      );

      // Index on query for filtering by query
      await collection.createIndex(
        { query: 1 },
        { background: true, name: 'idx_query' }
      );

      // Index on created_at for sorting
      await collection.createIndex(
        { created_at: -1 },
        { background: true, name: 'idx_created_at' }
      );

      // Compound index for common queries (workflow + ground truth + query)
      await collection.createIndex(
        { workflowId: 1, groundTruthId: 1, query: 1 },
        { background: true, name: 'idx_workflow_groundtruth_query' }
      );

      logger.debug('GroundTruthEvaluationService indexes created successfully');
    } catch (error) {
      logger.warn({ error }, 'Some GroundTruthEvaluationService indexes may already exist');
      // Don't throw - indexes may already exist, which is fine
    }
  }

  /**
   * Clear the ground truth dataset cache
   * 
   * Useful for testing or when datasets are updated and cache needs to be refreshed.
   * 
   * @param groundTruthId - Optional specific dataset ID to clear, or clear all if not provided
   */
  clearCache(groundTruthId?: string): void {
    if (groundTruthId) {
      this.groundTruthCache.delete(groundTruthId);
      logger.debug({ groundTruthId }, 'Cleared cache for specific ground truth dataset');
    } else {
      const size = this.groundTruthCache.size;
      this.groundTruthCache.clear();
      logger.debug({ clearedEntries: size }, 'Cleared all ground truth dataset cache');
    }
  }

  /**
   * Get cache statistics for monitoring
   * 
   * @returns Cache statistics including size and entry details
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ groundTruthId: string; cachedAt: Date; ageMs: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.groundTruthCache.entries()).map(([id, value]) => ({
      groundTruthId: id,
      cachedAt: new Date(value.cachedAt),
      ageMs: now - value.cachedAt,
    }));

    return {
      size: this.groundTruthCache.size,
      entries,
    };
  }
}

