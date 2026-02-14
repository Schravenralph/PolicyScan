import { getWorkflowReviewModel, WorkflowReviewDocument } from '../../models/WorkflowReview.js';
import { getDB } from '../../config/database.js';
import { ObjectId, Filter } from 'mongodb';
import { IUser } from '../../models/User.js';

export interface ReviewAnalytics {
    // Overall statistics
    totalReviews: number;
    completedReviews: number;
    pendingReviews: number;
    totalCandidates: number;
    acceptedCandidates: number;
    rejectedCandidates: number;
    pendingCandidates: number;
    overallAcceptanceRate: number;

    // Time-based statistics
    reviewsByDate: Array<{ date: string; count: number; accepted: number; rejected: number }>;
    averageReviewTime: number; // in minutes
    averageCandidatesPerReview: number;

    // Workflow-specific statistics
    reviewsByWorkflow: Array<{ workflowId: string; count: number; acceptanceRate: number }>;
    reviewsByModule: Array<{ moduleId: string; moduleName: string; count: number; acceptanceRate: number }>;

    // User statistics
    reviewsByUser: Array<{ userId: string; userEmail: string; count: number; acceptanceRate: number }>;

    // URL pattern statistics
    topAcceptedDomains: Array<{ domain: string; count: number; acceptanceRate: number }>;
    topRejectedDomains: Array<{ domain: string; count: number; rejectionRate: number }>;

    // Trend analysis
    acceptanceRateTrend: Array<{ date: string; acceptanceRate: number }>;
}

export interface ReviewComparison {
    review1: {
        id: string;
        workflowId: string;
        moduleId: string;
        completedAt: Date;
        totalCandidates: number;
        accepted: number;
        rejected: number;
        acceptanceRate: number;
    };
    review2: {
        id: string;
        workflowId: string;
        moduleId: string;
        completedAt: Date;
        totalCandidates: number;
        accepted: number;
        rejected: number;
        acceptanceRate: number;
    };
    differences: {
        acceptanceRateDiff: number;
        candidateCountDiff: number;
        commonCandidates: number;
        uniqueToReview1: number;
        uniqueToReview2: number;
    };
}

/**
 * Service for generating analytics and insights from review data.
 */
export class ReviewAnalyticsService {
    private reviewModel = getWorkflowReviewModel();

