/**
 * ETL RunManager - Orchestrates ETL pipeline execution
 * 
 * Manages ETL run state machine, retry logic, and coordination between
 * Node/TypeScript orchestration and Python transformers.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md
 */

import { logger } from '../../utils/logger.js';
import {
  ETLRunModel,
  type ETLRunDocument,
  type ETLRunCreateInput,
  type ETLRunState,
} from '../../models/ETLRunModel.js';
import {
  type ETLJobRequest,
  type ETLJobResult,
  validateETLJobRequest,
  validateETLJobResult,
  ETL_JOB_SCHEMA_VERSION,
} from '../../contracts/etlContracts.js';
import { ETLExtractionService } from './ETLExtractionService.js';
import { loadETLRunOutput } from '../../etl/loaders/graphdbLoader.js';
import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Configuration for ETL RunManager
 */
export interface ETLRunManagerConfig {
  pythonScriptPath?: string; // Path to Python transformer script
  maxRetries?: number;
  retryBackoffMs?: number;
  retryBackoffMultiplier?: number;
}

/**
 * ETL RunManager service
 */
export class ETLRunManager {
  private config: Required<ETLRunManagerConfig>;
  private extractionService: ETLExtractionService;
  
  constructor(config: ETLRunManagerConfig = {}) {
    this.config = {
      pythonScriptPath: config.pythonScriptPath || path.join(process.cwd(), 'scripts', 'etl', 'python_transformer.py'),
      maxRetries: config.maxRetries ?? 3,
      retryBackoffMs: config.retryBackoffMs ?? 1000,
      retryBackoffMultiplier: config.retryBackoffMultiplier ?? 2,
    };
    this.extractionService = new ETLExtractionService();
  }

  /**
   * Create and queue a new ETL run
   */
  async createRun(input: Omit<ETLRunCreateInput, 'runId'>): Promise<ETLRunDocument> {
    // Generate unique run ID using crypto (consistent with codebase patterns)
    const runId = `etl-${Date.now()}-${randomBytes(8).toString('hex')}`;
    
    const createInput: ETLRunCreateInput = {
      runId,
      ...input,
      maxRetries: input.maxRetries ?? this.config.maxRetries,
    };
    
    const run = await ETLRunModel.create(createInput);
    logger.info({ runId }, 'ETL run created and queued');
    
    return run;
  }

  /**
   * Execute an ETL run (transition from queued → running → succeeded/failed)
   */
  async executeRun(runId: string): Promise<ETLRunDocument> {
    const run = await ETLRunModel.findByRunId(runId);
    if (!run) {
      throw new Error(`ETL run not found: ${runId}`);
    }
    
    if (run.state !== 'queued' && run.state !== 'failed') {
      throw new Error(`ETL run is not in a valid state for execution: ${run.state}`);
    }
    
    // Transition to running
    await ETLRunModel.updateState(runId, 'running', {
      startedAt: new Date(),
    });
    
    try {
      // Extract documents from MongoDB/PostGIS
      logger.info({ runId }, 'Extracting documents for ETL');
      const extractedDocuments = await this.extractionService.extractDocuments({
        schemaVersion: ETL_JOB_SCHEMA_VERSION,
        runId,
        createdAt: new Date(),
        input: run.input,
        artifacts: {
          artifactRefs: run.artifactRefs,
        },
        models: run.models,
        output: {
          format: 'turtle',
          outputDir: path.join(process.cwd(), 'data', 'etl', runId),
          manifestName: 'manifest.json',
        },
      });
      
      // Build ETL job request
      const jobRequest: ETLJobRequest = {
        schemaVersion: ETL_JOB_SCHEMA_VERSION,
        runId,
        createdAt: new Date(),
        input: run.input,
        artifacts: {
          artifactRefs: run.artifactRefs,
        },
        models: run.models,
        output: {
          format: 'turtle',
          outputDir: path.join(process.cwd(), 'data', 'etl', runId),
          manifestName: 'manifest.json',
        },
      };
      
      // Validate request
      validateETLJobRequest(jobRequest);
      
      // Serialize documents to JSON file for Python
      const documentsFile = path.join(jobRequest.output.outputDir!, 'documents.json');
      await fs.mkdir(path.dirname(documentsFile), { recursive: true });
      const documentsJson = this.extractionService.serializeDocuments(extractedDocuments);
      await fs.writeFile(documentsFile, documentsJson, 'utf-8');
      
      // Execute Python transformer
      const result = await this.executePythonTransformer(jobRequest);
      
      // Validate result
      validateETLJobResult(result);
      
      // Load RDF into GraphDB
      logger.info({ runId, turtleFiles: result.outputs.turtleFiles.length }, 'Loading RDF into GraphDB');
      await loadETLRunOutput(runId, result.outputs.turtleFiles, result.outputs.manifest);
      
      // Update run with results
      const updatedRun = await ETLRunModel.updateState(runId, 'succeeded', {
        completedAt: new Date(),
        output: {
          turtleFiles: result.outputs.turtleFiles,
          manifest: result.outputs.manifest,
          stats: result.stats,
        },
        provenance: {
          activityId: `prov:${runId}`,
          entityIds: result.manifest?.inputFingerprints.map(f => f.contentFingerprint) || [],
          used: [
            ...(run.artifactRefs || []).map(ref => ({
              type: 'artifact' as const,
              identifier: ref.identifier,
              version: ref.version,
            })),
            {
              type: 'model' as const,
              identifier: run.models.nlpModelId,
            },
            {
              type: 'model' as const,
              identifier: run.models.rdfMappingVersion,
            },
          ],
        },
      });
      
      if (!updatedRun) {
        throw new Error(`Failed to update ETL run: ${runId}`);
      }
      
      logger.info({ runId, stats: result.stats }, 'ETL run succeeded');
      return updatedRun;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Update run with error
      await ETLRunModel.updateState(runId, 'failed', {
        completedAt: new Date(),
        error: errorMessage,
        errors: [{
          message: errorMessage,
          stack: errorStack,
          timestamp: new Date(),
        }],
      });
      
      logger.error({ runId, error: errorMessage }, 'ETL run failed');
      
      // Check if we should retry
      const failedRun = await ETLRunModel.findByRunId(runId);
      if (failedRun && failedRun.retryCount < failedRun.maxRetries) {
        const nextRetryAt = this.calculateNextRetry(failedRun.retryCount);
        await ETLRunModel.incrementRetry(runId, nextRetryAt);
        logger.info({ runId, retryCount: failedRun.retryCount + 1, nextRetryAt }, 'ETL run scheduled for retry');
      }
      
      throw error;
    }
  }

