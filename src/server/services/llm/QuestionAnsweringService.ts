import { ScrapedDocument } from '../infrastructure/types.js';
import { DocumentChunk, DocumentChunkingService } from '../ingestion/processing/DocumentChunkingService.js';
import { ChunkRetrievalService } from '../retrieval/ChunkRetrievalService.js';
import { LLMService, LLMMessage } from './LLMService.js';
import { CitationService, Citation } from '../review/CitationService.js';
import { ServiceUnavailableError } from '../../types/errors.js';

/**
 * Result of question-answering
 */
export interface QAResult {
  answer: string;
  citations: Citation[];
  confidence?: number;
  chunksUsed: DocumentChunk[];
}

/**
 * Service for question-answering over documents using RAG
 * 
 * Retrieves relevant chunks from documents and uses LLM to generate
 * answers with citations.
 */
export class QuestionAnsweringService {
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
    this.retrievalService = retrievalService || new ChunkRetrievalService(undefined, 5);
    this.citationService = citationService || new CitationService();
  }

  /**
   * Answer a question using retrieved documents
   * 
   * @param question The question to answer
   * @param documents The documents to search in
   * @returns Answer with citations
   */
  async answer(question: string, documents: ScrapedDocument[]): Promise<QAResult> {
    if (!this.llmService.isEnabled()) {
      throw new ServiceUnavailableError('LLM service is disabled. Cannot answer questions.', {
        reason: 'llm_service_disabled',
        operation: 'answer'
      });
    }

    // 1. Chunk all documents
    const allChunks: DocumentChunk[] = [];
    documents.forEach(doc => {
      const chunks = this.chunkingService.chunkDocument(doc);
      allChunks.push(...chunks);
    });

    if (allChunks.length === 0) {
      return {
        answer: 'Geen documenten gevonden om deze vraag te beantwoorden.',
        citations: [],
        chunksUsed: []
      };
    }

    // 2. Retrieve relevant chunks
    const relevantChunks = await this.retrievalService.retrieveRelevantChunks(question, allChunks);

    if (relevantChunks.length === 0) {
      return {
        answer: 'Geen relevante informatie gevonden in de beschikbare documenten om deze vraag te beantwoorden.',
        citations: [],
        chunksUsed: []
      };
    }

    // 3. Generate answer using LLM
    const answer = await this.generateAnswer(question, relevantChunks);

    // 4. Generate citations
    const citations = this.citationService.generateCitations(relevantChunks);

    // 5. Format answer with citations
    const formattedAnswer = this.citationService.formatCitations(answer, citations);

    return {
      answer: formattedAnswer,
      citations,
      chunksUsed: relevantChunks
    };
  }

  /**
   * Generate answer using LLM
   */
  private async generateAnswer(question: string, chunks: DocumentChunk[]): Promise<string> {
    // Build context from chunks
    const context = chunks.map((chunk, index) => {
      return `[${index + 1}] ${chunk.sourceTitle || 'Document'}\n${chunk.text}`;
    }).join('\n\n---\n\n');

    // Create prompt
    const systemPrompt = `Je bent een assistent die vragen beantwoordt over Nederlandse beleidsdocumenten. 
Gebruik alleen de informatie uit de gegeven context. Als het antwoord niet in de context staat, 
zeg dan "Ik heb geen informatie gevonden over deze vraag in de beschikbare documenten."

Citeer je bronnen met [1], [2], etc. aan het einde van relevante zinnen.`;

    const userPrompt = `Vraag: ${question}

Context:
${context}

Geef een duidelijk en beknopt antwoord op de vraag, gebruikmakend van de informatie uit de context. 
Citeer je bronnen met [1], [2], etc. waar relevant.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.llmService.generate(messages);
    return response.content;
  }
}

