import { getDB } from '../config/database.js';
import { ObjectId, Collection, type UpdateFilter } from 'mongodb';
import { validateReviewCreateInput, validateObjectId, sanitizeCandidate } from './WorkflowReviewValidation.js';

export type ReviewStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Aggregation strategies for collaborative review decisions
 */
export type AggregationStrategy = 'majority' | 'consensus' | 'first-reviewer' | 'unanimous' | 'single-reviewer';

/**
 * Individual reviewer decision for a candidate
 */
export interface ReviewerDecision {
    userId: ObjectId;
    status: 'accepted' | 'rejected';
    reviewedAt: Date;
    notes?: string;
}

/**
 * Candidate result with support for both single-reviewer (backward compatible) and collaborative review
 */
export interface CandidateResult {
    id: string;
    title: string;
    url: string;
    snippet?: string;
    metadata?: Record<string, unknown>;
    // Single-reviewer fields (backward compatible)
    reviewStatus: ReviewStatus;
    reviewedAt?: Date;
    reviewedBy?: ObjectId;
    reviewNotes?: string;
    // Collaborative review fields
    reviewDecisions?: ReviewerDecision[]; // Multiple reviewer decisions
    aggregatedStatus?: ReviewStatus; // Final status after aggregation
}

export interface WorkflowReviewDocument {
    _id?: ObjectId;
    runId: ObjectId;
    workflowId: string;
    moduleId: string;
    moduleName: string;
    candidateResults: CandidateResult[];
    status: 'pending' | 'completed';
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    completedBy?: ObjectId;
    // Collaborative review configuration
    aggregationStrategy?: AggregationStrategy; // Default: 'single-reviewer' for backward compatibility
    requiredReviewers?: number; // Minimum number of reviewers required (for consensus/unanimous)
}

export interface WorkflowReviewCreateInput {
    runId: string;
    workflowId: string;
    moduleId: string;
    moduleName: string;
    candidateResults: Omit<CandidateResult, 'reviewStatus'>[];
    aggregationStrategy?: AggregationStrategy; // Optional: defaults to 'single-reviewer' for backward compatibility
    requiredReviewers?: number; // Optional: minimum reviewers for consensus/unanimous strategies
}

export interface ReviewDecisionInput {
    candidateId: string;
    status: 'accepted' | 'rejected';
    userId?: string;
}

/**
 * Model for managing workflow review documents in MongoDB.
 * 
 * The WorkflowReviewModel provides database operations for:
 * - Creating and retrieving reviews
 * - Updating candidate review statuses
 * - Computing review statistics and patterns
 * - Managing review lifecycle (pending -> completed)
 * 
 * @example
 * ```typescript
 * const reviewModel = getWorkflowReviewModel();
 * const review = await reviewModel.createReview({
 *   runId: 'run-123',
 *   workflowId: 'workflow-456',
 *   moduleId: 'extract-metadata',
 *   moduleName: 'Extract Metadata',
 *   candidateResults: [...]
 * });
 * ```
 */
export class WorkflowReviewModel {
    private collection: Collection<WorkflowReviewDocument>;

    /**
     * Creates a new WorkflowReviewModel instance.
     * 
     * Initializes the MongoDB collection and ensures indexes are created
     * for optimal query performance.
     */
    constructor() {
        const db = getDB();
        this.collection = db.collection<WorkflowReviewDocument>('workflowReviews');
        // Create indexes for performance (idempotent)
        this.ensureIndexes().catch(err => {
            console.warn('Failed to create workflowReviews indexes:', err);
        });
    }

    /**
     * Ensure database indexes exist for optimal query performance.
     * 
     * Creates indexes on:
     * - runId + moduleId (for finding reviews by run and module)
     * - runId + status (for finding pending reviews by run)
     * - workflowId + status + completedAt (for review history queries)
     * - createdAt (for sorting by creation date)
     * 
     * @private
     */
    private async ensureIndexes(): Promise<void> {
        try {
            await this.collection.createIndex({ runId: 1, moduleId: 1 }, { unique: false });
            await this.collection.createIndex({ runId: 1, status: 1 });
            await this.collection.createIndex({ workflowId: 1, status: 1, completedAt: -1 });
            await this.collection.createIndex({ createdAt: -1 });
        } catch (error) {
            // Indexes might already exist, which is fine
            if (error instanceof Error && !error.message.includes('already exists')) {
                throw error;
            }
        }
    }

