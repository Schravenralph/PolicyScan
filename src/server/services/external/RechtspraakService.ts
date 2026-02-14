/**
 * Service for searching Rechtspraak.nl for jurisprudence and legal decisions
 * 
 * This service uses the official Open Data API as the primary method,
 * with Google Search as a fallback option.
 * 
 * Research Documentation: docs/30-rechtspraak/API-RESEARCH.md
 * Open Data API Documentation: docs/30-rechtspraak/Technische-documentatie-Open-Data-van-de-Rechtspraak.pdf
 */

import { GoogleSearchService } from './googleSearch.js';
import { RechtspraakOpenDataService } from './RechtspraakOpenDataService.js';
import { ScrapedDocument } from '../infrastructure/types.js';
import { DiscoveredDocument } from './DSOOntsluitenService.js';
import { logger } from '../../utils/logger.js';

/**
 * Search query parameters for jurisprudence
 */
export interface RechtspraakSearchQuery {
  /** Topic/query terms */
  query: string;
  /** Optional: Court filter (HR, GHAMS, RBDHA, etc.) */
  court?: string;
  /** Optional: Date range filter */
  dateRange?: {
    from?: string;
    to?: string;
  };
  /** Optional: Maximum number of results */
  maxResults?: number;
}

/**
 * Service for searching Rechtspraak.nl
 */
export class RechtspraakService {
  private googleSearch: GoogleSearchService;
  private openDataService: RechtspraakOpenDataService;
  private useOpenDataAPI: boolean;

  constructor(
    googleSearchService?: GoogleSearchService, 
    openDataService?: RechtspraakOpenDataService,
    useOpenDataAPI?: boolean
  ) {
    // Use provided services or create new instances
    this.googleSearch = googleSearchService || new GoogleSearchService();
    this.openDataService = openDataService || new RechtspraakOpenDataService();
    
    // Determine API preference from environment variable or parameter
    // Default: prefer Open Data API if not explicitly disabled
    if (useOpenDataAPI !== undefined) {
      this.useOpenDataAPI = useOpenDataAPI;
    } else {
      const envPreference = process.env.RECHTSPRAAK_USE_OPEN_DATA_API;
      this.useOpenDataAPI = envPreference !== 'false' && envPreference !== '0';
    }
    
    logger.debug(
      { useOpenDataAPI: this.useOpenDataAPI },
      'RechtspraakService initialized'
    );
  }

  /**
   * Check if the service is configured
   * Open Data API doesn't require configuration (public API)
   * Google Search requires API keys
   */
  isConfigured(): boolean {
    // Open Data API is always available (public), but we can fall back to Google Search
    return this.useOpenDataAPI || this.googleSearch.isConfigured();
  }

  /**
   * Search for jurisprudence and legal decisions
   * 
   * Uses Open Data API as primary method, falls back to Google Search if needed.
   */
  async searchJurisprudence(
    query: RechtspraakSearchQuery
  ): Promise<DiscoveredDocument[]> {
    // Try Open Data API first (if enabled)
    if (this.useOpenDataAPI) {
      try {
        logger.debug({ query }, 'Attempting search via Open Data API');
        
        const documents = await this.openDataService.searchJurisprudence({
          query: query.query,
          court: query.court,
          dateRange: query.dateRange,
          maxResults: query.maxResults,
        });

        if (documents.length > 0) {
          logger.info(
            { count: documents.length, query: query.query, method: 'Open Data API' },
            'Found documents via Open Data API'
          );
          return documents;
        } else {
          logger.debug({ query }, 'Open Data API returned no results, falling back to Google Search');
        }
      } catch (error) {
        logger.warn(
          { error, query: query.query },
          'Open Data API failed, falling back to Google Search'
        );
      }
    }

    // Fallback to Google Search
    if (!this.googleSearch.isConfigured()) {
      logger.warn('Google Search not configured and Open Data API unavailable. Cannot search rechtspraak.nl.');
      return [];
    }

    try {
      // Build search query with site restriction
      let searchQuery = query.query;
      
      // Add court filter if specified
      if (query.court) {
        searchQuery = `${searchQuery} ECLI:NL:${query.court}`;
      }
      
      // Add date range if specified
      if (query.dateRange?.from) {
        searchQuery = `${searchQuery} after:${query.dateRange.from}`;
      }
      if (query.dateRange?.to) {
        searchQuery = `${searchQuery} before:${query.dateRange.to}`;
      }

      // Search using Google Search with site restriction
      const scrapedDocs = await this.googleSearch.search(searchQuery, {
        siteRestrict: ['www.rechtspraak.nl', 'rechtspraak.nl'],
        numResults: query.maxResults || 20
      });

      // Map to DiscoveredDocument format
      const discoveredDocs = scrapedDocs.map(doc => 
        this.mapToDiscoveredDocument(doc)
      );

      logger.info(
        { count: discoveredDocs.length, query: query.query, method: 'Google Search' },
        'Found documents via Google Search fallback'
      );

      return discoveredDocs;
    } catch (error) {
      logger.error(
        { error, query: query.query },
        'Error searching Rechtspraak.nl via Google Search'
      );
      // Return empty array on error (don't break workflow)
      return [];
    }
  }

