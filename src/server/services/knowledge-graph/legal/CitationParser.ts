/**
 * Citation Parser Service
 * 
 * Parses citations in documents to extract references to other documents.
 * Supports Dutch legal citation formats and multiple citation patterns.
 */

import { logger } from '../../../utils/logger.js';

export interface Citation {
  text: string; // Original citation text
  documentId?: string; // Extracted document ID if found
  documentTitle?: string; // Extracted document title
  citationType: CitationType;
  confidence: number; // Confidence score [0, 1]
  context?: string; // Surrounding text context
}

export enum CitationType {
  DOCUMENT_ID = 'DOCUMENT_ID', // Explicit document ID reference
  LEGAL_REFERENCE = 'LEGAL_REFERENCE', // Legal citation format (e.g., "Artikel 2.1 van de Omgevingswet")
  URL_REFERENCE = 'URL_REFERENCE', // URL to another document
  TITLE_REFERENCE = 'TITLE_REFERENCE', // Reference by document title
  UNKNOWN = 'UNKNOWN', // Unrecognized citation format
}

export interface CitationParseResult {
  citations: Citation[];
  parseTime: number;
  totalCitations: number;
  confidence: number; // Average confidence
}

/**
 * Service for parsing citations from document text.
 */
export class CitationParser {
  // Dutch legal citation patterns
  // Security: Use bounded quantifiers to prevent ReDoS attacks
  private readonly patterns = {
    // Artikel references: "Artikel 2.1 van de Omgevingswet"
    // Limit capture groups to prevent excessive backtracking
    artikelPattern: /artikel\s+(\d+\.?\d{0,10})\s+van\s+(?:de\s+)?([A-Z][a-zA-Z\s]{1,100}?)(?:\s|$|,|\.)/gi,
    
    // Wet references: "Wet van 20 juli 2017, houdende regels over de fysieke leefomgeving (Omgevingswet)"
    wetPattern: /(?:de\s+)?([A-Z][a-zA-Z\s]{1,100}?wet)(?:\s|$|,|\.)/gi,
    
    // Besluit references: "Besluit van ..."
    besluitPattern: /(?:het\s+)?([A-Z][a-zA-Z\s]{1,100}?besluit)(?:\s|$|,|\.)/gi,
    
    // Verordening references: "Verordening van ..."
    verordeningPattern: /(?:de\s+)?([A-Z][a-zA-Z\s]{1,100}?verordening)(?:\s|$|,|\.)/gi,
    
    // Document ID patterns: "Document ID: ABC-123", "Doc: XYZ-456"
    // Limit ID length to prevent ReDoS
    documentIdPattern: /(?:document\s+)?(?:id|nummer|nr)[\s:]+([A-Z0-9-]{1,50})/gi,
    
    // URL patterns - limit URL length
    urlPattern: /https?:\/\/[^\s)]{1,500}/gi,
    
