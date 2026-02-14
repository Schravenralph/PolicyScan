import { DocumentChunk } from './DocumentChunkingService.js';

/**
 * Represents a citation reference
 */
export interface Citation {
  id: string; // Citation reference ID (e.g., "[1]", "[2]")
  chunkId: string;
  sourceUrl?: string;
  sourceTitle?: string;
  text: string; // The text being cited
  position: number; // Position in the answer/summary
}

/**
 * Citation format options
 */
export type CitationFormat = 'inline' | 'reference' | 'both';

/**
 * Configuration for citation generation
 */
export interface CitationConfig {
  format: CitationFormat;
  enabled: boolean;
}

/**
 * Service for generating and formatting citations for RAG responses
 * 
 * Tracks which chunks from source documents were used to generate
 * answers/summaries and formats them appropriately.
 */
export class CitationService {
  private config: CitationConfig;

  constructor(config?: Partial<CitationConfig>) {
    this.config = {
      format: (process.env.CITATION_FORMAT as CitationFormat) || 'inline',
      enabled: process.env.CITATION_ENABLED !== 'false',
      ...config
    };
  }

  /**
   * Generate citations for chunks used in a response
   * 
   * @param chunks The chunks that were used to generate the response
   * @returns Array of citations with IDs
   */
  generateCitations(chunks: DocumentChunk[]): Citation[] {
    if (!this.config.enabled) {
      return [];
    }

    // Deduplicate by source URL (multiple chunks from same document share citation)
    const sourceMap = new Map<string, DocumentChunk>();
    chunks.forEach(chunk => {
      const key = chunk.sourceUrl || chunk.id;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, chunk);
      }
    });

    const citations: Citation[] = [];
    let citationIndex = 1;

    sourceMap.forEach((chunk, _key) => {
      citations.push({
        id: `[${citationIndex}]`,
        chunkId: chunk.id,
        sourceUrl: chunk.sourceUrl,
        sourceTitle: chunk.sourceTitle,
        text: this.extractCitationText(chunk.text),
        position: 0 // Will be set when formatting
      });
      citationIndex++;
    });

    return citations;
  }

  /**
   * Format citations into the response text
   * 
   * @param text The generated text (may contain citation markers)
   * @param citations The citations to format
   * @returns Formatted text with citations
   */
  formatCitations(text: string, citations: Citation[]): string {
    if (!this.config.enabled || citations.length === 0) {
      return text;
    }

    switch (this.config.format) {
      case 'inline':
        return this.formatInlineCitations(text, citations);
      case 'reference':
        return this.formatReferenceCitations(text, citations);
      case 'both':
        return this.formatBothCitations(text, citations);
      default:
        return text;
    }
  }

  /**
   * Format citations inline (e.g., "According to the policy [1], ...")
   */
  private formatInlineCitations(text: string, citations: Citation[]): string {
    // If text already has citation markers, use them
    if (text.includes('[') && text.match(/\[\d+\]/)) {
      return text + '\n\n' + this.formatReferenceList(citations);
    }

    // Otherwise, append citations to end of relevant sentences
    // This is a simple implementation - in practice, the LLM should include citations
    return text + '\n\n' + this.formatReferenceList(citations);
  }

  /**
   * Format citations as reference list only (e.g., "References: [1] ...")
   */
  private formatReferenceCitations(text: string, citations: Citation[]): string {
    return text + '\n\n' + this.formatReferenceList(citations);
  }

  /**
   * Format both inline and reference list
   */
  private formatBothCitations(text: string, citations: Citation[]): string {
    // Add inline citations if not present
    let formattedText = text;
    if (!text.match(/\[\d+\]/)) {
      // Simple approach: add citations to end of sentences
      // In practice, LLM should be instructed to include citations inline
      formattedText = text;
    }

    return formattedText + '\n\n' + this.formatReferenceList(citations);
  }

  /**
   * Format reference list
   */
  private formatReferenceList(citations: Citation[]): string {
    const lines = citations.map(citation => {
      const parts: string[] = [citation.id];
      
      if (citation.sourceTitle) {
        parts.push(citation.sourceTitle);
      }
      
      if (citation.sourceUrl) {
        parts.push(`(${citation.sourceUrl})`);
      }

      return parts.join(' ');
    });

    return '**Referenties:**\n' + lines.join('\n');
  }

  /**
   * Extract citation text (first sentence or first N characters)
   */
  private extractCitationText(text: string, maxLength: number = 150): string {
    // Try to get first sentence
    const firstSentenceMatch = text.match(/^[^.!?]+[.!?]/);
    if (firstSentenceMatch && firstSentenceMatch[0].length <= maxLength) {
      return firstSentenceMatch[0];
    }

    // Otherwise truncate
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace > maxLength * 0.8 ? lastSpace : maxLength) + '...';
  }

  /**
   * Extract citations from LLM response text
   * Looks for patterns like [1], [2], etc.
   */
  extractCitationsFromText(text: string, citations: Citation[]): Array<{ position: number; citation: Citation }> {
    const found: Array<{ position: number; citation: Citation }> = [];
    const citationPattern = /\[(\d+)\]/g;
    let match: RegExpMatchArray | null;

    while ((match = citationPattern.exec(text)) !== null) {
      const citationNum = parseInt(match[1], 10);
      const citation = citations.find(c => c.id === `[${citationNum}]`);
        if (citation) {
          found.push({
	          position: match.index ?? 0,
	          citation
          });
        }
    }

    return found;
  }

  /**
   * Get configuration
   */
  getConfig(): CitationConfig {
    return { ...this.config };
  }
}
