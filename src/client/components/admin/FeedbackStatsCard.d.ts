interface QualityMetrics {
    documentQuality: Array<{
        documentId: string;
        clicks: number;
        accepts: number;
        rejects: number;
        rating: number;
        qualityScore: number;
    }>;
    sourceQuality: Array<{
        sourceUrl: string;
        documentCount: number;
        averageRating: number;
        acceptanceRate: number;
        clickThroughRate: number;
        qualityScore: number;
    }>;
    termImportance: Array<{
        term: string;
        frequency: number;
        averageRating: number;
        associatedAcceptRate: number;
        importanceScore: number;
    }>;
    overallCTR: number;
    overallAcceptanceRate: number;
}
interface FeedbackStatsCardProps {
    metrics: QualityMetrics;
}
export declare function FeedbackStatsCard({ metrics }: FeedbackStatsCardProps): import("react/jsx-runtime").JSX.Element;
export {};
