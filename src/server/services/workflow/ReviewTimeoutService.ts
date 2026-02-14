import { logger } from '../../utils/logger.js';
import { RunManager } from './RunManager.js';
import { IRunManager } from './interfaces/IRunManager.js';
import { Workflow } from '../infrastructure/types.js';
import { TimeoutEventLogger } from './TimeoutEventLogger.js';

// Forward declaration to avoid circular dependency
type WorkflowEngineResume = (runId: string, workflow: Workflow, params?: Record<string, unknown>, options?: { reviewMode?: boolean }) => Promise<unknown>;

/**
 * Default review timeout: 7 days
 */
export const DEFAULT_REVIEW_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Service to manage review timeouts for workflows
 * 
 * When a workflow pauses for review, this service schedules a timeout.
 * If the review is not completed within the timeout period, the workflow
 * will either auto-resume or fail based on the configured action.
 */
export class ReviewTimeoutService {
    private timeouts: Map<string, NodeJS.Timeout> = new Map();
    private runManager: IRunManager;
    private timeoutEventLogger: TimeoutEventLogger;
    // Store workflow engine reference and context for each run
    private runContexts: Map<string, {
        workflowEngine: { resume: WorkflowEngineResume };
        workflow: Workflow;
        context: Record<string, unknown>;
    }> = new Map();

    constructor(runManager: IRunManager) {
        this.runManager = runManager;
        this.timeoutEventLogger = new TimeoutEventLogger(runManager);
    }

    /**
     * Schedule a review timeout for a workflow run (simplified interface for WorkflowEngine)
     * 
     * @param runId - The run ID
     * @param workflowId - The workflow ID
     * @param stepId - The step ID where review is paused
     * @param stepName - The step name
     * @param timeoutMs - Timeout in milliseconds
     * @param timeoutAction - Action to take when timeout expires ('resume' or 'fail')
     */
    scheduleTimeout(
        runId: string,
        workflowId: string,
        stepId: string,
        stepName: string,
        timeoutMs: number,
        timeoutAction: 'resume' | 'fail'
    ): void {
        // This method is called from WorkflowEngine, but we need workflow and context
        // We'll retrieve them when the timeout fires
        // For now, we'll schedule the timeout and handle it when it fires
        this.scheduleReviewTimeoutInternal(runId, stepId, timeoutMs, timeoutAction);
    }

    /**
     * Store workflow context for a run (called before scheduling timeout)
     * 
     * @param runId - The run ID
     * @param workflowEngine - WorkflowEngine instance (with resume method)
     * @param workflow - Workflow definition
     * @param context - Workflow context
     */
    storeRunContext(
        runId: string,
        workflowEngine: { resume: WorkflowEngineResume },
        workflow: Workflow,
        context: Record<string, unknown>
    ): void {
        this.runContexts.set(runId, { workflowEngine, workflow, context });
    }

