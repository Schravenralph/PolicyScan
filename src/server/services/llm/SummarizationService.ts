import { ScrapedDocument } from '../infrastructure/types.js';
import { DocumentChunk, DocumentChunkingService } from '../ingestion/processing/DocumentChunkingService.js';
import { ChunkRetrievalService } from '../retrieval/ChunkRetrievalService.js';
import { LLMService, LLMMessage } from './LLMService.js';
import { CitationService, Citation } from '../review/CitationService.js';
import { ServiceUnavailableError } from '../../types/errors.js';

/**
 * Summarization options
 */
export interface SummarizationOptions {
  query?: string; // For query-focused summarization
  maxLength?: number; // Target summary length
  singleDocument?: boolean; // Summarize single document vs. multiple
}

/**
 * Result of summarization
 */
export interface SummarizationResult {
  summary: string;
  citations: Citation[];
  chunksUsed: DocumentChunk[];
  documentCount?: number;
}

/**
 * Service for summarizing documents using RAG
 * 
 * Can generate summaries for single documents, multiple documents,
 * or query-focused summaries.
 */
export class SummarizationService {
  private chunkingService: DocumentChunkingService;
  private retrievalService: ChunkRetrievalService;
  private llmService: LLMService;
  private citationService: CitationService;

  constructor(
    llmService?: LLMService,
    chunkingService?: DocumentChunkingService,
    retrievalService?: ChunkRetrievalService,
    citationService?: CitationService
  ) {
    this.llmService = llmService || new LLMService();
    this.chunkingService = chunkingService || new DocumentChunkingService();
    this.retrievalService = retrievalService || new ChunkRetrievalService(undefined, 10);
    this.citationService = citationService || new CitationService();
  }

  /**
   * Summarize documents
   * 
   * @param documents Documents to summarize
   * @param options Summarization options
   * @returns Summary with citations
   */
  async summarize(
    documents: ScrapedDocument[],
    options: SummarizationOptions = {}
  ): Promise<SummarizationResult> {
    if (!this.llmService.isEnabled()) {
      throw new ServiceUnavailableError('LLM service is disabled. Cannot generate summaries.', {
        reason: 'llm_service_disabled',
        operation: 'summarize'
      });
    }

    if (documents.length === 0) {
      return {
        summary: 'Geen documenten om samen te vatten.',
        citations: [],
        chunksUsed: []
      };
    }

    // 1. Chunk all documents
    const allChunks: DocumentChunk[] = [];
    documents.forEach(doc => {
      const chunks = this.chunkingService.chunkDocument(doc);
      allChunks.push(...chunks);
    });

    if (allChunks.length === 0) {
      return {
        summary: 'Geen inhoud gevonden in de documenten om samen te vatten.',
        citations: [],
        chunksUsed: []
      };
    }

    // 2. Retrieve relevant chunks (if query-focused) or use all chunks
    const relevantChunks = options.query
      ? await this.retrievalService.retrieveRelevantChunks(options.query, allChunks)
      : allChunks.slice(0, 20); // Limit to top 20 chunks for performance

    // 3. Generate summary using LLM
    const summary = await this.generateSummary(documents, relevantChunks, options);

    // 4. Generate citations
    const citations = this.citationService.generateCitations(relevantChunks);

    // 5. Format summary with citations
    const formattedSummary = this.citationService.formatCitations(summary, citations);

    return {
      summary: formattedSummary,
      citations,
      chunksUsed: relevantChunks,
      documentCount: documents.length
    };
  }

  /**
   * Generate summary using LLM
   */
  private async generateSummary(
    documents: ScrapedDocument[],
    chunks: DocumentChunk[],
    options: SummarizationOptions
  ): Promise<string> {
    // Build context from chunks
    const context = chunks.map((chunk, index) => {
      return `[${index + 1}] ${chunk.sourceTitle || 'Document'}\n${chunk.text}`;
    }).join('\n\n---\n\n');

    const documentTitles = documents.map(d => d.titel).filter(Boolean).join(', ');

    // Create prompt based on type
    let systemPrompt: string;
    let userPrompt: string;

    if (options.query) {
      // Query-focused summary
      systemPrompt = `Je bent een assistent die samenvattingen maakt van Nederlandse beleidsdocumenten.
Maak een beknopte samenvatting die zich richt op de gegeven vraag/onderwerp.
Gebruik alleen informatie uit de gegeven context. Citeer bronnen met [1], [2], etc.`;

      userPrompt = `Onderwerp/Vraag: ${options.query}

Documenten: ${documentTitles}

Context:
${context}

Maak een beknopte samenvatting (${options.maxLength || 300} woorden) die zich richt op het gegeven onderwerp.
Citeer belangrijke bronnen met [1], [2], etc.`;
    } else if (options.singleDocument && documents.length === 1) {
      // Single document summary
      systemPrompt = `Je bent een assistent die samenvattingen maakt van Nederlandse beleidsdocumenten.
Maak een beknopte maar complete samenvatting van het document.
Gebruik alleen informatie uit de gegeven context.`;

      userPrompt = `Document: ${documentTitles}

Inhoud:
${context}

Maak een beknopte samenvatting (${options.maxLength || 200} woorden) van dit document.`;
    } else {
      // Multi-document summary
      systemPrompt = `Je bent een assistent die samenvattingen maakt van meerdere Nederlandse beleidsdocumenten.
Maak een beknopte samenvatting die de belangrijkste punten uit alle documenten combineert.
Gebruik alleen informatie uit de gegeven context. Citeer bronnen met [1], [2], etc.`;

      userPrompt = `Documenten: ${documentTitles}

Inhoud:
${context}

Maak een beknopte samenvatting (${options.maxLength || 400} woorden) die de belangrijkste punten uit alle documenten combineert.
Citeer belangrijke bronnen met [1], [2], etc.`;
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.llmService.generate(messages);
    return response.content;
  }
}

