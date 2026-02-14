import { IRunManager } from './interfaces/IRunManager.js';
import { Workflow } from '../infrastructure/types.js';
import { WorkflowStateManager } from './WorkflowStateManager.js';
import { TimeoutEventLogger } from './TimeoutEventLogger.js';
import { WorkflowDependencies } from './WorkflowDependencies.js';
import { logger } from '../../utils/logger.js';
import { ServiceUnavailableError } from '../../types/errors.js';
import {
    workflowExecutionsTotal,
    workflowDuration,
    activeWorkflows,
    workflowErrorsTotal,
    workflowResourceUsage,
} from '../../utils/metrics.js';

/**
 * WorkflowExecutionMonitor Service
 *
 * Responsible for monitoring workflow execution including:
 * - Workflow timeouts
 * - Loop detection
 * - Metrics recording (start, completion, failure, cancellation)
 * - Progress streaming updates
 */
export class WorkflowExecutionMonitor {
    private workflowStartTime: number;
    private lastStepId?: string;
    private consecutiveStepExecutions: number = 0;
    private timeoutWarningLogged: boolean = false;
    private workflowStartMemory: number;
    private readonly MAX_STEP_EXECUTIONS = 100;
    private readonly STUCK_DETECTION_THRESHOLD = 10;
    private runId?: string;

    constructor(
        private workflow: Workflow,
        private runManager: IRunManager,
        private stateManager: WorkflowStateManager,
        private timeoutEventLogger: TimeoutEventLogger,
        private dependencies: WorkflowDependencies,
        private workflowTimeout: number
    ) {
        this.workflowStartTime = Date.now();
        this.workflowStartMemory = process.memoryUsage().heapUsed;
    }

    /**
     * Set the Run ID for the current execution
     * Should be called as soon as runId is established
     */
    setRunId(runId: string): void {
        this.runId = runId;
    }

    /**
     * Get the current duration of the workflow execution in milliseconds
     */
    getDuration(): number {
        return Date.now() - this.workflowStartTime;
    }

    /**
     * Record workflow start metrics
     */
    async start(): Promise<void> {
        activeWorkflows.inc({ workflow_id: this.workflow.id });
    }

    /**
     * Check if workflow execution has exceeded timeout
     */
    async checkWorkflowTimeout(): Promise<void> {
        if (!this.runId) return;

        const elapsedTime = Date.now() - this.workflowStartTime;
        if (elapsedTime > this.workflowTimeout) {
            const percentageUsed = (elapsedTime / this.workflowTimeout) * 100;
            await this.timeoutEventLogger.logTimeoutEvent({
                type: 'workflow_timeout',
                runId: this.runId,
                workflowId: this.workflow.id,
                workflowName: this.workflow.name,
                timeoutMs: this.workflowTimeout,
                elapsedMs: elapsedTime,
                percentageUsed,
                timestamp: new Date(),
            });
            // Create a timeout-specific error using TimeoutErrorFormatter
            const formatter = await this.dependencies.getTimeoutErrorFormatter();
            const formattedError = formatter.formatError({
                type: 'workflow',
                workflowId: this.workflow.id,
                workflowName: this.workflow.name,
                timeoutMs: this.workflowTimeout,
                elapsedMs: elapsedTime,
                percentageUsed,
                runId: this.runId,
            });

            const timeoutError = new Error(formattedError.message);
            timeoutError.name = 'WorkflowTimeoutError';
            // Attach suggestions and metadata to error for frontend use
            (timeoutError as Error & { suggestions?: string[]; metadata?: unknown }).suggestions = formattedError.suggestions;
            (timeoutError as Error & { suggestions?: string[]; metadata?: unknown }).metadata = formattedError.metadata;
            throw timeoutError;
        }
    }