  /**
   * Execute Python transformer (local process invocation)
   * 
   * For MVP, uses local process invocation. Can be migrated to job queue later.
   */
  private async executePythonTransformer(request: ETLJobRequest): Promise<ETLJobResult> {
    return new Promise((resolve, reject) => {
      // Serialize request to JSON file
      const requestFile = path.join(process.cwd(), 'data', 'etl', request.runId, 'request.json');
      
      // Ensure output directory exists
      const outputDir = request.output.outputDir || path.join(process.cwd(), 'data', 'etl', request.runId);
      
      fs.mkdir(outputDir, { recursive: true })
        .then(() => {
          // Write request to file
          return fs.writeFile(
            requestFile,
            JSON.stringify({
              ...request,
              createdAt: request.createdAt instanceof Date ? request.createdAt.toISOString() : request.createdAt,
            }, null, 2)
          );
        })
        .then(() => {
          // Spawn Python process
          const documentsFile = path.join(outputDir, 'documents.json');
          const pythonProcess = spawn('python3', [
            this.config.pythonScriptPath,
            '--request-file', requestFile,
            '--documents-file', documentsFile,
            '--output-dir', outputDir,
          ]);
          
          let stdout = '';
          let stderr = '';
          
          pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          pythonProcess.on('close', async (code) => {
            if (code !== 0) {
              reject(new Error(`Python transformer failed with code ${code}: ${stderr}`));
              return;
            }
            
            // Read result file
            const resultFile = path.join(outputDir, 'result.json');
            try {
              const resultContent = await fs.readFile(resultFile, 'utf-8');
              const result = JSON.parse(resultContent);
              
              // Parse date strings back to Date objects
              if (result.errors) {
                result.errors = result.errors.map((err: any) => ({
                  ...err,
                  timestamp: new Date(err.timestamp),
                }));
              }
              
              resolve(result);
            } catch (error) {
              reject(new Error(`Failed to read result file: ${error instanceof Error ? error.message : String(error)}`));
            }
          });
          
          pythonProcess.on('error', (error) => {
            reject(new Error(`Failed to spawn Python process: ${error.message}`));
          });
        })
        .catch(reject);
    });
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(retryCount: number): Date {
    const delayMs = this.config.retryBackoffMs * Math.pow(this.config.retryBackoffMultiplier, retryCount);
    return new Date(Date.now() + delayMs);
  }

  /**
   * Process queued runs (scheduler entry point)
   */
  async processQueuedRuns(): Promise<void> {
    const queuedRuns = await ETLRunModel.findQueuedRuns();
    
    for (const run of queuedRuns) {
      try {
        await this.executeRun(run.runId);
      } catch (error) {
        logger.error({ runId: run.runId, error }, 'Failed to process queued ETL run');
        // Continue with next run
      }
    }
  }

  /**
   * Process failed runs ready for retry
   */
  async processRetryRuns(): Promise<void> {
    const retryRuns = await ETLRunModel.findRunsReadyForRetry();
    
    for (const run of retryRuns) {
      try {
        await this.executeRun(run.runId);
      } catch (error) {
        logger.error({ runId: run.runId, error }, 'Failed to retry ETL run');
        // Continue with next run
      }
    }
  }

  /**
   * Get run by ID
   */
  async getRun(runId: string): Promise<ETLRunDocument | null> {
    return await ETLRunModel.findByRunId(runId);
  }

  /**
   * List runs with filters
   */
  async listRuns(filters: {
    state?: ETLRunState;
    createdAt?: { $gte?: Date; $lte?: Date };
  } = {}): Promise<ETLRunDocument[]> {
    return await ETLRunModel.find(filters);
  }
}