    /**
     * Internal method to schedule review timeout
     * 
     * @param runId - The run ID
     * @param stepId - The step ID where review is paused
     * @param timeoutMs - Timeout in milliseconds
     * @param timeoutAction - Action to take when timeout expires ('resume' or 'fail')
     */
    private scheduleReviewTimeoutInternal(
        runId: string,
        stepId: string,
        timeoutMs: number,
        timeoutAction: 'resume' | 'fail'
    ): void {
        // Clear existing timeout if any
        this.clearReviewTimeout(runId);

        // Validate timeout is positive
        if (timeoutMs <= 0) {
            throw new Error(`Invalid review timeout: ${timeoutMs}ms. Timeout must be a positive number.`);
        }

        const timeout = setTimeout(async () => {
            try {
                const run = await this.runManager.getRun(runId);
                if (!run || run.status !== 'paused') {
                    // Workflow is no longer paused, ignore timeout
                    logger.debug({ runId }, 'Review timeout expired but workflow is no longer paused, ignoring');
                    return;
                }

                const timeoutSeconds = Math.floor(timeoutMs / 1000);
                const timeoutMinutes = Math.floor(timeoutSeconds / 60);
                const timeoutHours = Math.floor(timeoutMinutes / 60);
                const timeoutDays = Math.floor(timeoutHours / 24);

                let timeoutMessage = `Review timeout exceeded after `;
                if (timeoutDays > 0) {
                    timeoutMessage += `${timeoutDays} day${timeoutDays > 1 ? 's' : ''}`;
                } else if (timeoutHours > 0) {
                    timeoutMessage += `${timeoutHours} hour${timeoutHours > 1 ? 's' : ''}`;
                } else if (timeoutMinutes > 0) {
                    timeoutMessage += `${timeoutMinutes} minute${timeoutMinutes > 1 ? 's' : ''}`;
                } else {
                    timeoutMessage += `${timeoutSeconds} second${timeoutSeconds > 1 ? 's' : ''}`;
                }
                timeoutMessage += `. Action: ${timeoutAction}`;

                // Get stored workflow context
                const runContext = this.runContexts.get(runId);
                
                // Log timeout event using TimeoutEventLogger
                const percentageUsed = 100; // Review timeout has expired
                await this.timeoutEventLogger.logTimeoutEvent({
                    type: 'review_timeout',
                    runId,
                    workflowId: runContext?.workflow.id,
                    workflowName: runContext?.workflow.name,
                    stepId,
                    timeoutMs,
                    elapsedMs: timeoutMs, // Review timeout has fully elapsed
                    percentageUsed,
                    timestamp: new Date(),
                    metadata: {
                        timeoutAction: timeoutAction,
                    },
                });
                if (!runContext) {
                    logger.warn({ runId }, 'Review timeout expired but no workflow context found, failing workflow');
                    await this.runManager.failRun(
                        runId,
                        `Review timeout exceeded after ${timeoutMs}ms (no workflow context)`
                    );
                    return;
                }

                const { workflowEngine, workflow, context } = runContext;

                if (timeoutAction === 'resume') {
                    // Auto-resume workflow
                    try {
                        await workflowEngine.resume(runId, workflow, context, { reviewMode: true });
                        await this.runManager.log(runId, '[i18n:workflowLogs.workflowAutoResumed]', 'info');
                    } catch (resumeError) {
                        const errorMessage = resumeError instanceof Error ? resumeError.message : String(resumeError);
                        logger.error({ runId, error: resumeError }, 'Failed to auto-resume workflow after review timeout');
                        await this.runManager.log(
                            runId,
                            `Failed to auto-resume workflow after review timeout: ${errorMessage}`,
                            'error'
                        );
                        // If resume fails, fail the workflow instead
                        await this.runManager.failRun(
                            runId,
                            `Review timeout exceeded and auto-resume failed: ${errorMessage}`
                        );
                    }
                } else {
                    // Fail workflow with formatted error message
                    const { getTimeoutErrorFormatter } = await import('../../utils/TimeoutErrorFormatter.js');
                    const formatter = getTimeoutErrorFormatter();
                    const formattedError = formatter.formatError({
                        type: 'review',
                        workflowId: workflow.id,
                        workflowName: workflow.name,
                        stepId,
                        timeoutMs,
                        elapsedMs: timeoutMs, // Review timeout elapsed equals timeout since it fired
                        runId,
                    });
                    
                    await this.runManager.failRun(
                        runId,
                        formattedError.message
                    );
                }

                // Clean up stored context
                this.runContexts.delete(runId);

                // Send notification
                await this.notifyReviewTimeout(runId, timeoutAction, timeoutMs).catch(error => {
                    logger.error({ runId, error }, 'Failed to send review timeout notification');
                });
            } catch (error) {
                logger.error({ runId, error }, 'Failed to handle review timeout');
            } finally {
                this.timeouts.delete(runId);
            }
        }, timeoutMs);

        this.timeouts.set(runId, timeout);

        // Log timeout scheduling (fire-and-forget)
        const timeoutDays = Math.floor(timeoutMs / (24 * 60 * 60 * 1000));
        this.runManager.log(
            runId,
            `Review timeout scheduled: ${timeoutDays} day${timeoutDays !== 1 ? 's' : ''} (${timeoutMs}ms). Action on timeout: ${timeoutAction}`,
            'info'
        ).catch((error) => {
            logger.warn({ runId, error }, 'Failed to log review timeout scheduling');
        });
    }

    /**
     * Clear a review timeout for a workflow run
     * 
     * @param runId - The run ID
     */
    clearReviewTimeout(runId: string): void {
        const timeout = this.timeouts.get(runId);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(runId);
            // Also clean up stored context
            this.runContexts.delete(runId);
            logger.debug({ runId }, 'Review timeout cleared');
        }
    }

    /**
     * Clear all review timeouts (useful for cleanup)
     */
    clearAllTimeouts(): void {
        for (const [runId, timeout] of this.timeouts.entries()) {
            clearTimeout(timeout);
        }
        this.timeouts.clear();
        logger.debug('All review timeouts cleared');
    }

    /**
     * Send notification about review timeout
     * 
     * @param runId - The run ID
     * @param timeoutAction - Action taken ('resume' or 'fail')
     * @param timeoutMs - Timeout duration in milliseconds
     */
    private async notifyReviewTimeout(
        runId: string,
        timeoutAction: 'resume' | 'fail',
        timeoutMs: number
    ): Promise<void> {
        try {
            const run = await this.runManager.getRun(runId);
            if (!run) {
                logger.warn({ runId }, 'Cannot send review timeout notification: run not found');
                return;
            }

            const userId = run.params?.userId as string | undefined;
            if (!userId) {
                logger.debug({ runId }, 'Cannot send review timeout notification: no userId in run params');
                return;
            }

            const { getNotificationService } = await import('../NotificationService.js');
            const notificationService = getNotificationService();

            const workflowName = run.params?.workflowName as string || 'Workflow';
            const workflowId = run.params?.workflowId as string;

            const actionMessage = timeoutAction === 'resume'
                ? 'has been automatically resumed'
                : 'has been failed';

            await notificationService.createNotification({
                user_id: userId,
                type: 'workflow_failed', // Using existing type for now
                title: `Workflow Review Timeout: ${workflowName}`,
                message: `Workflow "${workflowName}" review timeout exceeded and ${actionMessage}.`,
                link: workflowId ? `/workflows/${workflowId}/runs/${runId}` : `/workflows/runs/${runId}`,
                metadata: {
                    workflowId,
                    runId,
                    timeoutAction,
                    timeoutMs,
                    reason: 'review_timeout'
                }
            });

            logger.info({ runId, userId, timeoutAction }, 'Review timeout notification sent');
        } catch (error) {
            logger.error({ runId, error }, 'Failed to send review timeout notification');
            // Don't throw - notification failure shouldn't break the timeout handling
        }
    }
}
