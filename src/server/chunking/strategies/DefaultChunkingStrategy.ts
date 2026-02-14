/**
 * DefaultChunkingStrategy - Default chunking by headings/paragraphs
 * 
 * MVP strategy: split by headings when available, else by paragraphs.
 * Enforces size bounds and maintains overlap.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/04-unified-chunking.md
 */

import type { ChunkingStrategy, ChunkSegment, StrategyConfig } from './ChunkingStrategy.js';
import type { CanonicalDocument } from '../../contracts/types.js';

/**
 * Default chunking strategy
 * 
 * Splits by headings (markdown-style # or HTML-style) when available,
 * otherwise splits by paragraphs. Enforces size bounds.
 */
export class DefaultChunkingStrategy implements ChunkingStrategy {
  getName(): string {
    return 'default';
  }

  async chunk(
    normalizedText: string,
    _document: CanonicalDocument,
    config: StrategyConfig
  ): Promise<ChunkSegment[]> {
    const segments: ChunkSegment[] = [];

    // Try to split by headings first
    const headingMatches = this.findHeadings(normalizedText);
    
    if (headingMatches.length > 0) {
      // Split by headings
      for (let i = 0; i < headingMatches.length; i++) {
        const start = headingMatches[i].index;
        const end = i < headingMatches.length - 1 
          ? headingMatches[i + 1].index 
          : normalizedText.length;

        const text = normalizedText.substring(start, end);
        
        // If chunk is too large, split it further by paragraphs
        if (text.length > config.maxChunkSize) {
          const subChunks = this.splitByParagraphs(text, config, start);
          segments.push(...subChunks);
        } else if (text.length >= config.minChunkSize) {
          segments.push({
            start,
            end,
            headingPath: headingMatches[i].headingPath,
          });
        }
      }
    } else {
      // No headings found, split by paragraphs
      segments.push(...this.splitByParagraphs(normalizedText, config, 0));
    }

    // If no segments created (all chunks were too small), create at least one chunk with entire text
    // This ensures documents shorter than minChunkSize still get chunked
    if (segments.length === 0 && normalizedText.trim().length > 0) {
      segments.push({
        start: 0,
        end: normalizedText.length,
      });
    }

    // Apply overlap if configured
    if (config.chunkOverlap > 0 && segments.length > 1) {
      return this.applyOverlap(segments, config.chunkOverlap, normalizedText.length);
    }

    return segments;
  }

  /**
   * Find headings in text (markdown-style # or patterns like "Hoofdstuk", "Artikel")
   */
  private findHeadings(text: string): Array<{ index: number; headingPath: string[] }> {
    const headings: Array<{ index: number; headingPath: string[] }> = [];
    
    // Markdown-style headings (# ## ###)
    const markdownHeadingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    const headingPath: string[] = [];
    
    while ((match = markdownHeadingRegex.exec(text)) !== null) {
      const level = match[1].length;
      const title = match[2].trim();
      
      // Update heading path based on level
      headingPath.length = level - 1;
      headingPath.push(title);
      
      headings.push({
        index: match.index,
        headingPath: [...headingPath],
      });
    }

    // If no markdown headings, try to find common Dutch heading patterns
    if (headings.length === 0) {
      const dutchHeadingRegex = /^(Hoofdstuk|Artikel|Paragraaf|Afdeling)\s+(\d+[A-Za-z]?)[.:]\s*(.+)$/gmi;
      const dutchPath: string[] = [];
      
      while ((match = dutchHeadingRegex.exec(text)) !== null) {
        const type = match[1];
        const number = match[2];
        const title = match[3]?.trim() || '';
        const fullTitle = `${type} ${number}${title ? `: ${title}` : ''}`;
        
        dutchPath.push(fullTitle);
        
        headings.push({
          index: match.index,
          headingPath: [...dutchPath],
        });
      }
    }

    return headings.sort((a, b) => a.index - b.index);
  }

