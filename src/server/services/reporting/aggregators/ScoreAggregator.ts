/**
 * Score Aggregator
 * 
 * Aggregates score data for reporting (average, min, max, distribution).
 */

import type { IDataAggregator } from '../interfaces/IDataAggregator.js';
import type { ScoredDocument } from '../../scoring/types/ScoredDocument.js';
import type { ScoreSummary } from '../types/AggregatedData.js';

/**
 * Aggregates scores for reporting
 */
export class ScoreAggregator implements IDataAggregator<ScoredDocument> {
  /**
   * Aggregate scores into summary data
   * 
   * @param documents - Scored documents to aggregate
   * @returns Score summary
   */
  async aggregate(documents: ScoredDocument[]): Promise<ScoreSummary> {
    if (documents.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        distribution: [],
      };
    }

    const scores = documents.map((doc) => doc.finalScore);

    return {
      average: this.calculateAverage(scores),
      min: Math.min(...scores),
      max: Math.max(...scores),
      distribution: this.calculateDistribution(scores),
    };
  }

  /**
   * Calculate average score
   * 
   * @param scores - Array of scores
   * @returns Average score
   */
  private calculateAverage(scores: number[]): number {
    if (scores.length === 0) {
      return 0;
    }

    const sum = scores.reduce((acc, score) => acc + score, 0);
    return sum / scores.length;
  }

  /**
   * Calculate score distribution
   * 
   * Divides scores into ranges: 0.0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
   * 
   * @param scores - Array of scores
   * @returns Distribution with range and count
   */
  private calculateDistribution(
    scores: number[]
  ): Array<{ range: string; count: number }> {
    const ranges = [
      { min: 0.0, max: 0.2, label: '0.0-0.2' },
      { min: 0.2, max: 0.4, label: '0.2-0.4' },
      { min: 0.4, max: 0.6, label: '0.4-0.6' },
      { min: 0.6, max: 0.8, label: '0.6-0.8' },
      { min: 0.8, max: 1.0, label: '0.8-1.0' },
    ];

    const distribution: Array<{ range: string; count: number }> = [];

    for (const range of ranges) {
      const count = scores.filter(
        (score) => score >= range.min && score < range.max
      ).length;
      distribution.push({ range: range.label, count });
    }

    // Handle edge case: score exactly 1.0
    const perfectScores = scores.filter((score) => score === 1.0).length;
    if (perfectScores > 0) {
      const lastRange = distribution[distribution.length - 1];
      lastRange.count += perfectScores;
    }

    return distribution;
  }
}
