/**
 * Wetgeving Identifier Normalizer
 * 
 * Handles Wetgeving (Legislation) identifiers (BWBR, AKN, CVDR, URLs)
 */

import type { IdentifierNormalizer, DocumentIdentifier } from '../../contracts/documentIdentifier.js';
import type { DocumentSource } from '../../contracts/types.js';

export class WetgevingIdentifierNormalizer implements IdentifierNormalizer {
  canNormalize(identifier: string): boolean {
    // Check for BWBR identifier (BWBR123456)
    if (/^BWBR\d+$/i.test(identifier)) {
      return true;
    }
    
    // Check for CVDR identifier
    if (identifier.startsWith('CVDR') || identifier.includes('CVDR')) {
      return true;
    }
    
    // Check for Wetgeving URLs
    if (identifier.includes('wetten.overheid.nl') || 
        identifier.includes('officielebekendmakingen.nl')) {
      return true;
    }
    
    // Check for AKN identifiers that might be Wetgeving (not DSO)
    if (identifier.startsWith('/akn/') && identifier.includes('/wet/')) {
      return true;
    }
    
    return false;
  }
  
  normalize(identifier: string): DocumentIdentifier | null {
    if (!this.canNormalize(identifier)) {
      return null;
    }
    
    const alternateIdentifiers: Array<{ source: string; identifier: string }> = [];
    
    // Normalize BWBR identifier
    const bwbrMatch = identifier.match(/^BWBR(\d+)$/i);
    if (bwbrMatch) {
      const bwbr = `BWBR${bwbrMatch[1]}`;
      alternateIdentifiers.push({ source: 'BWBR', identifier: bwbr });
      return {
        source: 'Wetgeving',
        sourceId: bwbr,
        alternateIdentifiers,
      };
    }
    
    // Normalize CVDR identifier
    if (identifier.includes('CVDR')) {
      const cvdrMatch = identifier.match(/CVDR[^\s]*/i);
      if (cvdrMatch) {
        const cvdr = cvdrMatch[0];
        alternateIdentifiers.push({ source: 'CVDR', identifier: cvdr });
        return {
          source: 'Wetgeving',
          sourceId: cvdr,
          alternateIdentifiers,
        };
      }
    }
    
    // Normalize AKN identifier for Wetgeving
    if (identifier.startsWith('/akn/') && identifier.includes('/wet/')) {
      alternateIdentifiers.push({ source: 'AKN', identifier });
      return {
        source: 'Wetgeving',
        sourceId: identifier,
        alternateIdentifiers,
      };
    }
    
    // Normalize URL
    try {
      const url = new URL(identifier);
      if (url.hostname.includes('wetten.overheid.nl') || 
          url.hostname.includes('officielebekendmakingen.nl')) {
        // Try to extract BWBR or other identifier from URL
        const bwbrFromUrl = url.pathname.match(/BWBR\d+/i);
        if (bwbrFromUrl) {
          const bwbr = bwbrFromUrl[0].toUpperCase();
          alternateIdentifiers.push({ source: 'BWBR', identifier: bwbr });
          return {
            source: 'Wetgeving',
            sourceId: bwbr,
            canonicalUrl: identifier,
            alternateIdentifiers,
          };
        }
        
        return {
          source: 'Wetgeving',
          sourceId: identifier, // Use URL as sourceId
          canonicalUrl: identifier,
        };
      }
    } catch {
      // Not a valid URL, continue
    }
    
    // Generic Wetgeving identifier
    return {
      source: 'Wetgeving',
      sourceId: identifier,
    };
  }
  
  extractIdentifiers(document: { source: DocumentSource; sourceId: string; canonicalUrl?: string; sourceMetadata?: Record<string, unknown> }): DocumentIdentifier[] {
    const identifiers: DocumentIdentifier[] = [];
    
    if (document.source === 'Wetgeving') {
      identifiers.push({
        source: 'Wetgeving',
        sourceId: document.sourceId,
        canonicalUrl: document.canonicalUrl,
      });
      
      // Extract legal IDs from enrichmentMetadata or sourceMetadata
      if (document.sourceMetadata?.enrichmentMetadata) {
        const enrichment = document.sourceMetadata.enrichmentMetadata as Record<string, unknown>;
        if (enrichment.wetgeving) {
          const wetgeving = enrichment.wetgeving as Record<string, unknown>;
          if (wetgeving.legalIds) {
            const legalIds = wetgeving.legalIds as Record<string, string>;
            const alternateIdentifiers: Array<{ source: string; identifier: string }> = [];
            
            if (legalIds.bwbr) {
              alternateIdentifiers.push({ source: 'BWBR', identifier: legalIds.bwbr });
            }
            if (legalIds.akn) {
              alternateIdentifiers.push({ source: 'AKN', identifier: legalIds.akn });
            }
            if (legalIds.cvdr) {
              alternateIdentifiers.push({ source: 'CVDR', identifier: legalIds.cvdr });
            }
            
            if (alternateIdentifiers.length > 0) {
              identifiers.push({
                source: 'Wetgeving',
                sourceId: document.sourceId,
                canonicalUrl: document.canonicalUrl,
                alternateIdentifiers,
              });
            }
          }
        }
      }
      
      // Extract from sourceMetadata.legalIds if present
      if (document.sourceMetadata?.legalIds) {
        const legalIds = document.sourceMetadata.legalIds as Record<string, string>;
        const alternateIdentifiers: Array<{ source: string; identifier: string }> = [];
        
        if (legalIds.bwbr) {
          alternateIdentifiers.push({ source: 'BWBR', identifier: legalIds.bwbr });
        }
        if (legalIds.akn) {
          alternateIdentifiers.push({ source: 'AKN', identifier: legalIds.akn });
        }
        if (legalIds.cvdr) {
          alternateIdentifiers.push({ source: 'CVDR', identifier: legalIds.cvdr });
        }
        
        if (alternateIdentifiers.length > 0) {
          identifiers.push({
            source: 'Wetgeving',
            sourceId: document.sourceId,
            canonicalUrl: document.canonicalUrl,
            alternateIdentifiers,
          });
        }
      }
    }
    
    return identifiers;
  }
}

