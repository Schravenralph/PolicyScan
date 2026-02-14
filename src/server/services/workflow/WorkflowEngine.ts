import { IRunManager } from './interfaces/IRunManager.js';
import { Workflow, Run } from '../infrastructure/types.js';
import { WorkflowOutput } from './WorkflowOutputService.js';
import { WorkflowExecutor } from './WorkflowExecutor.js';
import { WorkflowValidator } from './WorkflowValidator.js';
import { WorkflowStateManager } from './WorkflowStateManager.js';
import { ReviewTimeoutService, DEFAULT_REVIEW_TIMEOUT_MS } from './ReviewTimeoutService.js';
import { TimeoutEventLogger } from './TimeoutEventLogger.js';
import { logger } from '../../utils/logger.js';
import type { CompensationAction } from './compensation/types.js';
import { WorkflowActionRegistry, type StepAction } from './WorkflowActionRegistry.js';
import type { WorkflowModule } from './WorkflowModule.js';

// Re-export StepAction for convenience
export type { StepAction };
import { WorkflowExecutionMonitor } from './WorkflowExecutionMonitor.js';
import type { NavigationGraph, GraphStatistics } from '../graphs/navigation/NavigationGraph.js';
import { GraphStatisticsService } from '../graphs/navigation/GraphStatisticsService.js';
import { type ValidationReport } from './ServiceValidationService.js';
import { WorkflowDependencies, DefaultWorkflowDependencies } from './WorkflowDependencies.js';
import { NotFoundError, BadRequestError, ServiceUnavailableError } from '../../types/errors.js';
import { WorkflowReviewHandler } from './WorkflowReviewHandler.js';
import { WorkflowNavigationService } from './WorkflowNavigationService.js';
import { WorkflowCompensationManager } from './WorkflowCompensationManager.js';
import type { WorkflowOrchestrator } from '../orchestration/WorkflowOrchestrator.js';
import { NarrativeFormatter } from '../monitoring/NarrativeFormatter.js';

export interface WorkflowExecutionResult {
    run: Run;
    outputFiles?: {
        jsonPath: string;
        markdownPath: string;
        txtPath: string;
        csvPath: string;
        htmlPath: string;
        xmlPath: string;
        pdfPath: string;
        xlsxPath: string;
        tsvPath: string;
    };
    output?: WorkflowOutput;
}

export class WorkflowEngine {
    private actionRegistry: WorkflowActionRegistry;
    private executor: WorkflowExecutor;
    private validator: WorkflowValidator;
    private stateManager: WorkflowStateManager;
    private reviewTimeoutService: ReviewTimeoutService;
    private timeoutEventLogger: TimeoutEventLogger;
    private compensationManager: WorkflowCompensationManager;
    private navigationGraph: NavigationGraph | null = null;
    private graphStatisticsService: GraphStatisticsService | null = null;
    private reviewHandler: WorkflowReviewHandler;
    private navigationService: WorkflowNavigationService;
    private workflowOrchestrator: WorkflowOrchestrator | null = null;
    private narrativeFormatter: NarrativeFormatter;

    constructor(
        private runManager: IRunManager,
        navigationGraph?: NavigationGraph | null,
        private dependencies: WorkflowDependencies = new DefaultWorkflowDependencies(),
        workflowOrchestrator?: WorkflowOrchestrator | null
    ) {
        // Create shared actions map
        const actions = new Map<string, StepAction>();
        // Initialize validator with shared actions map
        this.validator = new WorkflowValidator(actions);
        // Initialize action registry with validator and shared actions map
        this.actionRegistry = new WorkflowActionRegistry(this.validator, actions);
        // Initialize executor with shared actions map (they all hold references to the same map)
        this.executor = new WorkflowExecutor(this.runManager, actions);
        this.stateManager = new WorkflowStateManager(this.runManager);
        this.reviewTimeoutService = new ReviewTimeoutService(this.runManager);
        this.timeoutEventLogger = new TimeoutEventLogger(this.runManager);
        this.reviewHandler = new WorkflowReviewHandler(this.runManager, this.dependencies);
        this.navigationService = new WorkflowNavigationService(this.runManager);
        this.compensationManager = new WorkflowCompensationManager();
        this.navigationGraph = navigationGraph || null;
        this.narrativeFormatter = new NarrativeFormatter();
        this.workflowOrchestrator = workflowOrchestrator || null;
        // Initialize graph statistics service if navigation graph is available
        if (this.navigationGraph) {
            this.graphStatisticsService = new GraphStatisticsService(
                this.navigationGraph,
                this.runManager
            );
        }
    }

    /**
     * Get the workflow orchestrator instance
     * 
     * If no orchestrator was provided in the constructor, this will lazy-initialize one.
     * This allows backward compatibility while enabling orchestrator usage when needed.
     * 
     * @returns WorkflowOrchestrator instance
     */
    async getOrchestrator(): Promise<WorkflowOrchestrator> {
        if (!this.workflowOrchestrator) {
            // Lazy-initialize orchestrator with default services
            this.workflowOrchestrator = await this.dependencies.getWorkflowOrchestrator();

            logger.debug('[WorkflowEngine] Lazy-initialized WorkflowOrchestrator');
        }

        return this.workflowOrchestrator;
    }

    /**
     * Register an action that can be used in workflows
     */
    registerAction(name: string, action: StepAction): void {
        this.actionRegistry.registerAction(name, action);
        // Executor and validator automatically see changes since they hold references to the same map
    }

    /**
     * Execute a single action directly (for testing and standalone execution)
     * 
     * @param actionName - Name of the action to execute
     * @param params - Parameters to pass to the action
     * @param runId - Workflow run ID for logging
     * @param signal - Optional abort signal for cancellation
     * @returns Result from the action execution
     */
    async executeAction(
        actionName: string,
        params: Record<string, unknown>,
        runId: string,
        signal?: AbortSignal
    ): Promise<Record<string, unknown> | null | undefined> {
        return await this.actionRegistry.executeAction(actionName, params, runId, signal);
    }

    /**
     * Register a module as an action that can be used in workflows
     * 
     * This method wraps a WorkflowModule in a ModuleActionAdapter and registers
     * it as an action. The module can then be referenced in workflow steps by
     * its ID or by a custom action name.
     * 
     * @param actionName The name to use when referencing this module in workflows (defaults to module.id)
     * @param module The WorkflowModule to register
     * @throws Error if module is invalid or registration fails
     * 
     * @example
     * ```typescript
     * const searchModule = new SearchWebModule();
     * workflowEngine.registerModule('searchWeb', searchModule);
     * ```
     */
    registerModule(actionName: string, module: WorkflowModule): void {
        this.actionRegistry.registerModule(actionName, module);
        // Executor and validator automatically see changes since they hold references to the same map
    }

    /**
     * Register a module from the module registry by ID
     * 
     * Looks up a module in the module registry and registers it as an action.
     * This allows workflows to reference modules by ID without explicitly
     * registering them first.
     * 
     * @param actionName The name to use when referencing this module in workflows
     * @param moduleId The ID of the module in the registry
     * @throws Error if module is not found in registry
     * 
     * @example
     * ```typescript
     * workflowEngine.registerModuleFromRegistry('searchWeb', 'DiscoverSources');
     * ```
     */
    registerModuleFromRegistry(actionName: string, moduleId: string): void {
        this.actionRegistry.registerModuleFromRegistry(actionName, moduleId);
        // Executor and validator automatically see changes since they hold references to the same map
    }

    /**
     * Get the names of registered actions (for diagnostics / UI)
     */
    getRegisteredActionNames(): string[] {
        return this.actionRegistry.getRegisteredActionNames();
    }

