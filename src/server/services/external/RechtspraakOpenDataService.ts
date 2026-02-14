/**
 * Service for querying Rechtspraak Open Data API
 * 
 * This service implements the official Open Data API as described in:
 * docs/30-rechtspraak/Technische-documentatie-Open-Data-van-de-Rechtspraak.pdf
 * 
 * The API consists of two main components:
 * 1. ECLI Index Querying - Search for ECLI identifiers based on criteria
 * 2. Document Retrieval - Fetch full documents using ECLI identifiers
 * 
 * Rate Limit: Maximum 10 requests per second (conservative: 1 req/sec)
 * Format: XML responses following open-rechtspraak.xsd schema
 * 
 * Note: The actual API endpoints may need verification. This implementation
 * uses reasonable defaults based on REST API conventions and the XML schema.
 */

import { logger } from '../../utils/logger.js';
import { DiscoveredDocument } from './DSOOntsluitenService.js';
import axios, { AxiosInstance, AxiosError } from 'axios';
import * as cheerio from 'cheerio';

/**
 * ECLI Index query parameters
 */
export interface ECLIIndexQuery {
  /** Search query/keywords */
  query?: string;
  /** Court identifier (HR, GHAMS, RBDHA, etc.) */
  court?: string;
  /** Date range filter */
  dateRange?: {
    from?: string; // Format: YYYY-MM-DD
    to?: string;   // Format: YYYY-MM-DD
  };
  /** Legal area (rechtsgebied) */
  rechtsgebied?: string;
  /** Procedure type (proceduresoort) */
  proceduresoort?: string;
  /** Maximum number of results */
  maxResults?: number;
}

/**
 * ECLI identifier result from index query
 */
export interface ECLIResult {
  ecli: string;
  url?: string;
  title?: string;
  court?: string;
  date?: string;
}

/**
 * Service for querying Rechtspraak Open Data API
 */
export class RechtspraakOpenDataService {
  private readonly BASE_URL = 'https://data.rechtspraak.nl';
  // Corrected endpoints based on verification
  private readonly ECLI_INDEX_ENDPOINT = '/uitspraken/zoeken';
  private readonly DOCUMENT_ENDPOINT = '/uitspraken/content';

  // Conservative rate limit: 1 request per second (can be increased if API allows)
  private readonly MAX_REQUESTS_PER_SECOND = 1;
  private readonly REQUEST_DELAY_MS = 1000 / this.MAX_REQUESTS_PER_SECOND;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  
  private client: AxiosInstance;
  private lastRequestTime = 0;
  private lastRequestPromise: Promise<void> = Promise.resolve();

