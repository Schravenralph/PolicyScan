/**
 * Recency Factor - Calculates recency score for documents
 * 
 * Calculates recency score based on publication date.
 * More recent documents get higher scores.
 */

import type { IScoringFactor } from '../interfaces/IScoringFactor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Recency scoring factor
 * 
 * Calculates recency score based on publication date.
 */
export class RecencyFactor implements IScoringFactor {
  private weight: number;

  constructor(weight: number = 0.1) {
    this.weight = weight;
  }

  async calculate(document: CanonicalDocument, query?: string): Promise<FactorResult> {
    const publishedAt = document.dates?.publishedAt;
    
    if (!publishedAt) {
      // No date available, return neutral score
      return {
        factor: this.getName(),
        score: 0.5,
        weight: this.weight,
        metadata: { source: 'none', reason: 'no date' },
      };
    }

    // Handle Date object
    let publicationDate: Date;
    if (publishedAt instanceof Date) {
      publicationDate = publishedAt;
    } else if (typeof publishedAt === 'string') {
      publicationDate = new Date(publishedAt);
      if (isNaN(publicationDate.getTime())) {
        return {
          factor: this.getName(),
          score: 0.5,
          weight: this.weight,
          metadata: { source: 'none', reason: 'invalid date' },
        };
      }
    } else {
      return {
        factor: this.getName(),
        score: 0.5,
        weight: this.weight,
        metadata: { source: 'none', reason: 'invalid date type' },
      };
    }

    // Calculate days since publication
    const now = new Date();
    const daysSincePublication = (now.getTime() - publicationDate.getTime()) / (1000 * 60 * 60 * 24);

    // Calculate recency score (more recent = higher score)
    // Full score (1.0) for documents published today
    // Linear decay: 0.5 at 1 year, 0.0 at 10 years
    let recencyScore: number;
    if (daysSincePublication < 0) {
      // Future date, treat as very recent
      recencyScore = 1.0;
    } else if (daysSincePublication <= 365) {
      // Within 1 year: linear from 1.0 to 0.5
      recencyScore = 1.0 - (daysSincePublication / 365) * 0.5;
    } else if (daysSincePublication <= 3650) {
      // 1-10 years: linear from 0.5 to 0.0
      recencyScore = 0.5 - ((daysSincePublication - 365) / (3650 - 365)) * 0.5;
    } else {
      // Older than 10 years: 0.0
      recencyScore = 0.0;
    }

    return {
      factor: this.getName(),
      score: Math.max(0, Math.min(1, recencyScore)),
      weight: this.weight,
      metadata: {
        source: 'publishedAt',
        daysSincePublication: Math.floor(daysSincePublication),
        publicationDate: publicationDate.toISOString(),
      },
    };
  }

  getWeight(): number {
    return this.weight;
  }

  getName(): string {
    return 'recency';
  }
}