    /**
     * Start a workflow and return the run ID immediately
     * 
     * If queryId is provided in params, checks for existing active runs for that queryId
     * to prevent duplicate runs (idempotent start behavior).
     * 
     * Validates external service configuration before starting the workflow.
     * 
     * @param workflow - The workflow to execute
     * @param params - Workflow parameters (may include queryId for idempotent start)
     * @param options - Optional execution options (reviewMode, skipValidation)
     * @returns The run ID (existing if found, new if created)
     * @throws Error if required services are not configured (unless skipValidation is true)
     */
    async startWorkflow(workflow: Workflow, params: Record<string, unknown>, options?: { reviewMode?: boolean; skipValidation?: boolean; createdBy?: string }): Promise<string> {
        const queryId = params.queryId as string | undefined;
        const workflowId = workflow.id;

        // Validate external service configuration (unless skipped)
        if (!options?.skipValidation) {
            try {
                const validationService = await this.dependencies.getServiceValidationService();
                const stepIds = workflow.steps.map(step => step.id);
                const validationReport: ValidationReport = await validationService.validateForSteps(stepIds);

                // Log validation results
                logger.info(
                    { workflowId: workflow.id, validationReport },
                    `Service validation: ${validationReport.message}`
                );

                // Fail if required services are not configured
                if (!validationReport.valid) {
                    const errorMessage = `Workflow cannot start: ${validationReport.message}. ` +
                        `Misconfigured services: ${validationReport.services
                            .filter(s => s.status === 'misconfigured' && !s.optional)
                            .map(s => `${s.service} (${s.reason})`)
                            .join(', ')}`;

                    logger.error(
                        { workflowId: workflow.id, validationReport },
                        errorMessage
                    );

                    throw new BadRequestError(errorMessage);
                }

                // Warn about optional services that are unavailable
                const unavailableOptionalServices = validationReport.services.filter(
                    s => s.status === 'unavailable' && s.optional
                );
                if (unavailableOptionalServices.length > 0) {
                    logger.warn(
                        { workflowId: workflow.id, unavailableServices: unavailableOptionalServices },
                        `Optional services unavailable: ${unavailableOptionalServices.map(s => s.service).join(', ')}`
                    );
                }
            } catch (error) {
                // If validation itself fails, log but don't block workflow (graceful degradation)
                logger.warn(
                    { workflowId: workflow.id, error },
                    'Service validation failed, continuing with workflow execution'
                );
            }
        }

        // Create a new run for this workflow
        logger.info(
            { workflowId: workflow.id, queryId: params.queryId, paramsKeys: Object.keys(params) },
            'Creating workflow run via RunManager.createRun()'
        );
        const run = await this.runManager.createRun('workflow', {
            workflowId: workflow.id,
            workflowName: workflow.name,
            ...params
        }, options?.createdBy);
        
        if (!run._id) {
            logger.error(
                { workflowId: workflow.id, queryId: params.queryId },
                '❌ CRITICAL: Run created but _id is missing!'
            );
            throw new ServiceUnavailableError('Failed to create run: run ID is missing', {
                workflowId: workflow.id,
                queryId: params.queryId,
                reason: 'run_creation_failed'
            });
        }
        
        const runId = run._id.toString();
        logger.info(
            { workflowId: workflow.id, runId, queryId: params.queryId },
            '✅ Workflow run created successfully'
        );

        // Cancel previous active runs for this queryId or workflowId
        // This prevents multiple concurrent runs when user starts a new run or leaves the page
        // We do this AFTER creating the new run and exclude it, to handle race conditions where
        // multiple requests might be creating runs simultaneously.
        const cancelledCount = await this.runManager.cancelPreviousActiveRuns(queryId, workflowId, run._id);
        if (cancelledCount > 0) {
            logger.info(
                { workflowId, queryId, cancelledCount, currentRunId: runId },
                `Cancelled ${cancelledCount} previous active run(s) after starting new workflow`
            );
        }

        // Use queue-based execution for better scalability and job management
        // PRD FR-1: All workflows MUST be queued - no synchronous execution fallback
        try {
            const queueService = await this.dependencies.getQueueService();

            // Queue the workflow job with the runId (queue worker will use this run)
            const job = await queueService.queueWorkflow({
                workflowId: workflow.id,
                params,
                runId, // Pass runId so queue worker uses this run instead of creating a new one
                options
            });

            // Contract compliance: Log successful queueing
            logger.info(
                { workflowId: workflow.id, runId, jobId: job.id },
                `Workflow queued for execution (contract: workflow MUST be queued) - jobId: ${job.id}, runId: ${runId}`
            );

            return runId;
        } catch (queueError) {
            // PRD FR-1: Mandatory queuing - no fallback to synchronous execution
            const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
            logger.error(
                { workflowId: workflow.id, runId, error: errorMessage },
                'Failed to queue workflow: queue service is required (PRD FR-1: mandatory queuing, no synchronous fallback)'
            );
            
            // Mark the run as failed since we cannot queue it
            await this.runManager.failRun(
                runId,
                `Workflow queue service is unavailable. All workflows must be queued for execution (PRD requirement). Error: ${errorMessage}`
            ).catch(failErr => {
                logger.error({ error: failErr, runId }, 'Failed to mark run as failed after queue error');
            });
            
            throw new ServiceUnavailableError(
                'Workflow queue service is required but unavailable. All workflows must be queued for execution (PRD requirement). Please ensure Redis is connected and the queue service is running.',
                {
                    workflowId: workflow.id,
                    runId,
                    reason: 'queue_service_unavailable',
                    originalError: errorMessage
                }
            );
        }
    }

    /**
     * Pause a running workflow
     * 
     * Standardized execution method for pausing workflows.
     * The workflow will pause at the next status check during execution.
     * 
     * @param runId - The run ID to pause
     * @returns The paused run
     * @throws Error if run not found or not in a pausable state
     */
    async pause(runId: string): Promise<Run> {
        const run = await this.runManager.getRun(runId);
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

        if (run.status !== 'running' && run.status !== 'pending') {
            throw new BadRequestError(`Cannot pause run ${runId}: status is "${run.status}", expected "running" or "pending"`);
        }

        // Update status to paused - the executeWorkflow loop will detect this
        await this.runManager.updateStatus(runId, 'paused');
        await this.runManager.log(runId, 'Workflow pauze aangevraagd', 'info');
        await this.runManager.flushLogs(runId);

        const pausedRun = await this.runManager.getRun(runId);
        if (!pausedRun) {
            throw new NotFoundError('Run', runId);
        }

        return pausedRun;
    }

    /**
     * Merge original input parameters from run.params with checkpoint context
     * This ensures critical input parameters like selectedWebsites are preserved when resuming
     * 
     * @param checkpointContext - The context restored from checkpoint
     * @param originalParams - The original params from run.params
     * @returns Merged context with original input parameters preserved
     */
    private mergeOriginalParamsWithCheckpointContext(
        checkpointContext: Record<string, unknown>,
        originalParams: Record<string, unknown>
    ): Record<string, unknown> {
        const mergedContext = { ...checkpointContext };
        const internalKeys = [
            '__latestCheckpoint',
            '__checkpointHistory',
            '__currentStepId',
            '__resumeStepId',
            '__stepCheckpoints',
            '__stepCheckpointHistory',
            'workflowId',
            'workflowName',
            'userId',
            'createdBy'
        ];
        
        // Merge original input parameters, excluding internal metadata keys
        for (const [key, value] of Object.entries(originalParams)) {
            if (!internalKeys.includes(key) && !Object.prototype.hasOwnProperty.call(mergedContext, key)) {
                mergedContext[key] = value;
            }
        }
        
        return mergedContext;
    }

