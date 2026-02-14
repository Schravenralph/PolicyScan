/**
 * Authority Factor - Calculates authority score for documents
 * 
 * Calculates authority score based on document source and publisher.
 * Priority:
 * 1. enrichmentMetadata.authorityScore (if available)
 * 2. Computed from source field
 * 3. Computed from publisherAuthority field
 * 4. Default: 0.5 (neutral)
 */

import type { IScoringFactor } from '../interfaces/IScoringFactor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Authority scoring factor
 * 
 * Calculates authority score based on document source and publisher.
 */
export class AuthorityFactor implements IScoringFactor {
  private weight: number;

  constructor(weight: number = 0.3) {
    this.weight = weight;
  }

  async calculate(document: CanonicalDocument, query?: string): Promise<FactorResult> {
    // Priority 1: Check enrichmentMetadata
    if (document.enrichmentMetadata?.authorityScore !== undefined) {
      const score = document.enrichmentMetadata.authorityScore;
      if (typeof score === 'number' && score >= 0 && score <= 1) {
        return {
          factor: this.getName(),
          score,
          weight: this.weight,
          metadata: { source: 'enrichmentMetadata' },
        };
      }
    }

    // Priority 2: Derive from source field
    const sourceScores: Record<CanonicalDocument['source'], number> = {
      'DSO': 0.9,
      'Rechtspraak': 0.9,
      'Wetgeving': 0.9,
      'Web': 0.7,
      'Gemeente': 0.8,
      'PDOK': 0.8,
      'IPLO': 0.7, // IPLO provides guidance, similar authority to Web
    };

    if (document.source in sourceScores) {
      const score = sourceScores[document.source];
      return {
        factor: this.getName(),
        score,
        weight: this.weight,
        metadata: { source: 'sourceField', sourceType: document.source },
      };
    }

    // Priority 3: Derive from publisherAuthority (if available)
    if (document.publisherAuthority) {
      const authority = document.publisherAuthority.toLowerCase();
      let score = 0.5; // Default
      
      if (authority.includes('rijk') || authority.includes('national')) {
        score = 0.9;
      } else if (authority.includes('provincie') || authority.includes('provincial')) {
        score = 0.85;
      } else if (authority.includes('gemeente') || authority.includes('municipal')) {
        score = 0.8;
      }

      return {
        factor: this.getName(),
        score,
        weight: this.weight,
        metadata: { source: 'publisherAuthority', authority: document.publisherAuthority },
      };
    }

    // Default: neutral score
    return {
      factor: this.getName(),
      score: 0.5,
      weight: this.weight,
      metadata: { source: 'default' },
    };
  }

  getWeight(): number {
    return this.weight;
  }

  getName(): string {
    return 'authority';
  }
}