    /**
     * Create a new workflow review.
     * 
     * Creates a review document with candidate results that need to be
     * reviewed. All candidates start with 'pending' reviewStatus.
     * 
     * @param input - Review creation input with runId, workflowId, moduleId, and candidates
     * @returns The created review document
     * @throws {Error} If input validation fails
     * 
     * @example
     * ```typescript
     * const review = await reviewModel.createReview({
     *   runId: 'run-123',
     *   workflowId: 'workflow-456',
     *   moduleId: 'extract-metadata',
     *   moduleName: 'Extract Metadata',
     *   candidateResults: [
     *     { id: 'candidate-1', title: 'Page 1', url: 'https://example.com/page1' }
     *   ]
     * });
     * ```
     */
    async createReview(input: WorkflowReviewCreateInput): Promise<WorkflowReviewDocument> {
        // Validate input
        const validation = validateReviewCreateInput(input);
        if (!validation.valid) {
            throw new Error(`Invalid review input: ${validation.errors.join(', ')}`);
        }

        // Validate ObjectId format
        if (!validateObjectId(input.runId)) {
            throw new Error(`Invalid runId format: ${input.runId}`);
        }

        // Sanitize and prepare candidates
        const sanitizedCandidates = input.candidateResults.map((candidate, idx) => {
            const sanitized = sanitizeCandidate(candidate);
            return {
                ...sanitized,
                id: sanitized.id || `candidate-${idx}-${Date.now()}`,
                reviewStatus: 'pending' as ReviewStatus
            };
        });

        const review: WorkflowReviewDocument = {
            runId: new ObjectId(input.runId),
            workflowId: input.workflowId,
            moduleId: input.moduleId,
            moduleName: input.moduleName,
            candidateResults: sanitizedCandidates,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            // Collaborative review configuration (optional, defaults to single-reviewer)
            aggregationStrategy: input.aggregationStrategy || 'single-reviewer',
            ...(input.requiredReviewers !== undefined ? { requiredReviewers: input.requiredReviewers } : {})
        };

        const result = await this.collection.insertOne(review);
        return { ...review, _id: result.insertedId };
    }

    /**
     * Get a review by run ID and module ID
     */
    async getReviewByRunAndModule(runId: string, moduleId: string): Promise<WorkflowReviewDocument | null> {
        if (!validateObjectId(runId)) {
            throw new Error(`Invalid runId format: ${runId}`);
        }
        if (!moduleId || typeof moduleId !== 'string') {
            throw new Error('moduleId must be a non-empty string');
        }
        return this.collection.findOne({
            runId: new ObjectId(runId),
            moduleId
        });
    }

    /**
     * Get a review by ID
     */
    async getReviewById(reviewId: string): Promise<WorkflowReviewDocument | null> {
        if (!validateObjectId(reviewId)) {
            throw new Error(`Invalid reviewId format: ${reviewId}`);
        }
        return this.collection.findOne({ _id: new ObjectId(reviewId) });
    }

    /**
     * Get all pending reviews for a run
     */
    async getPendingReviewsByRun(runId: string): Promise<WorkflowReviewDocument[]> {
        // Limit to prevent memory exhaustion when loading pending reviews
        // Default limit: 1000 reviews, configurable via environment variable
        const MAX_WORKFLOW_REVIEWS = parseInt(process.env.MAX_WORKFLOW_REVIEWS || '1000', 10);
        
        const reviews = await this.collection
            .find({
                runId: new ObjectId(runId),
                status: 'pending'
            })
            .sort({ createdAt: -1 })
            .limit(MAX_WORKFLOW_REVIEWS)
            .toArray();
        
        if (reviews.length === MAX_WORKFLOW_REVIEWS) {
            console.warn(
                `[WorkflowReview] getPendingReviewsByRun() query may have been truncated at ${MAX_WORKFLOW_REVIEWS} entries. ` +
                `Consider increasing MAX_WORKFLOW_REVIEWS.`
            );
        }
        
        return reviews;
    }

