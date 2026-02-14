import Bull from 'bull';
import { logger } from '../../../utils/logger.js';
import { fireAndForget } from '../../../utils/initializationState.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { getWorkflowTimeout, isValidTimeout } from '../../../config/workflowQueueConfig.js';
import type { WorkflowJobData, WorkflowJobResult } from '../../../types/job-data.js';
import type { Run } from '../types.js';
import type {
  WorkflowJobProcessor,
  ProgressEventEmitter,
  PerformanceMetricsUpdater,
} from './BaseJobProcessor.js';
import { NotFoundError, ServiceUnavailableError, ExternalServiceError } from '../../../types/errors.js';

/**
 * Constants for progress tracking configuration
 */
const PROGRESS_TRACKING_CONFIG = {
  /** Maximum time to wait for workflow completion (30 minutes) */
  MAX_WAIT_TIME_MS: 30 * 60 * 1000,
  /** Interval between progress polls (2 seconds) */
  POLL_INTERVAL_MS: 2000,
  /** Default workflow timeout if not configured (30 minutes) */
  DEFAULT_TIMEOUT_MS: 30 * 60 * 1000,
} as const;

/**
 * Processor for workflow jobs
 * Handles workflow execution with modules
 * 
 * Features:
 * - Supports both predefined and database-stored workflows
 * - Implements timeout protection with configurable timeouts
 * - Handles workflow cancellation gracefully
 * - Tracks progress and emits progress events
 * - Logs timeout events for monitoring
 * - Supports review mode for workflow execution
 */
export class WorkflowJobProcessorImpl implements WorkflowJobProcessor {
  constructor(
    private progressEmitter: ProgressEventEmitter,
    private metricsUpdater: PerformanceMetricsUpdater
  ) {}

