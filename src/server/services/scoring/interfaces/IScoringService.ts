/**
 * Main scoring service interface
 * 
 * Defines the contract for scoring and ranking documents.
 */

import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ScoredDocument } from '../types/ScoredDocument.js';
import type { RankedDocument } from '../types/RankedDocument.js';

/**
 * Main interface for document scoring service
 */
export interface IScoringService {
  /**
   * Score a single document
   * 
   * @param document - Document to score
   * @param query - Optional query for context-aware scoring
   * @returns Document with calculated score
   */
  scoreDocument(document: CanonicalDocument, query?: string): Promise<ScoredDocument>;

  /**
   * Score multiple documents
   * 
   * @param documents - Documents to score
   * @param query - Optional query for context-aware scoring
   * @returns Documents with calculated scores
   */
  scoreDocuments(documents: CanonicalDocument[], query?: string): Promise<ScoredDocument[]>;

  /**
   * Rank documents by score
   * 
   * @param documents - Scored documents to rank
   * @returns Ranked documents (sorted by score, highest first)
   */
  rankDocuments(documents: ScoredDocument[]): Promise<RankedDocument[]>;
}
