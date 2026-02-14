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
export declare class DocumentSummarizationApiService extends BaseApiService {
    /**
     * Get existing summary for a document
     *
     * @param documentId - Document ID
     * @returns Summary response or null if no summary exists
     */
    getSummary(documentId: string): Promise<SummaryResponse | null>;
    /**
     * Generate summary for a document
     *
     * @param documentId - Document ID
     * @param forceRegenerate - If true, regenerate even if summary exists
     * @returns Generated summary
     */
    generateSummary(documentId: string, forceRegenerate?: boolean): Promise<SummaryResponse>;
    /**
     * Regenerate summary for a document (forces regeneration)
     *
     * @param documentId - Document ID
     * @returns Regenerated summary
     */
    regenerateSummary(documentId: string): Promise<SummaryResponse>;
}
export declare const documentSummarizationApi: DocumentSummarizationApiService;
