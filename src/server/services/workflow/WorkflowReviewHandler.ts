import { logger } from '../../utils/logger.js';
import { IRunManager } from './interfaces/IRunManager.js';
import { Workflow } from '../infrastructure/types.js';
import { WorkflowDependencies } from './WorkflowDependencies.js';
import { CandidateExtractionService } from './CandidateExtractionService.js';
import { getWorkflowReviewModel } from '../../models/WorkflowReview.js';

/**
 * WorkflowReviewHandler Service
 * 
 * Responsible for handling review points in workflow execution.
 * 
 * This service extracts review point handling logic from WorkflowEngine
 * to follow the single responsibility principle.
 */
export class WorkflowReviewHandler {
  private candidateExtractionService: CandidateExtractionService;

  constructor(
    private runManager: IRunManager,
    private dependencies: WorkflowDependencies,
    candidateExtractionService?: CandidateExtractionService
  ) {
    // Allow dependency injection for testing, but default to creating new instance for backward compatibility
    this.candidateExtractionService = candidateExtractionService || new CandidateExtractionService();
  }

  /**
   * Handle a review point: extract candidate results and create a review
   * 
   * @param runId - The run ID
   * @param workflow - The workflow definition
   * @param step - The step that triggered the review point
   * @param stepResult - The result from the step execution
   * @param context - The workflow context
   * @param workflowEngine - Optional WorkflowEngine instance (needed for ReviewServiceClass)
   */
  async handleReviewPoint(
    runId: string,
    workflow: Workflow,
    step: { id: string; name: string; action: string },
    stepResult: Record<string, unknown> | null | undefined,
    context: Record<string, unknown>,
    workflowEngine?: any // WorkflowEngine type, but we use any to avoid circular dependency
  ): Promise<void> {
    const reviewModel = getWorkflowReviewModel();

    // Extract candidate results from step result or context using the new service
    const candidates = this.candidateExtractionService.extractCandidates(stepResult, context);

    // Create review if we have candidates
    if (candidates.length > 0) {
      try {
        // Apply learning from past reviews to rank candidates
        if (!workflowEngine) {
          logger.warn({ runId, workflowId: workflow.id }, 'WorkflowEngine not provided, skipping review learning');
          return;
        }
        const ReviewServiceClass = await this.dependencies.getReviewServiceClass();
        const { RunManager: RunManagerClass } = await import('./RunManager.js');
        const { WorkflowEngine: WorkflowEngineClass } = await import('./WorkflowEngine.js');
        const reviewService = new ReviewServiceClass(
          this.runManager as InstanceType<typeof RunManagerClass>,
          workflowEngine as InstanceType<typeof WorkflowEngineClass>
        );
        const rankedCandidates = await reviewService.applyReviewLearning(workflow.id, candidates);

        // Log ranking results for debugging
        const boostedCount = rankedCandidates.filter(c => (c.boostScore || 0) > 0).length;
        if (boostedCount > 0) {
          await this.runManager.log(
            runId,
            `Applied learning: ${boostedCount} candidates boosted based on review history`,
            'info'
          );
        }

        // Limit candidates to prevent UI overload (max 500)
        const limitedCandidates = rankedCandidates.slice(0, 500);

        const createdReview = await reviewModel.createReview({
          runId,
          workflowId: workflow.id,
          moduleId: step.id,
          moduleName: step.name,
          candidateResults: limitedCandidates.map(c => ({
            id: c.id,
            title: c.title,
            url: c.url,
            snippet: c.snippet,
            metadata: { ...c.metadata, boostScore: c.boostScore },
          })),
        });

        const candidateCount = limitedCandidates.length;
        const totalCount = rankedCandidates.length;
        if (totalCount > candidateCount) {
          await this.runManager.log(
            runId,
            `Created review with ${candidateCount} candidates (${totalCount - candidateCount} truncated, max 500) for step: ${step.name}`,
            'info'
          );
        } else {
          await this.runManager.log(
            runId,
            `Created review with ${candidateCount} candidates (ranked by learning) for step: ${step.name}`,
            'info'
          );
        }

        // Apply review automation rules if enabled
        try {
          const autoReviewedCount = await reviewService.applyReviewAutomation(createdReview._id!.toString());
          if (autoReviewedCount > 0) {
            await this.runManager.log(
              runId,
              `Applied review automation: ${autoReviewedCount} candidates automatically reviewed`,
              'info'
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await this.runManager.log(
            runId,
            `Failed to apply review automation: ${errorMessage}`,
            'warn'
          );
          // Don't throw - automation failure shouldn't break workflow
        }

        // Send notification for review request (if run has userId)
        try {
          const run = await this.runManager.getRun(runId);
          const userId = run?.params?.userId as string | undefined;
          if (run && userId) {
            const notificationService = await this.dependencies.getNotificationService();
            await notificationService
              .createReviewRequestNotification(
                userId,
                runId,
                workflow.id,
                step.name,
                step.id,
                candidateCount
              )
              .catch((err) => {
                logger.warn({ error: err, runId }, 'Failed to send review notification');
                // Don't throw - notification failure shouldn't break workflow
              });
          }
        } catch (error) {
          logger.warn({ error, runId }, 'Error sending review notification');
          // Don't throw - notification failure shouldn't break workflow
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.runManager.log(runId, `Failed to create review: ${errorMessage}`, 'error');
        // Don't throw - allow workflow to continue even if review creation fails
      }
    } else {
      await this.runManager.log(
        runId,
        `No candidates found for review at step: ${step.name}. Continuing workflow.`,
        'warn'
      );
      // Don't pause if no candidates - just continue
    }
  }
}
