import { BaseApiService } from './BaseApiService';

/**
 * Review API service (US-009)
 */
export class ReviewApiService extends BaseApiService {
  async getReview(runId: string, moduleId?: string) {
    const url = moduleId ? `/reviews/${runId}?moduleId=${moduleId}` : `/reviews/${runId}`;
    return this.request<unknown>(url);
  }

  async getAllReviews(runId: string) {
    return this.request<unknown[]>(`/reviews/${runId}?all=true`);
  }

  async reviewCandidate(
    reviewId: string,
    candidateId: string,
    status: 'accepted' | 'rejected',
    notes?: string
  ) {
    return this.request<{ message: string }>(`/reviews/${reviewId}/candidates/${candidateId}`, {
      method: 'POST',
      body: JSON.stringify({ status, notes }),
    });
  }

  async reviewCandidates(
    reviewId: string,
    decisions: Array<{ candidateId: string; status: 'accepted' | 'rejected' }>
  ) {
    return this.request<{ message: string }>(`/reviews/${reviewId}/candidates`, {
      method: 'POST',
      body: JSON.stringify({ decisions }),
    });
  }

  async completeReview(reviewId: string, workflowId: string) {
    return this.request<{ message: string }>(`/reviews/${reviewId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ workflowId }),
    });
  }

  async getReviewStatistics(workflowId: string) {
    return this.request<{
      totalReviews: number;
      totalAccepted: number;
      totalRejected: number;
      acceptanceRate: number;
      patterns: Array<{
        urlPattern: string;
        acceptanceRate: number;
        count: number;
      }>;
    }>(`/reviews/statistics/${workflowId}`);
  }

  async getReviewHistory(workflowId: string, limit: number = 100) {
    return this.request<unknown[]>(`/reviews/history/${workflowId}?limit=${limit}`);
  }

  async getReviewStats(reviewId: string) {
    return this.request<{
      total: number;
      accepted: number;
      rejected: number;
      pending: number;
    }>(`/reviews/${reviewId}/stats`);
  }

  async getPendingReviews(runId: string) {
    return this.request<unknown[]>(`/reviews/run/${runId}/pending`);
  }

  async deleteReview(reviewId: string) {
    return this.request<{ message: string }>(`/reviews/${reviewId}`, {
      method: 'DELETE',
    });
  }

  async deleteReviewsByRun(runId: string) {
    return this.request<{ message: string; deletedCount: number }>(`/reviews/run/${runId}`, {
      method: 'DELETE',
    });
  }
}