  /**
   * Extract ECLI (European Case Law Identifier) from URL, metadata, or content
   * 
   * ECLI Format: ECLI:NL:[COURT]:[YEAR]:[IDENTIFIER]
   * Examples:
   * - ECLI:NL:HR:2024:123 (Hoge Raad - Supreme Court)
   * - ECLI:NL:GHAMS:2024:456 (Gerechtshof - Court of Appeal)
   * - ECLI:NL:RBDHA:2024:789 (Rechtbank - District Court)
   * 
   * @param url The document URL
   * @param title Optional title that might contain ECLI
   * @param content Optional content that might contain ECLI
   * @returns The extracted ECLI identifier, or undefined if not found
   */
  extractECLI(url?: string, title?: string, content?: string): string | undefined {
    // ECLI pattern: ECLI:NL:[COURT]:[YEAR]:[IDENTIFIER]
    // Court can be 2-10 uppercase letters/numbers
    // Year is 4 digits
    // Identifier can be alphanumeric
    const ecliPattern = /ECLI:NL:([A-Z0-9]{2,10}):(\d{4}):([A-Z0-9]+)/i;
    
    // Try to extract from URL first (most reliable)
    if (url) {
      const urlMatch = url.match(ecliPattern);
      if (urlMatch) {
        // Normalize to uppercase for consistency
        return `ECLI:NL:${urlMatch[1].toUpperCase()}:${urlMatch[2]}:${urlMatch[3].toUpperCase()}`;
      }
    }
    
    // Try to extract from title
    if (title) {
      const titleMatch = title.match(ecliPattern);
      if (titleMatch) {
        return `ECLI:NL:${titleMatch[1].toUpperCase()}:${titleMatch[2]}:${titleMatch[3].toUpperCase()}`;
      }
    }
    
    // Try to extract from content (if provided)
    if (content) {
      const contentMatch = content.match(ecliPattern);
      if (contentMatch) {
        return `ECLI:NL:${contentMatch[1].toUpperCase()}:${contentMatch[2]}:${contentMatch[3].toUpperCase()}`;
      }
    }
    
    return undefined;
  }

  /**
   * Validate ECLI format
   * 
   * @param ecli The ECLI identifier to validate
   * @returns true if the ECLI format is valid, false otherwise
   */
  validateECLI(ecli: string): boolean {
    if (!ecli || typeof ecli !== 'string') {
      return false;
    }
    
    // ECLI pattern: ECLI:NL:[COURT]:[YEAR]:[IDENTIFIER]
    const ecliPattern = /^ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+$/i;
    return ecliPattern.test(ecli);
  }

  /**
   * Normalize ECLI format to standard uppercase format
   * 
   * @param ecli The ECLI identifier to normalize
   * @returns Normalized ECLI, or undefined if invalid
   */
  normalizeECLI(ecli: string): string | undefined {
    if (!this.validateECLI(ecli)) {
      return undefined;
    }
    
    // Extract components and normalize to uppercase
    const match = ecli.match(/ECLI:NL:([A-Z0-9]{2,10}):(\d{4}):([A-Z0-9]+)/i);
    if (match) {
      return `ECLI:NL:${match[1].toUpperCase()}:${match[2]}:${match[3].toUpperCase()}`;
    }
    
    return undefined;
  }

  /**
   * Extract court identifier from ECLI
   * 
   * @param ecli The ECLI identifier
   * @returns The court identifier (e.g., "HR", "GHAMS", "RBDHA"), or undefined
   */
  extractCourtFromECLI(ecli: string): string | undefined {
    if (!this.validateECLI(ecli)) {
      return undefined;
    }
    
    const match = ecli.match(/ECLI:NL:([A-Z0-9]{2,10}):/i);
    return match ? match[1].toUpperCase() : undefined;
  }

  /**
   * Extract year from ECLI
   * 
   * @param ecli The ECLI identifier
   * @returns The year as a string, or undefined
   */
  extractYearFromECLI(ecli: string): string | undefined {
    if (!this.validateECLI(ecli)) {
      return undefined;
    }
    
    const match = ecli.match(/ECLI:NL:[A-Z0-9]{2,10}:(\d{4}):/i);
    return match ? match[1] : undefined;
  }