  /**
   * Split text by paragraphs
   */
  private splitByParagraphs(
    text: string,
    config: StrategyConfig,
    baseOffset: number
  ): ChunkSegment[] {
    const segments: ChunkSegment[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // If no paragraphs found, treat entire text as one paragraph
    if (paragraphs.length === 0 && text.trim().length > 0) {
      paragraphs.push(text.trim());
    }
    
    let currentChunk = '';
    let currentStart = baseOffset;
    let currentEnd = baseOffset;

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      const paragraphWithNewlines = paragraphs.length > 1 ? `\n\n${trimmed}` : trimmed;
      
      // If paragraph itself exceeds maxChunkSize, split it
      if (trimmed.length > config.maxChunkSize) {
        // Save current chunk if it meets minimum size
        if (currentChunk.length >= config.minChunkSize) {
          segments.push({
            start: currentStart,
            end: currentEnd,
          });
        }
        
        // Split large paragraph into fixed-size chunks
        const paragraphSegments = this.splitLargeText(trimmed, config, currentEnd);
        segments.push(...paragraphSegments);
        
        // Reset for next paragraph
        if (paragraphSegments.length > 0) {
          const lastSegment = paragraphSegments[paragraphSegments.length - 1];
          currentStart = lastSegment.end;
          currentEnd = currentStart;
          currentChunk = '';
        }
      } else if (currentChunk.length + paragraphWithNewlines.length <= config.maxChunkSize) {
        // Add to current chunk
        currentChunk += paragraphWithNewlines;
        currentEnd += paragraphWithNewlines.length;
      } else {
        // Save current chunk if it meets minimum size
        if (currentChunk.length >= config.minChunkSize) {
          segments.push({
            start: currentStart,
            end: currentEnd,
          });
        }
        
        // Start new chunk
        currentChunk = paragraphWithNewlines;
        currentStart = currentEnd;
        currentEnd = currentStart + paragraphWithNewlines.length;
      }
    }

    // Add final chunk if it meets minimum size OR if it's the only chunk (to ensure at least one chunk)
    // This ensures documents shorter than minChunkSize still get chunked
    if (currentChunk.length >= config.minChunkSize || (segments.length === 0 && currentChunk.trim().length > 0)) {
      segments.push({
        start: currentStart,
        end: currentEnd,
      });
    }

    return segments;
  }

  /**
   * Split large text into fixed-size chunks
   */
  private splitLargeText(
    text: string,
    config: StrategyConfig,
    baseOffset: number
  ): ChunkSegment[] {
    const segments: ChunkSegment[] = [];
    
    // Split text into chunks of maxChunkSize
    for (let i = 0; i < text.length; i += config.maxChunkSize) {
      const end = Math.min(i + config.maxChunkSize, text.length);
      const chunkText = text.substring(i, end);
      
      // Only create segment if it meets minimum size (or is the last chunk, or if no segments created yet)
      // This ensures at least one chunk is created even if text is shorter than minChunkSize
      if (chunkText.length >= config.minChunkSize || end === text.length || segments.length === 0) {
        segments.push({
          start: baseOffset + i,
          end: baseOffset + end,
        });
      }
    }
    
    return segments;
  }

  /**
   * Apply overlap between chunks
   */
  private applyOverlap(
    segments: ChunkSegment[],
    overlapSize: number,
    maxLength: number
  ): ChunkSegment[] {
    if (segments.length <= 1) {
      return segments;
    }

    const overlapped: ChunkSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Add overlap from previous chunk
      const overlapStart = i > 0 
        ? Math.max(0, segment.start - overlapSize)
        : segment.start;
      
      // Add overlap to next chunk
      const overlapEnd = i < segments.length - 1
        ? Math.min(maxLength, segment.end + overlapSize)
        : segment.end;

      overlapped.push({
        start: overlapStart,
        end: overlapEnd,
        headingPath: segment.headingPath,
        legalRefs: segment.legalRefs,
      });
    }

    return overlapped;
  }
}

