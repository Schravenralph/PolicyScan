/**
 * Scored Document Type
 * 
 * Represents a document with a calculated score and factor breakdown.
 */

import type { CanonicalDocument } from '../../../contracts/types.js';

/**
 * Score breakdown by factor
 */
export interface FactorScores {
  /** Authority score (0-1) */
  authority: number;
  /** Semantic relevance score (0-1) */
  semantic: number;
  /** Keyword match score (0-1) */
  keyword: number;
  /** Recency score (0-1) */
  recency: number;
  /** Document type preference score (0-1) */
  type: number;
  /** Rule-based score (0-1) */
  rules: number;
}

/**
 * Document with a calculated score
 * 
 * Extends CanonicalDocument with scoring information.
 */
export interface ScoredDocument extends CanonicalDocument {
  /** Final calculated score (0-1) */
  finalScore: number;
  /** Score breakdown by factor */
  factorScores: FactorScores;
  /** Timestamp when document was scored */
  scoredAt: Date;
}
