/**
 * URL Identifier Normalizer
 * 
 * Handles URL-based identifiers (e.g., from ground truth, web scraping)
 */

import type { IdentifierNormalizer, DocumentIdentifier } from '../../contracts/documentIdentifier.js';
import type { DocumentSource } from '../../contracts/types.js';

export class UrlIdentifierNormalizer implements IdentifierNormalizer {
  canNormalize(identifier: string): boolean {
    try {
      new URL(identifier);
      return true;
    } catch {
      return false;
    }
  }
  
  normalize(identifier: string): DocumentIdentifier | null {
    if (!this.canNormalize(identifier)) {
      return null;
    }
    
    // Try to detect source from URL
    const url = new URL(identifier);
    let source: DocumentSource = 'Web';
    
    // Detect DSO URLs
    if (url.hostname.includes('omgevingswet.overheid.nl') || 
        url.hostname.includes('ruimtelijkeplannen.nl') ||
        url.hostname.includes('omgevingsdocumenten.nl')) {
      source = 'DSO';
    }
    // Detect Rechtspraak URLs
    else if (url.hostname.includes('rechtspraak.nl')) {
      source = 'Rechtspraak';
    }
    // Detect Wetgeving URLs
    else if (url.hostname.includes('wetten.overheid.nl') ||
             url.hostname.includes('officielebekendmakingen.nl')) {
      source = 'Wetgeving';
    }
    // Detect Gemeente URLs (municipal websites)
    else if (typeof url.hostname === 'string' && url.hostname.includes('.nl') && 
             (url.hostname.endsWith('.nl') && url.hostname.split('.').length === 2)) {
      // Simple heuristic: single-level .nl domains are often municipalities
      source = 'Gemeente';
    }
    
    return {
      source: source as DocumentSource,
      sourceId: identifier, // Use URL as sourceId for web sources
      canonicalUrl: identifier,
    };
  }
  
  extractIdentifiers(document: { source: DocumentSource; sourceId: string; canonicalUrl?: string; sourceMetadata?: Record<string, unknown> }): DocumentIdentifier[] {
    const identifiers: DocumentIdentifier[] = [];
    
    if (document.canonicalUrl) {
      identifiers.push({
        source: document.source as DocumentSource,
        sourceId: document.sourceId,
        canonicalUrl: document.canonicalUrl,
      });
    }
    
    // Extract legacy URLs from sourceMetadata
    if (document.sourceMetadata) {
      const legacyUrl = document.sourceMetadata.legacyUrl || document.sourceMetadata.url;
      if (typeof legacyUrl === 'string' && legacyUrl !== document.canonicalUrl) {
        identifiers.push({
          source: document.source,
          sourceId: document.sourceId,
          canonicalUrl: legacyUrl,
        });
      }
    }
    
    return identifiers;
  }
}

