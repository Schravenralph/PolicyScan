/**
 * Document Summarization API Service
 * 
 * Service for interacting with document summarization API endpoints.
 */

import { BaseApiService } from './BaseApiService';

/**
 * Summary response from API
 */
export interface SummaryResponse {
  summary: string;
  documentId: string;
  hasSummary?: boolean;
  generated?: boolean;
  regenerated?: boolean;
}

/**
 * Document Summarization API Service
 */
export class DocumentSummarizationApiService extends BaseApiService {
  /**
   * Get existing summary for a document
   * 
   * @param documentId - Document ID
   * @returns Summary response or null if no summary exists
   */
  async getSummary(documentId: string): Promise<SummaryResponse | null> {
    try {
      return await this.get<SummaryResponse>(`/summarization/${documentId}`);
    } catch (error) {
      // Check if this is a real 404 from backend (summary doesn't exist)
      // vs a 404 from Vite dev server (misconfiguration)
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404) {
          // Check if this is a Vite dev server 404 (misconfiguration)
          // BaseApiService now sets isViteDevServer404 flag for easier detection
          const isViteDevServer404 = (error as { isViteDevServer404?: boolean }).isViteDevServer404;
          const errorMessage = error.message || '';
          
          if (isViteDevServer404 || 
              errorMessage.includes('VITE_API_URL may be misconfigured') ||
              errorMessage.includes('non-JSON response') || 
              errorMessage.includes('Fetch Interceptor') ||
              errorMessage.includes('Vite dev server')) {
            // This is a misconfiguration - rethrow with better message
            throw new Error(
              'API request failed: VITE_API_URL may be misconfigured. ' +
              'The request was sent to the Vite dev server instead of the backend. ' +
              'Fix: Set VITE_API_URL=/api in your .env file.'
            );
          }
          // Real 404 from backend - summary doesn't exist
          return null;
        }
      }
      throw error;
    }
  }

  /**
   * Generate summary for a document
   * 
   * @param documentId - Document ID
   * @param forceRegenerate - If true, regenerate even if summary exists
   * @returns Generated summary
   */
  async generateSummary(
    documentId: string,
    forceRegenerate: boolean = false
  ): Promise<SummaryResponse> {
    return this.post<SummaryResponse>(`/summarization/${documentId}`, {
      forceRegenerate
    });
  }

  /**
   * Regenerate summary for a document (forces regeneration)
   * 
   * @param documentId - Document ID
   * @returns Regenerated summary
   */
  async regenerateSummary(documentId: string): Promise<SummaryResponse> {
    return this.post<SummaryResponse>(`/summarization/${documentId}/regenerate`);
  }
}

// Export singleton instance
export const documentSummarizationApi = new DocumentSummarizationApiService();