    /**
     * Check for infinite loops (stuck workflow)
     */
    async checkLoop(currentStepId: string, context: Record<string, unknown>): Promise<void> {
        if (!this.runId) return;

        if (currentStepId === this.lastStepId) {
            this.consecutiveStepExecutions++;
        } else {
            this.consecutiveStepExecutions = 1;
            this.lastStepId = currentStepId;
        }

        if (this.consecutiveStepExecutions > this.MAX_STEP_EXECUTIONS) {
            const errorMsg = `Workflow stuck: Step ${currentStepId} has been executed ${this.consecutiveStepExecutions} times consecutively. Possible infinite loop detected.`;
            await this.runManager.log(this.runId, errorMsg, 'error');

            // Save context before failing to allow debugging
            try {
                await this.stateManager.checkpointWorkflowState(
                    this.runId,
                    currentStepId,
                    context,
                    currentStepId,
                    {
                        error: errorMsg,
                        consecutiveExecutions: this.consecutiveStepExecutions
                    }
                );
            } catch (checkpointError) {
                logger.warn({ runId: this.runId, error: checkpointError }, 'Failed to checkpoint before failing stuck workflow');
            }

            throw new ServiceUnavailableError(errorMsg, {
                runId: this.runId,
                workflowId: this.workflow.id,
                currentStepId,
                consecutiveExecutions: this.consecutiveStepExecutions,
                reason: 'workflow_stuck_timeout'
            });
        }

        if (this.consecutiveStepExecutions >= this.STUCK_DETECTION_THRESHOLD) {
            await this.runManager.log(
                this.runId,
                `⚠️ Warning: Step ${currentStepId} has been executed ${this.consecutiveStepExecutions} times consecutively. Possible circular reference or stuck workflow.`,
                'warn'
            );
        }
    }

    /**
     * Check and log timeout warning if threshold reached
     */
    async checkTimeoutWarning(userId?: string): Promise<void> {
        if (!this.runId) return;

        const elapsedTime = Date.now() - this.workflowStartTime;
        const timeoutWarningThreshold = this.workflowTimeout * 0.8;

        if (!this.timeoutWarningLogged && elapsedTime > timeoutWarningThreshold) {
            const percentageUsed = (elapsedTime / this.workflowTimeout) * 100;
            await this.timeoutEventLogger.logTimeoutWarning({
                type: 'workflow_timeout',
                runId: this.runId,
                workflowId: this.workflow.id,
                workflowName: this.workflow.name,
                timeoutMs: this.workflowTimeout,
                elapsedMs: elapsedTime,
                percentageUsed,
                warningThreshold: timeoutWarningThreshold,
                timestamp: new Date(),
            });

            // Trigger timeout warning alert
            const alertService = await this.dependencies.getAlertService();
            await alertService.checkTimeoutWarning(
                this.runId,
                this.workflow.id,
                this.workflow.name,
                elapsedTime,
                this.workflowTimeout,
                undefined,
                undefined,
                userId
            );

            this.timeoutWarningLogged = true;
        }
    }

