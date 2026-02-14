import { ScrapedDocument } from '../../infrastructure/types.js';

/**
 * Configuration for document chunking
 */
export interface ChunkingConfig {
  chunkSize: number; // Target chunk size in tokens (approximately)
  chunkOverlap: number; // Overlap between chunks in tokens
  strategy: 'paragraph' | 'section' | 'fixed'; // Chunking strategy
}

/**
 * Represents a chunk of text with metadata
 */
export interface DocumentChunk {
  id: string;
  text: string;
  startIndex: number; // Character position in original document
  endIndex: number;
  chunkIndex: number; // Order within document
  sourceUrl?: string;
  sourceTitle?: string;
  metadata: Record<string, unknown>;
}

/**
 * Service for chunking documents into smaller pieces for RAG
 * 
 * This service splits documents into chunks that fit within LLM context windows
 * while preserving semantic meaning. Supports multiple chunking strategies.
 */
export class DocumentChunkingService {
  private config: ChunkingConfig;
  private readonly tokensPerChar: number = 0.25; // Rough estimate: 1 token ≈ 4 characters

  constructor(config?: Partial<ChunkingConfig>) {
    this.config = {
      chunkSize: parseInt(process.env.CHUNK_SIZE || '500', 10),
      chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '50', 10),
      strategy: (process.env.CHUNK_STRATEGY as 'paragraph' | 'section' | 'fixed') || 'paragraph',
      ...config
    };

    if (this.config.chunkOverlap >= this.config.chunkSize) {
      throw new Error('Chunk overlap must be strictly less than chunk size');
    }
  }

  /**
   * Chunk a document into smaller pieces
   * 
   * @param document The document to chunk
   * @returns Array of document chunks
   */
  chunkDocument(document: ScrapedDocument): DocumentChunk[] {
    const content = this.extractContent(document);
    if (!content) {
      return [];
    }

    switch (this.config.strategy) {
      case 'paragraph':
        return this.chunkByParagraph(content, document);
      case 'section':
        return this.chunkBySection(content, document);
      case 'fixed':
        return this.chunkByFixedSize(content, document);
      default:
        return this.chunkByParagraph(content, document);
    }
  }

  /**
   * Chunk document by paragraphs (preserves semantic boundaries)
   */
  private chunkByParagraph(content: string, document: ScrapedDocument): DocumentChunk[] {
    // Split by double newlines or single newline after sentence
    const paragraphs = content.split(/\n\s*\n|\n(?=[A-Z][^.!?]*[.!?]\s)/).filter(p => p.trim().length > 0);
    
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let chunkStartIndex = 0;
    let chunkIndex = 0;
    let globalIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const paragraphTokens = this.estimateTokens(paragraph);
      const currentChunkTokens = this.estimateTokens(currentChunk);

      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length > 0 && currentChunkTokens + paragraphTokens > this.config.chunkSize) {
        chunks.push(this.createChunk(
          currentChunk,
          chunkStartIndex,
          globalIndex - 1,
          chunkIndex++,
          document
        ));

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk, this.config.chunkOverlap);
        currentChunk = overlapText + '\n\n' + paragraph;
        chunkStartIndex = globalIndex - overlapText.length;
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n' + paragraph;
        } else {
          currentChunk = paragraph;
          chunkStartIndex = globalIndex;
        }
      }

      globalIndex += paragraph.length + 2; // +2 for newlines
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(
        currentChunk,
        chunkStartIndex,
        content.length - 1,
        chunkIndex,
        document
      ));
    }

    return chunks;
  }

  /**
   * Chunk document by sections (uses markdown headers if available)
   */
  private chunkBySection(content: string, document: ScrapedDocument): DocumentChunk[] {
    // Try to detect markdown headers
    const headerPattern = /^(#{1,6})\s+(.+)$/gm;
    const sections: Array<{ title: string; level: number; start: number; end: number }> = [];
    let lastMatch: RegExpMatchArray | null = null;

    let match: RegExpMatchArray | null;
	    while ((match = headerPattern.exec(content)) !== null) {
	      if (lastMatch) {
	        sections[sections.length - 1].end = match.index ?? content.length;
	      }
	      sections.push({
	        title: match[2],
	        level: match[1].length,
	        start: match.index ?? 0,
	        end: content.length
	      });
	      lastMatch = match;
	    }

    if (sections.length === 0) {
      // No sections found, fall back to paragraph chunking
      return this.chunkByParagraph(content, document);
    }

    const chunks: DocumentChunk[] = [];
    sections.forEach((section, _index) => {
      const sectionText = content.substring(section.start, section.end).trim();
      if (sectionText.length > 0) {
        // Further chunk large sections
        const sectionChunks = this.chunkByFixedSize(sectionText, document, section.start);
        chunks.push(...sectionChunks);
      }
    });

    return chunks;
  }

  /**
   * Chunk document by fixed size (sliding window with overlap)
   */
  private chunkByFixedSize(
    content: string,
    document: ScrapedDocument,
    offset: number = 0
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const chunkSizeChars = Math.floor(this.config.chunkSize / this.tokensPerChar);
    const overlapChars = Math.floor(this.config.chunkOverlap / this.tokensPerChar);
    const stepSize = chunkSizeChars - overlapChars;

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < content.length) {
      const endIndex = Math.min(startIndex + chunkSizeChars, content.length);
      const chunkText = content.substring(startIndex, endIndex);

      // Try to end at sentence boundary if possible
      const sentenceEnd = chunkText.lastIndexOf('.');
      const finalEndIndex = sentenceEnd > chunkText.length * 0.8 
        ? startIndex + sentenceEnd + 1 
        : endIndex;

      chunks.push(this.createChunk(
        content.substring(startIndex, finalEndIndex),
        offset + startIndex,
        offset + finalEndIndex - 1,
        chunkIndex++,
        document
      ));

      startIndex += stepSize;
    }

    return chunks;
  }

  /**
   * Extract text content from document
   */
  private extractContent(document: ScrapedDocument): string | null {
    const doc = document as ScrapedDocument & { content?: string; text?: string; body?: string };
    const contentFields = [
      doc.content,
      doc.text,
      doc.body,
      document.samenvatting,
    ];

    for (const field of contentFields) {
      if (field && typeof field === 'string' && field.length > 0) {
        return field;
      }
    }

    return null;
  }

  /**
   * Create a document chunk with metadata
   */
  private createChunk(
    text: string,
    startIndex: number,
    endIndex: number,
    chunkIndex: number,
    document: ScrapedDocument
  ): DocumentChunk {
    return {
      id: `${document.url || document.titel || 'unknown'}-chunk-${chunkIndex}`,
      text: text.trim(),
      startIndex,
      endIndex,
      chunkIndex,
      sourceUrl: document.url,
      sourceTitle: document.titel,
      metadata: {
        ...(document as ScrapedDocument & { metadata?: Record<string, unknown>; id?: string }).metadata || {},
        originalDocumentId: (document as ScrapedDocument & { id?: string }).id,
      }
    };
  }

  /**
   * Get overlap text from end of chunk
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    const overlapChars = Math.floor(overlapTokens / this.tokensPerChar);
    const overlapText = text.substring(Math.max(0, text.length - overlapChars));
    
    // Try to start at sentence boundary
    const firstSentenceEnd = overlapText.indexOf('.');
    if (firstSentenceEnd > 0 && firstSentenceEnd < overlapText.length * 0.5) {
      return overlapText.substring(firstSentenceEnd + 1).trim();
    }
    
    return overlapText;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length * this.tokensPerChar);
  }

  /**
   * Get current configuration
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }
}
