import { BaseApiService } from './BaseApiService';
import type {
  DocumentFeedback,
  DocumentFeedbackStats,
  QAFeedback,
  UserInteraction,
} from '../../types/feedback';

/**
 * Feedback API service
 */
export class FeedbackApiService extends BaseApiService {
  async recordInteraction(interaction: UserInteraction) {
    return this.request<{ success: boolean; feedbackId: string }>('/feedback/interaction', {
      method: 'POST',
      body: JSON.stringify(interaction),
    });
  }

  async recordDocumentFeedback(feedback: DocumentFeedback) {
    return this.request<{ success: boolean; feedbackId: string }>('/feedback/document', {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  }

  async recordQAFeedback(feedback: QAFeedback) {
    return this.request<{ success: boolean; feedbackId: string }>('/feedback/qa', {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  }

  async getDocumentFeedbackStats(documentId: string) {
    return this.request<DocumentFeedbackStats>(`/feedback/document/${documentId}/stats`);
  }

  async getQualityMetrics(minInteractions?: number, minDocuments?: number) {
    const params = new URLSearchParams();
    if (minInteractions !== undefined)
      params.append('minInteractions', minInteractions.toString());
    if (minDocuments !== undefined) params.append('minDocuments', minDocuments.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
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
    }>(`/feedback/quality${query}`);
  }

  async runLearningCycle() {
    return this.request<{
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
    }>('/feedback/learn', {
      method: 'POST',
    });
  }

  async getLearningCycleStatus() {
    return this.request<{
      status: 'idle' | 'running' | 'completed' | 'failed' | 'disabled';
      enabled?: boolean;
      message?: string;
      currentCycle?: {
        operationId: string;
        startTime: string;
      };
      lastCycle?: {
        operationId: string;
        status: 'completed' | 'failed';
        completedAt: string;
        error?: string;
      };
    }>('/feedback/learn/status');
  }

  async recoverLearningCycle(timeoutMinutes?: number) {
    return this.request<{
      success: boolean;
      recovered: number;
      message: string;
    }>('/feedback/learn/recover', {
      method: 'POST',
      body: JSON.stringify({ timeoutMinutes }),
    });
  }

  async getLearningCycleHistory(limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (limit !== undefined) params.append('limit', limit.toString());
    if (offset !== undefined) params.append('offset', offset.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    
    return this.request<{
      cycles: Array<{
        operationId: string;
        status: 'completed' | 'failed';
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
    }>(`/feedback/learn/history${query}`);
  }

  async cancelLearningCycle(operationId?: string) {
    return this.request<{
      success: boolean;
      message: string;
      operationId: string;
    }>('/feedback/learn/cancel', {
      method: 'POST',
      body: JSON.stringify({ operationId }),
    });
  }
}