    /**
     * Record workflow completion metrics
     */
    async recordCompletion(_context: Record<string, unknown>): Promise<void> {
        if (!this.runId) return;

        const workflowDurationMs = Date.now() - this.workflowStartTime;
        const workflowDurationSeconds = workflowDurationMs / 1000;

        const metricsService = await this.dependencies.getMetricsService();
        metricsService.recordExecutionAsync({
            workflowId: this.workflow.id,
            workflowName: this.workflow.name,
            duration: workflowDurationMs,
            status: 'completed',
            metadata: {
                runId: this.runId,
                stepCount: this.workflow.steps.length,
            },
        });

        workflowExecutionsTotal.inc({ workflow_id: this.workflow.id, status: 'success' });
        workflowDuration.observe({ workflow_id: this.workflow.id }, workflowDurationSeconds);
        activeWorkflows.dec({ workflow_id: this.workflow.id });

        const workflowEndMemory = process.memoryUsage().heapUsed;
        const memoryDelta = workflowEndMemory - this.workflowStartMemory;
        workflowResourceUsage.set({ workflow_id: this.workflow.id, resource_type: 'memory_bytes' }, memoryDelta);

        // Progress update
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            progressStreamingService.completeRun(this.runId);
        } catch (progressError) {
            logger.error({ error: progressError, runId: this.runId }, 'Failed to update progress streaming on completion');
        }
    }

    /**
     * Record workflow failure metrics
     */
    async recordFailure(error: unknown, _context?: Record<string, unknown>): Promise<void> {
        if (!this.runId) return;

        const errorMessage = error instanceof Error ? error.message : String(error);
        const workflowDurationMs = Date.now() - this.workflowStartTime;
        const workflowDurationSeconds = workflowDurationMs / 1000;

        const isWorkflowTimeoutError = errorMessage.includes('exceeded maximum execution time') ||
            (error instanceof Error && error.name === 'WorkflowTimeoutError');
        const isStepTimeoutError = errorMessage.includes('timed out') ||
            (error instanceof Error && error.name === 'StepTimeoutError');
        const isStuckError = errorMessage.includes('Workflow stuck');
        const isTimeoutError = isWorkflowTimeoutError || isStepTimeoutError || isStuckError;

        let errorType = 'unknown';
        if (isTimeoutError) {
            errorType = 'timeout';
        } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
            errorType = 'validation';
        } else if (errorMessage.includes('service') || errorMessage.includes('API') || errorMessage.includes('external')) {
            errorType = 'external_service';
        } else if (errorMessage.includes('execution') || errorMessage.includes('execute')) {
            errorType = 'execution';
        }

        if (isTimeoutError) {
            if (isWorkflowTimeoutError) {
                const timeoutPercentage = Math.round((workflowDurationMs / this.workflowTimeout) * 100);
                await this.runManager.log(
                    this.runId,
                    `Workflow timeout after ${workflowDurationMs}ms (${timeoutPercentage}% of ${this.workflowTimeout}ms limit). Workflow: ${this.workflow.name} (${this.workflow.id})`,
                    'error'
                );
            } else if (isStepTimeoutError) {
                await this.runManager.log(
                    this.runId,
                    `Step timeout in workflow ${this.workflow.name} (${this.workflow.id}): ${errorMessage}`,
                    'error'
                );
            }
        }

        const finalStatus = isTimeoutError ? 'timeout' : 'failed';
        workflowExecutionsTotal.inc({ workflow_id: this.workflow.id, status: finalStatus });
        workflowDuration.observe({ workflow_id: this.workflow.id }, workflowDurationSeconds);
        workflowErrorsTotal.inc({ workflow_id: this.workflow.id, error_type: errorType });
        activeWorkflows.dec({ workflow_id: this.workflow.id });

        const workflowEndMemory = process.memoryUsage().heapUsed;
        const memoryDelta = workflowEndMemory - this.workflowStartMemory;
        workflowResourceUsage.set({ workflow_id: this.workflow.id, resource_type: 'memory_bytes' }, memoryDelta);

        // Progress update
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            progressStreamingService.failRun(this.runId, errorMessage);
        } catch (progressError) {
            logger.error({ error: progressError, runId: this.runId }, 'Failed to update progress streaming on failure');
        }
    }

    /**
     * Record workflow cancellation metrics
     */
    async recordCancellation(): Promise<void> {
        if (!this.runId) return;

        const workflowDurationMs = Date.now() - this.workflowStartTime;
        const workflowDurationSeconds = workflowDurationMs / 1000;

        const metricsService = await this.dependencies.getMetricsService();
        metricsService.recordExecutionAsync({
            workflowId: this.workflow.id,
            workflowName: this.workflow.name,
            duration: workflowDurationMs,
            status: 'cancelled',
            metadata: {
                runId: this.runId,
            },
        });

        workflowExecutionsTotal.inc({ workflow_id: this.workflow.id, status: 'cancelled' });
        workflowDuration.observe({ workflow_id: this.workflow.id }, workflowDurationSeconds);
        activeWorkflows.dec({ workflow_id: this.workflow.id });

        // Progress update
        try {
            const progressStreamingService = await this.dependencies.getProgressStreamingService();
            progressStreamingService.cancelRun(this.runId);
        } catch (progressError) {
            logger.error({ error: progressError }, 'Failed to update progress streaming on cancellation');
        }
    }
}
