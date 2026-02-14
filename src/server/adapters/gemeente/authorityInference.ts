/**
 * Authority Inference - Deterministic publisher authority inference from URLs and metadata
 * 
 * Infers publisher authority (municipality name) from document URLs and metadata.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/10-gemeente-beleid-adapter.md
 */

import { logger } from '../../utils/logger.js';

/**
 * Authority inference result
 */
export interface AuthorityInferenceResult {
  publisherAuthority: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'domain' | 'metadata' | 'heuristic';
}

/**
 * AuthorityInference - Infer publisher authority from URL and metadata
 */
export class AuthorityInference {
  /**
   * Infer publisher authority from URL and metadata
   * 
   * Rules (in order of priority):
   * 1. Use provided authority (highest priority - from SRU/API sources)
   * 2. Extract from domain name (e.g., amsterdam.nl -> "Gemeente Amsterdam")
   * 3. Extract from metadata (if available)
   * 4. Heuristic fallback
   * 
   * @param url - Document URL
   * @param metadata - Optional metadata (title, author, issuingAuthority, etc.)
   * @param providedAuthority - Optional pre-extracted authority (e.g., from SRU service)
   * @returns Inferred authority
   */
  infer(
    url: string, 
    metadata?: { title?: string; author?: string; issuingAuthority?: string; [key: string]: unknown },
    providedAuthority?: string
  ): AuthorityInferenceResult {
    // Method 0: Use provided authority (highest priority - from external sources like SRU)
    if (providedAuthority && providedAuthority.trim() && providedAuthority !== 'Onbekende gemeente') {
      return {
        publisherAuthority: providedAuthority.trim(),
        confidence: 'high',
        method: 'metadata',
      };
    }

    // Method 0b: Check metadata for issuingAuthority (from SRU/API sources)
    if (metadata?.issuingAuthority && typeof metadata.issuingAuthority === 'string') {
      const authorityStr = metadata.issuingAuthority.trim();
      if (authorityStr && authorityStr !== 'Onbekende gemeente') {
        return {
          publisherAuthority: authorityStr,
          confidence: 'high',
          method: 'metadata',
        };
      }
    }

    // Method 1: Extract from domain
    const domainResult = this.inferFromDomain(url);
    if (domainResult.confidence === 'high') {
      return domainResult;
    }

    // Method 2: Extract from metadata
    if (metadata) {
      const metadataResult = this.inferFromMetadata(metadata);
      if (metadataResult.confidence === 'high' || metadataResult.confidence === 'medium') {
        return metadataResult;
      }
    }

    // Method 3: Heuristic fallback
    return this.inferHeuristic(url, metadata);
  }

