import { getWorkflowReviewModel, WorkflowReviewDocument } from '../../models/WorkflowReview.js';
import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';

/**
 * Analytics data structures for review metrics
 */
export interface ReviewMetrics {
    totalReviews: number;
    pendingReviews: number;
    completedReviews: number;
    averageReviewDuration: number; // in seconds
    averageCandidatesPerReview: number;
    acceptanceRate: number; // 0-1, percentage of accepted candidates
    rejectionRate: number; // 0-1, percentage of rejected candidates
    reviewsByWorkflow: Record<string, number>;
    reviewsByModule: Record<string, number>;
    reviewsOverTime: Array<{ date: string; count: number }>;
    averageCandidatesReviewedPerDay: number;
}

export interface CandidateAnalytics {
    totalCandidates: number;
    acceptedCandidates: number;
    rejectedCandidates: number;
    pendingCandidates: number;
    acceptanceRate: number;
    rejectionRate: number;
    averageReviewTime: number; // seconds
    topRejectedUrls: Array<{ url: string; count: number }>;
    topAcceptedUrls: Array<{ url: string; count: number }>;
}

export interface ReviewTrends {
    period: 'day' | 'week' | 'month';
    acceptanceRateTrend: number[]; // Array of acceptance rates over time
    reviewVolumeTrend: number[]; // Array of review counts over time
    averageDurationTrend: number[]; // Array of average durations over time
    dates: string[]; // Corresponding dates for trends
}

/**
 * Review Analytics Service
 * 
 * Provides analytics and metrics for workflow reviews to help understand
 * review patterns, candidate acceptance rates, and review efficiency.
 */
export class ReviewAnalytics {
    private reviewModel = getWorkflowReviewModel();

    /**
     * Get comprehensive review metrics
     */
    async getReviewMetrics(timeRangeDays: number = 30): Promise<ReviewMetrics> {
        const db = getDB();
        const collection = db.collection('workflowReviews');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeRangeDays);

        // Get all reviews in time range
        const reviews = await collection
            .find({
                createdAt: { $gte: startDate }
            })
            .toArray();

        const totalReviews = reviews.length;
        const pendingReviews = reviews.filter(r => r.status === 'pending').length;
        const completedReviews = reviews.filter(r => r.status === 'completed').length;

        // Calculate average review duration
        const completedReviewsWithDuration = reviews.filter(r => 
            r.status === 'completed' && r.completedAt && r.createdAt
        );
        const averageReviewDuration = completedReviewsWithDuration.length > 0
            ? completedReviewsWithDuration.reduce((sum, review) => {
                const duration = (review.completedAt!.getTime() - review.createdAt.getTime()) / 1000;
                return sum + duration;
            }, 0) / completedReviewsWithDuration.length
            : 0;

        // Calculate average candidates per review
        const totalCandidates = reviews.reduce((sum, review) => 
            sum + (review.candidateResults?.length || 0), 0);
        const averageCandidatesPerReview = totalReviews > 0 
            ? totalCandidates / totalReviews 
            : 0;

        // Calculate acceptance/rejection rates
        let acceptedCount = 0;
        let rejectedCount = 0;
        let totalReviewedCandidates = 0;

        reviews.forEach(review => {
            review.candidateResults?.forEach((candidate: { reviewStatus?: string; reviewedAt?: Date; url?: string }) => {
                if (candidate.reviewStatus === 'accepted' || candidate.reviewStatus === 'rejected') {
                    totalReviewedCandidates++;
                    if (candidate.reviewStatus === 'accepted') {
                        acceptedCount++;
                    } else {
                        rejectedCount++;
                    }
                }
            });
        });

        const acceptanceRate = totalReviewedCandidates > 0 
            ? acceptedCount / totalReviewedCandidates 
            : 0;
        const rejectionRate = totalReviewedCandidates > 0 
            ? rejectedCount / totalReviewedCandidates 
            : 0;

        // Group by workflow
        const reviewsByWorkflow: Record<string, number> = {};
        reviews.forEach(review => {
            const workflowId = review.workflowId || 'unknown';
            reviewsByWorkflow[workflowId] = (reviewsByWorkflow[workflowId] || 0) + 1;
        });

        // Group by module
        const reviewsByModule: Record<string, number> = {};
        reviews.forEach(review => {
            const moduleId = review.moduleId || 'unknown';
            reviewsByModule[moduleId] = (reviewsByModule[moduleId] || 0) + 1;
        });

        // Reviews over time (daily)
        const reviewsOverTime = this.calculateReviewsOverTime(reviews as WorkflowReviewDocument[], 'day');

        // Average candidates reviewed per day
        const days = Math.max(1, timeRangeDays);
        const averageCandidatesReviewedPerDay = totalReviewedCandidates / days;

