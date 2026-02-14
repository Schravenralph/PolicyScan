/**
 * Type Factor - Calculates document type preference score
 * 
 * Calculates document type preference score based on document type.
 * Uses DOCUMENT_TYPE_PREFERENCES mapping.
 */

import type { IScoringFactor } from '../interfaces/IScoringFactor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { FactorResult } from '../types/FactorResult.js';

/**
 * Document type preferences (higher = more preferred)
 */
const DOCUMENT_TYPE_PREFERENCES: Record<string, number> = {
  // Policy documents (high preference)
  'Omgevingsvisie': 1.0,
  'Omgevingsplan': 1.0,
  'Omgevingsprogramma': 0.9,
  'Verordening': 0.95,
  'Beleidsregel': 0.9,
  'Besluit': 0.85,
  'Nota': 0.8,
  'Regeling': 0.85,
  'Circulaire': 0.75,
  'Richtlijn': 0.8,
  
  // Official publications (very high preference)
  'Staatsblad': 1.0,
  'Tractatenblad': 1.0,
  'Kamerstuk': 0.9,
  
  // Jurisprudence (high preference for legal context)
  'Hoge Raad': 0.95,
  'Gerechtshof': 0.85,
  'Rechtbank': 0.8,
  'Uitspraak': 0.8,
  
  // Guidance documents (medium preference)
  'Handreiking': 0.7,
  'Leidraad': 0.7,
  
  // Default for unknown types
  'default': 0.5,
};

/**
 * Document type preference scoring factor
 * 
 * Calculates type preference score based on document type.
 */
export class TypeFactor implements IScoringFactor {
  private weight: number;

  constructor(weight: number = 0.1) {
    this.weight = weight;
  }

  async calculate(document: CanonicalDocument, query?: string): Promise<FactorResult> {
    const documentType = document.documentType;
    
    if (!documentType) {
      return {
        factor: this.getName(),
        score: DOCUMENT_TYPE_PREFERENCES.default,
        weight: this.weight,
        metadata: { source: 'default', reason: 'no document type' },
      };
    }

    const typeScore = DOCUMENT_TYPE_PREFERENCES[documentType] ?? DOCUMENT_TYPE_PREFERENCES.default;

    return {
      factor: this.getName(),
      score: typeScore,
      weight: this.weight,
      metadata: {
        source: 'documentType',
        documentType,
        isDefault: !(documentType in DOCUMENT_TYPE_PREFERENCES),
      },
    };
  }

  getWeight(): number {
    return this.weight;
  }

  getName(): string {
    return 'type';
  }
}
