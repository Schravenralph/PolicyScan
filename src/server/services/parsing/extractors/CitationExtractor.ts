/**
 * CitationExtractor - Extracts citations from documents
 * 
 * Extracts legal citations and document references from document text
 * using pattern-based matching.
 * 
 * Extracted from CitationParser to separate parsing concerns.
 */

import { logger } from '../../../utils/logger.js';
import { CitationParser, CitationType } from '../../knowledge-graph/legal/CitationParser.js';
import type { IExtractor } from '../interfaces/IExtractor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { Citation } from '../types/Citation.js';
import crypto from 'crypto';

/**
 * Citation Extractor
 * 
 * Extracts citations from canonical documents using pattern-based matching.
 * This extractor uses CitationParser internally.
 */
export class CitationExtractor implements IExtractor<Citation> {
  private citationParser: CitationParser;

  constructor() {
    this.citationParser = new CitationParser();
  }

  /**
   * Extract citations from a document
   * 
   * @param document - Canonical document to extract citations from
   * @returns Array of extracted citations
   */
  async extract(document: CanonicalDocument): Promise<Citation[]> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[CitationExtractor] Extracting citations from document'
    );

    try {
      // Extract citations using CitationParser
      const parseResult = await this.citationParser.parseCitations(
        document.fullText || '',
        document.sourceId
      );

      // Convert CitationParser citations to parsing layer Citation format
      const citations: Citation[] = parseResult.citations.map((parserCitation, index) => {
        const id = this.generateCitationId(document.sourceId, parserCitation.text, index);
        const type = this.mapCitationType(parserCitation.citationType);

        return {
          id,
          text: parserCitation.text,
          type,
          confidence: parserCitation.confidence,
          sourceDocument: document.sourceId,
          extractedAt: new Date(),
        };
      });

      logger.info(
        {
          sourceId: document.sourceId,
          citationCount: citations.length,
          parseTime: parseResult.parseTime,
          averageConfidence: parseResult.confidence,
        },
        '[CitationExtractor] Extracted citations from document'
      );

      return citations;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sourceId: document.sourceId,
        },
        '[CitationExtractor] Failed to extract citations'
      );
      
      // Return empty array on error
      return [];
    }
  }

  /**
   * Generate a unique ID for a citation
   * 
   * @param sourceDocument - Source document ID
   * @param citationText - Citation text
   * @param index - Index in the citations array
   * @returns Unique citation ID
   */
  private generateCitationId(sourceDocument: string, citationText: string, index: number): string {
    // Create a hash of the citation text for uniqueness
    const hash = crypto.createHash('md5')
      .update(`${sourceDocument}:${citationText}`)
      .digest('hex')
      .substring(0, 8);
    
    return `${sourceDocument}:citation:${hash}:${index}`;
  }

  /**
   * Map CitationParser CitationType enum to string type
   * 
   * @param citationType - CitationParser citation type
   * @returns String type for parsing layer Citation
   */
  private mapCitationType(citationType: CitationType): string {
    switch (citationType) {
      case CitationType.DOCUMENT_ID:
        return 'document-id';
      case CitationType.LEGAL_REFERENCE:
        return 'legal-reference';
      case CitationType.URL_REFERENCE:
        return 'url';
      case CitationType.TITLE_REFERENCE:
        return 'title';
      case CitationType.UNKNOWN:
      default:
        return 'unknown';
    }
  }
}