  /**
   * Map ScrapedDocument to canonical DiscoveredDocument format
   */
  private mapToDiscoveredDocument(doc: ScrapedDocument): DiscoveredDocument {
    // Extract ECLI identifier
    const ecli = this.extractECLI(doc.url, doc.titel, doc.samenvatting);
    
    // Extract court from ECLI or infer from URL/title
    const court = ecli ? this.extractCourtFromECLI(ecli) : this.inferCourt(doc.url, doc.titel);
    
    // Extract court name from title or URL
    const courtName = this.extractCourtName(doc.titel, doc.url, court);

    return {
      title: doc.titel,
      url: doc.url,
      summary: doc.samenvatting || undefined,
      documentCategory: 'jurisprudence',
      documentType: this.inferDocumentType(court),
      sourceType: 'RECHTSPRAAK',
      sourceId: ecli || doc.url, // Use ECLI as sourceId if available, otherwise URL
      issuingAuthority: courtName,
      publicationDate: doc.publicatiedatum || undefined,
      authorityScore: 0.9, // High authority score for official court decisions
      matchSignals: {
        keyword: doc.relevanceScore,
        semantic: doc.semanticSimilarity,
        metadata: doc.relevanceScore
      },
      matchExplanation: doc['relevantie voor zoekopdracht'] || 
                       `Jurisprudence found on rechtspraak.nl${ecli ? ` (ECLI: ${ecli})` : ''}`,
      provenance: [{
        sourceType: 'RECHTSPRAAK',
        url: doc.url,
        fetchedAt: new Date().toISOString()
      }]
    };
  }

  /**
   * Infer court identifier from URL or title
   */
  private inferCourt(url: string, title: string): string | undefined {
    const text = `${url} ${title}`.toUpperCase();
    
    // Common court identifiers
    const courtPatterns = [
      { pattern: /\bHR\b/, court: 'HR' }, // Hoge Raad
      { pattern: /\bGHAMS\b/, court: 'GHAMS' }, // Gerechtshof Amsterdam
      { pattern: /\bGHLEE\b/, court: 'GHLEE' }, // Gerechtshof Leeuwarden
      { pattern: /\bGHDB\b/, court: 'GHDB' }, // Gerechtshof Den Bosch
      { pattern: /\bRBDHA\b/, court: 'RBDHA' }, // Rechtbank Den Haag
      { pattern: /\bRBAMS\b/, court: 'RBAMS' }, // Rechtbank Amsterdam
      { pattern: /\bRBROT\b/, court: 'RBROT' }, // Rechtbank Rotterdam
      { pattern: /\bRBUTR\b/, court: 'RBUTR' }, // Rechtbank Utrecht
    ];
    
    for (const { pattern, court } of courtPatterns) {
      if (pattern.test(text)) {
        return court;
      }
    }
    
    return undefined;
  }

  /**
   * Extract court name from title, URL, or court identifier
   */
  private extractCourtName(title: string, url: string, court?: string): string | undefined {
    // Map court identifiers to court names
    const courtNames: Record<string, string> = {
      'HR': 'Hoge Raad',
      'GHAMS': 'Gerechtshof Amsterdam',
      'GHLEE': 'Gerechtshof Leeuwarden',
      'GHDB': 'Gerechtshof \'s-Hertogenbosch',
      'RBDHA': 'Rechtbank Den Haag',
      'RBAMS': 'Rechtbank Amsterdam',
      'RBROT': 'Rechtbank Rotterdam',
      'RBUTR': 'Rechtbank Utrecht',
    };
    
    if (court && courtNames[court]) {
      return courtNames[court];
    }
    
    // Try to extract from title
    const text = `${title} ${url}`;
    const courtNamePatterns = [
      /(Hoge\s+Raad)/i,
      /(Gerechtshof\s+[A-Z][a-z]+)/i,
      /(Rechtbank\s+[A-Z][a-z]+)/i,
    ];
    
    for (const pattern of courtNamePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return undefined;
  }

  /**
   * Infer document type from court identifier
   */
  private inferDocumentType(court?: string): string | undefined {
    if (!court) {
      return undefined;
    }
    
    // Map court identifiers to document types
    if (court === 'HR') {
      return 'Hoge Raad';
    } else if (court.startsWith('GH')) {
      return 'Gerechtshof';
    } else if (court.startsWith('RB')) {
      return 'Rechtbank';
    }
    
    return undefined;
  }
}
