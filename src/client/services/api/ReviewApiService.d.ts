import { BaseApiService } from './BaseApiService';
/**
 * Review API service (US-009)
 */
export declare class ReviewApiService extends BaseApiService {
    getReview(runId: string, moduleId?: string): Promise<unknown>;
    getAllReviews(runId: string): Promise<unknown[]>;
    reviewCandidate(reviewId: string, candidateId: string, status: 'accepted' | 'rejected', notes?: string): Promise<{
        message: string;
    }>;
    reviewCandidates(reviewId: string, decisions: Array<{
        candidateId: string;
        status: 'accepted' | 'rejected';
    }>): Promise<{
        message: string;
    }>;
    completeReview(reviewId: string, workflowId: string): Promise<{
        message: string;
    }>;
    getReviewStatistics(workflowId: string): Promise<{
        totalReviews: number;
        totalAccepted: number;
        totalRejected: number;
        acceptanceRate: number;
        patterns: Array<{
            urlPattern: string;
            acceptanceRate: number;
            count: number;
        }>;
    }>;
    getReviewHistory(workflowId: string, limit?: number): Promise<unknown[]>;
    getReviewStats(reviewId: string): Promise<{
        total: number;
        accepted: number;
        rejected: number;
        pending: number;
    }>;
    getPendingReviews(runId: string): Promise<unknown[]>;
    deleteReview(reviewId: string): Promise<{
        message: string;
    }>;
    deleteReviewsByRun(runId: string): Promise<{
        message: string;
        deletedCount: number;
    }>;
}
