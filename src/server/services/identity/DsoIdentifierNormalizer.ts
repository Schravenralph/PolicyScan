/**
 * DSO Identifier Normalizer
 * 
 * Handles DSO identifiers (AKN, IMRO, identificatie)
 */

import type { IdentifierNormalizer, DocumentIdentifier } from '../../contracts/documentIdentifier.js';
import type { DocumentSource } from '../../contracts/types.js';

export class DsoIdentifierNormalizer implements IdentifierNormalizer {
  canNormalize(identifier: string): boolean {
    // Check if it's an AKN identifier
    if (identifier.startsWith('/akn/')) {
      return true;
    }
    // Check if it's an IMRO identifier
    if (identifier.startsWith('NL.IMRO.')) {
      return true;
    }
    // Check if it's a DSO identificatie (contains / but not http)
    if (identifier.includes('/') && !identifier.startsWith('http')) {
      return true;
    }
    return false;
  }
  
  normalize(identifier: string): DocumentIdentifier | null {
    if (!this.canNormalize(identifier)) {
      return null;
    }
    
    const alternateIdentifiers: Array<{ source: string; identifier: string }> = [];
    
    // Normalize AKN identifier
    if (identifier.startsWith('/akn/')) {
      alternateIdentifiers.push({ source: 'AKN', identifier });
      return {
        source: 'DSO',
        sourceId: identifier,
        alternateIdentifiers,
      };
    }
    
    // Normalize IMRO identifier
    if (identifier.startsWith('NL.IMRO.')) {
      alternateIdentifiers.push({ source: 'IMRO', identifier });
      return {
        source: 'DSO',
        sourceId: identifier,
        alternateIdentifiers,
      };
    }
    
    // Generic DSO identificatie
    return {
      source: 'DSO',
      sourceId: identifier,
    };
  }
  
  extractIdentifiers(document: { source: DocumentSource; sourceId: string; canonicalUrl?: string; sourceMetadata?: Record<string, unknown> }): DocumentIdentifier[] {
    const identifiers: DocumentIdentifier[] = [];
    
    if (document.source === 'DSO') {
      identifiers.push({
        source: 'DSO',
        sourceId: document.sourceId,
        canonicalUrl: document.canonicalUrl,
      });
      
      // Extract AKN identifier from sourceMetadata
      if (document.sourceMetadata?.discovery) {
        const discovery = document.sourceMetadata.discovery as Record<string, unknown>;
        if (discovery.identificatie && typeof discovery.identificatie === 'string') {
          const identificatie = discovery.identificatie;
          if (identificatie.startsWith('/akn/')) {
            identifiers.push({
              source: 'DSO',
              sourceId: identificatie,
              alternateIdentifiers: [
                { source: 'AKN', identifier: identificatie },
              ],
            });
          }
        }
      }
      
      // Extract IMRO identifier if present in sourceId
      if (document.sourceId.startsWith('NL.IMRO.')) {
        identifiers.push({
          source: 'DSO',
          sourceId: document.sourceId,
          alternateIdentifiers: [
            { source: 'IMRO', identifier: document.sourceId },
          ],
          canonicalUrl: document.canonicalUrl,
        });
      }
      
      // Extract publicatieLink as canonicalUrl if available
      if (document.sourceMetadata?.discovery) {
        const discovery = document.sourceMetadata.discovery as Record<string, unknown>;
        if (discovery.publicatieLink && typeof discovery.publicatieLink === 'string') {
          const publicatieLink = discovery.publicatieLink;
          if (publicatieLink !== document.canonicalUrl) {
            identifiers.push({
              source: 'DSO',
              sourceId: document.sourceId,
              canonicalUrl: publicatieLink,
            });
          }
        }
      }
    }
    
    return identifiers;
  }
}

