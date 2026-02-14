import { ScrapedDocument } from '../infrastructure/types.js';
import { QuestionAnsweringService, QAResult } from '../llm/QuestionAnsweringService.js';
import { SummarizationService, SummarizationOptions, SummarizationResult } from '../llm/SummarizationService.js';
import { LLMService } from '../llm/LLMService.js';
import { DocumentChunkingService } from '../ingestion/processing/DocumentChunkingService.js';
import { ChunkRetrievalService } from './ChunkRetrievalService.js';
import { CitationService } from '../review/CitationService.js';

/**
 * Main RAG Service that orchestrates question-answering and summarization
 * 
 * Provides a unified interface for RAG operations, managing all sub-services
 * and providing convenience methods for common operations.
 */
export class RAGService {
  private qaService: QuestionAnsweringService;
  private summarizationService: SummarizationService;

  constructor(
    llmService?: LLMService,
    chunkingService?: DocumentChunkingService,
    retrievalService?: ChunkRetrievalService,
    citationService?: CitationService
  ) {
    // Share services across QA and summarization
    const sharedLLM = llmService || new LLMService();
    const sharedChunking = chunkingService || new DocumentChunkingService();
    const sharedRetrieval = retrievalService || new ChunkRetrievalService();
    const sharedCitation = citationService || new CitationService();

    this.qaService = new QuestionAnsweringService(
      sharedLLM,
      sharedChunking,
      sharedRetrieval,
      sharedCitation
    );

    this.summarizationService = new SummarizationService(
      sharedLLM,
      sharedChunking,
      sharedRetrieval,
      sharedCitation
    );
  }

  /**
   * Answer a question using documents
   * 
   * @param question The question to answer
   * @param documents The documents to search in
   * @returns Answer with citations
   */
  async answerQuestion(question: string, documents: ScrapedDocument[]): Promise<QAResult> {
    return this.qaService.answer(question, documents);
  }

  /**
   * Summarize documents
   * 
   * @param documents Documents to summarize
   * @param options Summarization options
   * @returns Summary with citations
   */
  async summarizeDocuments(
    documents: ScrapedDocument[],
    options?: SummarizationOptions
  ): Promise<SummarizationResult> {
    return this.summarizationService.summarize(documents, options);
  }

  /**
   * Check if RAG is enabled
   */
  isEnabled(): boolean {
    try {
      const llmService = new LLMService();
      return llmService.isEnabled();
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const ragService = new RAGService();

