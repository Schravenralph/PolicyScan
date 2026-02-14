/**
 * BeleidChunkingStrategy - Chunking strategy for municipal policy documents
 * 
 * Splits by headings (markdown/PDF converted headings).
 * Tracks page numbers when available in enrichment metadata.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/04-unified-chunking.md
 */

import type { ChunkingStrategy, ChunkSegment, StrategyConfig } from './ChunkingStrategy.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import { DefaultChunkingStrategy } from './DefaultChunkingStrategy.js';
import { logger } from '../../utils/logger.js';

/**
 * Beleid (policy) chunking strategy
 * 
 * Handles municipal policy documents with heading-based structure.
 */
export class BeleidChunkingStrategy implements ChunkingStrategy {
  private defaultStrategy: DefaultChunkingStrategy;

  constructor() {
    this.defaultStrategy = new DefaultChunkingStrategy();
  }

  getName(): string {
    return 'beleid';
  }

  async chunk(
    normalizedText: string,
    document: CanonicalDocument,
    config: StrategyConfig
  ): Promise<ChunkSegment[]> {
    // Find headings (markdown-style or PDF-converted)
    const headings = this.findHeadings(normalizedText);
    
    // Log chunking attempt for debugging
    logger.debug(
      {
        documentId: document._id,
        documentFamily: document.documentFamily,
        normalizedTextLength: normalizedText.length,
        headingCount: headings.length,
        headings: headings.length > 0 ? headings.map(h => ({ level: h.level, title: h.title.substring(0, 50) })) : [],
        textPreview: normalizedText.substring(0, 200),
        minChunkSize: config.minChunkSize,
        maxChunkSize: config.maxChunkSize,
      },
      'BeleidChunkingStrategy: Starting chunking'
    );
    
    if (headings.length > 0) {
      const segments = this.chunkByHeadings(normalizedText, headings, config, document);
      logger.debug(
        {
          documentId: document._id,
          segmentsCreated: segments.length,
          strategy: 'heading-based',
        },
        'BeleidChunkingStrategy: Chunking by headings completed'
      );
      return segments;
    }

    // Fall back to default strategy
    logger.debug(
      {
        documentId: document._id,
        strategy: 'default-fallback',
      },
      'BeleidChunkingStrategy: No headings found, falling back to default strategy'
    );
    return this.defaultStrategy.chunk(normalizedText, document, config);
  }