  /**
   * Process a workflow job
   * 
   * @param job - The Bull job containing workflow execution data
   * @returns Promise resolving to the workflow job result
   * @throws Error if workflow execution fails or times out
   */
  async process(job: Bull.Job<WorkflowJobData>): Promise<WorkflowJobResult> {
    const { workflowId, params, options } = job.data;
    const jobId = String(job.id);

    logger.info({ jobId, workflowId }, 'Processing workflow job');

    // Track start time for performance metrics (defined early for catch block access)
    const startTime = Date.now();
    
    // Declare runManager outside try block so it's accessible in catch block
    let runManager: InstanceType<typeof import('../../workflow/RunManager.js').RunManager> | null = null;

    try {
      // Emit job started event
      await this.progressEmitter.emitProgressEvent({
        type: 'job_started',
        jobId,
        jobType: 'workflow',
        queryId: undefined,
        timestamp: new Date(),
        data: {
          status: 'active',
          message: `Workflow job started for workflow ${workflowId}`,
        },
      });

      // Import WorkflowModel and WorkflowEngine dynamically to ensure they're available in worker context
      const { WorkflowModel } = await import('../../../models/Workflow.js');
      const { WorkflowEngine } = await import('../../workflow/WorkflowEngine.js');
      const { RunManager } = await import('../../workflow/RunManager.js');
      const { moduleRegistry } = await import('../../workflow/WorkflowModuleRegistry.js');
      const { getDB } = await import('../../../config/database.js');
      const {
        explorationWorkflow,
        standardScanWorkflow,
        quickIploScanWorkflow,
        horstAanDeMaasWorkflow,
        horstLaborMigrationWorkflow,
        externalLinksWorkflow,
        beleidsscanGraphWorkflow,
        bfs3HopWorkflow,
        beleidsscanWizardWorkflow,
        beleidsscanStep1SearchDsoWorkflow,
        beleidsscanStep2EnrichDsoWorkflow,
        beleidsscanStep3SearchIploWorkflow,
        beleidsscanStep4ScanKnownSourcesWorkflow,
        beleidsscanStep5SearchOfficieleBekendmakingenWorkflow,
        beleidsscanStep6SearchRechtspraakWorkflow,
        beleidsscanStep7CommonCrawlWorkflow,
        beleidsscanStep9MergeScoreWorkflow,
        dsoLocationSearchWorkflow
      } = await import('../../../workflows/predefinedWorkflows.js');

      // Helper to get workflow by ID (supports both predefined and database workflows)
      const getWorkflowById = (id: string) => {
        switch (id) {
          case 'iplo-exploration':
            return explorationWorkflow;
          case 'standard-scan':
            return standardScanWorkflow;
          case 'quick-iplo-scan':
            return quickIploScanWorkflow;
          case 'external-links-exploration':
            return externalLinksWorkflow;
          case 'beleidsscan-graph':
            return beleidsscanGraphWorkflow;
          case 'bfs-3-hop':
            return bfs3HopWorkflow;
          case 'horst-aan-de-maas':
            return horstAanDeMaasWorkflow;
          case 'horst-labor-migration':
            return horstLaborMigrationWorkflow;
          case 'beleidsscan-wizard':
            return beleidsscanWizardWorkflow;
          case 'beleidsscan-step-1-search-dso':
            return beleidsscanStep1SearchDsoWorkflow;
          case 'beleidsscan-step-2-enrich-dso':
            return beleidsscanStep2EnrichDsoWorkflow;
          case 'beleidsscan-step-3-search-iplo':
            return beleidsscanStep3SearchIploWorkflow;
          case 'beleidsscan-step-4-scan-sources':
            return beleidsscanStep4ScanKnownSourcesWorkflow;
          case 'beleidsscan-step-5-officiele-bekendmakingen':
            return beleidsscanStep5SearchOfficieleBekendmakingenWorkflow;
          case 'beleidsscan-step-6-rechtspraak':
            return beleidsscanStep6SearchRechtspraakWorkflow;
          case 'beleidsscan-step-7-common-crawl':
            return beleidsscanStep7CommonCrawlWorkflow;
          case 'beleidsscan-step-9-merge-score':
            return beleidsscanStep9MergeScoreWorkflow;
          case 'dso-location-search':
            return dsoLocationSearchWorkflow;
          default:
            return null;
        }
      };

      // Try to get predefined workflow first
      let workflow = getWorkflowById(workflowId);
      
      // If not found, try to load from database using version-aware loading
      if (!workflow) {
        // Use version-aware loading: get latest published version if available, otherwise current version
        let workflowDoc = await WorkflowModel.getLatestPublishedVersion(workflowId);
        if (!workflowDoc) {
          // Fallback to current version if no published version exists
          workflowDoc = await WorkflowModel.findById(workflowId);
        }
        
        if (!workflowDoc) {
          throw new NotFoundError('Workflow', workflowId, {
            reason: 'workflow_not_found',
            operation: 'processWorkflowJob',
            jobId
          });
        }
        
        // Convert WorkflowDocument to Workflow type
        workflow = {
          id: workflowDoc.id,
          name: workflowDoc.name,
          description: workflowDoc.description,
          steps: workflowDoc.steps,
        };
      }

      // Validate external service configuration before executing workflow
      const { ServiceConfigurationValidator } = await import('../../workflow/ServiceConfigurationValidator.js');
      const serviceValidator = new ServiceConfigurationValidator();
      const serviceValidation = serviceValidator.validateWorkflowServices(workflow.id);
      if (!serviceValidation.valid) {
        const errorMessage = serviceValidation.error || 'Required external services not configured';
        logger.error(
          { jobId, workflowId: workflow.id, missingServices: serviceValidation.missingServices },
          'Workflow execution blocked: required external services not configured'
        );
        throw new ServiceUnavailableError(errorMessage, {
          reason: 'required_external_services_not_configured',
          operation: 'processWorkflowJob',
          workflowId: workflow.id,
          jobId,
          missingServices: serviceValidation.missingServices.map(s => s.name)
        });
      }

      await job.progress(10);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'workflow',
        queryId: undefined,
        timestamp: new Date(),
        data: {
          progress: 10,
          message: 'Workflow geladen, engine initialiseren...',
        },
      });

      // Initialize WorkflowEngine with module registry
      const db = getDB();
      runManager = new RunManager(db);
      const workflowEngine = new WorkflowEngine(runManager);

      // Register all modules from registry
      const allModules = moduleRegistry.getAll();
      for (const entry of allModules) {
        workflowEngine.registerModule(entry.metadata.id, entry.module);
      }

      // Register all workflow actions (required for workflow execution)
      // This ensures actions like scan_iplo_known_subjects are available
      // Also register graph actions (load_graph, explore_iplo, save_graph) which require navigationGraph
      try {
        const { registerAllWorkflowActions } = await import('../../workflow/registerWorkflowActions.js');
        // Create navigationGraph instance for graph-based actions
        // Graph actions are only registered if navigationGraph is provided
        let navigationGraph = null;
        try {
          const { getNeo4jDriver } = await import('../../../config/neo4j.js');
          const { NavigationGraph } = await import('../../graphs/navigation/NavigationGraph.js');
          const neo4jDriver = getNeo4jDriver();
          if (neo4jDriver) {
            navigationGraph = new NavigationGraph(neo4jDriver);
            await navigationGraph.load();
            logger.debug({ jobId, workflowId }, 'Navigation graph initialized for workflow actions');
          }
        } catch (graphError) {
          // Log but don't fail - graph actions may not be needed for all workflows
          logger.warn({ error: graphError, jobId, workflowId }, 'Failed to initialize navigation graph (graph actions will not be available)');
        }
        await registerAllWorkflowActions(workflowEngine, runManager, navigationGraph);
        logger.info({ jobId, workflowId, hasGraph: navigationGraph !== null }, 'Registered all workflow actions');
      } catch (error) {
        logger.error({ error, jobId, workflowId }, 'Failed to register workflow actions (workflow may fail)');
        // Continue anyway - some workflows may still work with just modules
      }