    /**
     * Get comprehensive analytics for reviews.
     * 
     * @param workflowId - Optional workflow ID to filter by
     * @param startDate - Optional start date for time range
     * @param endDate - Optional end date for time range
     */
    async getAnalytics(
        workflowId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<ReviewAnalytics> {
        const db = getDB();
        const collection = db.collection<WorkflowReviewDocument>('workflowReviews');

        // Build query
        const query: Filter<WorkflowReviewDocument> = {};
        if (workflowId) {
            query.workflowId = workflowId;
        }
        if (startDate || endDate) {
            query.createdAt = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        const reviews = await collection.find(query).toArray();

        // Calculate overall statistics
        const totalReviews = reviews.length;
        const completedReviews = reviews.filter(r => r.status === 'completed').length;
        const pendingReviews = totalReviews - completedReviews;

        let totalCandidates = 0;
        let acceptedCandidates = 0;
        let rejectedCandidates = 0;
        let pendingCandidates = 0;

        const reviewsByDateMap = new Map<string, { count: number; accepted: number; rejected: number }>();
        const reviewsByWorkflowMap = new Map<string, { count: number; accepted: number; rejected: number }>();
        const reviewsByModuleMap = new Map<string, { count: number; accepted: number; rejected: number; moduleName: string }>();
        const reviewsByUserMap = new Map<string, { count: number; accepted: number; rejected: number; userEmail: string }>();
        const domainStatsMap = new Map<string, { accepted: number; rejected: number }>();

        let totalReviewTime = 0;
        let reviewsWithTime = 0;

        for (const review of reviews) {
            const candidateCount = review.candidateResults.length;
            totalCandidates += candidateCount;

            let reviewAccepted = 0;
            let reviewRejected = 0;
            let reviewPending = 0;

            for (const candidate of review.candidateResults) {
                if (candidate.reviewStatus === 'accepted') {
                    acceptedCandidates++;
                    reviewAccepted++;
                } else if (candidate.reviewStatus === 'rejected') {
                    rejectedCandidates++;
                    reviewRejected++;
                } else {
                    pendingCandidates++;
                    reviewPending++;
                }

                // Track domain statistics
                try {
                    const url = new URL(candidate.url);
                    const domain = url.hostname.replace(/^www\./, '');
                    if (!domainStatsMap.has(domain)) {
                        domainStatsMap.set(domain, { accepted: 0, rejected: 0 });
                    }
                    const stats = domainStatsMap.get(domain)!;
                    if (candidate.reviewStatus === 'accepted') {
                        stats.accepted++;
                    } else if (candidate.reviewStatus === 'rejected') {
                        stats.rejected++;
                    }
                } catch (_e) {
                    // Invalid URL, skip
                }
            }

            // Track by date
            const dateKey = review.createdAt.toISOString().split('T')[0];
            if (!reviewsByDateMap.has(dateKey)) {
                reviewsByDateMap.set(dateKey, { count: 0, accepted: 0, rejected: 0 });
            }
            const dateStats = reviewsByDateMap.get(dateKey)!;
            dateStats.count++;
            dateStats.accepted += reviewAccepted;
            dateStats.rejected += reviewRejected;

            // Track by workflow
            if (!reviewsByWorkflowMap.has(review.workflowId)) {
                reviewsByWorkflowMap.set(review.workflowId, { count: 0, accepted: 0, rejected: 0 });
            }
            const workflowStats = reviewsByWorkflowMap.get(review.workflowId)!;
            workflowStats.count++;
            workflowStats.accepted += reviewAccepted;
            workflowStats.rejected += reviewRejected;

            // Track by module
            const moduleKey = `${review.moduleId}|${review.moduleName}`;
            if (!reviewsByModuleMap.has(moduleKey)) {
                reviewsByModuleMap.set(moduleKey, { count: 0, accepted: 0, rejected: 0, moduleName: review.moduleName });
            }
            const moduleStats = reviewsByModuleMap.get(moduleKey)!;
            moduleStats.count++;
            moduleStats.accepted += reviewAccepted;
            moduleStats.rejected += reviewRejected;

            // Track by user (if completed)
            if (review.completedBy) {
                const userKey = review.completedBy.toString();
                if (!reviewsByUserMap.has(userKey)) {
                    const user = await db.collection<IUser>('users').findOne({ _id: review.completedBy });
                    reviewsByUserMap.set(userKey, {
                        count: 0,
                        accepted: 0,
                        rejected: 0,
                        userEmail: user?.email || 'unknown'
                    });
                }
                const userStats = reviewsByUserMap.get(userKey)!;
                userStats.count++;
                userStats.accepted += reviewAccepted;
                userStats.rejected += reviewRejected;
            }

            // Calculate review time
            if (review.completedAt && review.createdAt) {
                const timeDiff = review.completedAt.getTime() - review.createdAt.getTime();
                totalReviewTime += timeDiff;
                reviewsWithTime++;
            }
        }

        // Calculate acceptance rate
        const totalDecided = acceptedCandidates + rejectedCandidates;
        const overallAcceptanceRate = totalDecided > 0 ? acceptedCandidates / totalDecided : 0;

        // Calculate average review time
        const averageReviewTime = reviewsWithTime > 0 ? totalReviewTime / reviewsWithTime / 1000 / 60 : 0; // in minutes

        // Build reviews by date array
        const reviewsByDate = Array.from(reviewsByDateMap.entries())
            .map(([date, stats]) => ({
                date,
                count: stats.count,
                accepted: stats.accepted,
                rejected: stats.rejected
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Build reviews by workflow array
        const reviewsByWorkflow = Array.from(reviewsByWorkflowMap.entries())
            .map(([workflowId, stats]) => {
                const total = stats.accepted + stats.rejected;
                return {
                    workflowId,
                    count: stats.count,
                    acceptanceRate: total > 0 ? stats.accepted / total : 0
                };
            })
            .sort((a, b) => b.count - a.count);

        // Build reviews by module array
        const reviewsByModule = Array.from(reviewsByModuleMap.entries())
            .map(([moduleKey, stats]) => {
                const [moduleId, moduleName] = moduleKey.split('|');
                const total = stats.accepted + stats.rejected;
                return {
                    moduleId,
                    moduleName: stats.moduleName || moduleName,
                    count: stats.count,
                    acceptanceRate: total > 0 ? stats.accepted / total : 0
                };
            })
            .sort((a, b) => b.count - a.count);

        // Build reviews by user array
        const reviewsByUser = Array.from(reviewsByUserMap.entries())
            .map(([userId, stats]) => {
                const total = stats.accepted + stats.rejected;
                return {
                    userId,
                    userEmail: stats.userEmail,
                    count: stats.count,
                    acceptanceRate: total > 0 ? stats.accepted / total : 0
                };
            })
            .sort((a, b) => b.count - a.count);

        // Build domain statistics
        const topAcceptedDomains = Array.from(domainStatsMap.entries())
            .map(([domain, stats]) => {
                const total = stats.accepted + stats.rejected;
                return {
                    domain,
                    count: total,
                    acceptanceRate: total > 0 ? stats.accepted / total : 0
                };
            })
            .filter(d => d.count > 0)
            .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
            .slice(0, 10);

        const topRejectedDomains = Array.from(domainStatsMap.entries())
            .map(([domain, stats]) => {
                const total = stats.accepted + stats.rejected;
                return {
                    domain,
                    count: total,
                    rejectionRate: total > 0 ? stats.rejected / total : 0
                };
            })
            .filter(d => d.count > 0)
            .sort((a, b) => b.rejectionRate - a.rejectionRate)
            .slice(0, 10);

        // Calculate acceptance rate trend (by week)
        const acceptanceRateTrend = this.calculateAcceptanceRateTrend(reviews);

        return {
            totalReviews,
            completedReviews,
            pendingReviews,
            totalCandidates,
            acceptedCandidates,
            rejectedCandidates,
            pendingCandidates,
            overallAcceptanceRate,
            reviewsByDate,
            averageReviewTime,
            averageCandidatesPerReview: totalReviews > 0 ? totalCandidates / totalReviews : 0,
            reviewsByWorkflow,
            reviewsByModule,
            reviewsByUser,
            topAcceptedDomains,
            topRejectedDomains,
            acceptanceRateTrend
        };
    }

    /**
     * Compare two reviews.
     */
    async compareReviews(reviewId1: string, reviewId2: string): Promise<ReviewComparison> {
        const review1 = await this.reviewModel.getReviewById(reviewId1);
        const review2 = await this.reviewModel.getReviewById(reviewId2);

        if (!review1 || !review2) {
            throw new Error('One or both reviews not found');
        }

        const stats1 = await this.reviewModel.getCandidateStats(reviewId1);
        const stats2 = await this.reviewModel.getCandidateStats(reviewId2);

        const acceptanceRate1 = stats1.total > 0 ? stats1.accepted / stats1.total : 0;
        const acceptanceRate2 = stats2.total > 0 ? stats2.accepted / stats2.total : 0;

        // Find common candidates (by URL)
        const urls1 = new Set(review1.candidateResults.map(c => c.url));
        const urls2 = new Set(review2.candidateResults.map(c => c.url));
        const commonUrls = new Set([...urls1].filter(url => urls2.has(url)));
        const uniqueToReview1 = urls1.size - commonUrls.size;
        const uniqueToReview2 = urls2.size - commonUrls.size;

        return {
            review1: {
                id: reviewId1,
                workflowId: review1.workflowId,
                moduleId: review1.moduleId,
                completedAt: review1.completedAt || review1.createdAt,
                totalCandidates: stats1.total,
                accepted: stats1.accepted,
                rejected: stats1.rejected,
                acceptanceRate: acceptanceRate1
            },
            review2: {
                id: reviewId2,
                workflowId: review2.workflowId,
                moduleId: review2.moduleId,
                completedAt: review2.completedAt || review2.createdAt,
                totalCandidates: stats2.total,
                accepted: stats2.accepted,
                rejected: stats2.rejected,
                acceptanceRate: acceptanceRate2
            },
            differences: {
                acceptanceRateDiff: acceptanceRate1 - acceptanceRate2,
                candidateCountDiff: stats1.total - stats2.total,
                commonCandidates: commonUrls.size,
                uniqueToReview1,
                uniqueToReview2
            }
        };
    }

    /**
     * Calculate acceptance rate trend over time (by week).
     */
    private calculateAcceptanceRateTrend(reviews: WorkflowReviewDocument[]): Array<{ date: string; acceptanceRate: number }> {
        const weeklyStats = new Map<string, { accepted: number; rejected: number }>();

        for (const review of reviews) {
            if (review.status !== 'completed') continue;

            // Get week start date (Monday)
            const date = new Date(review.completedAt || review.createdAt);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay() + 1); // Monday
            weekStart.setHours(0, 0, 0, 0);
            const weekKey = weekStart.toISOString().split('T')[0];

            if (!weeklyStats.has(weekKey)) {
                weeklyStats.set(weekKey, { accepted: 0, rejected: 0 });
            }

            const stats = weeklyStats.get(weekKey)!;
            for (const candidate of review.candidateResults) {
                if (candidate.reviewStatus === 'accepted') {
                    stats.accepted++;
                } else if (candidate.reviewStatus === 'rejected') {
                    stats.rejected++;
                }
            }
        }

        return Array.from(weeklyStats.entries())
            .map(([date, stats]) => {
                const total = stats.accepted + stats.rejected;
                return {
                    date,
                    acceptanceRate: total > 0 ? stats.accepted / total : 0
                };
            })
            .sort((a, b) => a.date.localeCompare(b.date));
    }
}

// Singleton instance
let analyticsServiceInstance: ReviewAnalyticsService | null = null;

export function getReviewAnalyticsService(): ReviewAnalyticsService {
    if (!analyticsServiceInstance) {
        analyticsServiceInstance = new ReviewAnalyticsService();
    }
    return analyticsServiceInstance;
}

