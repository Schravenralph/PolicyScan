/**
 * ChunkingStrategy - Interface for chunking strategies
 * 
 * Each strategy implements chunking logic for specific document families/types.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/04-unified-chunking.md
 */

import type { CanonicalDocument } from '../../contracts/types.js';

/**
 * Chunk segment with offsets and optional metadata
 */
export interface ChunkSegment {
  start: number; // Start offset in normalized text
  end: number; // End offset in normalized text
  headingPath?: string[]; // Optional heading path (e.g., ["Hoofdstuk 1", "Artikel 2"])
  legalRefs?: string[]; // Optional legal references (e.g., ["ECLI:NL:...", "BWBR0001234"])
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  minChunkSize: number; // Minimum chunk size in characters
  maxChunkSize: number; // Maximum chunk size in characters
  chunkOverlap: number; // Overlap in characters
}

/**
 * ChunkingStrategy interface
 */
export interface ChunkingStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Chunk normalized text into segments
   * 
   * @param normalizedText - Normalized fullText (same as used for fingerprinting)
   * @param document - Canonical document (for metadata access)
   * @param config - Strategy configuration
   * @returns Array of chunk segments with offsets
   */
  chunk(
    normalizedText: string,
    document: CanonicalDocument,
    config: StrategyConfig
  ): Promise<ChunkSegment[]>;
}

