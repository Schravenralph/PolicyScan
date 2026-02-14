/**
 * StopTpodChunkingStrategy - Chunking strategy for DSO STOP/TPOD documents
 * 
 * MVP: treat extracted text as semi-structured; split by section markers.
 * Preserves headingPath if STOP parser yields it.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/04-unified-chunking.md
 */

import type { ChunkingStrategy, ChunkSegment, StrategyConfig } from './ChunkingStrategy.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import { DefaultChunkingStrategy } from './DefaultChunkingStrategy.js';

/**
 * STOP/TPOD chunking strategy
 * 
 * Looks for STOP/TPOD-specific section markers and structure.
 * Falls back to default strategy if no structure detected.
 */
export class StopTpodChunkingStrategy implements ChunkingStrategy {
  private defaultStrategy: DefaultChunkingStrategy;

  constructor() {
    this.defaultStrategy = new DefaultChunkingStrategy();
  }

  getName(): string {
    return 'stop-tpod';
  }

  async chunk(
    normalizedText: string,
    document: CanonicalDocument,
    config: StrategyConfig
  ): Promise<ChunkSegment[]> {
    // Try to detect STOP/TPOD structure
    const structureMarkers = this.findStructureMarkers(normalizedText);
    
    if (structureMarkers.length > 0) {
      // Use structure-aware chunking
      return this.chunkByStructure(normalizedText, structureMarkers, config);
    }

    // Fall back to default strategy
    return this.defaultStrategy.chunk(normalizedText, document, config);
  }

  /**
   * Find STOP/TPOD structure markers
   * 
   * Looks for patterns like:
   * - "Hoofdstuk", "Afdeling", "Paragraaf"
   * - Section numbers (e.g., "1.1", "2.3.1")
   * - GIO/OW object markers
   */
  private findStructureMarkers(text: string): Array<{ index: number; level: number; title: string }> {
    const markers: Array<{ index: number; level: number; title: string }> = [];
    
    // Pattern for numbered sections (e.g., "1.1", "2.3.1", "Hoofdstuk 1")
    const sectionPattern = /^(?:Hoofdstuk|Afdeling|Paragraaf|Artikel)\s+(\d+(?:\.\d+)*)[.:]?\s*(.+)?$/gmi;
    let match;
    
    while ((match = sectionPattern.exec(text)) !== null) {
      const number = match[1];
      const title = match[2]?.trim() || '';
      const level = (number.match(/\./g) || []).length + 1; // Count dots to determine level
      
      markers.push({
        index: match.index,
        level,
        title: title || number,
      });
    }

    // Also look for GIO/OW object patterns if available in enrichment metadata
    // This would be enhanced when STOP parser is integrated
    
    return markers.sort((a, b) => a.index - b.index);
  }

  /**
   * Chunk by detected structure
   */
  private chunkByStructure(
    text: string,
    markers: Array<{ index: number; level: number; title: string }>,
    config: StrategyConfig
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

      // Update heading path based on level
      if (marker.level <= currentLevel) {
        // Reset to appropriate level
        headingPath.length = marker.level - 1;
      }
      headingPath.push(marker.title);
      currentLevel = marker.level;

      const chunkText = text.substring(start, end);
      
      // If chunk is too large, split it further
      if (chunkText.length > config.maxChunkSize) {
        // Split by paragraphs within this section
        const subChunks = this.splitLargeChunk(chunkText, config, start);
        // Add heading path to all sub-chunks
        subChunks.forEach(chunk => {
          segments.push({
            ...chunk,
            headingPath: [...headingPath],
          });
        });
      } else if (chunkText.length >= config.minChunkSize) {
        segments.push({
          start,
          end,
          headingPath: [...headingPath],
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