    /**
     * Check if a review exists for a run and module
     */
    async hasReview(runId: string, moduleId: string): Promise<boolean> {
        const review = await this.getReviewByRunAndModule(runId, moduleId);
        return review !== null;
    }

    /**
     * Update candidate review status (backward compatible single-reviewer mode)
     */
    async updateCandidateStatus(
        reviewId: string,
        candidateId: string,
        status: 'accepted' | 'rejected',
        userId?: string,
        notes?: string
    ): Promise<void> {
        if (!validateObjectId(reviewId)) {
            throw new Error(`Invalid reviewId format: ${reviewId}`);
        }
        if (!candidateId || typeof candidateId !== 'string') {
            throw new Error('candidateId must be a non-empty string');
        }
        if (status !== 'accepted' && status !== 'rejected') {
            throw new Error(`Invalid status: ${status}. Must be 'accepted' or 'rejected'`);
        }
        if (userId && !validateObjectId(userId)) {
            throw new Error(`Invalid userId format: ${userId}`);
        }

        // Check if review uses collaborative mode
        const review = await this.getReviewById(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }

        // If collaborative mode, use addReviewerDecision instead
        if (review.aggregationStrategy && review.aggregationStrategy !== 'single-reviewer') {
            if (!userId) {
                throw new Error('userId is required for collaborative review');
            }
            await this.addReviewerDecision(reviewId, candidateId, userId, status, notes);
            return;
        }

        // Single-reviewer mode (backward compatible)
        const update: UpdateFilter<WorkflowReviewDocument> = {
            $set: {
                'candidateResults.$[elem].reviewStatus': status,
                'candidateResults.$[elem].reviewedAt': new Date(),
                updatedAt: new Date(),
                ...(userId ? { 'candidateResults.$[elem].reviewedBy': new ObjectId(userId) } : {}),
                ...(notes ? { 'candidateResults.$[elem].reviewNotes': notes } : {})
            } as Record<string, unknown>
        };

        await this.collection.updateOne(
            { _id: new ObjectId(reviewId) },
            update,
            {
                arrayFilters: [{ 'elem.id': candidateId }]
            }
        );
    }