    // Title references in quotes: "Omgevingsvisie 2020"
    // Already bounded: {10,100}
    titlePattern: /["']([A-Z][^"']{10,100})["']/g,
  };

  /**
   * Parse citations from document text.
   */
  async parseCitations(
    text: string,
    documentId?: string
  ): Promise<CitationParseResult> {
    const startTime = Date.now();
    const citations: Citation[] = [];

    if (!text || text.trim().length === 0) {
      return {
        citations: [],
        parseTime: Date.now() - startTime,
        totalCitations: 0,
        confidence: 0,
      };
    }

    // Security: Limit input length to prevent ReDoS attacks
    const MAX_TEXT_LENGTH = 1000000; // 1MB limit
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH);
    }

    // Extract citations using various patterns
    citations.push(...this.extractArtikelCitations(text));
    citations.push(...this.extractWetCitations(text));
    citations.push(...this.extractBesluitCitations(text));
    citations.push(...this.extractVerordeningCitations(text));
    citations.push(...this.extractDocumentIdCitations(text));
    citations.push(...this.extractUrlCitations(text));
    citations.push(...this.extractTitleCitations(text));

    // Deduplicate citations (same text)
    const uniqueCitations = this.deduplicateCitations(citations);

    // Calculate average confidence
    const avgConfidence =
      uniqueCitations.length > 0
        ? uniqueCitations.reduce((sum, c) => sum + c.confidence, 0) /
          uniqueCitations.length
        : 0;

    const parseTime = Date.now() - startTime;

    logger.debug(
      `[CitationParser] Parsed ${uniqueCitations.length} citations from document ${documentId} in ${parseTime}ms`
    );

    return {
      citations: uniqueCitations,
      parseTime,
      totalCitations: uniqueCitations.length,
      confidence: avgConfidence,
    };
  }

  /**
   * Extract Artikel citations (e.g., "Artikel 2.1 van de Omgevingswet").
   */
  private extractArtikelCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    // Limit matches to prevent excessive processing
    const allMatches = text.matchAll(this.patterns.artikelPattern);
    const matches: RegExpMatchArray[] = [];
    let count = 0;
    const MAX_MATCHES = 1000;
    for (const match of allMatches) {
      if (count++ >= MAX_MATCHES) break;
      matches.push(match);
    }

    for (const match of matches) {
      const fullMatch = match[0];
      const artikelNumber = match[1];
      const wetName = match[2]?.trim();

      citations.push({
        text: fullMatch,
        documentTitle: wetName ? `${wetName} (Artikel ${artikelNumber})` : undefined,
        citationType: CitationType.LEGAL_REFERENCE,
        confidence: 0.8,
        context: this.getContext(text, match.index || 0, fullMatch.length),
      });
    }

    return citations;
  }

  /**
   * Extract Wet citations (e.g., "Omgevingswet", "Woningwet").
   */
  private extractWetCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    // Limit matches to prevent excessive processing
    const allMatches = text.matchAll(this.patterns.wetPattern);
    const matches: RegExpMatchArray[] = [];
    let count = 0;
    const MAX_MATCHES = 1000;
    for (const match of allMatches) {
      if (count++ >= MAX_MATCHES) break;
      matches.push(match);
    }

    for (const match of matches) {
      const fullMatch = match[0];
      const wetName = match[1]?.trim();

      // Skip if already captured as artikel citation
      if (text.substring(Math.max(0, (match.index || 0) - 50), match.index || 0).toLowerCase().includes('artikel')) {
        continue;
      }

      citations.push({
        text: fullMatch,
        documentTitle: wetName,
        citationType: CitationType.LEGAL_REFERENCE,
        confidence: 0.7,
        context: this.getContext(text, match.index || 0, fullMatch.length),
      });
    }

    return citations;
  }

  /**
   * Extract Besluit citations.
   */
  private extractBesluitCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    // Limit matches to prevent excessive processing
    const allMatches = text.matchAll(this.patterns.besluitPattern);
    const matches: RegExpMatchArray[] = [];
    let count = 0;
    const MAX_MATCHES = 1000;
    for (const match of allMatches) {
      if (count++ >= MAX_MATCHES) break;
      matches.push(match);
    }

    for (const match of matches) {
      const fullMatch = match[0];
      const besluitName = match[1]?.trim();

      citations.push({
        text: fullMatch,
        documentTitle: besluitName,
        citationType: CitationType.LEGAL_REFERENCE,
        confidence: 0.7,
        context: this.getContext(text, match.index || 0, fullMatch.length),
      });
    }

    return citations;
  }

  /**
   * Extract Verordening citations.
   */
  private extractVerordeningCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    // Limit matches to prevent excessive processing
    const allMatches = text.matchAll(this.patterns.verordeningPattern);
    const matches: RegExpMatchArray[] = [];
    let count = 0;
    const MAX_MATCHES = 1000;
    for (const match of allMatches) {
      if (count++ >= MAX_MATCHES) break;
      matches.push(match);
    }

    for (const match of matches) {
      const fullMatch = match[0];
      const verordeningName = match[1]?.trim();

      citations.push({
        text: fullMatch,
        documentTitle: verordeningName,
        citationType: CitationType.LEGAL_REFERENCE,
        confidence: 0.7,
        context: this.getContext(text, match.index || 0, fullMatch.length),
      });
    }

    return citations;
  }

  /**
   * Extract document ID citations (e.g., "Document ID: ABC-123").
   */
  private extractDocumentIdCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    const matches = [...text.matchAll(this.patterns.documentIdPattern)];

    for (const match of matches) {
      const fullMatch = match[0];
      const documentId = match[1]?.trim();

      citations.push({
        text: fullMatch,
        documentId,
        citationType: CitationType.DOCUMENT_ID,
        confidence: 0.9, // High confidence for explicit IDs
        context: this.getContext(text, match.index || 0, fullMatch.length),
      });
    }

    return citations;
  }

  /**
   * Extract URL citations.
   */
  private extractUrlCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    const matches = [...text.matchAll(this.patterns.urlPattern)];

    for (const match of matches) {
      const url = match[0];

      citations.push({
        text: url,
        citationType: CitationType.URL_REFERENCE,
        confidence: 0.85,
        context: this.getContext(text, match.index || 0, url.length),
      });
    }

    return citations;
  }

  /**
   * Extract title citations (quoted titles).
   */
  private extractTitleCitations(text: string): Citation[] {
    const citations: Citation[] = [];
    const matches = [...text.matchAll(this.patterns.titlePattern)];

    for (const match of matches) {
      const fullMatch = match[0];
      const title = match[1]?.trim();

      // Only consider if title looks like a document title (length, capitalization)
      if (title && title.length >= 10 && title.length <= 100) {
        citations.push({
          text: fullMatch,
          documentTitle: title,
          citationType: CitationType.TITLE_REFERENCE,
          confidence: 0.6,
          context: this.getContext(text, match.index || 0, fullMatch.length),
        });
      }
    }

    return citations;
  }

  /**
   * Get context around a citation (surrounding text).
   */
  private getContext(text: string, index: number, length: number): string {
    const contextLength = 100;
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + length + contextLength);
    return text.substring(start, end).trim();
  }

  /**
   * Deduplicate citations based on text similarity.
   */
  private deduplicateCitations(citations: Citation[]): Citation[] {
    const seen = new Set<string>();
    const unique: Citation[] = [];

    for (const citation of citations) {
      const normalized = citation.text.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(citation);
      }
    }

    return unique;
  }
}

