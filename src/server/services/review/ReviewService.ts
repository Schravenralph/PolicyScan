import { getWorkflowReviewModel, WorkflowReviewModel, WorkflowReviewDocument, CandidateResult, ReviewerDecision, AggregationStrategy } from '../../models/WorkflowReview.js';
import { RunManager } from '../workflow/RunManager.js';
import { WorkflowEngine } from '../workflow/WorkflowEngine.js';
import { Workflow } from '../infrastructure/types.js';
import { getReviewServiceCache } from './ReviewServiceCache.js';
import {
    ReviewNotFoundError,
    RunNotPausedError
} from './ReviewError.js';
import { AuditLog } from '../../models/AuditLog.js';
import { getNotificationService } from '../NotificationService.js';
import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import {
    BoostExplanation,
    calculateHistoricalTrend,
    fuzzyMatchUrl,
    calculateContentSimilarity,
    generateBoostExplanation,
    extractMLFeatures,
    MLFeatures
} from './ReviewLearningUtils.js';
import { getReviewAutomationService } from './ReviewAutomationService.js';
import { validateEnv } from '../../config/env.js';
import { getWorkflowById } from '../../utils/workflowLookup.js';

/**
 * Service for managing workflow reviews in the semi-automated review system.
 * 
 * The ReviewService provides functionality for:
 * - Retrieving pending reviews for workflow runs
 * - Accepting/rejecting candidates in reviews
 * - Completing reviews and resuming workflows
 * - Learning from review history to improve candidate ranking
 * 
 * @example
 * ```typescript
 * const reviewService = new ReviewService(runManager, workflowEngine);
 * const review = await reviewService.getPendingReview(runId);
 * await reviewService.reviewCandidate(reviewId, candidateId, 'accepted');
 * ```
 */
/**
 * Retry configuration for review operations
 */
interface RetryConfig {
    maxRetries: number;
    retryDelay: number; // milliseconds
    backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2
};

