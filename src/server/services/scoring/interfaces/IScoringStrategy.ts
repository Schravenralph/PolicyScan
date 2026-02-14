/**
 * Scoring strategy interface
 * 
 * Defines the contract for combining multiple scoring factors into a final score.
 */

import type { FactorResult } from '../types/FactorResult.js';

/**
 * Interface for scoring strategies
 */
export interface IScoringStrategy {
  /**
   * Combine multiple factor results into a final score
   * 
   * @param factors - Array of factor results to combine
   * @returns Final combined score (0-1)
   */
  combine(factors: FactorResult[]): Promise<number>;

  /**
   * Get the name of this strategy
   * 
   * @returns Strategy name
   */
  getName(): string;
}
