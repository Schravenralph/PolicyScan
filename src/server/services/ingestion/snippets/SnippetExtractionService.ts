import { ScrapedDocument } from '../../infrastructure/types.js';

/**
 * Service for extracting relevant snippets from documents for LLM re-ranking
 * 
 * This service extracts the most relevant portions of a document to send to the
 * re-ranker, keeping token usage within limits while preserving context.
 * 
 * How it works:
 * 1. Combines title, summary, and most relevant content chunk
 * 2. Limits total token count (default: ~500 tokens)
 * 3. Selects content chunks that best match the query
 */
export class SnippetExtractionService {
  private readonly maxTokens: number;
  private readonly tokensPerChar: number = 0.25; // Rough estimate: 1 token ≈ 4 characters

  constructor(maxTokens: number = 500) {
    this.maxTokens = maxTokens;
  }

  /**
   * Extract a relevant snippet from a document for re-ranking
   * 
   * @param document The document to extract snippet from
   * @param query The search query to match against
   * @returns A formatted snippet string ready for LLM input
   * 
   * The snippet includes:
   * - Document title (highest priority)
   * - Document summary (if available)
   * - Most relevant content chunk based on query matching
   */
  extractRelevantSnippet(document: ScrapedDocument, query: string): string {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    
    const parts: string[] = [];
    let tokenCount = 0;

    // 1. Always include title (highest priority)
    if (document.titel) {
      const titleText = `Title: ${document.titel}`;
      parts.push(titleText);
      tokenCount += this.estimateTokens(titleText);
    }

    // 2. Include summary if available
    if (document.samenvatting && tokenCount < this.maxTokens * 0.6) {
      const summaryText = `Summary: ${document.samenvatting}`;
      const summaryTokens = this.estimateTokens(summaryText);
      
      // Truncate summary if needed
      if (tokenCount + summaryTokens <= this.maxTokens * 0.8) {
        parts.push(summaryText);
        tokenCount += summaryTokens;
      } else {
        // Truncate summary to fit
        const remainingTokens = Math.floor(this.maxTokens * 0.8 - tokenCount);
        const truncatedSummary = this.truncateToTokens(document.samenvatting, remainingTokens);
        parts.push(`Summary: ${truncatedSummary}`);
        tokenCount += this.estimateTokens(truncatedSummary);
      }
    }

    // 3. Extract most relevant content chunk
    const content = this.extractContent(document);
    if (content && tokenCount < this.maxTokens * 0.9) {
      const relevantChunk = this.findMostRelevantChunk(content, queryTerms);
      if (relevantChunk) {
        const remainingTokens = Math.floor(this.maxTokens - tokenCount - 50); // Reserve 50 tokens for formatting
        const chunkText = this.truncateToTokens(relevantChunk, remainingTokens);
        if (chunkText.length > 0) {
          parts.push(`Content: ${chunkText}`);
        }
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Extract text content from document
   * Tries multiple fields to find the best content source
   * 
   * Note: ScrapedDocument interface doesn't include content/text/body fields,
   * but some extended document types may have them. This method safely checks
   * for these fields using type guards.
   */
  private extractContent(document: ScrapedDocument): string | null {
    // Type guard to check if document has extended content fields
    type ExtendedDocument = ScrapedDocument & {
      content?: string;
      text?: string;
      body?: string;
    };
    
    const extendedDoc = document as ExtendedDocument;
    
    // Try different content fields in order of preference
    const contentFields = [
      extendedDoc.content,
      extendedDoc.text,
      extendedDoc.body,
      document.samenvatting, // Fallback to summary if no content field
    ];

    for (const field of contentFields) {
      if (field && typeof field === 'string' && field.length > 100) {
        return field;
      }
    }

    return null;
  }

  /**
   * Find the most relevant chunk of content based on query terms
   * Splits content into sentences and scores each sentence
   */
  private findMostRelevantChunk(content: string, queryTerms: string[]): string | null {
    if (!content || queryTerms.length === 0) {
      return content || null;
    }

    // Split into sentences (simple approach)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    if (sentences.length === 0) {
      return content.substring(0, 500); // Fallback: first 500 chars
    }

    // Score each sentence based on query term matches
    const scoredSentences = sentences.map(sentence => {
      const sentenceLower = sentence.toLowerCase();
      let score = 0;
      
      for (const term of queryTerms) {
        if (sentenceLower.includes(term)) {
          score += 1;
          // Bonus for multiple occurrences
          const occurrences = (sentenceLower.match(new RegExp(term, 'g')) || []).length;
          score += (occurrences - 1) * 0.5;
        }
      }
      
      return { sentence: sentence.trim(), score };
    });

    // Sort by score and take top sentences
    scoredSentences.sort((a, b) => b.score - a.score);
    
    // Combine top 3-5 sentences (or until we have enough content)
    const topSentences = scoredSentences
      .filter(s => s.score > 0)
      .slice(0, 5)
      .map(s => s.sentence);

    if (topSentences.length === 0) {
      // No matches, return first few sentences
      return sentences.slice(0, 3).join('. ') + '.';
    }

    return topSentences.join('. ') + '.';
  }

  /**
   * Estimate token count for a text string
   * Uses rough approximation: 1 token ≈ 4 characters
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length * this.tokensPerChar);
  }

  /**
   * Truncate text to approximately fit within token limit
   */
  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = Math.floor(maxTokens / this.tokensPerChar);
    if (text.length <= maxChars) {
      return text;
    }
    
    // Truncate at word boundary
    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }
}
