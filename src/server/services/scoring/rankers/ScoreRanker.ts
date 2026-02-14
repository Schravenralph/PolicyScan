/**
 * Score Ranker - Ranks documents by score
 * 
 * Ranks documents by their final score (highest first).
 * Assigns rank positions starting from 1 (highest score = rank 1).
 */

import type { ScoredDocument } from '../types/ScoredDocument.js';
import type { RankedDocument } from '../types/RankedDocument.js';

/**
 * Simple score-based ranker
 * 
 * Ranks documents by their final score (highest first).
 */
export class ScoreRanker {
  /**
   * Rank documents by score
   * 
   * @param documents - Scored documents to rank
   * @returns Ranked documents (sorted by score, highest first, with rank assigned)
   */
  async rank(documents: ScoredDocument[]): Promise<RankedDocument[]> {
    if (documents.length === 0) {
      return [];
    }

    // Sort by score (highest first)
    const sorted = [...documents].sort((a, b) => b.finalScore - a.finalScore);

    // Assign rank positions (1 = highest score)
    return sorted.map((doc, index) => ({
      ...doc,
      rank: index + 1,
    }));
  }
}