  /**
   * Infer authority from domain name
   */
  private inferFromDomain(url: string): AuthorityInferenceResult {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Remove www. prefix
      const domain = hostname.replace(/^www\./, '');

      // Pattern: gemeente-[name].nl or [name].nl
      // Examples: amsterdam.nl, gemeente-amsterdam.nl, rotterdam.nl
      const gemeenteMatch = domain.match(/^gemeente-([^.]+)\./);
      if (gemeenteMatch) {
        const gemeenteName = this.capitalizeGemeenteName(gemeenteMatch[1]);
        return {
          publisherAuthority: `Gemeente ${gemeenteName}`,
          confidence: 'high',
          method: 'domain',
        };
      }

      // Pattern: [name].nl (common for Dutch municipalities)
      const directMatch = domain.match(/^([^.]+)\.nl$/);
      if (directMatch) {
        const gemeenteName = this.capitalizeGemeenteName(directMatch[1]);
        // Return high confidence for common municipality names
        // Common municipality names: amsterdam, rotterdam, denhaag, utrecht, etc.
        const commonMunicipalities = [
          'amsterdam', 'rotterdam', 'denhaag', 'den-haag', 'utrecht', 'eindhoven', 'groningen',
          'tilburg', 'almere', 'breda', 'nijmegen', 'enschede', 'haarlem', 'arnhem',
          'zaanstad', 'amersfoort', 'apeldoorn', 's-hertogenbosch', 'hoofddorp',
        ];
        if (commonMunicipalities.includes(directMatch[1].toLowerCase()) || this.isLikelyMunicipality(gemeenteName)) {
          return {
            publisherAuthority: `Gemeente ${gemeenteName}`,
            confidence: 'high',
            method: 'domain',
          };
        }
      }

      // Pattern: [name].gemeente.nl or [name].overheid.nl
      const overheidMatch = domain.match(/([^.]+)\.(gemeente|overheid)\.nl$/);
      if (overheidMatch) {
        const gemeenteName = this.capitalizeGemeenteName(overheidMatch[1]);
        return {
          publisherAuthority: `Gemeente ${gemeenteName}`,
          confidence: 'high',
          method: 'domain',
        };
      }

      return {
        publisherAuthority: 'Onbekende gemeente',
        confidence: 'low',
        method: 'domain',
      };
    } catch (error) {
      logger.warn({ error, url }, 'Failed to parse URL for authority inference');
      return {
        publisherAuthority: 'Onbekende gemeente',
        confidence: 'low',
        method: 'domain',
      };
    }
  }

  /**
   * Infer authority from metadata
   */
  private inferFromMetadata(metadata: { title?: string; author?: string; [key: string]: unknown }): AuthorityInferenceResult {
    // Check author field
    if (metadata.author) {
      const authorStr = String(metadata.author);
      const gemeenteMatch = authorStr.match(/gemeente\s+([^,]+)/i);
      if (gemeenteMatch) {
        return {
          publisherAuthority: `Gemeente ${gemeenteMatch[1].trim()}`,
          confidence: 'high',
          method: 'metadata',
        };
      }
    }

    // Check title for municipality references
    if (metadata.title) {
      const titleStr = String(metadata.title);
      const gemeenteMatch = titleStr.match(/gemeente\s+([^,]+)/i);
      if (gemeenteMatch) {
        return {
          publisherAuthority: `Gemeente ${gemeenteMatch[1].trim()}`,
          confidence: 'medium',
          method: 'metadata',
        };
      }
    }

    return {
      publisherAuthority: 'Onbekende gemeente',
      confidence: 'low',
      method: 'metadata',
    };
  }

  /**
   * Heuristic fallback inference
   */
  private inferHeuristic(url: string, _metadata?: { title?: string; author?: string; [key: string]: unknown }): AuthorityInferenceResult {
    // Try to extract any municipality name from URL path
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      
      for (const part of pathParts) {
        const decoded = decodeURIComponent(part);
        if (this.isLikelyMunicipality(decoded)) {
          return {
            publisherAuthority: `Gemeente ${this.capitalizeGemeenteName(decoded)}`,
            confidence: 'medium',
            method: 'heuristic',
          };
        }
      }
    } catch {
      // URL parsing failed, skip
    }

    return {
      publisherAuthority: 'Onbekende gemeente',
      confidence: 'low',
      method: 'heuristic',
    };
  }

  /**
   * Capitalize gemeente name (handle common patterns)
   */
  private capitalizeGemeenteName(name: string): string {
    // Special case: "denhaag" should become "Den Haag"
    if (name.toLowerCase() === 'denhaag') {
      return 'Den Haag';
    }
    
    // Handle hyphenated names (e.g., "den-haag" -> "Den Haag")
    if (name.includes('-')) {
      return name
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }

    // Handle camelCase or lowercase
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  /**
   * Check if a name is likely a municipality
   * (Simple heuristic - can be expanded with a list of known municipalities)
   */
  private isLikelyMunicipality(name: string): boolean {
    const normalized = name.toLowerCase().trim();
    
    // Common municipality patterns
    const commonPatterns = [
      /^[a-z]+(dam|burg|stad|wijk|hout|berg|dorp)$/i, // e.g., Amsterdam, Rotterdam, Utrecht
      /^[a-z]+-[a-z]+$/i, // Hyphenated names
    ];

    // Minimum length check
    if (normalized.length < 3) {
      return false;
    }

    // Check against patterns
    return commonPatterns.some(pattern => pattern.test(normalized));
  }
}

/**
 * Singleton instance
 */
export const authorityInference = new AuthorityInference();

