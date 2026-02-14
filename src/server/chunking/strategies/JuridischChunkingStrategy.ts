/**
 * JuridischChunkingStrategy - Chunking strategy for legal documents
 * 
 * Splits by headings ("Overwegingen", "Beslissing", etc.) and numbered articles/sections.
 * Stores headingPath and legalRefs placeholders.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/04-unified-chunking.md
 */

import type { ChunkingStrategy, ChunkSegment, StrategyConfig } from './ChunkingStrategy.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import { DefaultChunkingStrategy } from './DefaultChunkingStrategy.js';

/**
 * Juridisch (legal) chunking strategy
 * 
 * Specifically handles Rechtspraak and Wetgeving documents with legal structure.
 */
export class JuridischChunkingStrategy implements ChunkingStrategy {
  private defaultStrategy: DefaultChunkingStrategy;

  constructor() {
    this.defaultStrategy = new DefaultChunkingStrategy();
  }

  getName(): string {
    return 'juridisch';
  }

  async chunk(
    normalizedText: string,
    document: CanonicalDocument,
    config: StrategyConfig
  ): Promise<ChunkSegment[]> {
    // Find legal structure markers
    const structureMarkers = this.findLegalStructure(normalizedText, document);
    
    if (structureMarkers.length > 0) {
      return this.chunkByLegalStructure(normalizedText, structureMarkers, config, document);
    }

    // Fall back to default strategy
    return this.defaultStrategy.chunk(normalizedText, document, config);
  }

  /**
   * Find legal structure markers
   * 
   * Looks for:
   * - Rechtspraak sections: "Overwegingen", "Beslissing", "Conclusie"
   * - Wetgeving articles: "Artikel", "Lid", "Onderdeel"
   * - ECLI references if available
   */
  private findLegalStructure(
    text: string,
    document: CanonicalDocument
  ): Array<{ 
    index: number; 
    level: number; 
    title: string; 
    type: 'rechtspraak' | 'wetgeving';
    legalRefs?: string[];
  }> {
    const markers: Array<{
      index: number;
      level: number;
      title: string;
      type: 'rechtspraak' | 'wetgeving';
      legalRefs?: string[];
    }> = [];

    // Rechtspraak sections
    const rechtspraakPattern = /^(Overwegingen|Beslissing|Conclusie|Feiten|Recht|Geschiedenis|Procedures|Beoordeling)[.:]?\s*(.+)?$/gmi;
    let match;
    
    while ((match = rechtspraakPattern.exec(text)) !== null) {
      const sectionType = match[1];
      
      markers.push({
        index: match.index,
        level: 1,
        title: sectionType,
        type: 'rechtspraak',
      });
    }

    // Wetgeving articles
    const wetgevingPattern = /^(Artikel|Lid|Onderdeel|Paragraaf)\s+(\d+[a-z]?)[.:]?\s*(.+)?$/gmi;
    
    while ((match = wetgevingPattern.exec(text)) !== null) {
      const articleType = match[1];
      const number = match[2];
      const title = match[3]?.trim() || '';
      const fullTitle = `${articleType} ${number}${title ? `: ${title}` : ''}`;
      
      // Determine level based on type
      let level = 1;
      if (articleType === 'Artikel') level = 1;
      else if (articleType === 'Lid') level = 2;
      else if (articleType === 'Onderdeel') level = 3;
      else if (articleType === 'Paragraaf') level = 2;

      markers.push({
        index: match.index,
        level,
        title: fullTitle,
        type: 'wetgeving',
      });
    }

    // Extract ECLI or other legal references from document metadata if available
    const legalRefs: string[] = [];
    if (document.enrichmentMetadata) {
      const metadata = document.enrichmentMetadata as Record<string, unknown>;
      if (metadata.ecli) {
        legalRefs.push(String(metadata.ecli));
      }
      if (metadata.legalIds && Array.isArray(metadata.legalIds)) {
        legalRefs.push(...(metadata.legalIds as string[]));
      }
    }

    // Add legal refs to first marker if found
    if (legalRefs.length > 0 && markers.length > 0) {
      markers[0].legalRefs = legalRefs;
    }

    return markers.sort((a, b) => a.index - b.index);
  }

  /**
   * Chunk by legal structure
   */
  private chunkByLegalStructure(
    text: string,
    markers: Array<{
      index: number;
      level: number;
      title: string;
      type: 'rechtspraak' | 'wetgeving';
      legalRefs?: string[];
    }>,
    config: StrategyConfig,
    _document: CanonicalDocument
  ): ChunkSegment[] {
    const segments: ChunkSegment[] = [];
    const headingPath: string[] = [];
    let currentLevel = 0;

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const start = marker.index;
      const end = i < markers.length - 1 
        ? markers[i + 1].index 
        : text.length;

      // Update heading path
      if (marker.level <= currentLevel) {
        headingPath.length = marker.level - 1;
      }
      headingPath.push(marker.title);
      currentLevel = marker.level;

      const chunkText = text.substring(start, end);
      
      // Split large chunks
      if (chunkText.length > config.maxChunkSize) {
        const subChunks = this.splitLargeChunk(chunkText, config, start);
        subChunks.forEach(chunk => {
          segments.push({
            ...chunk,
            headingPath: [...headingPath],
            legalRefs: marker.legalRefs,
          });
        });
      } else if (chunkText.length >= config.minChunkSize) {
        segments.push({
          start,
          end,
          headingPath: [...headingPath],
          legalRefs: marker.legalRefs,
        });
      }
    }

    return segments;
  }

  /**
   * Split a large chunk into smaller pieces
   */
  private splitLargeChunk(
    text: string,
    config: StrategyConfig,
    baseOffset: number
  ): Array<{ start: number; end: number }> {
    const segments: Array<{ start: number; end: number }> = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let currentChunk = '';
    let currentStart = baseOffset;
    let currentEnd = baseOffset;

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      const paragraphWithNewlines = `\n\n${trimmed}`;
      
      if (currentChunk.length + paragraphWithNewlines.length <= config.maxChunkSize) {
        currentChunk += paragraphWithNewlines;
        currentEnd += paragraphWithNewlines.length;
      } else {
        if (currentChunk.length >= config.minChunkSize) {
          segments.push({ start: currentStart, end: currentEnd });
        }
        currentChunk = paragraphWithNewlines;
        currentStart = currentEnd;
        currentEnd = currentStart + paragraphWithNewlines.length;
      }
    }

    if (currentChunk.length >= config.minChunkSize) {
      segments.push({ start: currentStart, end: currentEnd });
    }

    return segments;
  }
}

