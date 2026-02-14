/**
 * Semantic Factor - Calculates semantic relevance score for documents
 * 
 * Extracts semantic score from enrichmentMetadata.matchSignals.
 */

import type { IScoringFactor } from '../interfaces/IScoringFactor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Semantic relevance scoring factor
 * 
 * Calculates semantic relevance score based on embeddings from matchSignals.
 */
export class SemanticFactor implements IScoringFactor {
  private weight: number;

  constructor(weight: number = 0.3) {
    this.weight = weight;
  }

  async calculate(document: CanonicalDocument, query?: string): Promise<FactorResult> {
    const matchSignals = document.enrichmentMetadata?.matchSignals;
    
    if (!matchSignals || typeof matchSignals !== 'object') {
      return {
        factor: this.getName(),
        score: 0,
        weight: this.weight,
        metadata: { source: 'none' },
      };
    }

    const matchSignalsTyped = matchSignals as Record<string, unknown>;
    const semanticScore = typeof matchSignalsTyped.semantic === 'number' && 
                          matchSignalsTyped.semantic >= 0 && 
                          matchSignalsTyped.semantic <= 1
      ? matchSignalsTyped.semantic
      : 0;

    return {
      factor: this.getName(),
      score: semanticScore,
      weight: this.weight,
      metadata: { source: 'matchSignals' },
    };
  }

  getWeight(): number {
    return this.weight;
  }

  getName(): string {
    return 'semantic';
  }
}