    /**
     * Add a reviewer decision for collaborative review.
     * 
     * Adds a decision from a specific reviewer. If the reviewer has already
     * made a decision, it updates their existing decision. After adding the
     * decision, automatically aggregates the final status based on the review's
     * aggregation strategy.
     * 
     * @param reviewId - The ID of the review
     * @param candidateId - The ID of the candidate
     * @param userId - The ID of the reviewer (required)
     * @param status - The decision: 'accepted' or 'rejected'
     * @param notes - Optional notes from the reviewer
     * @throws {Error} If review, candidate, or user ID is invalid
     * 
     * @example
     * ```typescript
     * await reviewModel.addReviewerDecision(
     *   'review-123',
     *   'candidate-456',
     *   'user-789',
     *   'accepted',
     *   'This looks good'
     * );
     * ```
     */
    async addReviewerDecision(
        reviewId: string,
        candidateId: string,
        userId: string,
        status: 'accepted' | 'rejected',
        notes?: string
    ): Promise<void> {
        if (!validateObjectId(reviewId)) {
            throw new Error(`Invalid reviewId format: ${reviewId}`);
        }
        if (!candidateId || typeof candidateId !== 'string') {
            throw new Error('candidateId must be a non-empty string');
        }
        if (!userId || !validateObjectId(userId)) {
            throw new Error('userId is required and must be a valid ObjectId');
        }
        if (status !== 'accepted' && status !== 'rejected') {
            throw new Error(`Invalid status: ${status}. Must be 'accepted' or 'rejected'`);
        }

        const review = await this.getReviewById(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }

        const candidate = review.candidateResults.find(c => c.id === candidateId);
        if (!candidate) {
            throw new Error(`Candidate not found: ${candidateId}`);
        }

        const userIdObj = new ObjectId(userId);
        const decision: ReviewerDecision = {
            userId: userIdObj,
            status,
            reviewedAt: new Date(),
            notes
        };

        // Get existing decisions or initialize array
        const existingDecisions = candidate.reviewDecisions || [];
        
        // Check if this reviewer already made a decision
        const existingIndex = existingDecisions.findIndex(
            d => d.userId.toString() === userId
        );

        let updatedDecisions: ReviewerDecision[];
        if (existingIndex >= 0) {
            // Update existing decision
            updatedDecisions = [...existingDecisions];
            updatedDecisions[existingIndex] = decision;
        } else {
            // Add new decision
            updatedDecisions = [...existingDecisions, decision];
        }

        // Aggregate final status
        const aggregatedStatus = this.aggregateDecisions(
            updatedDecisions,
            review.aggregationStrategy || 'single-reviewer',
            review.requiredReviewers
        );

        // Update candidate with new decision and aggregated status
        const update: UpdateFilter<WorkflowReviewDocument> = {
            $set: {
                'candidateResults.$[elem].reviewDecisions': updatedDecisions,
                'candidateResults.$[elem].aggregatedStatus': aggregatedStatus,
                'candidateResults.$[elem].reviewStatus': aggregatedStatus, // For backward compatibility
                updatedAt: new Date()
            } as Record<string, unknown>
        };

        await this.collection.updateOne(
            { _id: new ObjectId(reviewId) },
            update,
            {
                arrayFilters: [{ 'elem.id': candidateId }]
            }
        );
    }

    /**
     * Aggregate multiple reviewer decisions into a final status.
     * 
     * @param decisions - Array of reviewer decisions
     * @param strategy - Aggregation strategy to use
     * @param requiredReviewers - Minimum number of reviewers (for consensus/unanimous)
     * @returns The aggregated review status
     * @private
     */
    private aggregateDecisions(
        decisions: ReviewerDecision[],
        strategy: AggregationStrategy,
        requiredReviewers?: number
    ): ReviewStatus {
        if (decisions.length === 0) {
            return 'pending';
        }

        switch (strategy) {
            case 'single-reviewer':
                // Single reviewer mode: use first decision
                return decisions[0].status;
            
            case 'first-reviewer':
                // Use the first reviewer's decision
                return decisions[0].status;
            
            case 'majority': {
                // Majority vote: accept if more accept than reject
                const accepted = decisions.filter(d => d.status === 'accepted').length;
                const rejected = decisions.filter(d => d.status === 'rejected').length;
                if (accepted > rejected) {
                    return 'accepted';
                } else if (rejected > accepted) {
                    return 'rejected';
                } else {
                    // Tie: default to rejected (conservative)
                    return 'rejected';
                }
            }
            
            case 'consensus': {
                // Consensus: all reviewers must agree
                const required = requiredReviewers || decisions.length;
                if (decisions.length < required) {
                    return 'pending'; // Not enough reviewers yet
                }
                const allAccepted = decisions.every(d => d.status === 'accepted');
                const allRejected = decisions.every(d => d.status === 'rejected');
                if (allAccepted) {
                    return 'accepted';
                } else if (allRejected) {
                    return 'rejected';
                } else {
                    // No consensus: use majority as fallback
                    const acc = decisions.filter(d => d.status === 'accepted').length;
                    const rej = decisions.filter(d => d.status === 'rejected').length;
                    return acc > rej ? 'accepted' : 'rejected';
                }
            }
            
            case 'unanimous': {
                // Unanimous: all must agree, otherwise pending
                const allSame = decisions.every(d => d.status === decisions[0].status);
                if (allSame) {
                    return decisions[0].status;
                } else {
                    return 'pending'; // Wait for unanimous agreement
                }
            }
            
            default: {
                // Default to majority
                const accCount = decisions.filter(d => d.status === 'accepted').length;
                const rejCount = decisions.filter(d => d.status === 'rejected').length;
                return accCount > rejCount ? 'accepted' : 'rejected';
            }
        }
    }