  constructor(baseURL?: string) {
    this.client = axios.create({
      baseURL: baseURL || this.BASE_URL,
      timeout: 30000,
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        'User-Agent': 'Beleidsscan/1.0',
      },
    });
  }

  /**
   * Rate limiting: Ensure we don't exceed the configured requests per second
   * Uses a promise chain to enforce sequential execution and prevent race conditions
   */
  private async rateLimit(): Promise<void> {
    // Chain this request to the previous one
    this.lastRequestPromise = this.lastRequestPromise.then(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.REQUEST_DELAY_MS) {
        const delay = this.REQUEST_DELAY_MS - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      this.lastRequestTime = Date.now();
    }).catch(error => {
      // Ensure the chain continues even if one request fails (though rateLimit itself shouldn't fail)
      logger.error({ error }, 'Error in rate limiter');
    });

    return this.lastRequestPromise;
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = this.MAX_RETRIES,
    delay = this.RETRY_DELAY_MS
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) {
        throw error;
      }

      const axiosError = error as AxiosError;
      // Only retry on network errors or 5xx server errors
      if (
        !axiosError.response ||
        (axiosError.response.status >= 500 && axiosError.response.status < 600)
      ) {
        logger.warn(
          { retries, delay, error: axiosError.message },
          'Retrying request after error'
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1, delay * 2);
      }

      // Don't retry on client errors (4xx)
      throw error;
    }
  }

  /**
   * Query the ECLI index to get a list of ECLI identifiers matching criteria
   * 
   * @param query Search criteria
   * @returns Array of ECLI identifiers with metadata
   */
  async queryECLIIndex(query: ECLIIndexQuery): Promise<ECLIResult[]> {
    await this.rateLimit();

    // Build query parameters
    const params: Record<string, string> = {
      // Force return=DOC to get document entries (although API might return feed)
      return: 'DOC'
    };
    
    // Mapping parameters to what seems to be supported or common
    if (query.query) {
      // Note: Full text search might not be supported by this endpoint
      // but we pass it anyway just in case
      params.q = query.query;
      params.keyword = query.query;
    }
    
    if (query.court) {
      params.rechtbank = query.court;
    }
    
    if (query.dateRange?.from) {
      params.datumVan = query.dateRange.from;
    }
    
    if (query.dateRange?.to) {
      params.datumTot = query.dateRange.to;
    }
    
    if (query.rechtsgebied) {
      params.rechtsgebied = query.rechtsgebied;
    }
    
    if (query.proceduresoort) {
      params.proceduresoort = query.proceduresoort;
    }
    
    if (query.maxResults) {
      params.max = query.maxResults.toString();
    }

    logger.debug(
      { endpoint: this.ECLI_INDEX_ENDPOINT, params },
      'Querying ECLI index'
    );

    try {
      // Query ECLI index with retry logic
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get(this.ECLI_INDEX_ENDPOINT, {
          params,
          responseType: 'text',
        });
      });

      // Parse XML response
      try {
        const ecliResults = this.parseECLIIndexResponse(response.data);

        logger.info(
          { count: ecliResults.length, query },
          'ECLI index query completed'
        );

        return ecliResults;
      } catch (parseError) {
        logger.error(
          { error: parseError, query, responseStart: typeof response.data === 'string' ? response.data.substring(0, 200) : 'Not string' },
          'Failed to parse ECLI index response'
        );
        return [];
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        logger.warn(
          { endpoint: this.ECLI_INDEX_ENDPOINT, query },
          'ECLI index endpoint not found'
        );
        return [];
      }
      
      logger.error(
        { error, query, status: axiosError.response?.status },
        'Error querying ECLI index'
      );
      // Return empty array instead of throwing to prevent workflow crash
      return [];
    }
  }

  /**
   * Retrieve full document using ECLI identifier
   * 
   * @param ecli ECLI identifier (e.g., "ECLI:NL:HR:2024:123")
   * @returns Full document XML as string
   */
  async getDocumentByECLI(ecli: string): Promise<string> {
    await this.rateLimit();

    // Normalize ECLI
    const normalizedECLI = ecli.startsWith('ECLI:') ? ecli : `ECLI:${ecli}`;
    
    // Correct endpoint: /uitspraken/content?id={ECLI}
    const params = { id: normalizedECLI };

    logger.debug({ ecli: normalizedECLI, endpoint: this.DOCUMENT_ENDPOINT }, 'Fetching document by ECLI');

    try {
      const response = await this.retryWithBackoff(async () => {
        return await this.client.get(this.DOCUMENT_ENDPOINT, {
          params,
          responseType: 'text',
        });
      });

      if (!response.data || (typeof response.data === 'string' && response.data.trim().length === 0)) {
        throw new Error('Empty response received from Rechtspraak API');
      }

      return response.data;
    } catch (error) {
      logger.error(
        { error, ecli: normalizedECLI },
        'Error fetching document by ECLI'
      );
      // Throwing here is handled by RechtspraakAdapter (which catches and skips)
      throw error;
    }
  }

  /**
   * Search for jurisprudence documents using Open Data API
   * 
   * This is the main method that:
   * 1. Queries the ECLI index
   * 2. Retrieves documents for each ECLI
   * 3. Parses and maps to DiscoveredDocument format
   * 
   * @param query Search criteria
   * @returns Array of discovered documents
   */
  async searchJurisprudence(query: ECLIIndexQuery): Promise<DiscoveredDocument[]> {
    try {
      // Step 1: Query ECLI index
      const ecliResults = await this.queryECLIIndex(query);

      if (ecliResults.length === 0) {
        logger.info({ query }, 'No ECLI results found');
        return [];
      }

      // Step 2: Retrieve documents for each ECLI (limit to maxResults)
      const maxDocs = query.maxResults || 20;
      const eclisToFetch = ecliResults.slice(0, maxDocs);

      logger.info(
        { totalECLIs: ecliResults.length, fetching: eclisToFetch.length },
        'Fetching documents for ECLIs'
      );

      const documents: DiscoveredDocument[] = [];

      // Fetch documents with rate limiting
      for (const ecliResult of eclisToFetch) {
        try {
          const xmlContent = await this.getDocumentByECLI(ecliResult.ecli);
          const document = this.parseDocumentXML(xmlContent, ecliResult);
          
          if (document) {
            documents.push(document);
          }
        } catch (error) {
          logger.warn(
            { error, ecli: ecliResult.ecli },
            'Failed to fetch or parse document, skipping'
          );
          // Continue with next document instead of failing completely
        }
      }

      logger.info(
        { query, found: documents.length, requested: maxDocs },
        'Jurisprudence search completed via Open Data API'
      );

      return documents;
    } catch (error) {
      logger.error(
        { error, query },
        'Error in searchJurisprudence via Open Data API'
      );
      // Return empty array on error (don't break workflow)
      return [];
    }
  }

  /**
   * Parse ECLI index XML response (Atom feed)
   * 
   * @param xml XML response string
   * @returns Array of ECLI results
   */
  private parseECLIIndexResponse(xml: string): ECLIResult[] {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      const results: ECLIResult[] = [];

      // Handle Atom feed format
      $('entry').each((_, elem) => {
        const $elem = $(elem);
        const id = $elem.find('id').text().trim(); // E.g., ECLI:NL:RBARN:1998:AA1005

        // Extract ECLI from ID
        const ecliMatch = id.match(/ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+/i);
        if (ecliMatch && ecliMatch[0]) {
          const ecli = this.normalizeECLI(ecliMatch[0]);
          if (ecli) {
            // Extract title parts
            const titleText = $elem.find('title').text().trim();
            // Title format often: ECLI:..., Court, Date, CaseNumber

            const updated = $elem.find('updated').text().trim();

            results.push({
              ecli,
              url: this.buildDocumentURL(ecli),
              title: titleText || undefined,
              court: this.extractCourtFromECLI(ecli),
              date: updated ? updated.split('T')[0] : undefined,
            });
          }
        }
      });

      if (results.length > 0) {
        return results;
      }

      // Legacy/Fallback parsing (kept for compatibility)
      // Strategy 1: Look for ECLI in RDF descriptions
      $('rdf\\:Description, Description').each((_, elem) => {
        const $elem = $(elem);
        const about = $elem.attr('rdf:about') || $elem.attr('about') || '';
        
        if (about.includes('ECLI:')) {
          const ecliMatch = about.match(/ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+/i);
          if (ecliMatch && ecliMatch[0]) {
            const ecli = this.normalizeECLI(ecliMatch[0]);
            if (ecli) {
              results.push({
                ecli,
                url: this.buildDocumentURL(ecli),
                title: $elem.find('dcterms\\:title, title').first().text().trim() || undefined,
                court: this.extractCourtFromECLI(ecli),
                date: $elem.find('dcterms\\:date, date, dcterms\\:issued, issued').first().text().trim() || undefined,
              });
            }
          }
        }
      });

      // Strategy 2 (formerly 3): Fallback - extract ECLI patterns from text content
      if (results.length === 0) {
        const ecliRegex = /ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+/gi;
        const matches = xml.match(ecliRegex);
        if (matches) {
          const uniqueECLIs = [...new Set(matches.map(m => this.normalizeECLI(m)).filter((e): e is string => !!e))];
          for (const ecli of uniqueECLIs) {
            results.push({
              ecli,
              url: this.buildDocumentURL(ecli),
              court: this.extractCourtFromECLI(ecli),
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error({ error }, 'Error parsing ECLI index XML');
      return [];
    }
  }

  /**
   * Normalize ECLI to standard format
   */
  private normalizeECLI(ecli: string): string | null {
    if (!ecli) return null;
    const match = ecli.match(/ECLI:NL:([A-Z0-9]{2,10}):(\d{4}):([A-Z0-9]+)/i);
    if (match) {
      return `ECLI:NL:${match[1].toUpperCase()}:${match[2]}:${match[3].toUpperCase()}`;
    }
    return null;
  }

  /**
   * Extract court identifier from ECLI
   */
  private extractCourtFromECLI(ecli: string): string | undefined {
    const match = ecli.match(/ECLI:NL:([A-Z0-9]{2,10}):/i);
    return match ? match[1].toUpperCase() : undefined;
  }

  /**
   * Parse document XML and map to DiscoveredDocument
   * 
   * Based on open-rechtspraak.xsd schema:
   * - Root: open-rechtspraak with rdf:RDF and rs:uitspraak or rs:conclusie
   * - Metadata in dcterms namespace (Dublin Core Terms)
   * - ECLI in ecli namespace
   * - Court/creator information in dcterms:creator
   * 
   * @param xml Document XML string
   * @param ecliResult ECLI metadata from index query
   * @returns DiscoveredDocument or null if parsing fails
   */
  private parseDocumentXML(
    xml: string,
    ecliResult: ECLIResult
  ): DiscoveredDocument | null {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });

      // Extract ECLI from document (validate against provided ECLI)
      const documentECLI = this.extractECLIFromXML($, xml) || ecliResult.ecli;
      if (!documentECLI) {
        logger.warn({ ecli: ecliResult.ecli }, 'Could not extract ECLI from document XML');
        return null;
      }

      // Extract title - according to schema, title is composed of ECLI + date + court
      // But we try to find explicit title first
      const title = 
        $('dcterms\\:title, title').first().text().trim() ||
        $('rdf\\:Description dcterms\\:title').first().text().trim() ||
        ecliResult.title ||
        `Jurisprudentie ${documentECLI}`;
      
      // Extract date - dcterms:date is the decision date, dcterms:issued is publication date
      const decisionDate = 
        $('dcterms\\:date, date').first().text().trim() ||
        $('rdf\\:Description dcterms\\:date').first().text().trim() ||
        ecliResult.date ||
        undefined;
      
      const publicationDate = 
        $('dcterms\\:issued, issued').first().text().trim() ||
        decisionDate ||
        undefined;

      // Extract court/creator - dcterms:creator contains the court information
      const creatorText = 
        $('dcterms\\:creator, creator').first().text().trim() ||
        $('rdf\\:Description dcterms\\:creator').first().text().trim() ||
        undefined;
      
      const court = 
        creatorText ||
        ecliResult.court ||
        this.extractCourtName(documentECLI);

      // Extract summary/abstract - dcterms:abstract or dcterms:description
      const summary = 
        $('dcterms\\:abstract, abstract').first().text().trim() ||
        $('dcterms\\:description, description').first().text().trim() ||
        $('rdf\\:Description dcterms\\:abstract').first().text().trim() ||
        undefined;

      // Extract document type from rs:uitspraak or rs:conclusie
      const documentType = 
        $('rs\\:uitspraak, uitspraak').length > 0 ? 'Uitspraak' :
        $('rs\\:conclusie, conclusie').length > 0 ? 'Conclusie' :
        this.inferDocumentType(court || this.extractCourtFromECLI(documentECLI));

      // Build document URL
      const url = ecliResult.url || this.buildDocumentURL(documentECLI);

      const document: DiscoveredDocument = {
        title: title.trim() || `Jurisprudentie ${documentECLI}`,
        url,
        summary: summary || undefined,
        documentCategory: 'jurisprudence',
        documentType: documentType || undefined,
        sourceType: 'RECHTSPRAAK',
        sourceId: documentECLI,
        issuingAuthority: court || this.extractCourtName(documentECLI),
        publicationDate: publicationDate || decisionDate,
        authorityScore: 0.9, // High authority score for official court decisions
        matchSignals: {
          keyword: undefined,
          semantic: undefined,
          metadata: undefined,
        },
        matchExplanation: `Jurisprudence found via Open Data API (ECLI: ${documentECLI})`,
        provenance: [{
          sourceType: 'RECHTSPRAAK',
          url,
          fetchedAt: new Date().toISOString(),
        }],
      };

      return document;
    } catch (error) {
      logger.error({ error, ecli: ecliResult.ecli }, 'Error parsing document XML');
      return null;
    }
  }

  /**
   * Extract ECLI from XML document
   */
  private extractECLIFromXML($: cheerio.CheerioAPI, xml: string): string | null {
    // Try to find ECLI in rdf:about attribute
    const aboutAttr = $('rdf\\:Description').first().attr('rdf:about') || 
                      $('rdf\\:Description').first().attr('about') || '';
    if (aboutAttr.includes('ECLI:')) {
      const match = aboutAttr.match(/ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+/i);
      if (match) return this.normalizeECLI(match[0]);
    }

    // Try to find ECLI in identifier element
    const identifier = $('dcterms\\:identifier, identifier').first().text().trim();
    if (identifier.includes('ECLI:')) {
      const match = identifier.match(/ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+/i);
      if (match) return this.normalizeECLI(match[0]);
    }

    // Fallback: search in entire XML
    const ecliRegex = /ECLI:NL:[A-Z0-9]{2,10}:\d{4}:[A-Z0-9]+/i;
    const match = xml.match(ecliRegex);
    if (match) return this.normalizeECLI(match[0]);

    return null;
  }

  /**
   * Build document URL from ECLI
   */
  private buildDocumentURL(ecli: string): string {
    // Format: https://uitspraken.rechtspraak.nl/inziendocument?id={ECLI}
    const normalizedECLI = ecli.startsWith('ECLI:') ? ecli : `ECLI:${ecli}`;
    return `https://uitspraken.rechtspraak.nl/inziendocument?id=${encodeURIComponent(normalizedECLI)}`;
  }

  /**
   * Extract court name from ECLI identifier
   */
  private extractCourtName(ecli: string): string | undefined {
    const match = ecli.match(/ECLI:NL:([A-Z0-9]{2,10}):/);
    if (!match) return undefined;

    const courtId = match[1];
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

    return courtNames[courtId] || courtId;
  }

  /**
   * Infer document type from court identifier
   */
  private inferDocumentType(court?: string): string | undefined {
    if (!court) return undefined;

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
