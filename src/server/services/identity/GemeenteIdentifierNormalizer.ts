/**
 * Gemeente Identifier Normalizer
 * 
 * Handles Gemeente (Municipal) document identifiers (primarily URLs)
 * Gemeente documents typically use URLs as their sourceId, but this normalizer
 * provides better detection and extraction for municipal documents.
 */

import type { IdentifierNormalizer, DocumentIdentifier } from '../../contracts/documentIdentifier.js';
import type { DocumentSource } from '../../contracts/types.js';

export class GemeenteIdentifierNormalizer implements IdentifierNormalizer {
  canNormalize(identifier: string): boolean {
    // Check if it's a URL that looks like a municipal website
    try {
      const url = new URL(identifier);
      const hostname = url.hostname.toLowerCase();
      
      // Municipal websites typically end with .nl and have a single-level domain
      // Examples: amsterdam.nl, rotterdam.nl, utrecht.nl
      // But also: gemeente.amsterdam.nl, www.amsterdam.nl
      if (hostname.endsWith('.nl')) {
        // Check for common municipal patterns
        const parts = hostname.split('.');
        const domain = parts[parts.length - 2]; // Second-to-last part
        
        // Common municipal domain patterns
        const municipalPatterns = [
          /^[a-z]+$/, // Single word domains (amsterdam, rotterdam, etc.)
          /^gemeente/i, // gemeente.*.nl
        ];
        
        // Check if domain matches municipal patterns
        if (municipalPatterns.some(pattern => pattern.test(domain))) {
          return true;
        }
        
        // Also check for known municipal city names (common ones)
        const knownMunicipalities = [
          'amsterdam', 'rotterdam', 'den-haag', 'utrecht', 'eindhoven',
          'groningen', 'tilburg', 'almere', 'breda', 'nijmegen',
          'enschede', 'haarlem', 'arnhem', 'zaanstad', 'amersfoort',
        ];
        
        if (knownMunicipalities.includes(domain)) {
          return true;
        }
      }
    } catch {
      // Not a valid URL
      return false;
    }
    
    return false;
  }
  
  normalize(identifier: string): DocumentIdentifier | null {
    if (!this.canNormalize(identifier)) {
      return null;
    }
    
    try {
      const url = new URL(identifier);
      const hostname = url.hostname.toLowerCase();
      
      // Extract municipality name from domain
      const parts = hostname.split('.');
      const domain = parts[parts.length - 2];
      
      // Normalize municipality name (remove 'gemeente' prefix if present)
      let municipalityName = domain;
      if (domain.toLowerCase().startsWith('gemeente')) {
        municipalityName = domain.substring(8); // Remove 'gemeente'
      }
      
      // Capitalize first letter
      municipalityName = municipalityName.charAt(0).toUpperCase() + municipalityName.slice(1);
      
      return {
        source: 'Gemeente',
        sourceId: identifier, // Use URL as sourceId (as Gemeente adapter does)
        canonicalUrl: identifier,
      };
    } catch {
      return null;
    }
  }
  
  extractIdentifiers(document: { source: DocumentSource; sourceId: string; canonicalUrl?: string; sourceMetadata?: Record<string, unknown> }): DocumentIdentifier[] {
    const identifiers: DocumentIdentifier[] = [];
    
    if (document.source === 'Gemeente') {
      identifiers.push({
        source: 'Gemeente',
        sourceId: document.sourceId,
        canonicalUrl: document.canonicalUrl || document.sourceId, // sourceId is typically the URL
      });
      
      // Extract URL from sourceMetadata if different
      if (document.sourceMetadata?.url && document.sourceMetadata.url !== document.sourceId) {
        identifiers.push({
          source: 'Gemeente',
          sourceId: document.sourceId,
          canonicalUrl: document.sourceMetadata.url as string,
        });
      }
      
      // Extract legacy URL if present
      if (document.sourceMetadata?.legacyUrl && document.sourceMetadata.legacyUrl !== document.sourceId) {
        identifiers.push({
          source: 'Gemeente',
          sourceId: document.sourceId,
          canonicalUrl: document.sourceMetadata.legacyUrl as string,
        });
      }
    }
    
    return identifiers;
  }
}

