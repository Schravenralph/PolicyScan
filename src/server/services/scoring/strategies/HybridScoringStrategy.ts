/**
 * Hybrid Scoring Strategy
 * 
 * Combines multiple scoring strategies (Weighted Linear and ML-based)
 * to produce a comprehensive score.
 */

import type { IScoringStrategy } from '../interfaces/IScoringStrategy.js';
import type { FactorResult } from '../types/FactorResult.js';
import { WeightedLinearScoringStrategy } from './WeightedLinearScoringStrategy.js';
import { MachineLearningScoringStrategy } from './MachineLearningScoringStrategy.js';

/**
 * Hybrid scoring strategy
 * 
 * Combines WeightedLinearScoringStrategy and MachineLearningScoringStrategy
 * using a weighted average.
 */
export class HybridScoringStrategy implements IScoringStrategy {
  private linearStrategy: WeightedLinearScoringStrategy;
  private mlStrategy: MachineLearningScoringStrategy;
  private linearWeight: number;
  private mlWeight: number;

  /**
   * Initialize hybrid strategy with weights for sub-strategies
   *
   * @param linearWeight - Weight for the linear strategy (default: 0.5)
   * @param mlWeight - Weight for the ML strategy (default: 0.5)
   */
  constructor(linearWeight = 0.5, mlWeight = 0.5) {
    this.linearStrategy = new WeightedLinearScoringStrategy();
    this.mlStrategy = new MachineLearningScoringStrategy();

    // Normalize weights to ensure they sum to 1.0
    const totalWeight = linearWeight + mlWeight;
    if (totalWeight > 0) {
      this.linearWeight = linearWeight / totalWeight;
      this.mlWeight = mlWeight / totalWeight;
    } else {
      // Default to 50/50 if weights sum to 0
      this.linearWeight = 0.5;
      this.mlWeight = 0.5;
    }
  }

  async combine(factors: FactorResult[]): Promise<number> {
    const linearScore = await this.linearStrategy.combine(factors);
    const mlScore = await this.mlStrategy.combine(factors);

    // Calculate weighted average of the two strategies
    const combinedScore = (linearScore * this.linearWeight) + (mlScore * this.mlWeight);

    // Clamp to [0, 1] range just in case
    return Math.max(0, Math.min(1, combinedScore));
  }

  getName(): string {
    return 'hybrid';
  }
}
