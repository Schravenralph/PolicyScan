/**
 * Scoring factor interface
 * 
 * Defines the contract for individual scoring factors (authority, semantic, keyword, etc.)
 */

import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Interface for scoring factors
 */
export interface IScoringFactor {
  /**
   * Calculate the score for this factor
   * 
   * @param document - Document to score
   * @param query - Optional query for context-aware scoring
   * @returns Factor result with score and metadata
   */
  calculate(document: CanonicalDocument, query?: string): Promise<FactorResult>;

  /**
   * Get the weight for this factor
   * 
   * @returns Weight value (0-1)
   */
  getWeight(): number;

  /**
   * Get the name of this factor
   * 
   * @returns Factor name
   */
  getName(): string;
}