    /**
     * Resume a paused workflow
     * 
     * Standardized execution method for resuming workflows.
     * The workflow will resume from the step where it was paused.
     * 
     * @param runId - The run ID to resume
     * @param workflow - The workflow definition (required to resume execution)
     * @param params - Optional updated parameters (if not provided, uses existing run params)
     * @param options - Optional execution options (reviewMode)
     * @returns The resumed run
     * @throws Error if run not found or not in a resumable state
     */
    async resume(
        runId: string,
        workflow: Workflow,
        params?: Record<string, unknown>,
        options?: { reviewMode?: boolean }
    ): Promise<Run> {
        const run = await this.runManager.getRun(runId);
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

        // Support resuming both paused and failed workflows
        if (run.status !== 'paused' && run.status !== 'failed') {
            throw new BadRequestError(`Cannot resume run ${runId}: status is "${run.status}", expected "paused" or "failed"`);
        }

        // Clear review timeout when resuming
        this.reviewTimeoutService.clearReviewTimeout(runId);

        // Resume the run using RunManager (supports both paused and failed)
        await this.runManager.resumeRun(runId);

        const resumeParams = params || run.params || {};

        // For paused workflows, use pausedState if available
        if (run.status === 'paused' && run.pausedState) {
            const pausedState = run.pausedState;
            // If pausedState exists, merge its context with params
            if (pausedState.context) {
                Object.assign(resumeParams, pausedState.context);
            }
            // Store stepId in params for restoration
            if (pausedState.stepId) {
                resumeParams.__resumeStepId = pausedState.stepId;
            }
        } else if (run.status === 'failed') {
            // For failed workflows, try to restore from checkpoint
            const latestCheckpoint = run.params?.__latestCheckpoint as {
                stepId: string;
                nextStepId?: string;
                context: Record<string, unknown>;
                checkpointedAt: string;
            } | undefined;

            if (latestCheckpoint && latestCheckpoint.context) {
                // Restore context from checkpoint and merge original input parameters
                // This ensures critical input parameters like selectedWebsites are preserved
                const originalParams = run.params || {};
                const mergedContext = this.mergeOriginalParamsWithCheckpointContext(
                    latestCheckpoint.context,
                    originalParams
                );
                Object.assign(resumeParams, mergedContext);
                // Use nextStepId if available, otherwise use stepId
                resumeParams.__resumeStepId = latestCheckpoint.nextStepId || latestCheckpoint.stepId;

                logger.info(
                    { runId, checkpointStepId: latestCheckpoint.stepId, nextStepId: latestCheckpoint.nextStepId },
                    `Resuming failed workflow from checkpoint (step: ${latestCheckpoint.stepId}, next: ${resumeParams.__resumeStepId})`
                );
            } else {
                // No checkpoint available - log warning but allow resume from beginning
                logger.warn(
                    { runId },
                    'Resuming failed workflow but no checkpoint available. Will start from beginning.'
                );
            }
        }

        // Resume execution in background
        this.executeWorkflow(workflow, resumeParams, runId, options).catch(err => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error({ error: err, workflowId: workflow.id, runId }, `Error resuming workflow ${workflow.id}`);
            this.runManager.failRun(runId, errorMessage).catch(failErr => {
                logger.error({ error: failErr, runId }, 'Failed to mark run as failed after resume error');
            });
        });

        const resumedRun = await this.runManager.getRun(runId);
        if (!resumedRun) {
            throw new NotFoundError('Run', runId);
        }