      await job.progress(20);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'workflow',
        queryId: undefined,
        timestamp: new Date(),
        data: {
          progress: 20,
          message: 'Engine geïnitialiseerd, workflowuitvoering starten...',
        },
      });

      // Use provided runId or create a new run
      let runId: string;
      if (job.data.runId) {
        // Use existing runId (created by WorkflowEngine.startWorkflow())
        runId = job.data.runId;
        logger.info({ jobId, runId, workflowId }, 'Using existing runId from job data');
        
        const existingRun = await runManager.getRun(runId);
        if (!existingRun) {
          logger.error({ jobId, runId, workflowId }, '❌ CRITICAL: Run not found in database!');
          throw new NotFoundError('Run', runId, {
            reason: 'run_not_found',
            operation: 'processWorkflowJob',
            workflowId,
            jobId
          });
        }
        
        logger.info(
          { jobId, runId, workflowId, status: existingRun.status },
          '✅ Found existing run in database'
        );
        
        // Check if run was cancelled before starting
        if (existingRun.status === 'cancelled') {
          throw new ServiceUnavailableError(`Run ${runId} was cancelled before execution could start`, {
            reason: 'run_cancelled_before_start',
            operation: 'processWorkflowJob',
            runId,
            workflowId,
            jobId
          });
        }
        // Update run status to running if it was pending
        if (existingRun.status === 'pending') {
          await runManager.startRun(runId);
          logger.info({ jobId, runId, workflowId }, 'Updated run status from pending to running');
        }
      } else {
        // Create new run (backward compatibility for direct queue usage)
        logger.info({ jobId, workflowId }, 'Creating new run (no runId in job data)');
        const initialRun = await runManager.createRun('workflow', {
          workflowId: workflow.id,
          workflowName: workflow.name,
          ...params
        });
        
        if (!initialRun._id) {
          logger.error({ jobId, workflowId }, '❌ CRITICAL: Run created but _id is missing!');
          throw new ServiceUnavailableError('Failed to create run: run ID is missing', {
            reason: 'run_creation_failed',
            operation: 'processWorkflowJob',
            workflowId,
            jobId
          });
        }
        
        runId = initialRun._id.toString();
        logger.info({ jobId, runId, workflowId }, '✅ Created new run in database');
      }

      await job.progress(50);
      await this.progressEmitter.emitProgressEvent({
        type: 'job_progress',
        jobId,
        jobType: 'workflow',
        queryId: undefined,
        timestamp: new Date(),
        data: {
          progress: 50,
          message: `Workflowuitvoering gestart (runId: ${runId})`,
          metadata: {
            runId,
          },
        },
      });

      // Execute workflow directly (blocking) to avoid race conditions
      // Set up progress tracking in parallel
      const maxWaitTime = PROGRESS_TRACKING_CONFIG.MAX_WAIT_TIME_MS;
      const pollInterval = PROGRESS_TRACKING_CONFIG.POLL_INTERVAL_MS;
      
      // Use AbortController to properly cancel progress tracking
      const abortController = new AbortController();
      let progressTrackingTimer: NodeJS.Timeout | null = null;
      
      // Capture startTime in local scope for async function closure
      const progressStartTime = startTime;
      
      // Start progress tracking in background
      const progressTracking = (async () => {
        while (Date.now() - progressStartTime < maxWaitTime && !abortController.signal.aborted) {
          // Check abort signal before creating timer
          if (abortController.signal.aborted) break;
          
          const timerPromise = new Promise<void>((resolve) => {
            progressTrackingTimer = setTimeout(() => {
              // Clear timer reference and resolve
              progressTrackingTimer = null;
              resolve();
            }, pollInterval);
          });
          
          await timerPromise;
          
          // Check abort signal after timer resolves
          if (abortController.signal.aborted) break;
          
          const currentRun = await runManager.getRun(runId);
          if (!currentRun) break;
          
          if (currentRun.status === 'completed' || currentRun.status === 'failed' || currentRun.status === 'cancelled') {
            break;
          }
          
          // Update progress based on elapsed time
          const progress = Math.min(50 + (Date.now() - progressStartTime) / maxWaitTime * 40, 90);
          await job.progress(Math.floor(progress));
        }
      })();

      // Execute workflow with timeout protection
      // Get timeout for this workflow (default: 30 minutes)
      const workflowTimeoutMs = getWorkflowTimeout(workflow.id, workflow.id);
      const validTimeoutMs = isValidTimeout(workflowTimeoutMs) ? workflowTimeoutMs : PROGRESS_TRACKING_CONFIG.DEFAULT_TIMEOUT_MS;
      
      const executionStartTime = Date.now();
      let run: Run;
      try {
        // Wrap executeWorkflow with timeout
        run = await withTimeout(
          workflowEngine.executeWorkflow(workflow, params, runId, {
            reviewMode: options?.reviewMode || false,
          }),
          validTimeoutMs,
          `Workflow ${workflow.id} (${workflow.name}) execution`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const elapsedMs = Date.now() - executionStartTime;
        const isTimeoutError = errorMessage.includes('timed out');
        
        // If timeout occurred, cancel the workflow and update job status
        if (isTimeoutError) {
          // Log timeout event using TimeoutEventLogger
          const { TimeoutEventLogger } = await import('../../workflow/TimeoutEventLogger.js');
          const timeoutEventLogger = new TimeoutEventLogger(runManager);
          const percentageUsed = (elapsedMs / validTimeoutMs) * 100;
          await timeoutEventLogger.logTimeoutEvent({
            type: 'queue_timeout',
            runId,
            workflowId: workflow.id,
            workflowName: workflow.name,
            timeoutMs: validTimeoutMs,
            elapsedMs,
            percentageUsed,
            timestamp: new Date(),
            metadata: {
              jobId,
            },
          });
          
          // Cancel the workflow gracefully
          try {
            await workflowEngine.cancel(runId);
          } catch (cancelError) {
            logger.warn(
              { jobId, workflowId, runId, cancelError },
              'Failed to cancel workflow on timeout, but continuing with error handling'
            );
          }
          
          // Update job progress to 100% (failed)
          await job.progress(100);
          
          // Format error message using TimeoutErrorFormatter
          const { getTimeoutErrorFormatter } = await import('../../../utils/TimeoutErrorFormatter.js');
          const formatter = getTimeoutErrorFormatter();
          const formattedError = formatter.formatError({
            type: 'queue',
            workflowId: workflow.id,
            workflowName: workflow.name,
            timeoutMs: validTimeoutMs,
            elapsedMs,
            percentageUsed,
            runId,
          });
          
          // Emit job failed event with timeout information
          await this.progressEmitter.emitProgressEvent({
            type: 'job_failed',
            jobId,
            jobType: 'workflow',
            queryId: undefined,
            timestamp: new Date(),
            data: {
              status: 'failed',
              error: formattedError.message,
              errorDetails: {
                type: 'timeout',
                elapsedMs,
                timeoutMs: validTimeoutMs,
                workflowId,
                runId,
                suggestions: formattedError.suggestions,
                metadata: formattedError.metadata,
              },
            },
          });
          
          // Throw timeout error
          throw new ExternalServiceError('WorkflowEngine', `Workflow execution timed out: ${workflow.name} (${workflow.id}) exceeded ${validTimeoutMs}ms timeout after ${elapsedMs}ms`, {
            reason: 'workflow_timeout',
            operation: 'processWorkflowJob',
            workflowId: workflow.id,
            runId,
            jobId,
            timeoutMs: validTimeoutMs,
            elapsedMs
          });
        }
        // Ensure progress tracking stops
        abortController.abort();
        if (progressTrackingTimer) {
          clearTimeout(progressTrackingTimer);
          progressTrackingTimer = null;
        }
        fireAndForget(
          progressTracking,
          {
            service: 'WorkflowJobProcessor',
            operation: 'progressTrackingCleanup',
            logger
          }
        );
        
        // Get the failed run to include error details
        const failedRun = await runManager.getRun(runId);
        if (failedRun?.status === 'failed') {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new ExternalServiceError('WorkflowEngine', `Workflow execution failed: ${failedRun.error || errorMessage}`, {
            reason: 'workflow_execution_failed',
            operation: 'processWorkflowJob',
            workflowId: workflow.id,
            runId,
            jobId,
            originalError: errorMessage
          });
        }
        throw error;
      }

      // Stop progress tracking
      abortController.abort();
      if (progressTrackingTimer) {
        clearTimeout(progressTrackingTimer);
        progressTrackingTimer = null;
      }
      fireAndForget(
        progressTracking,
        {
          service: 'WorkflowJobProcessor',
          operation: 'progressTrackingCleanup',
          logger
        }
      );

      if (!run) {
        logger.error(
          { jobId, workflowId, runId },
          '❌ CRITICAL: Run not found after workflow execution'
        );
        throw new NotFoundError('Run', runId, {
          reason: 'run_not_found_after_execution',
          operation: 'processWorkflowJob',
          workflowId,
          jobId
        });
      }

      if (run.status === 'failed') {
        const errorMessage = run.error || 'Unknown error';
        logger.error(
          { jobId, workflowId, runId, error: errorMessage, runStatus: run.status },
          '❌ Workflow execution failed'
        );
        throw new ExternalServiceError('WorkflowEngine', `Workflow execution failed: ${errorMessage}`, {
          reason: 'workflow_execution_failed',
          operation: 'processWorkflowJob',
          workflowId: workflow.id,
          runId,
          jobId,
          error: errorMessage
        });
      }

      if (run.status === 'cancelled') {
        throw new ServiceUnavailableError('Workflow execution was cancelled', {
          reason: 'workflow_execution_cancelled',
          operation: 'processWorkflowJob',
          workflowId: workflow.id,
          runId,
          jobId
        });
      }

      await job.progress(100);

      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('workflowJobs', processingTime);
      logger.info({ jobId, workflowId, runId, processingTimeMs: processingTime }, 'Workflow job completed');

      // Extract queryId from run params for event emission (consistent with error handling)
      const queryId = run.params?.queryId as string | undefined;

      // Complete workflow with contract enforcement (mandatory: save results + emit event)
      const { WorkflowCompletionService } = await import('../../workflow/WorkflowCompletionService.js');
      const completionService = new WorkflowCompletionService(runManager, this.progressEmitter);
      
      await completionService.completeWorkflowWithContract({
        runId,
        workflowId,
        jobId,
        result: run.result || {},
        status: 'completed',
        queryId,
        metadata: {
          processingTimeMs: processingTime,
        },
      });

      const result: WorkflowJobResult = {
        success: true,
        runId,
        results: run.result,
      };

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metricsUpdater.updatePerformanceMetrics('workflowJobs', processingTime);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const runId = job.data.runId;
      const queryId = job.data.params?.queryId as string | undefined;
      
      logger.error(
        { 
          jobId, 
          workflowId, 
          runId,
          queryId,
          error: errorMessage,
          errorStack: errorStack?.substring(0, 500), // Limit stack trace in logs
          processingTimeMs: processingTime 
        }, 
        '❌ Error processing workflow job'
      );

      // Fail workflow with contract enforcement (mandatory: save failure + emit event)
      if (runId && runManager) {
        try {
          const { WorkflowCompletionService } = await import('../../workflow/WorkflowCompletionService.js');
          const completionService = new WorkflowCompletionService(runManager, this.progressEmitter);
          
          await completionService.failWorkflowWithContract({
            runId,
            workflowId,
            jobId,
            result: {},
            status: 'failed',
            queryId,
            error: errorMessage,
            errorDetails: {
              error: errorMessage,
              errorStack: errorStack?.substring(0, 1000), // Limit stack trace size
              processingTimeMs: processingTime,
              workflowId,
              runId,
              queryId,
            },
            metadata: {
              processingTimeMs: processingTime,
            },
          });
        } catch (contractError) {
          // Contract violation - log but still throw original error
          logger.error(
            { jobId, workflowId, runId, queryId, contractError },
            'WorkflowCompletionContract violation during failure handling'
          );
          // Still throw original error so Bull can handle retries
        }
      } else {
        // Fallback if runManager not available - still try to emit event
        try {
          await this.progressEmitter.emitProgressEvent({
            type: 'job_failed',
            jobId,
            jobType: 'workflow',
            queryId,
            timestamp: new Date(),
            data: {
              status: 'failed',
              error: errorMessage,
              errorDetails: {
                error: errorMessage,
                errorStack: errorStack?.substring(0, 1000),
                processingTimeMs: processingTime,
                workflowId,
                runId,
                queryId,
              },
            },
          });
        } catch (emitError) {
          logger.error(
            { jobId, workflowId, runId, queryId, emitError },
            'Failed to emit failure event (fallback)'
          );
        }
      }

      throw error; // Bull will handle retries
    }
  }
}

