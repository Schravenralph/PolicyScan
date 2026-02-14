/**
 * Document Summarization Service
 * 
 * Service for generating and managing document summaries for CanonicalDocument entities.
 * Uses chunked LLM-based summarization to handle long documents.
 */

import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { LLMService, LLMMessage } from '../llm/LLMService.js';
import { NotFoundError, ServiceUnavailableError, BadRequestError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';
import type { CanonicalDocument } from '../../contracts/types.js';

/**
 * Configuration for document summarization
 */
export interface SummarizationConfig {
  targetLength?: number; // Target summary length in words (default: 250)
  chunkSize?: number; // Chunk size in tokens for processing (default: 2000)
  maxChunks?: number; // Maximum number of chunks to process (default: 20)
}

/**
 * Result of document summarization
 */
export interface SummarizationResult {
  summary: string; // Markdown summary
  documentId: string;
  documentTitle: string;
  generatedAt: Date;
}

/**
 * Service for summarizing CanonicalDocument entities
 */
export class DocumentSummarizationService {
  private canonicalDocumentService = getCanonicalDocumentService();
  private llmService: LLMService;
  private config: Required<SummarizationConfig>;

  constructor(config?: SummarizationConfig) {
    this.llmService = new LLMService();
    this.config = {
      targetLength: config?.targetLength || 250,
      chunkSize: config?.chunkSize || 2000,
      maxChunks: config?.maxChunks || 20,
    };
  }

  /**
   * Generate and store summary for a document
   * 
   * @param documentId - Document ID to summarize
   * @param forceRegenerate - If true, regenerate even if summary exists
   * @returns Generated summary in markdown format
   */
  async summarizeDocument(
    documentId: string,
    forceRegenerate: boolean = false
  ): Promise<string> {
    // Check if LLM service is available
    if (!this.llmService.isEnabled()) {
      throw new ServiceUnavailableError(
        'LLM service is disabled. Cannot generate summaries. Set RAG_ENABLED=true to enable.',
        {
          reason: 'llm_service_disabled',
          operation: 'summarizeDocument'
        }
      );
    }

    // Load document
    const document = await this.canonicalDocumentService.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document', documentId, {
        operation: 'summarizeDocument'
      });
    }

    const canonicalDoc = document as CanonicalDocument;

    // Check if summary already exists
    if (!forceRegenerate && canonicalDoc.enrichmentMetadata?.summary) {
      const existingSummary = canonicalDoc.enrichmentMetadata.summary as string;
      if (existingSummary && existingSummary.trim().length > 0) {
        logger.debug({ documentId }, 'Summary already exists, returning existing summary');
        return existingSummary;
      }
    }

    // Validate document has content
    if (!canonicalDoc.fullText || canonicalDoc.fullText.trim().length === 0) {
      throw new BadRequestError('Document has no fullText content to summarize', {
        documentId,
        operation: 'summarizeDocument'
      });
    }

    // Generate summary
    logger.info({ documentId, title: canonicalDoc.title }, 'Generating document summary');
    const summary = await this.generateSummary(canonicalDoc);

    // Store summary in enrichmentMetadata
    await this.canonicalDocumentService.updateEnrichmentMetadata(
      documentId,
      {
        summary: summary,
        summaryGeneratedAt: new Date().toISOString(),
      }
    );

    logger.info({ documentId }, 'Summary generated and stored successfully');
    return summary;
  }

  /**
   * Get existing summary for a document
   * 
   * @param documentId - Document ID
   * @returns Existing summary or null if not found
   */
  async getSummary(documentId: string): Promise<string | null> {
    const document = await this.canonicalDocumentService.findById(documentId);
    if (!document) {
      throw new NotFoundError('Document', documentId, {
        operation: 'getSummary'
      });
    }

    const canonicalDoc = document as CanonicalDocument;
    const summary = canonicalDoc.enrichmentMetadata?.summary;
    
    if (summary && typeof summary === 'string' && summary.trim().length > 0) {
      return summary;
    }

    return null;
  }

  /**
   * Regenerate summary for a document (forces regeneration)
   * 
   * @param documentId - Document ID
   * @returns Regenerated summary
   */
  async regenerateSummary(documentId: string): Promise<string> {
    return this.summarizeDocument(documentId, true);
  }

  /**
   * Generate summary using LLM with chunked approach
   */
  private async generateSummary(document: CanonicalDocument): Promise<string> {
    const { fullText, title } = document;
    
    // Chunk the document text
    const chunks = this.chunkText(fullText, this.config.chunkSize);
    
    // Limit number of chunks to process
    const chunksToProcess = chunks.slice(0, this.config.maxChunks);
    
    if (chunksToProcess.length === 0) {
      throw new BadRequestError('Document text could not be chunked', {
        documentId: document._id,
        operation: 'generateSummary'
      });
    }

    // Build context from chunks
    const context = chunksToProcess
      .map((chunk, index) => `[Deel ${index + 1}]\n${chunk}`)
      .join('\n\n---\n\n');

    // Create prompt
    const systemPrompt = `Je bent een expert in het samenvatten van Nederlandse beleidsdocumenten en juridische teksten.
Je maakt beknopte maar complete samenvattingen die de belangrijkste punten van een document weergeven.
Gebruik markdown formatting voor structuur (headers, lijsten, etc.).
Schrijf in het Nederlands.`;

    const userPrompt = `Document: ${title}

Inhoud van het document:
${context}

Maak een beknopte samenvatting (ongeveer ${this.config.targetLength} woorden) van dit document in markdown formaat.
De samenvatting moet:
- De belangrijkste punten en conclusies bevatten
- De structuur van het document weerspiegelen waar relevant
- Gebruik maken van markdown formatting (headers, lijsten, etc.)
- Geschreven zijn in het Nederlands
- Geen citaties of referenties bevatten (gewoon de inhoud samenvatten)`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llmService.generate(messages);
      return response.content.trim();
    } catch (error) {
      logger.error({ error, documentId: document._id }, 'Error generating summary with LLM');
      throw new ServiceUnavailableError(
        'Failed to generate summary. LLM service may be unavailable.',
        {
          reason: 'llm_generation_failed',
          operation: 'generateSummary',
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  /**
   * Chunk text into smaller pieces for LLM processing
   * Uses paragraph-based chunking to preserve semantic boundaries
   */
  private chunkText(text: string, chunkSizeTokens: number): string[] {
    // Rough estimate: 1 token ≈ 4 characters
    const tokensPerChar = 0.25;
    const chunkSizeChars = Math.floor(chunkSizeTokens / tokensPerChar);
    
    // Split by paragraphs (double newlines) or sentence boundaries
    const paragraphs = text.split(/\n\s*\n|\n(?=[A-Z][^.!?]*[.!?]\s)/).filter(p => p.trim().length > 0);
    
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const paragraphTokens = Math.ceil(paragraph.length * tokensPerChar);
      const currentChunkTokens = Math.ceil(currentChunk.length * tokensPerChar);

      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length > 0 && currentChunkTokens + paragraphTokens > chunkSizeTokens) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + paragraph;
        } else {
          currentChunk = paragraph;
        }
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    // If no chunks were created (very short text), return the whole text
    if (chunks.length === 0) {
      return [text];
    }

    return chunks;
  }
}

// Singleton instance
let documentSummarizationService: DocumentSummarizationService | null = null;

/**
 * Get singleton instance of DocumentSummarizationService
 */
export function getDocumentSummarizationService(): DocumentSummarizationService {
  if (!documentSummarizationService) {
    documentSummarizationService = new DocumentSummarizationService();
  }
  return documentSummarizationService;
}
