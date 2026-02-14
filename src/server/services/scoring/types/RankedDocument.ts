/**
 * Ranked Document Type
 * 
 * Represents a scored document that has been ranked.
 */

import type { ScoredDocument } from './ScoredDocument.js';

/**
 * Scored document that has been ranked
 * 
 * Extends ScoredDocument with ranking information.
 */
export interface RankedDocument extends ScoredDocument {
  /** Rank position (1 = highest score, 2 = second highest, etc.) */
  rank: number;
}