    /**
     * Delete a review by ID
     */
    async deleteReview(reviewId: string): Promise<boolean> {
        if (!validateObjectId(reviewId)) {
            throw new Error(`Invalid reviewId format: ${reviewId}`);
        }
        const result = await this.collection.deleteOne({ _id: new ObjectId(reviewId) });
        return result.deletedCount > 0;
    }

    /**
     * Delete all reviews for a run
     */
    async deleteReviewsByRun(runId: string): Promise<number> {
        if (!validateObjectId(runId)) {
            throw new Error(`Invalid runId format: ${runId}`);
        }
        const result = await this.collection.deleteMany({ runId: new ObjectId(runId) });
        return result.deletedCount;
    }

    /**
     * Complete a review (mark all pending as rejected or use provided decisions)
     */
    async completeReview(reviewId: string, userId?: string): Promise<void> {
        if (!validateObjectId(reviewId)) {
            throw new Error(`Invalid reviewId format: ${reviewId}`);
        }
        if (userId && !validateObjectId(userId)) {
            throw new Error(`Invalid userId format: ${userId}`);
        }

        // Check if review exists
        const review = await this.getReviewById(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }
        if (review.status === 'completed') {
            throw new Error(`Review ${reviewId} is already completed`);
        }

        const update: UpdateFilter<WorkflowReviewDocument> = {
            $set: {
                status: 'completed',
                completedAt: new Date(),
                updatedAt: new Date(),
                'candidateResults.$[elem].reviewStatus': 'rejected',
                ...(userId ? { completedBy: new ObjectId(userId) } : {})
            } as Record<string, unknown>
        };

        // Mark any remaining pending candidates as rejected
        await this.collection.updateOne(
            { _id: new ObjectId(reviewId) },
            update,
            {
                arrayFilters: [{ 'elem.reviewStatus': 'pending' }]
            }
        );
    }

    /**
     * Batch update multiple candidate statuses.
     * 
     * More efficient than calling updateCandidateStatus multiple times.
     * Uses MongoDB bulkWrite for optimal performance when updating many
     * candidates at once.
     * 
     * Supports both single-reviewer and collaborative review modes.
     * 
     * @param reviewId - The ID of the review
     * @param decisions - Array of decisions with candidateId, status, and optional notes
     * @param userId - Optional user ID who made the decisions (required for collaborative review)
     * @throws {Error} If review is not found or input is invalid
     * 
     * @example
     * ```typescript
     * await reviewModel.batchUpdateCandidateStatus('review-123', [
     *   { candidateId: 'candidate-1', status: 'accepted' },
     *   { candidateId: 'candidate-2', status: 'rejected', notes: 'Not relevant' }
     * ], 'user-789');
     * ```
     */
    async batchUpdateCandidateStatus(
        reviewId: string,
        decisions: Array<{ candidateId: string; status: 'accepted' | 'rejected'; notes?: string }>,
        userId?: string
    ): Promise<void> {
        const review = await this.getReviewById(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }

        // If collaborative mode, use addReviewerDecision for each
        if (review.aggregationStrategy && review.aggregationStrategy !== 'single-reviewer') {
            if (!userId) {
                throw new Error('userId is required for collaborative review');
            }
            // Process each decision individually (they need aggregation)
            for (const decision of decisions) {
                await this.addReviewerDecision(
                    reviewId,
                    decision.candidateId,
                    userId,
                    decision.status,
                    decision.notes
                );
            }
            return;
        }

        // Single-reviewer mode (backward compatible)
        // Build update operations for each decision
        const updateOps = decisions.map(decision => {
            const update: Record<string, unknown> = {
                $set: {
                    'candidateResults.$[elem].reviewStatus': decision.status,
                    'candidateResults.$[elem].reviewedAt': new Date(),
                    updatedAt: new Date()
                }
            };

            if (userId) {
                (update.$set as Record<string, unknown>)['candidateResults.$[elem].reviewedBy'] = new ObjectId(userId);
            }

            if (decision.notes) {
                (update.$set as Record<string, unknown>)['candidateResults.$[elem].reviewNotes'] = decision.notes;
            }

            return {
                updateOne: {
                    filter: { _id: new ObjectId(reviewId) },
                    update,
                    arrayFilters: [{ 'elem.id': decision.candidateId }]
                }
            };
        });

        // Execute all updates in a single bulk operation for optimal performance
        if (updateOps.length > 0) {
            await this.collection.bulkWrite(updateOps, { ordered: false }); // Unordered for better performance
        }
    }