/**
 * Execute an operation with retry logic and error recovery
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    errorContext?: string
): Promise<T> {
    let lastError: Error | unknown;
    let delay = config.retryDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            if (attempt < config.maxRetries) {
                const isRetryable = error instanceof Error && (
                    error.message.includes('timeout') ||
                    error.message.includes('connection') ||
                    error.message.includes('network') ||
                    error.message.includes('ECONNRESET') ||
                    error.message.includes('ETIMEDOUT')
                );

                if (isRetryable) {
                    console.warn(
                        `[ReviewService] Retryable error in ${errorContext || 'operation'} (attempt ${attempt + 1}/${config.maxRetries + 1}):`,
                        error instanceof Error ? error.message : String(error)
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= config.backoffMultiplier;
                    continue;
                }
            }
            
            // Non-retryable error or max retries reached
            throw error;
        }
    }

    throw lastError || new Error('Operation failed after retries');
}

export class ReviewService {
    private reviewModel: WorkflowReviewModel;

    /**
     * Creates a new ReviewService instance.
     * 
     * @param runManager - The RunManager instance for managing workflow runs
     * @param workflowEngine - The WorkflowEngine instance for resuming workflows
     */
    constructor(
        private runManager: RunManager,
        private workflowEngine: WorkflowEngine
    ) {
        this.reviewModel = getWorkflowReviewModel();
    }

    /**
     * Check if a user has permission to review a workflow run
     * 
     * @param userId - The user ID to check
     * @param runId - The run ID to check permission for
     * @returns True if user has permission, false otherwise
     */
    async checkReviewPermission(userId: string, runId: string): Promise<boolean> {
        try {
            const run = await this.runManager.getRun(runId);
            if (!run) {
                return false;
            }

            // Get user from database to check role
            const db = getDB();
            const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
            
            if (!user) {
                return false;
            }

            // Admins and developers can review any workflow
            if (user.role === 'admin' || user.role === 'developer') {
                return true;
            }

            // Check if user is the owner of the workflow run
            // This assumes runs have a userId field or can be traced to workflow owner
            // For now, allow all authenticated users to review (can be restricted later)
            return true;
        } catch (error) {
            console.error('[ReviewService] Error checking review permission:', error);
            return false;
        }
    }

    /**
     * Log audit entry for review action
     * 
     * @param userId - User ID performing the action
     * @param action - Action type
     * @param reviewId - Review ID
     * @param details - Additional details
     */
    private async logAuditAction(
        userId: string,
        action: 'review_created' | 'review_candidate_accepted' | 'review_candidate_rejected' | 'review_completed' | 'review_deleted',
        reviewId: string,
        details?: Record<string, unknown>
    ): Promise<void> {
        try {
            const db = getDB();
            const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
            const userEmail = user?.email || 'unknown';

            await AuditLog.create({
                userId,
                userEmail,
                action: action as 'review_created' | 'review_candidate_accepted' | 'review_candidate_rejected' | 'review_completed' | 'review_deleted',
                targetType: 'review',
                targetId: reviewId,
                details: {
                    ...details,
                    reviewAction: action
                }
            }).catch((error) => {
                console.error('[ReviewService] Failed to create audit log:', error);
                // Don't throw - audit logging should not break the application
            });
        } catch (error) {
            console.error('[ReviewService] Error logging audit action:', error);
            // Don't throw - audit logging should not break the application
        }
    }

    /**
     * Send notification for review request
     * 
     * @param userId - User ID to notify
     * @param reviewId - Review ID
     * @param runId - Run ID
     * @param workflowName - Workflow name
     * @param candidateCount - Number of candidates to review
     */
    private async sendReviewNotification(
        userId: string,
        reviewId: string,
        runId: string,
        workflowName: string,
        candidateCount: number
    ): Promise<void> {
        try {
            const notificationService = getNotificationService();
            await notificationService.createNotification({
                user_id: userId,
                type: 'review_request',
                title: `Review requested: ${workflowName}`,
                message: `A workflow review is pending with ${candidateCount} candidate(s) to review.`,
                link: `/workflows/reviews/${reviewId}`,
                metadata: {
                    reviewId,
                    runId,
                    workflowName,
                    candidateCount
                }
            }).catch((error) => {
                console.error('[ReviewService] Failed to send review notification:', error);
                // Don't throw - notifications should not break the application
            });
        } catch (error) {
            console.error('[ReviewService] Error sending review notification:', error);
            // Don't throw - notifications should not break the application
        }
    }

    /**
     * Get pending review for a run.
     * 
     * Retrieves a pending review for the specified run. If moduleId is provided,
     * returns the review for that specific module. Otherwise, returns the first
     * pending review for the run (typically the one that caused the pause).
     * 
     * @param runId - The ID of the workflow run
     * @param moduleId - Optional module ID to filter by specific module
     * @returns The pending review document, or null if no pending review exists
     * @throws {ReviewNotFoundError} If the run is not found
     * @throws {RunNotPausedError} If the run is not in paused status
     * 
     * @example
     * ```typescript
     * const review = await reviewService.getPendingReview('run-123');
     * if (review) {
     *   console.log(`Found ${review.candidateResults.length} candidates to review`);
     * }
     * ```
     */
    async getPendingReview(runId: string, moduleId?: string): Promise<WorkflowReviewDocument | null> {
        if (!runId || typeof runId !== 'string') {
            throw new Error('runId must be a non-empty string');
        }
        if (moduleId !== undefined && (typeof moduleId !== 'string' || moduleId.trim() === '')) {
            throw new Error('moduleId must be a non-empty string if provided');
        }

        const run = await this.runManager.getRun(runId);
        if (!run) {
            throw new ReviewNotFoundError(`Run not found: ${runId}`);
        }

        if (run.status !== 'paused') {
            throw new RunNotPausedError(runId, run.status);
        }

        if (moduleId) {
            return this.reviewModel.getReviewByRunAndModule(runId, moduleId);
        }

        // Get the first pending review for this run
        // Try using paused state to determine which module
        if (run.pausedState) {
            const review = await this.reviewModel.getReviewByRunAndModule(runId, run.pausedState.stepId);
            if (review) {
                return review;
            }
        }

        // Fallback: get all pending reviews and return the first one
        const pendingReviews = await this.reviewModel.getPendingReviewsByRun(runId);
        return pendingReviews.length > 0 ? pendingReviews[0] : null;
    }

    /**
     * Get all pending reviews for a run.
     * 
     * Returns all pending reviews associated with the specified run.
     * Useful when a workflow has multiple pause points.
     * 
     * @param runId - The ID of the workflow run
     * @returns Array of pending review documents
     * 
     * @example
     * ```typescript
     * const reviews = await reviewService.getAllPendingReviews('run-123');
     * console.log(`Found ${reviews.length} pending reviews`);
     * ```
     */
    async getAllPendingReviews(runId: string): Promise<WorkflowReviewDocument[]> {
        return this.reviewModel.getPendingReviewsByRun(runId);
    }

    /**
     * Accept or reject a single candidate in a review.
     * 
     * Updates the review status for a specific candidate. The candidate's
     * reviewStatus is set to 'accepted' or 'rejected', and optional notes
     * can be added for future reference.
     * 
     * Includes:
     * - Permission checking
     * - Audit logging
     * - Retry logic for database operations
     * - Better error messages
     * 
     * @param reviewId - The ID of the review
     * @param candidateId - The ID of the candidate to review
     * @param status - Either 'accepted' or 'rejected'
     * @param userId - Optional user ID who made the decision
     * @param notes - Optional notes about the decision
     * @throws {Error} If reviewId, candidateId, or status are invalid, or if permission is denied
     * 
     * @example
     * ```typescript
     * await reviewService.reviewCandidate(
     *   'review-123',
     *   'candidate-456',
     *   'accepted',
     *   'user-789',
     *   'This URL matches our criteria'
     * );
     * ```
     */
    async reviewCandidate(
        reviewId: string,
        candidateId: string,
        status: 'accepted' | 'rejected',
        userId?: string,
        notes?: string
    ): Promise<void> {
        // Validate inputs with better error messages
        if (!reviewId || typeof reviewId !== 'string') {
            throw new Error('Review ID is required and must be a valid string');
        }
        if (!candidateId || typeof candidateId !== 'string') {
            throw new Error('Candidate ID is required and must be a valid string');
        }
        if (status !== 'accepted' && status !== 'rejected') {
            throw new Error(`Invalid status: "${status}". Status must be either "accepted" or "rejected"`);
        }

        // Check permission if userId is provided
        if (userId) {
            const review = await this.reviewModel.getReviewById(reviewId);
            if (!review) {
                throw new ReviewNotFoundError(`Review not found: ${reviewId}`);
            }
            const hasPermission = await this.checkReviewPermission(userId, review.runId.toString());
            if (!hasPermission) {
                throw new Error(`Permission denied: User ${userId} does not have permission to review this workflow`);
            }
        }

        // Execute with retry logic
        await withRetry(
            () => this.reviewModel.updateCandidateStatus(reviewId, candidateId, status, userId, notes),
            DEFAULT_RETRY_CONFIG,
            `reviewCandidate(${reviewId}, ${candidateId})`
        );

        // Log audit action
        if (userId) {
            await this.logAuditAction(
                userId,
                status === 'accepted' ? 'review_candidate_accepted' : 'review_candidate_rejected',
                reviewId,
                {
                    candidateId,
                    notes: notes || undefined
                }
            );
        }
    }

    /**
     * Accept or reject multiple candidates in a single operation.
     * 
     * Uses batch update for optimal performance when reviewing multiple
     * candidates at once. This is more efficient than calling reviewCandidate
     * multiple times.
     * 
     * Includes:
     * - Permission checking
     * - Audit logging
     * - Retry logic for database operations
     * - Better error messages
     * 
     * @param reviewId - The ID of the review
     * @param decisions - Array of review decisions, each with candidateId, status, and optional notes
     * @param userId - Optional user ID who made the decisions
     * @throws {Error} If reviewId is invalid or decisions array is empty/invalid, or if permission is denied
     * 
     * @example
     * ```typescript
     * await reviewService.reviewCandidates('review-123', [
     *   { candidateId: 'candidate-1', status: 'accepted' },
     *   { candidateId: 'candidate-2', status: 'rejected', notes: 'Not relevant' },
     *   { candidateId: 'candidate-3', status: 'accepted' }
     * ], 'user-789');
     * ```
     */
    async reviewCandidates(
        reviewId: string,
        decisions: Array<{ candidateId: string; status: 'accepted' | 'rejected'; notes?: string }>,
        userId?: string
    ): Promise<void> {
        // Enhanced validation with better error messages
        if (!reviewId || typeof reviewId !== 'string') {
            throw new Error('Review ID is required and must be a valid string');
        }
        if (!Array.isArray(decisions) || decisions.length === 0) {
            throw new Error('Decisions array is required and must contain at least one decision');
        }
        
        // Validate all decisions with detailed error messages
        for (let i = 0; i < decisions.length; i++) {
            const decision = decisions[i];
            if (!decision || typeof decision !== 'object') {
                throw new Error(`Decision at index ${i} must be an object`);
            }
            if (!decision.candidateId || typeof decision.candidateId !== 'string') {
                throw new Error(`Decision at index ${i} must have a valid candidateId (string)`);
            }
            if (decision.status !== 'accepted' && decision.status !== 'rejected') {
                throw new Error(`Decision at index ${i} has invalid status: "${decision.status}". Status must be either "accepted" or "rejected"`);
            }
            if (decision.notes !== undefined && typeof decision.notes !== 'string') {
                throw new Error(`Decision at index ${i} has invalid notes: notes must be a string if provided`);
            }
        }

        // Check permission if userId is provided and fetch review for later use
        let review = null;
        if (userId) {
            review = await this.reviewModel.getReviewById(reviewId);
            if (!review) {
                throw new ReviewNotFoundError(`Review not found: ${reviewId}`);
            }
            const hasPermission = await this.checkReviewPermission(userId, review.runId.toString());
            if (!hasPermission) {
                throw new Error(`Permission denied: User ${userId} does not have permission to review this workflow`);
            }
        }

        // Execute with retry logic
        await withRetry(
            async () => {
                // Use batch update for better performance when updating multiple candidates
                if (decisions.length > 1) {
                    await this.reviewModel.batchUpdateCandidateStatus(reviewId, decisions, userId);
                } else {
                    // Single update for one candidate
                    await this.reviewModel.updateCandidateStatus(
                        reviewId,
                        decisions[0].candidateId,
                        decisions[0].status,
                        userId,
                        decisions[0].notes
                    );
                }
            },
            DEFAULT_RETRY_CONFIG,
            `reviewCandidates(${reviewId}, ${decisions.length} decisions)`
        );
        
        // Invalidate cache for this review's statistics
        // Reuse review from permission check if available, otherwise fetch it
        if (!review) {
            review = await this.reviewModel.getReviewById(reviewId);
        }
        if (review) {
            const cache = getReviewServiceCache();
            cache.clear(`review-stats-${review.workflowId}`);
        }

        // Log audit action for batch review
        if (userId) {
            const acceptedCount = decisions.filter(d => d.status === 'accepted').length;
            const rejectedCount = decisions.filter(d => d.status === 'rejected').length;
            await this.logAuditAction(
                userId,
                'review_candidate_accepted', // Use accepted as primary action type
                reviewId,
                {
                    batchReview: true,
                    totalDecisions: decisions.length,
                    acceptedCount,
                    rejectedCount
                }
            );
        }
    }

    /**
     * Complete a review and resume the associated workflow.
     * 
     * Marks the review as completed, marks any remaining pending candidates
     * as rejected, and resumes the workflow execution with the accepted
     * candidates added to the workflow context.
     * 
     * Includes:
     * - Permission checking
     * - Audit logging
     * - Retry logic for database operations
     * - Better error messages
     * - Seamless workflow resume with error recovery
     * 
     * @param reviewId - The ID of the review to complete
     * @param workflow - The workflow definition to resume
     * @param userId - Optional user ID who completed the review
     * @throws {Error} If review is not found, run is not paused, or permission is denied
     * 
     * @example
     * ```typescript
     * await reviewService.completeReviewAndResume(
     *   'review-123',
     *   standardScanWorkflow,
     *   'user-789'
     * );
     * ```
     */
    async completeReviewAndResume(
        reviewId: string,
        workflow: Workflow,
        userId?: string
    ): Promise<void> {
        // Enhanced validation with better error messages
        if (!reviewId || typeof reviewId !== 'string') {
            throw new Error('Review ID is required and must be a valid string');
        }
        if (!workflow || !workflow.id || !workflow.steps) {
            throw new Error('Valid workflow definition is required');
        }

        // Get review with retry logic
        const review = await withRetry(
            () => this.reviewModel.getReviewById(reviewId),
            DEFAULT_RETRY_CONFIG,
            `getReviewById(${reviewId})`
        );

        if (!review) {
            throw new ReviewNotFoundError(`Review not found: ${reviewId}. Please verify the review ID and try again.`);
        }

        // Check permission if userId is provided
        if (userId) {
            const hasPermission = await this.checkReviewPermission(userId, review.runId.toString());
            if (!hasPermission) {
                throw new Error(`Permission denied: User ${userId} does not have permission to complete this review`);
            }
        }

        // Get run with better error handling
        const run = await withRetry(
            () => this.runManager.getRun(review.runId.toString()),
            DEFAULT_RETRY_CONFIG,
            `getRun(${review.runId.toString()})`
        );

        if (!run) {
            throw new Error(`Workflow run not found: ${review.runId.toString()}. The run may have been deleted.`);
        }

        if (run.status !== 'paused') {
            throw new RunNotPausedError(
                review.runId.toString(),
                run.status,
                `Cannot resume workflow: run is in "${run.status}" status, but must be "paused" to resume.`
            );
        }

        // Validate review has required properties
        if (!review.moduleId) {
            throw new Error(`Review ${reviewId} is missing moduleId. The review may be corrupted.`);
        }
        if (!Array.isArray(review.candidateResults)) {
            throw new Error(`Review ${reviewId} has invalid candidateResults. The review may be corrupted.`);
        }

        // Get accepted candidates to pass to workflow (before completing review)
        const acceptedCandidates = await withRetry(
            () => this.reviewModel.getAcceptedCandidates(reviewId),
            DEFAULT_RETRY_CONFIG,
            `getAcceptedCandidates(${reviewId})`
        );

        // Update context with accepted candidates
        if (!run.pausedState) {
            throw new Error(`Cannot resume workflow: paused state is missing. The workflow may have been corrupted.`);
        }

        const context = { ...run.pausedState.context };
        // Add accepted candidates to context for next steps
        context[review.moduleId] = {
            ...(context[review.moduleId] || {}),
            acceptedCandidates,
            reviewCompleted: true,
            reviewId: reviewId,
            reviewStats: {
                total: review.candidateResults.length,
                accepted: acceptedCandidates.length,
                rejected: review.candidateResults.length - acceptedCandidates.length
            }
        };
        
        // Also add to a general acceptedCandidates array for easy access
        if (!Array.isArray(context.acceptedCandidates)) {
            context.acceptedCandidates = [];
        }
        (context.acceptedCandidates as CandidateResult[]).push(...acceptedCandidates);

        // Resume workflow execution FIRST (before completing review)
        try {
            await withRetry(
                () => this.workflowEngine.executeWorkflow(
                    workflow,
                    context,
                    review.runId.toString(),
                    { reviewMode: true }
                ),
                { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 }, // Fewer retries for workflow execution
                `executeWorkflow(${workflow.id}, ${review.runId.toString()})`
            );
        } catch (error) {
            // Workflow resume failed - don't complete review
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Failed to resume workflow: ${errorMessage}. ` +
                `The review remains pending and can be retried. ` +
                `Review ID: ${reviewId}, Run ID: ${review.runId.toString()}`
            );
        }

        // Only complete review AFTER workflow resume succeeds
        await withRetry(
            () => this.reviewModel.completeReview(reviewId, userId),
            DEFAULT_RETRY_CONFIG,
            `completeReview(${reviewId})`
        );

        // Log audit action
        if (userId) {
            await this.logAuditAction(
                userId,
                'review_completed',
                reviewId,
                {
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    acceptedCount: acceptedCandidates.length,
                    totalCount: review.candidateResults.length
                }
            );
        }
    }

    /**
     * Get review statistics for a workflow to support learning algorithms.
     * 
     * Returns aggregated statistics including acceptance rates, rejection rates,
     * and URL pattern analysis. Results are cached for 5 minutes to improve
     * performance. Used by the learning algorithm to boost candidate scores
     * based on historical acceptance patterns.
     * 
     * @param workflowId - The ID of the workflow
     * @returns Statistics object with total reviews, acceptance rates, and URL patterns
     * 
     * @example
     * ```typescript
     * const stats = await reviewService.getReviewStatistics('workflow-123');
     * console.log(`Acceptance rate: ${stats.acceptanceRate}`);
     * console.log(`Found ${stats.patterns.length} URL patterns`);
     * ```
     */
    /**
     * Get a review by ID.
     * 
     * @param reviewId - The ID of the review
     * @returns The review document, or null if not found
     * @throws {Error} If reviewId is invalid
     */
    async getReview(reviewId: string): Promise<WorkflowReviewDocument | null> {
        if (!reviewId || typeof reviewId !== 'string') {
            throw new Error('Review ID is required and must be a valid string');
        }
        return this.reviewModel.getReviewById(reviewId);
    }

    async getReviewStatistics(workflowId: string): Promise<{
        totalReviews: number;
        totalAccepted: number;
        totalRejected: number;
        acceptanceRate: number;
        patterns: Array<{
            urlPattern: string;
            acceptanceRate: number;
            count: number;
        }>;
    }> {
        const cache = getReviewServiceCache();
        const cacheKey = `review-stats-${workflowId}`;
        
        // Try cache first
        const cached = cache.get<{
            totalReviews: number;
            totalAccepted: number;
            totalRejected: number;
            acceptanceRate: number;
            patterns: Array<{
                urlPattern: string;
                acceptanceRate: number;
                count: number;
            }>;
        }>(cacheKey);
        
        if (cached) {
            return cached;
        }
        
        // Fetch from database
        const stats = await this.reviewModel.getReviewStatistics(workflowId);
        
        // Cache for 5 minutes
        cache.set(cacheKey, stats);
        
        return stats;
    }

    /**
     * Get review history for a workflow.
     * 
     * Returns completed reviews for the specified workflow, sorted by
     * completion date (most recent first). Useful for analyzing review
     * patterns and trends.
     * 
     * @param workflowId - The ID of the workflow
     * @param limit - Maximum number of reviews to return (default: 100)
     * @returns Array of completed review documents
     * 
     * @example
     * ```typescript
     * const history = await reviewService.getReviewHistory('workflow-123', 50);
     * console.log(`Retrieved ${history.length} completed reviews`);
     * ```
     */
    async getReviewHistory(workflowId: string, limit: number = 100): Promise<WorkflowReviewDocument[]> {
        return this.reviewModel.getReviewHistory(workflowId, limit);
    }

    /**
     * Apply review automation rules to a review.
     * 
     * Automatically accepts or rejects candidates based on configured rules
     * and templates. Only applies automation if REVIEW_AUTOMATION_ENABLED
     * environment variable is true (default: true).
     * 
     * @param reviewId - The ID of the review
     * @returns Number of candidates automatically reviewed
     * @throws {Error} If review is not found
     * 
     * @example
     * ```typescript
     * const autoReviewedCount = await reviewService.applyReviewAutomation('review-123');
     * console.log(`Automatically reviewed ${autoReviewedCount} candidates`);
     * ```
     */
    async applyReviewAutomation(reviewId: string): Promise<number> {
        // Check if automation is enabled
        const env = validateEnv();
        if (!env.REVIEW_AUTOMATION_ENABLED) {
            return 0;
        }

        // Get the review
        const review = await this.reviewModel.getReviewById(reviewId);
        if (!review) {
            throw new ReviewNotFoundError(`Review not found: ${reviewId}`);
        }

        // Get pending candidates only
        const pendingCandidates = review.candidateResults.filter(c => c.reviewStatus === 'pending');
        if (pendingCandidates.length === 0) {
            return 0;
        }

        // Apply automation rules
        const automationService = getReviewAutomationService();
        const decisions = await automationService.applyAutomationRules(
            review.workflowId,
            review.moduleId,
            pendingCandidates.map(c => ({
                id: c.id,
                title: c.title,
                url: c.url,
                metadata: c.metadata
            }))
        );

        // Apply decisions to review
        let appliedCount = 0;
        for (const decision of decisions) {
            try {
                await this.reviewModel.updateCandidateStatus(
                    reviewId,
                    decision.candidateId,
                    decision.status,
                    undefined, // No userId for automated decisions
                    `Automated: ${decision.reason} (Rule: ${decision.ruleId})`
                );
                appliedCount++;
            } catch (error) {
                console.error(`[ReviewService] Failed to apply automation decision for candidate ${decision.candidateId}:`, error);
                // Continue with other candidates even if one fails
            }
        }

        return appliedCount;
    }

    /**
     * Get candidate statistics for a review.
     * 
     * Returns counts of total, accepted, rejected, and pending candidates
     * for the specified review. Useful for displaying progress indicators.
     * 
     * @param reviewId - The ID of the review
     * @returns Statistics object with candidate counts
     * 
     * @example
     * ```typescript
     * const stats = await reviewService.getCandidateStats('review-123');
     * console.log(`${stats.accepted}/${stats.total} candidates accepted`);
     * ```
     */
    async getCandidateStats(reviewId: string): Promise<{
        total: number;
        accepted: number;
        rejected: number;
        pending: number;
    }> {
        return this.reviewModel.getCandidateStats(reviewId);
    }

    /**
     * Get reviewer decisions for a specific candidate in a collaborative review.
     * 
     * Returns all individual reviewer decisions for the candidate,
     * useful for collaborative review workflows where multiple reviewers
     * can review the same candidate.
     * 
     * @param reviewId - The ID of the review
     * @param candidateId - The ID of the candidate
     * @returns Array of reviewer decisions
     * @throws {Error} If review or candidate is not found
     * 
     * @example
     * ```typescript
     * const decisions = await reviewService.getReviewerDecisions('review-123', 'candidate-456');
     * console.log(`${decisions.length} reviewers have made decisions`);
     * decisions.forEach(decision => {
     *   console.log(`User ${decision.userId} decided: ${decision.status}`);
     * });
     * ```
     */
    async getReviewerDecisions(reviewId: string, candidateId: string): Promise<ReviewerDecision[]> {
        if (!reviewId || typeof reviewId !== 'string') {
            throw new Error('Review ID is required and must be a valid string');
        }
        if (!candidateId || typeof candidateId !== 'string') {
            throw new Error('Candidate ID is required and must be a valid string');
        }
        return this.reviewModel.getReviewerDecisions(reviewId, candidateId);
    }

    /**
     * Apply learning from past reviews to rank candidates.
     * 
     * Enhanced algorithm with fuzzy matching, multi-factor ranking, historical trends, and explainability.
     * 
     * Features:
     * - Fuzzy URL pattern matching (Levenshtein distance)
     * - Multi-factor ranking (URL pattern, content similarity, metadata)
     * - Historical trend analysis (track acceptance rates over time)
     * - ML integration points (feature extraction for future ML models)
     * - A/B testing framework support
     * - Algorithm explainability (boost reasons)
     * - Performance optimizations (caching, batch processing)
     * 
     * @param workflowId - The ID of the workflow
     * @param candidates - Array of candidate objects to rank
     * @returns Array of candidates with boostScore, boostExplanation, and mlFeatures added, sorted by multi-factor ranking
     * 
     * @example
     * ```typescript
     * const candidates = [
     *   { id: '1', title: 'Page 1', url: 'https://example.com/page1' },
     *   { id: '2', title: 'Page 2', url: 'https://example.com/page2' }
     * ];
     * const ranked = await reviewService.applyReviewLearning('workflow-123', candidates);
     * // Candidates include boostScore, boostExplanation, and mlFeatures
     * ```
     */
    async applyReviewLearning(
        workflowId: string,
        candidates: Array<{ id: string; title: string; url: string; snippet?: string; metadata?: Record<string, unknown> }>
    ): Promise<Array<{ 
        id: string; 
        title: string; 
        url: string; 
        snippet?: string; 
        metadata?: Record<string, unknown>; 
        boostScore?: number;
        boostExplanation?: BoostExplanation;
        mlFeatures?: MLFeatures;
    }>> {
        // Performance optimization: Early return if no candidates
        if (candidates.length === 0) {
            return [];
        }

        const cache = getReviewServiceCache();
        const cacheKey = `review-learning-${workflowId}`;
        
        // Try cache first (5 minute TTL)
        type CachedStatsType = {
            statistics: Awaited<ReturnType<WorkflowReviewModel['getReviewStatistics']>>;
            historicalTrends: ReturnType<typeof calculateHistoricalTrend>;
            acceptedTitles: string[];
            acceptedSnippets: string[];
        };
        const cachedStats = cache.get<CachedStatsType>(cacheKey) as CachedStatsType | undefined;

        let statistics: Awaited<ReturnType<typeof this.reviewModel.getReviewStatistics>>;
        let historicalTrends: ReturnType<typeof calculateHistoricalTrend>;
        let acceptedTitles: string[];
        let acceptedSnippets: string[];

        if (cachedStats) {
            ({ statistics, historicalTrends, acceptedTitles, acceptedSnippets } = cachedStats);
        } else {
            // Fetch statistics
            statistics = await this.reviewModel.getReviewStatistics(workflowId);
            
            // If no review history, return candidates as-is
            if (statistics.totalReviews === 0) {
                return candidates.map(c => ({ ...c, boostScore: 0 }));
            }

            // Get review history for trend analysis and content similarity
            const reviewHistory = await this.reviewModel.getReviewHistory(workflowId, 1000);
            historicalTrends = calculateHistoricalTrend(reviewHistory);
            
            // Extract accepted candidate titles and snippets for content similarity
            acceptedTitles = [];
            acceptedSnippets = [];
            for (const review of reviewHistory) {
                if (!Array.isArray(review.candidateResults)) {
                    console.warn(`[ReviewService] Review ${review._id?.toString() || 'unknown'} has invalid candidateResults, skipping`);
                    continue;
                }
                for (const candidate of review.candidateResults) {
                    if (candidate.reviewStatus === 'accepted') {
                        if (candidate.title) acceptedTitles.push(candidate.title);
                        if (candidate.snippet) acceptedSnippets.push(candidate.snippet);
                    }
                }
            }

            // Cache for 5 minutes
            cache.set(cacheKey, { statistics, historicalTrends, acceptedTitles, acceptedSnippets }, 5 * 60 * 1000);
        }

        // Performance optimization: Batch process candidates
        // Use Map for O(1) pattern lookups
        const patternMap = new Map(
            statistics.patterns
                .filter(p => p.acceptanceRate > 0.5 && p.count >= 2)
                .map(p => [p.urlPattern, p])
        );

        // Get recent trend (last 3 months average)
        const recentTrends = historicalTrends.slice(-3);
        const recentAcceptanceRate = recentTrends.length > 0
            ? recentTrends.reduce((sum, t) => sum + t.acceptanceRate, 0) / recentTrends.length
            : statistics.acceptanceRate;

        // A/B Testing Framework: Check if algorithm variant is enabled
        // This is a placeholder for future A/B testing infrastructure
        const useEnhancedAlgorithm = process.env.REVIEW_LEARNING_ENHANCED !== 'false'; // Default: enabled
        const fuzzyThreshold = parseFloat(process.env.REVIEW_LEARNING_FUZZY_THRESHOLD || '0.7');

        // Multi-factor ranking with enhanced features
        const boostedCandidates = candidates.map(candidate => {
            let boostScore = 0;
            let urlPatternMatch: { pattern: string; acceptanceRate: number; similarity: number } | null = null;
            let contentSimilarity = 0;
            // boostFactors array removed - not currently used but kept for future explainability features

            // Factor 1: Fuzzy URL Pattern Matching
            if (useEnhancedAlgorithm) {
                for (const [patternUrl, pattern] of patternMap.entries()) {
                    const match = fuzzyMatchUrl(candidate.url, patternUrl, fuzzyThreshold);
                    if (match && match.similarity > 0.5) {
                        // Calculate boost based on acceptance rate and similarity
                        const patternConfidence = Math.min(pattern.count / 10, 1.0);
                        const matchWeight = match.matchType === 'exact' ? 1.0 : 
                                          match.matchType === 'path' ? 0.9 :
                                          match.matchType === 'domain' ? 0.6 : 0.7;
                        const patternBoost = pattern.acceptanceRate * match.similarity * matchWeight * 0.4 * patternConfidence;
                        
                        if (patternBoost > boostScore) {
                            boostScore = patternBoost;
                            urlPatternMatch = {
                                pattern: patternUrl,
                                acceptanceRate: pattern.acceptanceRate,
                                similarity: match.similarity
                            };
                        }
                    }
                }
            } else {
                // Fallback to original algorithm for A/B testing
                for (const pattern of statistics.patterns) {
                    if (pattern.acceptanceRate > 0.5 && pattern.count >= 2) {
                        try {
                            const url = new URL(candidate.url);
                            const candidateHostname = url.hostname.toLowerCase().replace(/^www\./, '');
                            const candidatePath = url.pathname.split('/').filter(p => p).slice(0, 2).join('/');
                            const patternUrl = pattern.urlPattern.toLowerCase();
                            const patternHostname = patternUrl.split('/')[0].replace(/^www\./, '');
                            const patternPath = patternUrl.includes('/') ? patternUrl.split('/').slice(1).join('/') : '';
                            
                            const hostnameMatch = candidateHostname === patternHostname;
                            const pathMatch = patternPath && candidatePath && (
                                candidatePath.startsWith(patternPath) || patternPath.startsWith(candidatePath)
                            );
                            
                            if (hostnameMatch || (hostnameMatch && pathMatch)) {
                                const confidence = Math.min(pattern.count / 10, 1);
                                const baseBoost = pattern.acceptanceRate * 0.3;
                                const pathBonus = pathMatch ? 0.1 : 0;
                                const patternBoost = (baseBoost + pathBonus) * confidence;
                                
                                if (patternBoost > boostScore) {
                                    boostScore = patternBoost;
                                    urlPatternMatch = {
                                        pattern: pattern.urlPattern,
                                        acceptanceRate: pattern.acceptanceRate,
                                        similarity: 1.0
                                    };
                                }
                            }
                        } catch {
                            // Invalid URL, skip
                        }
                    }
                }
            }

            // Factor 2: Content Similarity
            if (acceptedTitles.length > 0 || acceptedSnippets.length > 0) {
                const contentSim = calculateContentSimilarity(
                    candidate,
                    acceptedTitles,
                    acceptedSnippets
                );
                contentSimilarity = contentSim.similarity;
                const contentBoost = contentSimilarity * 0.3;
                boostScore += contentBoost;
            }

            // Factor 3: Historical Trend Analysis
            if (recentTrends.length > 0) {
                const trendBoost = recentAcceptanceRate * 0.2;
                boostScore += trendBoost;
            }

            // Factor 4: Metadata-based scoring
            if (candidate.metadata) {
                const metadataBoost = Object.keys(candidate.metadata).length > 0 ? 0.05 : 0;
                boostScore += metadataBoost;
            }

            // Cap boost score at 1.0
            boostScore = Math.min(boostScore, 1.0);

            // Generate explanation for transparency
            const boostExplanation = generateBoostExplanation(boostScore, {
                urlPattern: urlPatternMatch || undefined,
                contentSimilarity: contentSimilarity > 0 ? contentSimilarity : undefined,
                historicalTrend: recentTrends.length > 0 ? {
                    trend: recentTrends[recentTrends.length - 1].trend,
                    acceptanceRate: recentAcceptanceRate
                } : undefined,
                metadata: candidate.metadata
            });

            // ML Integration Point: Extract features for future ML model
            const mlFeatures = extractMLFeatures(
                candidate,
                urlPatternMatch,
                contentSimilarity,
                recentAcceptanceRate
            );

            return {
                ...candidate,
                boostScore,
                boostExplanation,
                mlFeatures,
                metadata: {
                    ...candidate.metadata,
                    matchedPattern: urlPatternMatch ? {
                        urlPattern: urlPatternMatch.pattern,
                        acceptanceRate: urlPatternMatch.acceptanceRate,
                        similarity: urlPatternMatch.similarity
                    } : undefined,
                    contentSimilarity: contentSimilarity > 0 ? contentSimilarity : undefined,
                    historicalTrend: recentTrends.length > 0 ? {
                        trend: recentTrends[recentTrends.length - 1].trend,
                        acceptanceRate: recentAcceptanceRate
                    } : undefined
                }
            };
        });

        // Multi-factor sorting: boost score, then content similarity, then relevance score, then original order
        return boostedCandidates.sort((a, b) => {
            // Primary: Boost score
            const boostDiff = (b.boostScore || 0) - (a.boostScore || 0);
            if (Math.abs(boostDiff) > 0.001) return boostDiff;
            
            // Secondary: Content similarity
            const aContentSim = (a.metadata?.contentSimilarity as number) || 0;
            const bContentSim = (b.metadata?.contentSimilarity as number) || 0;
            const contentDiff = bContentSim - aContentSim;
            if (Math.abs(contentDiff) > 0.001) return contentDiff;
            
            // Tertiary: Relevance score if available (from candidate metadata, not boost metadata)
            const aRelevance = (a.metadata && typeof a.metadata === 'object' && 'relevanceScore' in a.metadata ? (a.metadata as Record<string, unknown>).relevanceScore as number : undefined) || 0;
            const bRelevance = (b.metadata && typeof b.metadata === 'object' && 'relevanceScore' in b.metadata ? (b.metadata as Record<string, unknown>).relevanceScore as number : undefined) || 0;
            const relevanceDiff = bRelevance - aRelevance;
            if (Math.abs(relevanceDiff) > 0.001) return relevanceDiff;
            
            // Maintain original order for ties
            return 0;
        });
    }

    /**
     * Get all pending reviews for a run
     */
    async getPendingReviews(runId: string): Promise<WorkflowReviewDocument[]> {
        return this.reviewModel.getPendingReviewsByRun(runId);
    }

    /**
     * Delete a review
     * 
     * Includes:
     * - Audit logging
     * - Retry logic
     * - Better error messages
     * 
     * @param reviewId - The ID of the review to delete
     * @param userId - Optional user ID who deleted the review
     * @returns True if review was deleted, false if not found
     * @throws {Error} If reviewId is invalid
     */
    async deleteReview(reviewId: string, userId?: string): Promise<boolean> {
        if (!reviewId || typeof reviewId !== 'string') {
            throw new Error('Review ID is required and must be a valid string');
        }

        // Get review before deletion for audit logging
        const review = await this.reviewModel.getReviewById(reviewId);
        
        // Delete with retry logic
        const deleted = await withRetry(
            () => this.reviewModel.deleteReview(reviewId),
            DEFAULT_RETRY_CONFIG,
            `deleteReview(${reviewId})`
        );

        // Log audit action if review was deleted and userId provided
        if (deleted && userId && review) {
            await this.logAuditAction(
                userId,
                'review_deleted',
                reviewId,
                {
                    workflowId: review.workflowId,
                    moduleId: review.moduleId,
                    runId: review.runId.toString()
                }
            );
        }

        return deleted;
    }

    /**
     * Delete all reviews for a run
     * 
     * Includes:
     * - Retry logic
     * - Better error messages
     * 
     * @param runId - The ID of the run
     * @param userId - Optional user ID who deleted the reviews
     * @returns Number of reviews deleted
     * @throws {Error} If runId is invalid
     */
    async deleteReviewsByRun(runId: string, userId?: string): Promise<number> {
        if (!runId || typeof runId !== 'string') {
            throw new Error('Run ID is required and must be a valid string');
        }

        // Delete with retry logic
        const deletedCount = await withRetry(
            () => this.reviewModel.deleteReviewsByRun(runId),
            DEFAULT_RETRY_CONFIG,
            `deleteReviewsByRun(${runId})`
        );

        // Log audit action if reviews were deleted and userId provided
        if (deletedCount > 0 && userId) {
            await this.logAuditAction(
                userId,
                'review_deleted',
                runId, // Use runId as targetId for batch deletion
                {
                    batchDeletion: true,
                    deletedCount,
                    runId
                }
            );
        }

        return deletedCount;
    }

    /**
     * Create a review automatically from workflow execution results.
     * 
     * This method extracts candidate results from workflow output and creates
     * a review for them. Useful for post-execution review creation or batch review creation.
     * 
     * @param runId - The ID of the workflow run
     * @param workflowId - The ID of the workflow
     * @param moduleId - The ID of the module
     * @param moduleName - The name of the module
     * @param workflowOutput - The workflow output containing results
     * @param options - Optional configuration for review creation
     * @returns The created review document
     * 
     * @example
     * ```typescript
     * const review = await reviewService.createReviewFromWorkflowResults(
     *   'run-123',
     *   'workflow-456',
     *   'extract-metadata',
     *   'Extract Metadata',
     *   workflowOutput
     * );
     * ```
     */
    async createReviewFromWorkflowResults(
        runId: string,
        workflowId: string,
        moduleId: string,
        moduleName: string,
        workflowOutput: {
            results?: {
                documents?: Array<{
                    url: string;
                    title: string;
                    type?: string;
                    sourceUrl?: string;
                    relevanceScore?: number;
                    discoveredAt?: string;
                    metadata?: Record<string, unknown>;
                }>;
                endpoints?: Array<{
                    url: string;
                    title: string;
                    type?: string;
                    sourceUrl?: string;
                    relevanceScore?: number;
                    snippet?: string;
                    metadata?: Record<string, unknown>;
                }>;
            };
        },
        options?: {
            aggregationStrategy?: AggregationStrategy;
            requiredReviewers?: number;
            maxCandidates?: number;
        }
    ): Promise<WorkflowReviewDocument> {
        if (!runId || typeof runId !== 'string') {
            throw new Error('runId must be a non-empty string');
        }
        if (!workflowId || typeof workflowId !== 'string') {
            throw new Error('workflowId must be a non-empty string');
        }
        if (!moduleId || typeof moduleId !== 'string') {
            throw new Error('moduleId must be a non-empty string');
        }
        if (!moduleName || typeof moduleName !== 'string') {
            throw new Error('moduleName must be a non-empty string');
        }

        // Extract candidates from workflow output
        const candidates: Omit<CandidateResult, 'reviewStatus'>[] = [];

        // Extract from documents
        if (workflowOutput.results?.documents) {
            for (const doc of workflowOutput.results.documents) {
                candidates.push({
                    id: `doc-${candidates.length}`,
                    title: doc.title || doc.url || 'Untitled',
                    url: doc.url,
                    snippet: doc.metadata?.snippet as string | undefined,
                    metadata: {
                        ...doc.metadata,
                        type: doc.type,
                        sourceUrl: doc.sourceUrl,
                        relevanceScore: doc.relevanceScore,
                        discoveredAt: doc.discoveredAt,
                        source: 'documents'
                    }
                });
            }
        }

        // Extract from endpoints
        if (workflowOutput.results?.endpoints) {
            for (const endpoint of workflowOutput.results.endpoints) {
                candidates.push({
                    id: `endpoint-${candidates.length}`,
                    title: endpoint.title || endpoint.url || 'Untitled',
                    url: endpoint.url,
                    snippet: endpoint.snippet,
                    metadata: {
                        ...endpoint.metadata,
                        type: endpoint.type,
                        sourceUrl: endpoint.sourceUrl,
                        relevanceScore: endpoint.relevanceScore,
                        source: 'endpoints'
                    }
                });
            }
        }

        if (candidates.length === 0) {
            throw new Error('No candidates found in workflow output');
        }

        // Limit candidates if specified
        const limitedCandidates = options?.maxCandidates
            ? candidates.slice(0, options.maxCandidates)
            : candidates;

        // Create review
        const review = await this.reviewModel.createReview({
            runId,
            workflowId,
            moduleId,
            moduleName,
            candidateResults: limitedCandidates,
            aggregationStrategy: options?.aggregationStrategy,
            requiredReviewers: options?.requiredReviewers
        });

        // Apply automation if enabled
        try {
            const autoReviewedCount = await this.applyReviewAutomation(review._id!.toString());
            if (autoReviewedCount > 0) {
                console.log(`[ReviewService] Auto-reviewed ${autoReviewedCount} candidates in review ${review._id}`);
            }
        } catch (error) {
            console.warn(`[ReviewService] Failed to apply automation to review ${review._id}:`, error);
            // Don't throw - automation failure shouldn't break review creation
        }

        return review;
    }

    /**
     * Automatically complete a review if all candidates have been reviewed.
     * 
     * Checks if all candidates in the review have been accepted or rejected,
     * and if so, automatically completes the review. This is useful for
     * automation workflows where reviews should complete automatically.
     * 
     * @param reviewId - The ID of the review
     * @param autoResume - Whether to automatically resume the workflow after completion (default: false)
     * @returns True if review was completed, false otherwise
     * 
     * @example
     * ```typescript
     * const completed = await reviewService.autoCompleteReviewIfReady('review-123');
     * if (completed) {
     *   console.log('Review was automatically completed');
     * }
     * ```
     */
    async autoCompleteReviewIfReady(
        reviewId: string,
        autoResume: boolean = false
    ): Promise<boolean> {
        const review = await this.reviewModel.getReviewById(reviewId);
        if (!review) {
            throw new ReviewNotFoundError(`Review not found: ${reviewId}`);
        }

        // Check if review is already completed
        if (review.status === 'completed') {
            return false;
        }

        // Check if all candidates have been reviewed
        const allReviewed = review.candidateResults.every(
            candidate => candidate.reviewStatus !== 'pending'
        );

        if (!allReviewed) {
            return false;
        }

        // Complete the review
        await this.reviewModel.completeReview(reviewId, undefined); // No userId for automated completion

        console.log(`[ReviewService] Auto-completed review ${reviewId} (all candidates reviewed)`);

        // Optionally resume workflow
        if (autoResume) {
            try {
                const run = await this.runManager.getRun(review.runId.toString());
                if (run && run.status === 'paused') {
                    const workflow = await getWorkflowById(review.workflowId);
                    if (workflow) {
                        await this.completeReviewAndResume(reviewId, workflow, undefined);
                        console.log(`[ReviewService] Auto-resumed workflow after completing review ${reviewId}`);
                    }
                }
            } catch (error) {
                console.warn(`[ReviewService] Failed to auto-resume workflow after completing review ${reviewId}:`, error);
                // Don't throw - resume failure shouldn't break completion
            }
        }

        return true;
    }

    /**
     * Query reviews with filtering options for automation purposes.
     * 
     * Allows filtering reviews by status, workflow, module, and other criteria.
     * Useful for bulk automation operations and review management.
     * 
     * @param filters - Filter criteria
     * @returns Array of matching review documents
     * 
     * @example
     * ```typescript
     * const pendingReviews = await reviewService.queryReviews({
     *   status: 'pending',
     *   workflowId: 'workflow-123'
     * });
     * ```
     */
    async queryReviews(filters: {
        status?: 'pending' | 'completed';
        workflowId?: string;
        moduleId?: string;
        runId?: string;
        limit?: number;
        skip?: number;
    }): Promise<WorkflowReviewDocument[]> {
        const query: Record<string, unknown> = {};

        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.workflowId) {
            query.workflowId = filters.workflowId;
        }
        if (filters.moduleId) {
            query.moduleId = filters.moduleId;
        }
        if (filters.runId) {
            query.runId = new ObjectId(filters.runId);
        }

        const db = getDB();
        const collection = db.collection<WorkflowReviewDocument>('workflowreviews');

        let cursor = collection.find(query);

        if (filters.skip) {
            cursor = cursor.skip(filters.skip);
        }
        if (filters.limit) {
            cursor = cursor.limit(filters.limit);
        }

        cursor = cursor.sort({ createdAt: -1 }); // Most recent first

        return await cursor.toArray();
    }

    /**
     * Get reviews that are ready for automation (all candidates reviewed but not completed).
     * 
     * Returns reviews where all candidates have been reviewed (accepted or rejected)
     * but the review itself is still pending. These reviews can be auto-completed.
     * 
     * @param workflowId - Optional workflow ID to filter by
     * @param limit - Maximum number of reviews to return
     * @returns Array of review documents ready for automation
     * 
     * @example
     * ```typescript
     * const readyReviews = await reviewService.getReviewsReadyForAutomation();
     * for (const review of readyReviews) {
     *   await reviewService.autoCompleteReviewIfReady(review._id!.toString());
     * }
     * ```
     */
    async getReviewsReadyForAutomation(
        workflowId?: string,
        limit: number = 100
    ): Promise<WorkflowReviewDocument[]> {
        const filters: {
            status?: 'pending' | 'completed';
            workflowId?: string;
            limit?: number;
        } = {
            status: 'pending',
            limit
        };

        if (workflowId) {
            filters.workflowId = workflowId;
        }

        const pendingReviews = await this.queryReviews(filters);

        // Filter to only those where all candidates are reviewed
        return pendingReviews.filter(review =>
            review.candidateResults.every(
                candidate => candidate.reviewStatus !== 'pending'
            )
        );
    }
}

