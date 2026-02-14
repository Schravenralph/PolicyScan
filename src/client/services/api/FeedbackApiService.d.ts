import { BaseApiService } from './BaseApiService';
import type { DocumentFeedback, DocumentFeedbackStats, QAFeedback, UserInteraction } from '../../types/feedback';
/**
 * Feedback API service
 */
export declare class FeedbackApiService extends BaseApiService {
    recordInteraction(interaction: UserInteraction): Promise<{
        success: boolean;
        feedbackId: string;
    }>;
    recordDocumentFeedback(feedback: DocumentFeedback): Promise<{
        success: boolean;
        feedbackId: string;
    }>;
    recordQAFeedback(feedback: QAFeedback): Promise<{
        success: boolean;
        feedbackId: string;
    }>;
    getDocumentFeedbackStats(documentId: string): Promise<DocumentFeedbackStats>;
    getQualityMetrics(minInteractions?: number, minDocuments?: number): Promise<{
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
    }>;
    runLearningCycle(): Promise<{
        success: boolean;
        result: {
            rankingBoosts: Array<{
                documentId: string;
                boost: number;
                reason: string;
            }>;
            dictionaryUpdates: Array<{
                term: string;
                synonyms: string[];
                confidence: number;
            }>;
            sourceUpdates: Array<{
                sourceUrl: string;
                qualityScore: number;
                deprecated: boolean;
            }>;
            metrics: {
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
            };
        };
        message: string;
    }>;
    getLearningCycleStatus(): Promise<{
        status: "idle" | "running" | "completed" | "failed" | "disabled";
        enabled?: boolean;
        message?: string;
        currentCycle?: {
            operationId: string;
            startTime: string;
        };
        lastCycle?: {
            operationId: string;
            status: "completed" | "failed";
            completedAt: string;
            error?: string;
        };
    }>;
    recoverLearningCycle(timeoutMinutes?: number): Promise<{
        success: boolean;
        recovered: number;
        message: string;
    }>;
    getLearningCycleHistory(limit?: number, offset?: number): Promise<{
        cycles: Array<{
            operationId: string;
            status: "completed" | "failed";
            startTime: string;
            endTime: string;
            duration: number;
            result?: {
                rankingBoostsCount: number;
                dictionaryUpdatesCount: number;
                sourceUpdatesCount: number;
                sourcesDeprecated: number;
                termsAdded: number;
                synonymsAdded: number;
                overallCTR: number;
                overallAcceptanceRate: number;
            };
            error?: string;
        }>;
        total: number;
    }>;
    cancelLearningCycle(operationId?: string): Promise<{
        success: boolean;
        message: string;
        operationId: string;
    }>;
}
