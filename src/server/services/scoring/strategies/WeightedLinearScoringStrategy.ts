/**
 * Weighted Linear Scoring Strategy
 * 
 * Combines scoring factors using weighted linear combination.
 * Formula: score = Σ(factor.score * factor.weight) / Σ(factor.weight)
 * 
 * Normalizes weights to ensure they sum to 1.0, then calculates weighted sum.
 */

import type { IScoringStrategy } from '../interfaces/IScoringStrategy.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Weighted linear scoring strategy
 * 
 * Combines factors using weighted linear combination.
 * Normalizes weights to ensure proper scaling.
 */
export class WeightedLinearScoringStrategy implements IScoringStrategy {
  async combine(factors: FactorResult[]): Promise<number> {
    if (factors.length === 0) {
      return 0;
    }

    // Normalize weights to ensure they sum to 1.0
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    
    if (totalWeight === 0) {
      // All weights are 0, return average of scores
      const avgScore = factors.reduce((sum, f) => sum + f.score, 0) / factors.length;
      return Math.max(0, Math.min(1, avgScore));
    }

    // Calculate weighted sum with normalized weights
    const score = factors.reduce(
      (sum, f) => sum + (f.score * (f.weight / totalWeight)),
      0
    );

    // Clamp to [0, 1] range
    return Math.max(0, Math.min(1, score));
  }

  getName(): string {
    return 'weighted-linear';
  }
}