        return {
            totalReviews,
            pendingReviews,
            completedReviews,
            averageReviewDuration,
            averageCandidatesPerReview,
            acceptanceRate,
            rejectionRate,
            reviewsByWorkflow,
            reviewsByModule,
            reviewsOverTime,
            averageCandidatesReviewedPerDay
        };
    }

    /**
     * Get candidate analytics
     */
    async getCandidateAnalytics(timeRangeDays: number = 30): Promise<CandidateAnalytics> {
        const db = getDB();
        const collection = db.collection('workflowReviews');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeRangeDays);

        const reviews = await collection
            .find({
                createdAt: { $gte: startDate }
            })
            .toArray();

        let totalCandidates = 0;
        let acceptedCandidates = 0;
        let rejectedCandidates = 0;
        let pendingCandidates = 0;
        const urlCounts: Record<string, { accepted: number; rejected: number }> = {};
        const reviewTimes: number[] = [];

        reviews.forEach(review => {
            review.candidateResults?.forEach((candidate: { reviewStatus?: string; reviewedAt?: Date; url?: string }) => {
                totalCandidates++;
                
                if (candidate.reviewStatus === 'accepted') {
                    acceptedCandidates++;
                    if (candidate.url) {
                        urlCounts[candidate.url] = urlCounts[candidate.url] || { accepted: 0, rejected: 0 };
                        urlCounts[candidate.url].accepted++;
                    }
                } else if (candidate.reviewStatus === 'rejected') {
                    rejectedCandidates++;
                    if (candidate.url) {
                        urlCounts[candidate.url] = urlCounts[candidate.url] || { accepted: 0, rejected: 0 };
                        urlCounts[candidate.url].rejected++;
                    }
                } else {
                    pendingCandidates++;
                }

                // Calculate review time if reviewed
                if (candidate.reviewedAt && review.createdAt) {
                    const reviewTime = (candidate.reviewedAt.getTime() - review.createdAt.getTime()) / 1000;
                    reviewTimes.push(reviewTime);
                }
            });
        });

        const acceptanceRate = totalCandidates > 0 ? acceptedCandidates / totalCandidates : 0;
        const rejectionRate = totalCandidates > 0 ? rejectedCandidates / totalCandidates : 0;
        const averageReviewTime = reviewTimes.length > 0
            ? reviewTimes.reduce((sum, time) => sum + time, 0) / reviewTimes.length
            : 0;

        // Top rejected URLs
        const topRejectedUrls = Object.entries(urlCounts)
            .filter(([, counts]) => counts.rejected > 0)
            .map(([url, counts]) => ({ url, count: counts.rejected }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Top accepted URLs
        const topAcceptedUrls = Object.entries(urlCounts)
            .filter(([, counts]) => counts.accepted > 0)
            .map(([url, counts]) => ({ url, count: counts.accepted }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            totalCandidates,
            acceptedCandidates,
            rejectedCandidates,
            pendingCandidates,
            acceptanceRate,
            rejectionRate,
            averageReviewTime,
            topRejectedUrls,
            topAcceptedUrls
        };
    }

    /**
     * Get review trends over time
     */
    async getReviewTrends(period: 'day' | 'week' | 'month', timeRangeDays: number = 30): Promise<ReviewTrends> {
        const db = getDB();
        const collection = db.collection('workflowReviews');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeRangeDays);

        const reviews = await collection
            .find({
                createdAt: { $gte: startDate }
            })
            .sort({ createdAt: 1 })
            .toArray();

        // Group reviews by period
        const groupedReviews = this.groupReviewsByPeriod(reviews as WorkflowReviewDocument[], period);
        
        const dates: string[] = [];
        const acceptanceRateTrend: number[] = [];
        const reviewVolumeTrend: number[] = [];
        const averageDurationTrend: number[] = [];

        Object.keys(groupedReviews).sort().forEach(dateKey => {
            const periodReviews = groupedReviews[dateKey];
            dates.push(dateKey);

            // Review volume
            reviewVolumeTrend.push(periodReviews.length);

            // Acceptance rate for this period
            let accepted = 0;
            let totalReviewed = 0;
            let totalDuration = 0;
            let durationCount = 0;

            periodReviews.forEach(review => {
                review.candidateResults?.forEach(candidate => {
                    if (candidate.reviewStatus === 'accepted' || candidate.reviewStatus === 'rejected') {
                        totalReviewed++;
                        if (candidate.reviewStatus === 'accepted') {
                            accepted++;
                        }
                    }
                });

                if (review.status === 'completed' && review.completedAt && review.createdAt) {
                    const duration = (review.completedAt.getTime() - review.createdAt.getTime()) / 1000;
                    totalDuration += duration;
                    durationCount++;
                }
            });

            acceptanceRateTrend.push(totalReviewed > 0 ? accepted / totalReviewed : 0);
            averageDurationTrend.push(durationCount > 0 ? totalDuration / durationCount : 0);
        });

        return {
            period,
            acceptanceRateTrend,
            reviewVolumeTrend,
            averageDurationTrend,
            dates
        };
    }

    /**
     * Calculate reviews over time grouped by period
     */
    private calculateReviewsOverTime(reviews: WorkflowReviewDocument[], period: 'day' | 'week' | 'month'): Array<{ date: string; count: number }> {
        const grouped = this.groupReviewsByPeriod(reviews, period);
        
        return Object.entries(grouped)
            .map(([date, reviewList]) => ({
                date,
                count: reviewList.length
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Group reviews by time period
     */
    private groupReviewsByPeriod(reviews: WorkflowReviewDocument[], period: 'day' | 'week' | 'month'): Record<string, WorkflowReviewDocument[]> {
        const grouped: Record<string, WorkflowReviewDocument[]> = {};

        reviews.forEach(review => {
            const date = new Date(review.createdAt);
            let key: string;

            if (period === 'day') {
                key = date.toISOString().split('T')[0]; // YYYY-MM-DD
            } else if (period === 'week') {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
                key = weekStart.toISOString().split('T')[0];
            } else { // month
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }

            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(review);
        });

        return grouped;
    }
}

// Singleton instance
let reviewAnalyticsInstance: ReviewAnalytics | null = null;

export function getReviewAnalytics(): ReviewAnalytics {
    if (!reviewAnalyticsInstance) {
        reviewAnalyticsInstance = new ReviewAnalytics();
    }
    return reviewAnalyticsInstance;
}

