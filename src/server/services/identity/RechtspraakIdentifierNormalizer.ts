/**
 * Rechtspraak Identifier Normalizer
 * 
 * Handles Rechtspraak identifiers (ECLI)
 */

import type { IdentifierNormalizer, DocumentIdentifier } from '../../contracts/documentIdentifier.js';
import type { DocumentSource } from '../../contracts/types.js';

export class RechtspraakIdentifierNormalizer implements IdentifierNormalizer {
  canNormalize(identifier: string): boolean {
    // Check for ECLI format: ECLI:NL:HR:2024:123
    if (identifier.startsWith('ECLI:')) {
      return true;
    }
    // Check for Rechtspraak URLs
    if (identifier.includes('rechtspraak.nl')) {
      return true;
    }
    return false;
  }
  
  normalize(identifier: string): DocumentIdentifier | null {
    if (!this.canNormalize(identifier)) {
      return null;
    }
    
    // Extract ECLI from identifier
    // ECLI format is typically ECLI:Country:Court:Year:Number (4 parts)
    const ecliMatch = identifier.match(/^ECLI:([^:]+:[^:]+:[^:]+:[^:]+)$/);
    if (ecliMatch) {
      const ecli = ecliMatch[1]; // Full ECLI without "ECLI:" prefix
      return {
        source: 'Rechtspraak',
        sourceId: ecli,
        alternateIdentifiers: [
          { source: 'ECLI', identifier: ecli },
        ],
      };
    }
    
    // If it's a URL, try to extract ECLI from it
    try {
      const url = new URL(identifier);
      if (url.hostname.includes('rechtspraak.nl')) {
        // Try to extract ECLI from URL path or query params
        const pathMatch = url.pathname.match(/ECLI:([^/]+)/);
        if (pathMatch) {
          const ecli = pathMatch[1];
          return {
            source: 'Rechtspraak',
            sourceId: ecli,
            canonicalUrl: identifier,
            alternateIdentifiers: [
              { source: 'ECLI', identifier: ecli },
            ],
          };
        }
        
        // Fallback: use URL as sourceId
        return {
          source: 'Rechtspraak',
          sourceId: identifier,
          canonicalUrl: identifier,
        };
      }
    } catch {
      // Not a valid URL, continue
    }
    
    // Generic Rechtspraak identifier
    return {
      source: 'Rechtspraak',
      sourceId: identifier,
    };
  }
  
  extractIdentifiers(document: { source: DocumentSource; sourceId: string; canonicalUrl?: string; sourceMetadata?: Record<string, unknown> }): DocumentIdentifier[] {
    if (document.source === 'Rechtspraak') {
      const identifiers: DocumentIdentifier[] = [{
        source: 'Rechtspraak',
        sourceId: document.sourceId,
        canonicalUrl: document.canonicalUrl,
      }];
      
      // Extract ECLI if present in sourceId
      if (document.sourceId.includes(':')) {
        // Assume sourceId is ECLI format
        identifiers.push({
          source: 'Rechtspraak',
          sourceId: document.sourceId,
          alternateIdentifiers: [
            { source: 'ECLI', identifier: document.sourceId },
          ],
          canonicalUrl: document.canonicalUrl,
        });
      }
      
      return identifiers;
    }
    return [];
  }
}
