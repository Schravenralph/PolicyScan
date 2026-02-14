/**
 * TypeScript interfaces for feedback collection
 * Matches backend FeedbackCollectionService types
 */
export interface UserInteraction {
    type: 'click' | 'view' | 'accept' | 'reject' | 'search';
    documentId?: string;
    queryId?: string;
    query?: string;
    position?: number;
    timestamp?: Date | string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
}
export interface DocumentFeedback {
    documentId: string;
    queryId?: string;
    query?: string;
    rating: number;
    helpful: boolean;
    relevant: boolean;
    comment?: string;
    timestamp?: Date | string;
    userId?: string;
    metadata?: Record<string, unknown>;
}
export interface QAFeedback {
    query: string;
    answer?: string;
    helpful: boolean;
    accurate: boolean;
    sources?: string[];
    comment?: string;
    timestamp?: Date | string;
    userId?: string;
    metadata?: Record<string, unknown>;
}
export interface DocumentFeedbackStats {
    totalInteractions: number;
    clicks: number;
    accepts: number;
    rejects: number;
    averageRating: number;
    helpfulCount: number;
    relevantCount: number;
}