  /**
   * Find headings in text
   * 
   * Looks for markdown-style headings (# ## ###) and common policy document patterns.
   */
  private findHeadings(text: string): Array<{ index: number; level: number; title: string }> {
    const headings: Array<{ index: number; level: number; title: string }> = [];
    
    // Markdown-style headings
    const markdownPattern = /^(#{1,6})\s+(.+)$/gm;
    let match;
    
    while ((match = markdownPattern.exec(text)) !== null) {
      const level = match[1].length;
      const title = match[2].trim();
      
      headings.push({
        index: match.index,
        level,
        title,
      });
    }

    // If no markdown headings, look for common policy patterns
    if (headings.length === 0) {
      // First check for Dutch heading patterns like "Hoofdstuk 1: Inleiding"
      // These are more specific and should take precedence
      // Handle both line-start patterns and normalized text (PDF extraction may remove line breaks)
      // Pattern: Match Dutch heading word + number + colon/space + title
      // Title capture: up to 80 chars, stopping at next heading pattern or double newline
      // Use word boundary to ensure we match complete words, and handle both line-start and inline patterns
      const dutchHeadingPattern = /(?:^|[\n\r]|\s)\b(Hoofdstuk|Paragraaf|Artikel|Deel)\s+(\d+(?:\.\d+)*)[:\s]+([^\n\r]{0,80}?)(?=\s+(?:Hoofdstuk|Paragraaf|Artikel|Deel)\s+\d|[\n\r]{2,}|$)/gmi;
      
      // Reset regex lastIndex to ensure we search from the beginning
      dutchHeadingPattern.lastIndex = 0;
      
      // Find all heading matches
      const headingMatches: RegExpExecArray[] = [];
      while ((match = dutchHeadingPattern.exec(text)) !== null) {
        headingMatches.push(match);
      }
      
      // Process each heading match and extract clean title
      for (const headingMatch of headingMatches) {
        const prefix = headingMatch[1];
        const number = headingMatch[2];
        let title = headingMatch[3].trim();
        
        // Adjust index if match started with newline or space
        let actualIndex = headingMatch.index;
        if (headingMatch[0].startsWith('\n') || headingMatch[0].startsWith('\r')) {
          actualIndex = headingMatch.index + 1;
        } else if (headingMatch[0].startsWith(' ')) {
          actualIndex = headingMatch.index + 1;
        }
        
        // Clean up title - stop at first sentence start (capital letter followed by lowercase word)
        // Headings like "Hoofdstuk 1: Inleiding" should have title "Inleiding", not "Inleiding Dit is..."
        // Look for pattern: space + capital letter + lowercase word (likely start of content sentence)
        const contentStartMatch = title.match(/^(.+?)(?=\s+[A-Z][a-z]{2,}\s)/);
        if (contentStartMatch && contentStartMatch[1].length > 0 && contentStartMatch[1].length < title.length - 5) {
          // Only use this match if it's significantly shorter (at least 5 chars shorter)
          // This prevents cutting off valid multi-word titles
          title = contentStartMatch[1].trim();
        }
        
        // Limit title to reasonable length (headings are typically 1-3 words, max ~50 chars)
        // If still too long, try to find a natural break
        if (title.length > 50) {
          // Try to find a natural break (space, newline, or punctuation)
          const breakMatch = title.match(/^(.{0,50})(?:\s|[\n\r]|[.!?]|$)/);
          if (breakMatch && breakMatch[1].length > 5) {
            title = breakMatch[1].trim();
          } else {
            // Fallback: take first 50 chars but try to stop at word boundary
            const wordBoundaryMatch = title.substring(0, 50).match(/^(.+?)(?:\s|$)/);
            if (wordBoundaryMatch && wordBoundaryMatch[1].length > 5) {
              title = wordBoundaryMatch[1].trim();
            } else {
              title = title.substring(0, 50).trim();
            }
          }
        }
        
        const level = prefix.toLowerCase() === 'hoofdstuk' ? 1 : 
                     prefix.toLowerCase() === 'deel' ? 1 :
                     prefix.toLowerCase() === 'paragraaf' ? 2 : 3;
        
        headings.push({
          index: actualIndex,
          level,
          title: `${prefix} ${number}: ${title}`,
        });
      }
      
      // If no Dutch headings found, look for generic policy patterns like "1. Titel", "1.1 Subtitel"
      if (headings.length === 0) {
        const policyPattern = /^(\d+(?:\.\d+)*)\s+(.+)$/gm;
        
        while ((match = policyPattern.exec(text)) !== null) {
          const number = match[1];
          const title = match[2].trim();
          const level = (number.match(/\./g) || []).length + 1;
          
          headings.push({
            index: match.index,
            level,
            title: `${number} ${title}`,
          });
        }
      }
    }

    return headings.sort((a, b) => a.index - b.index);
  }

  /**
   * Chunk by headings
   */
  private chunkByHeadings(
    text: string,
    headings: Array<{ index: number; level: number; title: string }>,
    config: StrategyConfig,
    document: CanonicalDocument
  ): ChunkSegment[] {
    const segments: ChunkSegment[] = [];
    const headingPath: string[] = [];
    let currentLevel = 0;

    // If there's content before the first heading, create a chunk for it
    // This ensures all content is chunked, even content before the first heading
    if (headings.length > 0 && headings[0].index > 0) {
      const preHeadingText = text.substring(0, headings[0].index);
      if (preHeadingText.trim().length > 0) {
        // Content before first heading - no heading path
        if (preHeadingText.length >= config.minChunkSize) {
          segments.push({
            start: 0,
            end: headings[0].index,
          });
        } else {
          // Too small, will be merged with first heading chunk
          // Store it for later merging
        }
      }
    }

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const start = heading.index;
      const end = i < headings.length - 1 
        ? headings[i + 1].index 
        : text.length;

      // Update heading path based on level
      if (heading.level <= currentLevel) {
        headingPath.length = heading.level - 1;
      }
      headingPath.push(heading.title);
      currentLevel = heading.level;

      const chunkText = text.substring(start, end);
      
      // Split large chunks
      if (chunkText.length > config.maxChunkSize) {
        const subChunks = this.splitLargeChunk(chunkText, config, start);
        if (subChunks.length > 0) {
          subChunks.forEach(chunk => {
            segments.push({
              ...chunk,
              headingPath: [...headingPath],
            });
          });
        } else {
          // If splitLargeChunk returned no chunks (all too small), include the original chunk anyway
          // This ensures we always have at least one chunk per heading section
          segments.push({
            start,
            end,
            headingPath: [...headingPath],
          });
        }
      } else if (chunkText.length >= config.minChunkSize || end === text.length || i === headings.length - 1) {
        // Include chunk if it meets minimum size OR is the last chunk/heading (to ensure at least one chunk with heading)
        // Also log when including a chunk that's smaller than minChunkSize (for debugging)
        if (chunkText.length < config.minChunkSize) {
          logger.debug(
            {
              documentId: document._id,
              chunkTextLength: chunkText.length,
              minChunkSize: config.minChunkSize,
              reason: i === headings.length - 1 ? 'last-heading' : 'end-of-text',
            },
            'BeleidChunkingStrategy: Including chunk smaller than minChunkSize'
          );
        }
        segments.push({
          start,
          end,
          headingPath: [...headingPath],
        });
      } else {
        // Chunk is too small and not the last one - merge with previous chunk if it exists
        // This ensures all content is chunked even when individual sections are small
        if (segments.length > 0) {
          // Merge with previous chunk to ensure content isn't lost
          const lastSegment = segments[segments.length - 1];
          lastSegment.end = end;
          // Always update heading path to the current heading path (more recent/specific)
          // This ensures merged chunks have the correct heading path from the most recent heading
          if (headingPath.length > 0) {
            lastSegment.headingPath = [...headingPath];
          }
          logger.debug(
            {
              documentId: document._id,
              chunkTextLength: chunkText.length,
              minChunkSize: config.minChunkSize,
              headingIndex: i,
              mergedWithPrevious: true,
            },
            'BeleidChunkingStrategy: Merged small chunk with previous chunk'
          );
        } else {
          // First chunk, include it even if small (will be handled by fallback if no other chunks are created)
          segments.push({
            start,
            end,
            headingPath: [...headingPath],
          });
          logger.debug(
            {
              documentId: document._id,
              chunkTextLength: chunkText.length,
              minChunkSize: config.minChunkSize,
              headingIndex: i,
              reason: 'First chunk, including even though small',
            },
            'BeleidChunkingStrategy: Including first chunk (too small but first)'
          );
        }
      }
    }

    // If no segments created (all chunks were too small), create at least one chunk with entire text
    // This ensures documents shorter than minChunkSize still get chunked
    // If headings were detected, include the heading path in the fallback chunk
    if (segments.length === 0 && text.trim().length > 0) {
      const fallbackHeadingPath = headings.length > 0 ? [headings[0].title] : [];
      segments.push({
        start: 0,
        end: text.length,
        headingPath: fallbackHeadingPath.length > 0 ? fallbackHeadingPath : undefined,
      });
      logger.debug(
        {
          documentId: document._id,
          textLength: text.length,
          minChunkSize: config.minChunkSize,
          reason: 'Fallback chunk created - no segments met minimum size',
        },
        'BeleidChunkingStrategy: Created fallback chunk'
      );
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

    // Add final chunk if it meets minimum size OR if it's the only chunk (to ensure at least one chunk)
    // This ensures documents shorter than minChunkSize still get chunked
    if (currentChunk.length >= config.minChunkSize || (segments.length === 0 && currentChunk.trim().length > 0)) {
      segments.push({ start: currentStart, end: currentEnd });
    }

    // Final safety check: if no segments created at all, create one from the entire text
    // This handles edge cases where all paragraphs are too small
    if (segments.length === 0 && text.trim().length > 0) {
      segments.push({ start: baseOffset, end: baseOffset + text.length });
    }

    return segments;
  }
}

