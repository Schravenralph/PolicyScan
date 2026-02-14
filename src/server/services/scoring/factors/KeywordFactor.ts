/**
 * Keyword Factor - Calculates keyword match score for documents
 * 
 * Calculates keyword match score from document content.
 * Uses fullText directly from CanonicalDocument.
 * Searches in title (weight: 0.6) and text content (weight: 0.4).
 */

import type { IScoringFactor } from '../interfaces/IScoringFactor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Keyword matching scoring factor
 * 
 * Calculates keyword match score based on text matching.
 */
export class KeywordFactor implements IScoringFactor {
  private weight: number;

  constructor(weight: number = 0.2) {
    this.weight = weight;
  }

  async calculate(document: CanonicalDocument, query?: string): Promise<FactorResult> {
    if (!query || query.trim().length === 0) {
      return {
        factor: this.getName(),
        score: 0,
        weight: this.weight,
        metadata: { source: 'none', reason: 'no query' },
      };
    }

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    
    if (queryTerms.length === 0) {
      return {
        factor: this.getName(),
        score: 0,
        weight: this.weight,
        metadata: { source: 'none', reason: 'no valid terms' },
      };
    }

    // Search in title (weight: 0.6) and text content (weight: 0.4)
    let titleMatches = 0;
    let textMatches = 0;

    if (document.title) {
      const titleLower = document.title.toLowerCase();
      titleMatches = queryTerms.filter(term => titleLower.includes(term)).length;
    }

    if (document.fullText) {
      const textLower = document.fullText.toLowerCase();
      textMatches = queryTerms.filter(term => textLower.includes(term)).length;
    }

    // Calculate weighted match score
    const titleScore = titleMatches / queryTerms.length;
    const textScore = textMatches / queryTerms.length;
    const keywordScore = titleScore * 0.6 + textScore * 0.4;

    return {
      factor: this.getName(),
      score: Math.max(0, Math.min(1, keywordScore)),
      weight: this.weight,
      metadata: {
        source: 'fullText',
        titleMatches,
        textMatches,
        totalTerms: queryTerms.length,
      },
    };
  }

  getWeight(): number {
    return this.weight;
  }

  getName(): string {
    return 'keyword';
  }
}