        return resumedRun;
    }

    /**
     * Retry a failed workflow
     * 
     * Standardized execution method for retrying failed workflows.
     * Creates a new run with the same parameters and workflow definition.
     * 
     * @param runId - The failed run ID to retry
     * @param workflow - The workflow definition
     * @param params - Optional updated parameters (if not provided, uses existing run params)
     * @param options - Optional execution options (reviewMode)
     * @returns The new run ID for the retry
     * @throws Error if run not found or not in a retriable state
     */
    async retry(
        runId: string,
        workflow: Workflow,
        params?: Record<string, unknown>,
        options?: { reviewMode?: boolean }
    ): Promise<string> {
        const run = await this.runManager.getRun(runId);
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

        if (run.status !== 'failed') {
            throw new BadRequestError(`Cannot retry run ${runId}: status is "${run.status}", expected "failed"`);
        }

        // Use existing params if new params not provided
        const retryParams = params || run.params || {};

        // Start a new workflow run with the same parameters
        return await this.startWorkflow(workflow, retryParams, options);
    }

    /**
     * Cancel a running or paused workflow
     * 
     * Standardized execution method for cancelling workflows.
     * The workflow will stop at the next status check during execution.
     * 
     * When cancelling a workflow that's in the queue:
     * - Updates the run status to 'cancelled'
     * - Removes the job from the Bull queue (so next waiting job can start)
     * - The workflow execution loop will detect the cancelled status and stop
     * 
     * @param runId - The run ID to cancel
     * @returns The cancelled run
     * @throws Error if run not found or not in a cancellable state
     */
    async cancel(runId: string): Promise<Run> {
        const run = await this.runManager.getRun(runId);
        if (!run) {
            throw new NotFoundError('Run', runId);
        }

        if (run.status === 'completed' || run.status === 'cancelled') {
            throw new BadRequestError(`Cannot cancel run ${runId}: status is "${run.status}", already completed or cancelled`);
        }

        // Update status to cancelled - the executeWorkflow loop will detect this
        await this.runManager.updateStatus(runId, 'cancelled');
        await this.runManager.log(runId, 'Workflow geannuleerd door gebruiker', 'warn');
        await this.runManager.flushLogs(runId);

        // Remove the job from the queue if it exists
        // This is critical: if the job remains in the queue, the next waiting job won't start
        try {
            const queueService = await this.dependencies.getQueueService();
            const jobRemoved = await queueService.removeWorkflowJobByRunId(runId);
            if (jobRemoved) {
                logger.info(
                    { runId },
                    'Removed workflow job from queue after cancellation (next waiting job will start automatically)'
                );
            } else {
                logger.debug(
                    { runId },
                    'No queue job found for runId (may have already completed or been removed)'
                );
            }
        } catch (queueError) {
            // Don't fail cancellation if queue removal fails - log and continue
            // The workflow will still be cancelled, but the queue might not update immediately
            logger.warn(
                { error: queueError, runId },
                'Failed to remove workflow job from queue after cancellation (non-fatal)'
            );
        }

        // Update progress streaming
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            progressStreamingService.cancelRun(runId);
        } catch (progressError) {
            logger.error({ error: progressError }, 'Failed to update progress streaming on cancellation');
        }

        const cancelledRun = await this.runManager.getRun(runId);
        if (!cancelledRun) {
            throw new NotFoundError('Run', runId);
        }

        return cancelledRun;
    }


    /**
     * Validate that all required actions for a workflow are registered
     * Delegates to WorkflowValidator service
     */
    private validateWorkflow(workflow: Workflow): void {
        this.validator.validateWorkflow(workflow);
    }

    /**
     * Validate external service configuration for a workflow
     */
    private async validateExternalServices(workflowId: string): Promise<void> {
        const serviceValidator = await this.dependencies.getServiceConfigurationValidator();
        const serviceValidation = serviceValidator.validateWorkflowServices(workflowId);

        if (!serviceValidation.valid) {
            const errorMessage = serviceValidation.error ||
                `Workflow "${workflowId}" requires external services that are not configured: ${serviceValidation.missingServices.map(s => s.name).join(', ')}`;

            // Log missing services for debugging
            logger.error(
                {
                    workflowId: workflowId,
                    missingServices: serviceValidation.missingServices.map(s => ({
                        name: s.name,
                        error: s.error,
                        guidance: s.guidance,
                    })),
                },
                'Workflow execution blocked: required external services not configured'
            );

            throw new ServiceUnavailableError(errorMessage, {
                workflowId: workflowId,
                missingServices: serviceValidation.missingServices,
                reason: 'required_external_services_not_configured'
            });
        }

        // Log service validation success (debug level)
        const requiredServices = serviceValidator.getRequiredServices(workflowId);
        if (requiredServices.length > 0) {
            logger.debug(
                { workflowId: workflowId, requiredServices },
                'External service configuration validated successfully'
            );
        }
    }

    /**
     * Check workflow status and handle pause/cancel
     */
    private async checkStatusAndPause(
        runId: string,
        currentStepId: string,
        context: Record<string, unknown>,
        abortController: AbortController,
        workflow: Workflow,
        phase: 'before' | 'after' = 'before'
    ): Promise<Run | null> {
        const cancelLogKey = phase === 'after'
            ? 'Workflow geannuleerd na stapuitvoering'
            : 'Workflow geannuleerd voor stapuitvoering';

        if (abortController.signal.aborted) {
            await this.runManager.log(runId, cancelLogKey, 'info');
            await this.runManager.flushLogs(runId);
            // Update progress streaming
            try {
                const progressStreamingService = await this.dependencies.getProgressStreamingService();
                progressStreamingService.cancelRun(runId);
            } catch (progressError) {
                logger.error({ error: progressError }, 'Failed to update progress streaming on cancellation');
            }
            const cancelledRun = await this.runManager.getRun(runId);
            if (!cancelledRun) {
                logger.warn({ runId }, 'Cancelled run not found - may have been deleted during cleanup');
                return null as unknown as Run;
            }
            return cancelledRun;
        }

        const status = await this.stateManager.checkWorkflowStatus(runId);
        if (status === 'cancelled') {
            try {
                const progressStreamingService = await this.dependencies.getProgressStreamingService();
                progressStreamingService.cancelRun(runId);
            } catch (progressError) {
                logger.error({ error: progressError }, 'Failed to update progress streaming on cancellation');
            }
            const cancelledRun = await this.runManager.getRun(runId);
            if (!cancelledRun) {
                logger.warn({ runId }, 'Cancelled run not found - may have been deleted during cleanup');
                return null as unknown as Run;
            }
            return cancelledRun;
        }

        if (status === 'paused') {
            const pausedRun = await this.stateManager.pauseWorkflow(runId, currentStepId, context);
            const currentStep = workflow.steps.find(s => s.id === currentStepId);
            if (currentStep?.reviewPoint) {
                const reviewTimeoutMs = currentStep.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS;
                const reviewTimeoutAction = currentStep.reviewTimeoutAction ?? 'fail';
                this.reviewTimeoutService.storeRunContext(runId, this, workflow, context);
                this.reviewTimeoutService.scheduleTimeout(
                    runId,
                    workflow.id,
                    currentStepId,
                    currentStep.name,
                    reviewTimeoutMs,
                    reviewTimeoutAction
                );
            }
            return pausedRun;
        }

        return null;
    }

    /**
     * Execute a workflow step including monitoring, logging, and error handling
     */
    private async executeStepWithMonitoring(
        runId: string,
        currentStepId: string,
        workflow: Workflow,
        context: Record<string, unknown>,
        abortController: AbortController
    ): Promise<{
        result: Record<string, unknown> | null | undefined;
        duration: number;
        skipped?: boolean;
        parallelStepResults?: Map<string, { result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null>;
    } | null> {
        const currentStep = workflow.steps.find(s => s.id === currentStepId);
        if (!currentStep) {
            const errorMsg = `Step ${currentStepId} not found in workflow ${workflow.id}. Available steps: ${workflow.steps.map(s => s.id).join(', ')}`;
            await this.runManager.log(runId, errorMsg, 'error');
            throw new NotFoundError('Workflow step', currentStepId, {
                runId,
                workflowId: workflow.id,
                availableSteps: workflow.steps.map(s => s.id),
                reason: 'step_not_found_in_workflow'
            });
        }

        // Log intent
        const stepNumber = workflow.steps.findIndex(s => s.id === currentStepId) + 1;
        const purpose = this.narrativeFormatter.inferStepPurpose(currentStep.name, currentStep.action);
        const actionDesc = currentStep.action
            ? this.narrativeFormatter.inferActionDescription(currentStep.action)
            : 'deze stap uitvoeren';

        const narrativeMessage = this.narrativeFormatter.formatStepIntent({
            stepName: currentStep.name,
            stepId: currentStepId,
            stepNumber,
            purpose,
            action: actionDesc
        });

        await this.runManager.log(runId, narrativeMessage.formattedMessage, 'info');

        // Update progress
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            const completedSteps = workflow.steps.findIndex(s => s.id === currentStepId);
            const progressPercent = Math.round((completedSteps / workflow.steps.length) * 100);
            progressStreamingService.updateProgress(runId, {
                currentStep: currentStep.name || currentStepId,
                completedSteps,
                progress: progressPercent,
            });
        } catch (progressError) {
            logger.debug({ runId, stepId: currentStepId, error: progressError }, 'Failed to update progress on step start');
        }

        // Checkpoint before execution
        try {
            await this.stateManager.checkpointWorkflowState(
                runId,
                currentStepId,
                context,
                currentStepId,
                {
                    checkpointType: 'before_execution',
                    stepName: currentStep.name
                }
            );
        } catch (checkpointError) {
            logger.warn(
                { runId, stepId: currentStepId, error: checkpointError },
                'Failed to create checkpoint before step execution'
            );
        }

        const stepExecutionStartTime = Date.now();
        let stepResult: { result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null;
        let parallelResult: { result: Record<string, unknown>; duration: number; stepResults: Map<string, { result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null> } | null = null;

        try {
            if (currentStep.parallel && currentStep.parallel.length > 0) {
                await this.runManager.log(
                    runId,
                    `Executing ${currentStep.parallel.length} parallel steps: ${currentStep.parallel.join(', ')}`,
                    'info'
                );
                parallelResult = await this.executor.executeParallelSteps(
                    workflow,
                    currentStep.parallel,
                    context,
                    runId,
                    abortController.signal
                );

                stepResult = {
                    result: parallelResult.result,
                    duration: parallelResult.duration
                };
            } else {
                stepResult = await this.executor.executeStep(
                    workflow,
                    currentStepId,
                    context,
                    runId,
                    abortController.signal
                );
            }

            const stepExecutionDuration = Date.now() - stepExecutionStartTime;
            await this.runManager.log(
                runId,
                `Step execution completed: ${currentStep.name} (${currentStepId}) in ${stepExecutionDuration}ms`,
                'debug'
            );
        } catch (stepError) {
            const stepExecutionDuration = Date.now() - stepExecutionStartTime;
            const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);
            const errorStack = stepError instanceof Error ? stepError.stack : undefined;
            const continueOnError = currentStep.continueOnError === true;

            await this.runManager.log(
                runId,
                `Step execution failed: ${currentStep.name} (${currentStepId}) after ${stepExecutionDuration}ms. Error: ${errorMessage}${continueOnError ? ' (continuing workflow due to continueOnError flag)' : ''}`,
                continueOnError ? 'warn' : 'error'
            );

            try {
                await this.stateManager.checkpointWorkflowState(
                    runId,
                    currentStepId,
                    context,
                    currentStepId,
                    {
                        error: errorMessage,
                        errorStack: errorStack?.substring(0, 1000),
                        stepDuration: stepExecutionDuration,
                        failedAt: new Date().toISOString(),
                        continueOnError: continueOnError
                    }
                );
                await this.runManager.log(runId, `Context and checkpoint saved before step failure for debugging/resume`, 'debug');
            } catch (checkpointError) {
                logger.warn({ runId, stepId: currentStepId, error: checkpointError }, 'Failed to checkpoint workflow state before step failure');
            }

            if (continueOnError) {
                if (!context[currentStepId]) {
                    context[currentStepId] = {};
                }
                const stepContext = context[currentStepId] as Record<string, unknown>;
                stepContext.error = errorMessage;
                stepContext.errorStack = errorStack?.substring(0, 1000);
                stepContext.failedAt = new Date().toISOString();
                stepContext.continueOnError = true;

                stepResult = {
                    result: null,
                    duration: stepExecutionDuration,
                    skipped: false
                };

                await this.runManager.log(
                    runId,
                    `Step ${currentStep.name} (${currentStepId}) failed but workflow continues due to continueOnError flag`,
                    'info'
                );
            } else {
                throw stepError;
            }
        }

        // Return raw result without updating context — context update is deferred
        // to after the post-step pause check so that pauseWorkflow does not persist
        // the just-completed step's result (matching original semantics).
        if (stepResult === null || stepResult === undefined) {
            return stepResult;
        }

        return {
            ...stepResult,
            parallelStepResults: parallelResult?.stepResults,
        };
    }

    /**
     * Apply step results to context, update progress, and track compensation.
     * Called after the post-step pause check so that pauseWorkflow does not
     * persist the just-completed step's result in the saved context.
     */
    private async finalizeStepExecution(
        runId: string,
        currentStepId: string,
        stepResult: {
            result: Record<string, unknown> | null | undefined;
            duration: number;
            skipped?: boolean;
            parallelStepResults?: Map<string, { result: Record<string, unknown> | null | undefined; duration: number; skipped?: boolean } | null>;
        },
        workflow: Workflow,
        context: Record<string, unknown>
    ): Promise<void> {
        const currentStep = workflow.steps.find(s => s.id === currentStepId);

        if (stepResult.parallelStepResults) {
            context[currentStepId] = stepResult.result;
            for (const [stepId, stepResultData] of stepResult.parallelStepResults.entries()) {
                if (stepResultData && stepResultData.result !== null && stepResultData.result !== undefined) {
                    context[stepId] = stepResultData.result;
                }
            }

            for (const [stepId, stepResultData] of stepResult.parallelStepResults.entries()) {
                if (stepId !== currentStepId) {
                    await this.stateManager.markStepCompleted(runId, stepId, {
                        parallelExecution: true,
                        parentStepId: currentStepId
                    });

                    if (this.compensationManager.hasCompensationAction(stepId) && stepResultData?.result) {
                        const tracker = this.compensationManager.getCompensationTracker(runId);
                        const parallelStep = workflow.steps.find(s => s.id === stepId);
                        tracker.trackStep(
                            stepId,
                            parallelStep?.action || 'unknown',
                            stepResultData.result,
                            context
                        );
                    }
                }
            }
        } else {
            this.executor.updateContext(context, currentStepId, stepResult.result, workflow);
        }

        // Update progress: step completed
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            const completedSteps = workflow.steps.findIndex(s => s.id === currentStepId) + 1;
            const progressPercent = Math.round((completedSteps / workflow.steps.length) * 100);
            progressStreamingService.updateProgress(runId, {
                currentStep: currentStep?.name || currentStepId,
                completedSteps,
                progress: progressPercent,
            });
        } catch (progressError) {
            logger.debug({ runId, stepId: currentStepId, error: progressError }, 'Failed to update progress on step completion');
        }

        // Track compensation
        if (this.compensationManager.hasCompensationAction(currentStepId)) {
            const tracker = this.compensationManager.getCompensationTracker(runId);
            tracker.trackStep(
                currentStepId,
                currentStep?.action || 'unknown',
                stepResult.result,
                context
            );
        }
    }

    /**
     * Complete workflow run initialization after state has been created.
     * State initialization (initializeState) is called separately in the caller so that
     * runId is captured immediately for proper error cleanup.
     */
    private async initializeWorkflowRun(
        workflow: Workflow,
        params: Record<string, unknown>,
        state: { runId: string; currentStepId: string | undefined; context: Record<string, unknown>; isResuming: boolean }
    ): Promise<{
        graphStatsBefore: GraphStatistics | null;
    }> {
        const { runId, context } = state;

        // Ensure workflowId is in context for actions that need it
        if (!context.workflowId) {
            context.workflowId = workflow.id;
        }

        // Initialize performance configuration in context (if not already present)
        if (!context.performanceConfig) {
            const { initializePerformanceConfigInContext } = await import('../../utils/performanceConfig.js');
            const perfConfig = initializePerformanceConfigInContext(context, params);
            logger.debug(
                { runId, workflowId: workflow.id, performanceConfig: perfConfig },
                'Performance configuration initialized in workflow context'
            );
        }

        // Capture navigation graph statistics at workflow start (if NavigationGraph is available)
        let graphStatsBefore: GraphStatistics | null = null;
        if (this.graphStatisticsService) {
            try {
                graphStatsBefore = await this.graphStatisticsService.getCurrentStatistics(
                    runId,
                    workflow.id
                );
                logger.info({
                    runId,
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    graphStats: {
                        totalNodes: graphStatsBefore.totalNodes,
                        totalEdges: graphStatsBefore.totalEdges,
                    },
                }, 'Navigation graph statistics at workflow start');
            } catch (error) {
                logger.warn(
                    { runId, workflowId: workflow.id, error },
                    'Failed to get navigation graph statistics at workflow start'
                );
            }
        }

        // Initialize progress tracking for workflow execution
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            progressStreamingService.initializeRun(runId, workflow.steps.length);
            progressStreamingService.updateProgress(runId, {
                status: 'running',
                currentStep: 'Starting workflow...',
            });
        } catch (progressError) {
            // Don't fail workflow if progress initialization fails
            logger.debug({ runId, error: progressError }, 'Failed to initialize progress tracking');
        }

        return { graphStatsBefore };
    }

    /**
     * Execute a workflow (internal or blocking)
     * Returns the run along with generated output files
     */
    async executeWorkflow(
        workflow: Workflow,
        params: Record<string, unknown>,
        existingRunId?: string,
        options?: { reviewMode?: boolean }
    ): Promise<Run> {
        // Validate workflow before execution
        this.validateWorkflow(workflow);

        // Validate external service configuration
        await this.validateExternalServices(workflow.id);

        // Get workflow timeout (default: 3 hours - increased for longer workflows)
        const DEFAULT_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        const workflowTimeout = workflow.timeout || DEFAULT_TIMEOUT_MS;

        // Validate timeout is positive
        if (workflowTimeout <= 0) {
            throw new BadRequestError(`Invalid workflow timeout: ${workflowTimeout}ms. Timeout must be a positive number.`, {
                workflowId: workflow.id,
                timeout: workflowTimeout,
                reason: 'invalid_timeout'
            });
        }

        // Capture navigation graph statistics at workflow start (if NavigationGraph is available)
        let graphStatsBefore: GraphStatistics | null = null;

        // Create AbortController for cancellation support
        const abortController = new AbortController();

        // Initialize execution monitor
        const monitor = new WorkflowExecutionMonitor(
            workflow,
            this.runManager,
            this.stateManager,
            this.timeoutEventLogger,
            this.dependencies,
            workflowTimeout
        );
        await monitor.start();

        // Declare variables that will be set in try block
        let runId: string | undefined;
        let currentStepId: string | undefined;
        let context: Record<string, unknown> | undefined;
        let isResuming: boolean;

        // Set up cancellation checking function (will be updated with runId in try block)
        let checkCancellation = async (): Promise<void> => {
            // Will be updated after runId is set
        };

        try {
            // Initialize state first so runId is captured immediately for proper cleanup
            const state = await this.stateManager.initializeState(workflow, params, existingRunId);
            runId = state.runId;
            monitor.setRunId(runId);
            currentStepId = state.currentStepId;
            context = state.context;
            isResuming = state.isResuming;

            // Complete remaining initialization (performance config, graph stats, progress tracking)
            const initResult = await this.initializeWorkflowRun(workflow, params, state);
            graphStatsBefore = initResult.graphStatsBefore;

            // Update cancellation check function with actual runId
            checkCancellation = async (): Promise<void> => {
                if (!runId) return;
                const status = await this.stateManager.checkWorkflowStatus(runId);
                if (status === 'cancelled') {
                    abortController.abort();
                }
            };

            const reviewMode = options?.reviewMode ?? false;

            // Start workflow if not resuming
            if (!isResuming) {
                await this.stateManager.startWorkflow(runId, workflow.name);
            }

            while (currentStepId) {
                // Monitor checks: timeout, infinite loops, warnings
                await monitor.checkWorkflowTimeout();
                await monitor.checkLoop(currentStepId, context);
                await monitor.checkTimeoutWarning(params.userId as string);

                // Check for cancellation and pause before step execution
                await checkCancellation();
                const statusResult = await this.checkStatusAndPause(runId, currentStepId, context, abortController, workflow);
                if (statusResult) {
                    return statusResult;
                }

                // Execute step with monitoring
                const stepResult = await this.executeStepWithMonitoring(runId, currentStepId, workflow, context, abortController);

                // Check overall workflow timeout after step execution
                await monitor.checkWorkflowTimeout();

                // Check status again after step execution
                await checkCancellation();
                const postStatusResult = await this.checkStatusAndPause(runId, currentStepId, context, abortController, workflow, 'after');
                if (postStatusResult) {
                    return postStatusResult;
                }

                // Handle skipped steps (condition evaluated to false)
                if (stepResult === null) {
                    const currentStep = workflow.steps.find(s => s.id === currentStepId);
                    // Step was skipped due to condition - move to next step (or elseNext if defined)
                    await this.runManager.log(
                        runId,
                        `Step ${currentStep?.name || currentStepId} was skipped due to condition. Moving to next step.`,
                        'info'
                    );
                    const nextStepId = this.executor.getNextStepId(workflow, currentStepId, context, true);
                    if (nextStepId === undefined) {
                        await this.runManager.log(
                            runId,
                            `No next step after skipped step ${currentStepId}. Workflow will complete.`,
                            'info'
                        );
                        currentStepId = undefined;
                        break;
                    }
                    // Check for circular reference
                    if (nextStepId === currentStepId) {
                        const errorMsg = `Circular reference detected: Skipped step ${currentStepId} points to itself as elseNext. This would cause an infinite loop.`;
                        await this.runManager.log(runId, errorMsg, 'error');
                        await this.stateManager.failWorkflow(runId, errorMsg, 'failed');
                        throw new BadRequestError(errorMsg, {
                            runId,
                            workflowId: workflow.id,
                            stepId: currentStepId,
                            reason: 'circular_reference_elseNext'
                        });
                    }
                    currentStepId = nextStepId;
                    continue;
                }

                // Safety check: if stepResult is undefined (shouldn't happen, but defensive)
                if (stepResult === undefined) {
                    await this.runManager.log(runId, `Warning: Step ${currentStepId} returned undefined result (expected null or object)`, 'warn');
                    const nextStepId = this.executor.getNextStepId(workflow, currentStepId, context, false);
                    if (!nextStepId) {
                        await this.runManager.log(runId, `Workflow ended: No next step after ${currentStepId}`, 'info');
                        currentStepId = undefined;
                        break;
                    }
                    // Check for circular reference
                    if (nextStepId === currentStepId) {
                        const errorMsg = `Circular reference detected: Step ${currentStepId} points to itself as next step. This would cause an infinite loop.`;
                        await this.runManager.log(runId, errorMsg, 'error');
                        await this.stateManager.failWorkflow(runId, errorMsg, 'failed');
                        throw new BadRequestError(errorMsg, {
                            runId,
                            workflowId: workflow.id,
                            stepId: currentStepId,
                            reason: 'circular_reference_next'
                        });
                    }
                    currentStepId = nextStepId;
                    continue;
                }

                // Apply step results to context, update progress, and track compensation.
                // This runs after the post-step pause check so that pauseWorkflow
                // does not persist the just-completed step's result.
                await this.finalizeStepExecution(runId, currentStepId, stepResult, workflow, context);

                const { result } = stepResult;

                // Check if this is a review point in review mode
                if (reviewMode) {
                    const step = workflow.steps.find(s => s.id === currentStepId);
                    if (step?.reviewPoint) {
                        await this.handleReviewPoint(runId, workflow, step, result, context);
                        await this.runManager.log(runId, `Workflow paused for review at step: ${step.name}`, 'info');
                        const pausedRun = await this.stateManager.pauseWorkflow(runId, currentStepId, context);
                        // Schedule review timeout if configured
                        const reviewTimeoutMs = step.reviewTimeout ?? DEFAULT_REVIEW_TIMEOUT_MS;
                        const reviewTimeoutAction = step.reviewTimeoutAction ?? 'fail';
                        // Store workflow context for timeout handler
                        this.reviewTimeoutService.storeRunContext(runId, this, workflow, context);
                        this.reviewTimeoutService.scheduleTimeout(
                            runId,
                            workflow.id,
                            currentStepId,
                            step.name,
                            reviewTimeoutMs,
                            reviewTimeoutAction
                        );
                        return pausedRun;
                    }
                }

                // Move to next step using WorkflowExecutor (with context for conditional branching)
                const nextStepId = this.executor.getNextStepId(workflow, currentStepId, context, false);

                // Create robust checkpoint after step completion (includes step completion + full context)
                // This ensures we can resume from this exact point if workflow fails later
                try {
                    await this.stateManager.checkpointWorkflowState(
                        runId,
                        currentStepId,
                        context,
                        nextStepId,
                        {
                            duration: stepResult.duration,
                            skipped: stepResult.skipped || false,
                            stepName: workflow.steps.find(s => s.id === currentStepId)?.name
                        }
                    );
                } catch (checkpointError) {
                    // Log checkpoint error but don't fail workflow - checkpointing is for resilience
                    // If checkpointing fails, we still have markStepCompleted data for basic resume
                    logger.warn(
                        { runId, stepId: currentStepId, error: checkpointError },
                        'Failed to create workflow checkpoint (workflow will continue, but resume may be limited)'
                    );
                }

                if (nextStepId === undefined) {
                    // No next step - workflow should complete
                    const currentStep = workflow.steps.find(s => s.id === currentStepId);
                    if (currentStep) {
                        await this.runManager.log(
                            runId,
                            `Workflow reached terminal step: ${currentStep.name} (${currentStepId}). No next step defined.`,
                            'info'
                        );
                    } else {
                        await this.runManager.log(
                            runId,
                            `Workflow reached end at step ${currentStepId}. No next step defined.`,
                            'info'
                        );
                    }
                    currentStepId = undefined;
                    break;
                }

                // Validate that next step exists in workflow
                const nextStep = workflow.steps.find(s => s.id === nextStepId);
                if (!nextStep) {
                    const errorMsg = `Next step ${nextStepId} not found in workflow ${workflow.id}. Available steps: ${workflow.steps.map(s => s.id).join(', ')}`;
                    await this.runManager.log(runId, errorMsg, 'error');
                    throw new NotFoundError('Workflow step', nextStepId, {
                        runId,
                        workflowId: workflow.id,
                        currentStepId,
                        availableSteps: workflow.steps.map(s => s.id),
                        reason: 'next_step_not_found_in_workflow'
                    });
                }

                await this.runManager.log(
                    runId,
                    `Moving to next step: ${nextStep.name} (${nextStepId})`,
                    'debug'
                );

                currentStepId = nextStepId;
            }

            return await this.handleWorkflowCompletion(
                runId,
                workflow,
                context!,
                graphStatsBefore,
                monitor
            );

        } catch (error) {
            return await this.handleWorkflowFailure(
                error,
                runId,
                workflow,
                context,
                currentStepId,
                params,
                monitor
            );
        }
    }

    /**
     * Handle workflow completion
     */
    private async handleWorkflowCompletion(
        runId: string,
        workflow: Workflow,
        context: Record<string, unknown>,
        graphStatsBefore: GraphStatistics | null,
        monitor?: WorkflowExecutionMonitor
    ): Promise<Run> {
        // Workflow completed successfully - generate output files
        await this.runManager.log(runId, 'Alle workflowstappen succesvol voltooid. Workflow afronden...', 'info');
        const completedRun = await this.stateManager.completeWorkflow(runId, context);

        // Track navigation graph statistics at workflow completion (if GraphStatisticsService is available)
        if (this.graphStatisticsService && graphStatsBefore) {
            try {
                const statsAfter = await this.graphStatisticsService.getCurrentStatistics(
                    runId,
                    workflow.id
                );

                // Track graph growth with anomaly detection
                await this.graphStatisticsService.trackWorkflowGraphGrowth(
                    runId,
                    workflow.id,
                    graphStatsBefore,
                    statsAfter
                );
            } catch (error) {
                // Don't fail workflow if statistics tracking fails
                logger.warn(
                    { runId, workflowId: workflow.id, error },
                    'Failed to track navigation graph statistics at workflow completion'
                );
            }
        }

        // Clear compensation tracker (no compensation needed for successful workflows)
        this.compensationManager.clearCompensationTracker(runId);

        // Record workflow metrics via monitor
        if (monitor) {
            await monitor.recordCompletion(context);
        }

        if (completedRun) {
            try {
                await this.generateWorkflowOutput(completedRun, context);
            } catch (outputError) {
                // Log but don't fail the workflow if output generation fails
                logger.error({ error: outputError, runId }, 'Failed to generate workflow output');
                await this.runManager.log(runId, `Warning: Failed to generate output files: ${outputError}`, 'warn');
            }

            // Create notification for workflow completion (if userId is available)
            try {
                const userId = completedRun.params?.userId as string | undefined;
                if (userId) {
                    const notificationService = await this.dependencies.getNotificationService();
                    const workflowName = completedRun.params?.workflowName as string || workflow.name;
                    const workflowId = completedRun.params?.workflowId as string || workflow.id;
                    await notificationService.createWorkflowCompleteNotification(
                        userId,
                        workflowName,
                        runId,
                        workflowId
                    );
                }
            } catch (notificationError) {
                // Don't fail workflow if notification creation fails
                logger.error({ error: notificationError, runId }, 'Failed to create workflow completion notification');
            }

            // Store workflow execution history (non-blocking)
            try {
                const historyService = await this.dependencies.getHistoryService();
                await historyService.createHistoryFromRun(
                    completedRun,
                    workflow.id,
                    workflow.name
                );
            } catch (historyError) {
                // Don't fail workflow if history storage fails
                logger.error({ error: historyError, runId, workflowId: workflow.id }, 'Failed to store workflow execution history');
            }
        }

        return completedRun || (await this.runManager.getRun(runId))!;
    }

    /**
     * Handle workflow failure
     */
    private async handleWorkflowFailure(
        error: unknown,
        runId: string | undefined,
        workflow: Workflow,
        context: Record<string, unknown> | undefined,
        currentStepId: string | undefined,
        params: Record<string, unknown>,
        monitor?: WorkflowExecutionMonitor
    ): Promise<Run> {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        let failedRun: Run | null = null;

        // Ensure runId is available (might be missing if initialization failed)
        if (!runId) {
            logger.error({ workflowId: workflow.id, error, errorStack }, 'Workflow execution failed before run initialization');
            // Try to create a run for error tracking even if initialization failed
            try {
                const createdBy = (params?.createdBy as string | undefined) || (params?.userId as string | undefined);
                const emergencyRun = await this.runManager.createRun('workflow', {
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    ...params,
                    __initializationFailed: true,
                    __error: errorMessage,
                    __errorStack: errorStack?.substring(0, 2000)
                }, createdBy);
                if (emergencyRun._id) {
                    runId = emergencyRun._id.toString();
                    await this.runManager.failRun(runId, `Initialization failed: ${errorMessage}`);
                    logger.info({ runId, workflowId: workflow.id }, 'Created emergency run for initialization failure tracking');
                }
            } catch (emergencyError) {
                logger.error({ workflowId: workflow.id, error: emergencyError }, 'Failed to create emergency run for initialization failure');
            }
            throw error;
        }

        // Always attempt to save context and checkpoint before handling error
        // Even with partial context, this ensures we can resume from the last known state
        if (runId) {
            try {
                // Try to get currentStepId from various sources
                let checkpointStepId = currentStepId;
                let checkpointContext = context;

                // If currentStepId is not available, try to get it from run params
                if (!checkpointStepId) {
                    try {
                        const run = await this.runManager.getRun(runId);
                        if (run) {
                            // Try to get from latest checkpoint
                            const latestCheckpoint = run.params?.__latestCheckpoint as {
                                stepId?: string;
                                nextStepId?: string;
                                context?: Record<string, unknown>;
                            } | undefined;
                            checkpointStepId = latestCheckpoint?.nextStepId || latestCheckpoint?.stepId;

                            // Try to get context from run params or latest checkpoint
                            if (!checkpointContext && run.params) {
                                const checkpointCtx = latestCheckpoint?.context as Record<string, unknown> | undefined;
                                checkpointContext = checkpointCtx || (run.params as Record<string, unknown>);
                            }
                        }
                    } catch (runError) {
                        logger.debug({ runId, error: runError }, 'Failed to get run for checkpoint recovery');
                    }
                }

                // If still no stepId, use first step of workflow as fallback
                if (!checkpointStepId && workflow.steps.length > 0) {
                    checkpointStepId = workflow.steps[0].id;
                }

                // Ensure we have at least an empty context
                if (!checkpointContext) {
                    checkpointContext = { ...params };
                }

                // Create checkpoint with available data (even if partial)
                if (checkpointStepId) {
                    // Get duration from monitor if available
                    const workflowDurationMs = monitor ? monitor.getDuration() : undefined;

                    await this.stateManager.checkpointWorkflowState(
                        runId,
                        checkpointStepId,
                        checkpointContext,
                        checkpointStepId, // Stay on same step (error occurred)
                        {
                            error: errorMessage,
                            errorStack: errorStack?.substring(0, 1000),
                            failedAt: new Date().toISOString(),
                            workflowDuration: workflowDurationMs,
                            partialContext: !context || !currentStepId, // Mark if context is partial
                            recoveredFromRun: !currentStepId // Mark if we recovered stepId from run
                        }
                    );
                    logger.debug(
                        { runId, stepId: checkpointStepId, partialContext: !context || !currentStepId },
                        'Context and checkpoint saved before error handling'
                    );
                } else {
                    logger.warn({ runId }, 'Cannot create checkpoint: no stepId available');
                }
            } catch (checkpointError) {
                // Log but don't fail - checkpointing is for resilience
                logger.warn(
                    { runId, stepId: currentStepId, error: checkpointError },
                    'Failed to checkpoint workflow state before error handling'
                );
            }
        }

        // Check if error is from cancellation (AbortError)
        if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Workflow cancelled')) {
            await this.runManager.log(runId, 'Workflow geannuleerd tijdens uitvoering (AbortError)', 'info');
            await this.runManager.flushLogs(runId);

            if (monitor) {
                await monitor.recordCancellation();
            }

            const cancelledRun = await this.runManager.getRun(runId);
            if (!cancelledRun) {
                logger.warn({ runId }, 'Cancelled run not found - may have been deleted during cleanup');
                return null as unknown as Run;
            }

            // Store workflow execution history for cancelled runs (non-blocking)
            try {
                const historyService = await this.dependencies.getHistoryService();
                await historyService.createHistoryFromRun(
                    cancelledRun,
                    workflow.id,
                    workflow.name
                );
            } catch (historyError) {
                // Don't fail workflow if history storage fails
                logger.error({ error: historyError, runId, workflowId: workflow.id }, 'Failed to store workflow execution history');
            }

            return cancelledRun;
        }

        // Check if error is a timeout error (workflow-level or step-level)
        const isWorkflowTimeoutError = errorMessage.includes('exceeded maximum execution time') ||
            (error instanceof Error && error.name === 'WorkflowTimeoutError');
        const isStepTimeoutError = errorMessage.includes('timed out') ||
            (error instanceof Error && error.name === 'StepTimeoutError');
        const isStuckError = errorMessage.includes('Workflow stuck');
        const isTimeoutError = isWorkflowTimeoutError || isStepTimeoutError || isStuckError;

        // Execute compensation for tracked steps before marking workflow as failed
        try {
            const tracker = this.compensationManager.getCompensationTracker(runId);
            const summary = tracker.getSummary();
            if (summary.uncompensated > 0) {
                logger.info(
                    { runId, uncompensatedSteps: summary.uncompensated },
                    'Executing compensation for failed workflow steps'
                );
                await tracker.compensateAll(this.compensationManager.getCompensationActions());
                const finalSummary = tracker.getSummary();
                logger.info(
                    { runId, ...finalSummary },
                    'Compensation execution completed'
                );
            }
        } catch (compensationError) {
            // Log compensation errors but don't block workflow failure handling
            const compensationErrorMessage = compensationError instanceof Error ? compensationError.message : String(compensationError);
            logger.error(
                { error: compensationError, runId },
                `Compensation execution failed: ${compensationErrorMessage}`
            );
        }

        try {
            // Use timeout status if it's a timeout error, otherwise use failed
            if (isTimeoutError) {
                // Update run status to 'timeout' for timeout errors
                failedRun = await this.stateManager.failWorkflow(runId, errorMessage, 'timeout');
            } else {
                failedRun = await this.stateManager.failWorkflow(runId, errorMessage);
            }
        } catch (failError) {
            // If we can't mark the run as failed, log it but don't throw
            const failErrorMessage = failError instanceof Error ? failError.message : String(failError);
            logger.error({ error: failError, runId }, `Failed to mark run as failed: ${failErrorMessage}`);
            // Try to get the run anyway
            try {
                failedRun = await this.runManager.getRun(runId);
            } catch (getRunError) {
                logger.error({ error: getRunError, runId }, 'Failed to get run after failure');
            }
        }

        // Record metrics via monitor (after state is persisted)
        if (monitor) {
            await monitor.recordFailure(error, context);
        }

        // Still try to generate output for failed runs (for debugging)
        if (failedRun && context) {
            try {
                await this.generateWorkflowOutput(failedRun, context);
            } catch (outputError) {
                logger.error({ error: outputError, runId }, 'Failed to generate workflow output for failed run');
            }

            // Create notification for workflow failure (if userId is available)
            try {
                const userId = failedRun.params?.userId as string | undefined;
                if (userId) {
                    const notificationService = await this.dependencies.getNotificationService();
                    const workflowName = failedRun.params?.workflowName as string || workflow.name;
                    const workflowId = failedRun.params?.workflowId as string || workflow.id;
                    await notificationService.createWorkflowFailureNotification(
                        userId,
                        workflowName,
                        runId,
                        errorMessage,
                        workflowId
                    );
                }
            } catch (notificationError) {
                // Don't fail workflow if notification creation fails
                logger.error({ error: notificationError, runId }, 'Failed to create workflow failure notification');
            }

            // Store workflow execution history for failed runs (non-blocking)
            try {
                const historyService = await this.dependencies.getHistoryService();
                await historyService.createHistoryFromRun(
                    failedRun,
                    workflow.id,
                    workflow.name
                );
            } catch (historyError) {
                // Don't fail workflow if history storage fails
                logger.error({ error: historyError, runId, workflowId: workflow.id }, 'Failed to store workflow execution history');
            }
        }

        // Return failed run if available, otherwise throw the original error
        if (failedRun) {
            return failedRun;
        } else {
            // If we couldn't get the run, re-throw the original error
            throw error;
        }
    }

    /**
     * Handle a review point: extract candidate results and create a review
     */
    private async handleReviewPoint(
        runId: string,
        workflow: Workflow,
        step: { id: string; name: string; action: string },
        stepResult: Record<string, unknown> | null | undefined,
        context: Record<string, unknown>
    ): Promise<void> {
        await this.reviewHandler.handleReviewPoint(runId, workflow, step, stepResult, context, this);
    }

    /**
     * Generate workflow output files and update the run with output paths
     */
    private async generateWorkflowOutput(run: Run, context: Record<string, unknown>): Promise<void> {
        const outputService = await this.dependencies.getWorkflowOutputService();
        const { jsonPath, markdownPath, txtPath, csvPath, htmlPath, xmlPath } = await outputService.generateOutput(run, context);

        // Store all output format paths in the run result
        await this.runManager.updateOutputPaths(run._id!.toString(), {
            jsonPath,
            markdownPath,
            txtPath,
            csvPath,
            htmlPath,
            xmlPath
        });

        await this.runManager.log(
            run._id!.toString(),
            `📄 Output files generated: JSON=${jsonPath}, MD=${markdownPath}, TXT=${txtPath}, CSV=${csvPath}, HTML=${htmlPath}, XML=${xmlPath}`,
            'info'
        );
    }

    /**
     * Navigate to next step
     * 
     * Moves the workflow to the next step in sequence, validating prerequisites
     * and updating navigation history.
     * 
     * @param runId - The run ID
     * @param workflow - The workflow definition
     * @returns The updated run
     * @throws Error if navigation is invalid or next step doesn't exist
     */
    async goNext(runId: string, workflow: Workflow): Promise<Run> {
        return await this.navigationService.goNext(runId, workflow);
    }

    /**
     * Navigate to previous step
     * 
     * Moves the workflow back to the previous step, using navigation history.
     * 
     * @param runId - The run ID
     * @param workflow - The workflow definition
     * @returns The updated run
     * @throws Error if navigation is invalid or cannot go back
     */
    async goBack(runId: string, workflow: Workflow): Promise<Run> {
        return await this.navigationService.goBack(runId, workflow);
    }

    /**
     * Jump to specific step
     * 
     * Jumps directly to a target step, validating prerequisites and navigation rules.
     * 
     * @param runId - The run ID
     * @param workflow - The workflow definition
     * @param targetStepId - The target step ID to jump to
     * @returns The updated run
     * @throws Error if navigation is invalid or target step doesn't exist
     */
    async jumpToStep(runId: string, workflow: Workflow, targetStepId: string): Promise<Run> {
        return await this.navigationService.jumpToStep(runId, workflow, targetStepId);
    }

    /**
     * Validate step navigation
     * 
     * Validates that navigation from one step to another is allowed,
     * checking prerequisites and navigation rules.
     * 
     * @param runId - The run ID
     * @param workflow - The workflow definition
     * @param fromStepId - The source step ID
     * @param toStepId - The target step ID
     * @returns Validation result with valid flag and optional reason
     */
    async validateStepNavigation(
        runId: string,
        workflow: Workflow,
        fromStepId: string,
        toStepId: string
    ): Promise<{ valid: boolean; reason?: string }> {
        return await this.navigationService.validateStepNavigation(runId, workflow, fromStepId, toStepId);
    }

    /**
     * Register a compensation action for a workflow step
     * 
     * @param stepId - The step ID that needs compensation
     * @param compensationAction - The compensation action to execute on failure
     */
    registerCompensationAction(stepId: string, compensationAction: CompensationAction): void {
        this.compensationManager.registerCompensationAction(stepId, compensationAction);
    }
}