    /**
     * Get accepted candidates for a review.
     * 
     * For collaborative reviews, uses aggregatedStatus if available,
     * otherwise falls back to reviewStatus.
     */
    async getAcceptedCandidates(reviewId: string): Promise<CandidateResult[]> {
        const review = await this.getReviewById(reviewId);
        if (!review) {
            return [];
        }
        return review.candidateResults.filter(c => {
            // Use aggregatedStatus for collaborative reviews, fallback to reviewStatus
            const status = c.aggregatedStatus || c.reviewStatus;
            return status === 'accepted';
        });
    }

    /**
     * Get rejected candidates for a review.
     * 
     * For collaborative reviews, uses aggregatedStatus if available,
     * otherwise falls back to reviewStatus.
     */
    async getRejectedCandidates(reviewId: string): Promise<CandidateResult[]> {
        const review = await this.getReviewById(reviewId);
        if (!review) {
            return [];
        }
        return review.candidateResults.filter(c => {
            // Use aggregatedStatus for collaborative reviews, fallback to reviewStatus
            const status = c.aggregatedStatus || c.reviewStatus;
            return status === 'rejected';
        });
    }

    /**
     * Get pending candidates for a review.
     * 
     * For collaborative reviews, uses aggregatedStatus if available,
     * otherwise falls back to reviewStatus.
     */
    async getPendingCandidates(reviewId: string): Promise<CandidateResult[]> {
        const review = await this.getReviewById(reviewId);
        if (!review) {
            return [];
        }
        return review.candidateResults.filter(c => {
            // Use aggregatedStatus for collaborative reviews, fallback to reviewStatus
            const status = c.aggregatedStatus || c.reviewStatus;
            return status === 'pending';
        });
    }

    /**
     * Get reviewer decisions for a specific candidate.
     * 
     * Returns all individual reviewer decisions for the candidate,
     * useful for collaborative review workflows.
     * 
     * @param reviewId - The ID of the review
     * @param candidateId - The ID of the candidate
     * @returns Array of reviewer decisions, or empty array if none exist
     * @throws {Error} If review or candidate is not found
     * 
     * @example
     * ```typescript
     * const decisions = await reviewModel.getReviewerDecisions('review-123', 'candidate-456');
     * console.log(`${decisions.length} reviewers have made decisions`);
     * ```
     */
    async getReviewerDecisions(reviewId: string, candidateId: string): Promise<ReviewerDecision[]> {
        const review = await this.getReviewById(reviewId);
        if (!review) {
            throw new Error(`Review not found: ${reviewId}`);
        }
        const candidate = review.candidateResults.find(c => c.id === candidateId);
        if (!candidate) {
            throw new Error(`Candidate not found: ${candidateId}`);
        }
        return candidate.reviewDecisions || [];
    }

