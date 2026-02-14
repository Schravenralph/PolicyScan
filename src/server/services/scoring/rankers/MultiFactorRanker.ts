/**
 * Multi-Factor Ranker - Ranks documents using multiple factors
 * 
 * Ranks documents using a configurable weighted combination of factors.
 * Allows re-ranking logic separate from the initial scoring.
 */

import type { ScoredDocument, FactorScores } from '../types/ScoredDocument.js';
import type { RankedDocument } from '../types/RankedDocument.js';
import { ScoreRanker } from './ScoreRanker.js';

export interface MultiFactorRankerConfig {
  /**
   * Weights for ranking.
   * keys can be any factor (authority, recency, etc.) or 'finalScore'.
   * If not provided, falls back to ScoreRanker (finalScore).
   */
  weights?: Partial<Record<keyof FactorScores | 'finalScore', number>>;
}

/**
 * Multi-factor ranker
 * 
 * Ranks documents by a weighted combination of factors and/or the final score.
 */
export class MultiFactorRanker {
  private scoreRanker: ScoreRanker;

  constructor(private config: MultiFactorRankerConfig = {}) {
    this.scoreRanker = new ScoreRanker();
  }

  /**
   * Rank documents using multiple factors
   * 
   * @param documents - Scored documents to rank
   * @returns Ranked documents
   */
  async rank(documents: ScoredDocument[]): Promise<RankedDocument[]> {
    if (documents.length === 0) {
      return [];
    }

    const weights = this.config.weights;

    // If no weights configured, fallback to simple score-based ranking
    if (!weights || Object.keys(weights).length === 0) {
      return this.scoreRanker.rank(documents);
    }

    // Normalize weights
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + Math.abs(w || 0), 0);

    // Calculate ranking score for each document
    const rankable = documents.map(doc => {
      let score = 0;

      if (totalWeight === 0) {
        // Fallback if weights sum to 0 (should not happen in valid config)
        score = doc.finalScore;
      } else {
        for (const [key, weight] of Object.entries(weights)) {
          if (weight === undefined || weight === 0) continue;

          let val = 0;
          if (key === 'finalScore') {
            val = doc.finalScore;
          } else {
            // Access factor score safely
            val = doc.factorScores[key as keyof FactorScores] || 0;
          }

          score += val * (Math.abs(weight) / totalWeight);
        }
      }

      return { doc, score };
    });

    // Sort by calculated score (highest first)
    rankable.sort((a, b) => b.score - a.score);

    // Map back to RankedDocument with new rank positions
    return rankable.map((item, index) => ({
      ...item.doc,
      rank: index + 1,
    }));
  }
}