    /**
     * Get candidate count statistics for a review.
     * 
     * For collaborative reviews, uses aggregatedStatus if available,
     * otherwise falls back to reviewStatus.
     */
    async getCandidateStats(reviewId: string): Promise<{
        total: number;
        accepted: number;
        rejected: number;
        pending: number;
    }> {
        const review = await this.getReviewById(reviewId);
        if (!review) {
            return { total: 0, accepted: 0, rejected: 0, pending: 0 };
        }
        return {
            total: review.candidateResults.length,
            accepted: review.candidateResults.filter(c => {
                const status = c.aggregatedStatus || c.reviewStatus;
                return status === 'accepted';
            }).length,
            rejected: review.candidateResults.filter(c => {
                const status = c.aggregatedStatus || c.reviewStatus;
                return status === 'rejected';
            }).length,
            pending: review.candidateResults.filter(c => {
                const status = c.aggregatedStatus || c.reviewStatus;
                return status === 'pending';
            }).length
        };
    }

    /**
     * Get review history for a workflow (for learning)
     */
    async getReviewHistory(workflowId: string, limit: number = 100): Promise<WorkflowReviewDocument[]> {
        return this.collection
            .find({ workflowId, status: 'completed' })
            .sort({ completedAt: -1 })
            .limit(limit)
            .toArray();
    }

    /**
     * Get review statistics for learning algorithms.
     * 
     * Analyzes completed reviews to compute:
     * - Total reviews, accepted, and rejected counts
     * - Overall acceptance rate
     * - URL pattern acceptance rates (for pattern matching)
     * 
     * Results are sorted by pattern count (most common first).
     * Used by the learning algorithm to boost candidate scores.
     * 
     * @param workflowId - The ID of the workflow
     * @returns Statistics object with review counts and URL patterns
     * 
     * @example
     * ```typescript
     * const stats = await reviewModel.getReviewStatistics('workflow-123');
     * console.log(`Acceptance rate: ${stats.acceptanceRate}`);
     * stats.patterns.forEach(pattern => {
     *   console.log(`${pattern.urlPattern}: ${pattern.acceptanceRate}`);
     * });
     * ```
     */
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
        const reviews = await this.getReviewHistory(workflowId, 1000);
        
        let totalAccepted = 0;
        let totalRejected = 0;
        const urlPatterns: Map<string, { accepted: number; rejected: number }> = new Map();

        for (const review of reviews) {
            for (const candidate of review.candidateResults) {
                if (candidate.reviewStatus === 'accepted') {
                    totalAccepted++;
                } else if (candidate.reviewStatus === 'rejected') {
                    totalRejected++;
                }

                // Extract URL pattern (domain + first path segment)
                try {
                    const url = new URL(candidate.url);
                    // Normalize hostname (remove www.)
                    const hostname = url.hostname.replace(/^www\./, '');
                    const pathSegments = url.pathname.split('/').filter(s => s);
                    const pattern = pathSegments.length > 0 
                        ? `${hostname}/${pathSegments[0]}`
                        : hostname;
                    
                    if (!urlPatterns.has(pattern)) {
                        urlPatterns.set(pattern, { accepted: 0, rejected: 0 });
                    }
                    const stats = urlPatterns.get(pattern)!;
                    if (candidate.reviewStatus === 'accepted') {
                        stats.accepted++;
                    } else if (candidate.reviewStatus === 'rejected') {
                        stats.rejected++;
                    }
                } catch (_e) {
                    // Invalid URL, skip pattern extraction
                    continue;
                }
            }
        }

        const total = totalAccepted + totalRejected;
        const patterns = Array.from(urlPatterns.entries()).map(([pattern, stats]) => {
            const count = stats.accepted + stats.rejected;
            const acceptanceRate = count > 0 ? stats.accepted / count : 0;
            return { urlPattern: pattern, acceptanceRate, count };
        }).sort((a, b) => b.count - a.count);

        return {
            totalReviews: reviews.length,
            totalAccepted,
            totalRejected,
            acceptanceRate: total > 0 ? totalAccepted / total : 0,
            patterns
        };
    }
}

// Singleton instance
let reviewModelInstance: WorkflowReviewModel | null = null;

export function getWorkflowReviewModel(): WorkflowReviewModel {
    if (!reviewModelInstance) {
        reviewModelInstance = new WorkflowReviewModel();
    }
    return reviewModelInstance;
}

