import { google } from 'googleapis';
import { ScrapedDocument, DocumentType } from '../infrastructure/types.js';
import type { ImborService } from './imborService.js';
import { ServiceConfigurationError, ServiceConnectionError, ServiceRateLimitError } from '../../utils/serviceErrors.js';
import { retryWithBackoff } from '../../utils/retry.js';
import { logger } from '../../utils/logger.js';
import { getCircuitBreakerManager } from '../../config/httpClient.js';
import { getEnv } from '../../config/env.js';

/**
 * Rate limiter for Google Custom Search API
 * Free tier: 100 queries per day
 * Paid tier: 10,000 queries per day
 * We'll use a conservative limit of 90 queries per day to stay safe
 */
class GoogleSearchRateLimiter {
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerDay = 90;
  private readonly windowMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check if we can make a request
   * Returns true if under limit, false if rate limited
   */
  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove timestamps older than 24 hours
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );

    return this.requestTimestamps.length < this.maxRequestsPerDay;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Get remaining requests for today
   */
  getRemainingRequests(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );
    return Math.max(0, this.maxRequestsPerDay - this.requestTimestamps.length);
  }
}

/**
 * Query validation and optimization utilities
 * Exported for testing purposes
 */
export class QueryOptimizer {
  /**
   * Validates a search query
   * @param query - The query to validate
   * @returns Validation result with isValid flag and error message if invalid
   */
  static validateQuery(query: string): { isValid: boolean; error?: string } {
    if (!query || typeof query !== 'string') {
      return { isValid: false, error: 'Query must be a non-empty string' };
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { isValid: false, error: 'Query cannot be empty' };
    }

    // Google Custom Search API has a maximum query length of 2048 characters
    if (trimmed.length > 2048) {
      return { isValid: false, error: 'Query exceeds maximum length of 2048 characters' };
    }

    // Check for invalid characters that could break the API
    const invalidChars = /[<>{}[\]\\]/;
    if (invalidChars.test(trimmed)) {
      return { isValid: false, error: 'Query contains invalid characters' };
    }

    return { isValid: true };
  }

  /**
   * Sanitizes and optimizes a search query
   * @param query - The raw query string
   * @returns Optimized query string
   */
  static optimizeQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '';
    }

    // Remove extra whitespace
    let optimized = query.trim().replace(/\s+/g, ' ');

    // Remove special characters that don't help search (but keep operators)
    // Keep: +, -, ", |, (, ), site:, filetype:, etc.
    optimized = optimized.replace(/[^\w\s+\-"|():]/g, ' ');

    // Normalize quotes (convert smart quotes to regular quotes)
    optimized = optimized.replace(/[""]/g, '"').replace(/['']/g, "'");

    // Remove empty parentheses
    optimized = optimized.replace(/\(\s*\)/g, '');

    // Clean up multiple spaces again
    optimized = optimized.replace(/\s+/g, ' ').trim();

    return optimized;
  }

  /**
   * Constructs an optimized query from multiple terms
   * @param terms - Array of search terms
   * @param options - Query construction options
   * @returns Optimized query string
   */
  static constructQuery(
    terms: string[],
    options?: {
      useQuotes?: boolean; // Use quotes for exact phrases
      usePlus?: boolean; // Use + operator for required terms
      maxTerms?: number; // Maximum number of terms to include
    }
  ): string {
    if (!terms || terms.length === 0) {
      return '';
    }

    // Filter and optimize terms
    const validTerms = terms
      .filter(term => term && typeof term === 'string' && term.trim().length > 0)
      .map(term => this.optimizeQuery(term.trim()))
      .filter(term => term.length > 0);

    if (validTerms.length === 0) {
      return '';
    }

    // Limit number of terms if specified
    const limitedTerms = options?.maxTerms
      ? validTerms.slice(0, options.maxTerms)
      : validTerms;

    // Construct query based on options
    if (options?.useQuotes && limitedTerms.length === 1) {
      // Single term: use quotes for exact phrase
      return `"${limitedTerms[0]}"`;
    } else if (options?.usePlus) {
      // Use + operator for required terms
      return limitedTerms.map(term => `+${term}`).join(' ');
    } else {
      // Default: join terms with spaces
      return limitedTerms.join(' ');
    }
  }

  /**
   * Enhances query with context terms
   * @param baseQuery - Base search query
   * @param contextTerms - Additional context terms to include
   * @returns Enhanced query string
   */
  static enhanceWithContext(baseQuery: string, contextTerms: string[]): string {
    const base = this.optimizeQuery(baseQuery);
    if (!base) {
      return this.constructQuery(contextTerms);
    }

    const context = this.constructQuery(contextTerms, { maxTerms: 3 });
    if (!context) {
      return base;
    }

    // Add context terms in parentheses for grouping
    return `${base} (${context})`;
  }
}

export class GoogleSearchService {
  private apiKey: string | null = null;
  private searchEngineId: string | null = null;
  private customsearch;
  private imborService: ImborService | null = null;
  private rateLimiter: GoogleSearchRateLimiter;

  constructor() {
    // Use getEnv() to get API keys from .env file (same as the rest of the application)
    // This ensures consistency across the codebase - getEnv() loads from .env via dotenv
    const env = getEnv();
    this.apiKey = env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY || null;
    this.searchEngineId = env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID || null;
    this.rateLimiter = new GoogleSearchRateLimiter();

    if (!this.apiKey || !this.searchEngineId) {
      const missingConfig: string[] = [];
      if (!this.apiKey) missingConfig.push('GOOGLE_CUSTOM_SEARCH_JSON_API_KEY');
      if (!this.searchEngineId) missingConfig.push('GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID');
      
      logger.warn(
        { missingConfig },
        'Google Custom Search credentials not configured'
      );
    } else {
      logger.debug('Google Custom Search API configured');
    }

    this.customsearch = google.customsearch('v1');
  }

  /**
   * Set IMBOR service for enhanced queries
   */
  setImborService(imborService: ImborService): void {
    this.imborService = imborService;
  }

  /**
   * Check if Google Search is configured
   * @returns true if configured, false otherwise
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.searchEngineId);
  }

  /**
   * Validate Google Search configuration
   * @throws ServiceConfigurationError if not configured
   */
  validateConfiguration(): void {
    if (!this.apiKey || !this.searchEngineId) {
      const missingConfig: string[] = [];
      if (!this.apiKey) missingConfig.push('GOOGLE_CUSTOM_SEARCH_JSON_API_KEY');
      if (!this.searchEngineId) missingConfig.push('GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID');
      throw new ServiceConfigurationError('GoogleSearchService', missingConfig);
    }
  }

  /**
   * Search Google Custom Search API with retry logic
   * Uses centralized retry utility with exponential backoff
   */
  private async searchWithRetry(
    params: {
      key: string;
      cx: string;
      q: string;
      num: number;
      lr: string;
      cr: string;
    }
  ): Promise<unknown> {
    const circuitBreakerManager = getCircuitBreakerManager();
    const breaker = circuitBreakerManager.getBreaker('google-search-api');

    return breaker.execute(() =>
      retryWithBackoff(
        async () => {
          try {
            return await this.customsearch.cse.list(params);
          } catch (error: unknown) {
            // Check for rate limit errors
            const statusCode =
              (error as { code?: number; response?: { status?: number }; status?: number })?.code ||
              (error as { code?: number; response?: { status?: number }; status?: number })?.response?.status ||
              (error as { code?: number; response?: { status?: number }; status?: number })?.status;
            const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

            if (statusCode === 429) {
              const retryAfter = (error as { response?: { headers?: { 'retry-after'?: string } } })?.response?.headers?.['retry-after'];
              const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
              throw new ServiceRateLimitError('GoogleSearchService', retryAfterSeconds);
            }

            if (statusCode && statusCode >= 400 && statusCode < 500) {
              throw new ServiceConnectionError('GoogleSearchService', statusCode, `Client error: ${errorMessage}`);
            }

            if (statusCode && statusCode >= 500 && statusCode < 600) {
              throw new ServiceConnectionError('GoogleSearchService', statusCode, `Server error: ${errorMessage}`);
            }

            // For other errors, throw as connection error
            throw new ServiceConnectionError(
              'GoogleSearchService',
              undefined,
              error instanceof Error ? error.message : String(error)
            );
          }
        },
        {
          maxAttempts: 4,
          initialDelay: 1000,
          maxDelay: 30000,
          multiplier: 2,
        },
        `GoogleSearchService.search for query: ${params.q}`
      )
    );
  }

  /**
   * Search Google Custom Search API with enhanced queries
   */
  async search(
    query: string,
    options?: {
      siteRestrict?: string[];
      excludeSites?: string[];
      numResults?: number;
      filetype?: string;
    }
  ): Promise<ScrapedDocument[]> {
    // Check configuration (non-throwing for backward compatibility)
    if (!this.isConfigured()) {
      logger.warn({ query }, 'Google Custom Search not configured. Skipping Google search.');
      return [];
    }

    // Check rate limiting
    if (!this.rateLimiter.canMakeRequest()) {
      const remaining = this.rateLimiter.getRemainingRequests();
      logger.warn(
        { query, remaining },
        'Google Search API rate limit reached. Skipping search.'
      );
      return [];
    }

    const documents: ScrapedDocument[] = [];

    try {
      // Validate query
      const validation = QueryOptimizer.validateQuery(query);
      if (!validation.isValid) {
        logger.error(
          { query, validationError: validation.error },
          'Invalid Google Search query'
        );
        return [];
      }

      // Optimize the base query
      let searchQuery = QueryOptimizer.optimizeQuery(query);

      // Add filetype restriction if specified
      if (options?.filetype) {
        const filetype = options.filetype.toLowerCase().replace(/^\./, ''); // Remove leading dot if present
        searchQuery = `filetype:${filetype} ${searchQuery}`;
      }

      // Add site restrictions with proper grouping
      if (options?.siteRestrict && options.siteRestrict.length > 0) {
        // Optimize site URLs (remove protocol, trailing slashes)
        const optimizedSites = options.siteRestrict.map(site => {
          let optimized = site.trim();
          // Remove protocol
          optimized = optimized.replace(/^https?:\/\//, '');
          // Remove trailing slash
          optimized = optimized.replace(/\/$/, '');
          // Remove www. prefix for cleaner site: queries
          optimized = optimized.replace(/^www\./, '');
          return optimized;
        }).filter(site => {
          // Filter out invalid domains (must have at least one dot for TLD)
          return site.length > 0 && site.includes('.') && !site.includes(' ');
        });

        if (optimizedSites.length > 0) {
          // Use OR for multiple sites, group in parentheses
          if (optimizedSites.length === 1) {
            searchQuery = `${searchQuery} site:${optimizedSites[0]}`;
          } else {
            // Limit to 10 sites to avoid query length issues
            const limitedSites = optimizedSites.slice(0, 10);
            const siteFilters = limitedSites.map(site => `site:${site}`).join(' OR ');
            searchQuery = `${searchQuery} (${siteFilters})`;
          }
        }
      }

      // Execute the search with retry logic for rate limit errors (429)
      // Note: Using 'key' parameter instead of 'auth' for API key authentication
      // 'auth' is for OAuth2, 'key' is for API keys in googleapis library
      const response = await this.searchWithRetry({
        key: this.apiKey!,
        cx: this.searchEngineId!,
        q: searchQuery,
        num: options?.numResults || 10,
        lr: 'lang_nl', // Dutch language results
        cr: 'countryNL' // Netherlands focus
      });

      // Record the request for rate limiting
      this.rateLimiter.recordRequest();

      const typedResponse = response as { data?: { items?: unknown[] } };
      const items = typedResponse.data?.items || [];

      // Improved error handling for empty results
      if (items.length === 0) {
        logger.debug(
          { query, siteRestrict: options?.siteRestrict },
          'Google Search returned no results - may indicate no matching documents, query too specific, site restrictions too narrow, or API quota issues'
        );
        return [];
      }

      for (const item of items as Array<{ link?: string; title?: string; displayLink?: string; snippet?: string }>) {
        // Skip excluded sites
        if (options?.excludeSites) {
          const isExcluded = options.excludeSites.some(site =>
            item.link?.includes(site)
          );
          if (isExcluded) continue;
        }

        documents.push({
          titel: item.title || 'Untitled',
          url: item.link || '',
          website_url: this.extractDomain(item.link || ''),
          website_titel: item.displayLink || '',
          samenvatting: item.snippet || '',
          type_document: this.determineDocumentType(item.link || ''),
          publicatiedatum: null
        });
      }

      const remaining = this.rateLimiter.getRemainingRequests();
      logger.info(
        { query, documentCount: documents.length, remainingRequests: remaining },
        'Google Search completed'
      );
    } catch (error) {
      // Handle service error types
      if (error instanceof ServiceRateLimitError) {
        logger.warn(
          { query, retryAfterSeconds: error.retryAfterSeconds },
          'Google Search API rate limit exceeded'
        );
        // Return empty array for rate limit (already handled by retry logic)
        return [];
      }
      
      if (error instanceof ServiceConnectionError) {
        logger.error(
          { query, statusCode: error.statusCode, error: error.message },
          'Google Search API connection failed'
        );
        // Return empty array for connection errors (graceful degradation)
        return [];
      }
      
      if (error instanceof ServiceConfigurationError) {
        logger.error(
          { query, missingConfig: error.missingConfig },
          'Google Search API not configured'
        );
        // Return empty array for configuration errors (graceful degradation)
        return [];
      }
      
      // Log other errors
      logger.error(
        { query, error: error instanceof Error ? error.message : String(error) },
        'Error performing Google Custom Search'
      );
    }

    return documents;
  }

  /**
   * Search with government focus and IMBOR enhancement
   */
  async searchGovernmentSources(
    onderwerp: string,
    thema: string,
    overheidslaag: string
  ): Promise<ScrapedDocument[]> {
    // Get enhanced terms from IMBOR if available
    let queryTerms: string[] = [];
    const contextTerms: string[] = [];

    if (this.imborService) {
      const enhanced = this.imborService.enhanceQuery(onderwerp, thema);
      if (enhanced?.enhancedTerms) {
        queryTerms = enhanced.enhancedTerms;
        logger.debug(
          { onderwerp, thema, enhancedTerms: queryTerms },
          'Using IMBOR-enhanced terms'
        );
      } else {
        // Fallback to original terms
        queryTerms = [onderwerp, thema].filter(t => t && t.trim().length > 0);
      }
    } else {
      queryTerms = [onderwerp, thema].filter(t => t && t.trim().length > 0);
    }

    // Add government layer as context
    if (overheidslaag && overheidslaag.trim().length > 0) {
      contextTerms.push(overheidslaag.trim());
    }

    // Build optimized query with context
    const baseQuery = QueryOptimizer.constructQuery(queryTerms, {
      maxTerms: 5, // Limit to top 5 most relevant terms
      useQuotes: false // Don't force exact phrases for flexibility
    });

    const query = contextTerms.length > 0
      ? QueryOptimizer.enhanceWithContext(baseQuery, contextTerms)
      : baseQuery;

    // Common Dutch government domains
    const governmentSites = [
      'rijksoverheid.nl',
      'overheid.nl',
      'officielebekendmakingen.nl',
      'iplo.nl',
      'denhaag.nl',
      'amsterdam.nl',
      'rotterdam.nl',
      'utrecht.nl',
      'groningen.nl',
      'eindhoven.nl'
    ];

    // Search for web pages
    const webDocs = await this.search(query, {
      siteRestrict: governmentSites,
      numResults: 10
    });

    // Also search specifically for PDFs
    const pdfDocs = await this.search(query, {
      siteRestrict: governmentSites,
      numResults: 10,
      filetype: 'pdf'
    });

    // Combine and deduplicate
    const allDocs = [...webDocs, ...pdfDocs];
    return this.deduplicateDocuments(allDocs);
  }

  /**
   * Search specific websites
   */
  async searchSpecificSites(
    query: string,
    websites: string[]
  ): Promise<ScrapedDocument[]> {
    return this.search(query, {
      siteRestrict: websites,
      numResults: 10
    });
  }

  /**
   * Normalize URL for deduplication
   * Removes trailing slashes, query parameters, and fragments
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove query parameters and fragments
      urlObj.search = '';
      urlObj.hash = '';
      // Remove trailing slash
      let normalized = urlObj.toString();
      if (normalized.endsWith('/') && normalized.length > urlObj.protocol.length + urlObj.hostname.length + 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized.toLowerCase();
    } catch {
      // If URL parsing fails, return lowercase version without trailing slash
      return url.toLowerCase().replace(/\/$/, '').split('?')[0].split('#')[0];
    }
  }

  /**
   * Calculate string similarity using Jaccard similarity (token-based)
   * Returns a value between 0 and 1, where 1 is identical
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    // Normalize strings
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalized1 = normalize(str1);
    const normalized2 = normalize(str2);

    if (normalized1 === normalized2) return 1;

    // Tokenize into words
    const tokens1 = new Set(normalized1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(normalized2.split(/\s+/).filter(t => t.length > 0));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    // Calculate Jaccard similarity (intersection / union)
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate deduplication score for a document
   * Higher score = better quality, should be kept over duplicates
   */
  private calculateDocumentScore(doc: ScrapedDocument): number {
    let score = 0;

    // Base score: 1.0
    score = 1.0;

    // Boost for having a title
    if (doc.titel && doc.titel.trim().length > 0) {
      score += 0.2;
      // Boost for longer, more descriptive titles
      if (doc.titel.length > 20) score += 0.1;
    }

    // Boost for having a summary
    if (doc.samenvatting && doc.samenvatting.trim().length > 0) {
      score += 0.2;
      // Boost for longer summaries
      if (doc.samenvatting.length > 50) score += 0.1;
    }

    // Boost for having document type
    if (doc.type_document && doc.type_document !== 'Webpagina') {
      score += 0.1;
    }

    // Boost for having publication date
    if (doc.publicatiedatum) {
      score += 0.1;
    }

    // Boost for having website information
    if (doc.website_titel && doc.website_titel.trim().length > 0) {
      score += 0.1;
    }

    return score;
  }

  /**
   * Merge two documents, keeping the best information from both
   */
  private mergeDocuments(primary: ScrapedDocument, secondary: ScrapedDocument): ScrapedDocument {
    return {
      titel: primary.titel || secondary.titel || 'Untitled',
      url: primary.url || secondary.url,
      website_url: primary.website_url || secondary.website_url,
      website_titel: primary.website_titel || secondary.website_titel,
      samenvatting: primary.samenvatting || secondary.samenvatting || '',
      type_document: primary.type_document || secondary.type_document || 'Webpagina',
      publicatiedatum: primary.publicatiedatum || secondary.publicatiedatum || null
    };
  }

  /**
   * Remove duplicate documents using multiple strategies:
   * 1. URL normalization (exact match after normalization)
   * 2. Title similarity (high similarity threshold)
   * 3. Content similarity (snippet similarity)
   * 
   * When duplicates are found, keeps the document with the highest score
   */
  private deduplicateDocuments(documents: ScrapedDocument[]): ScrapedDocument[] {
    if (documents.length === 0) return [];

    // Configuration thresholds
    const TITLE_SIMILARITY_THRESHOLD = 0.8; // 80% similarity
    const SNIPPET_SIMILARITY_THRESHOLD = 0.7; // 70% similarity

    // Step 1: Group by normalized URL
    const urlGroups = new Map<string, ScrapedDocument[]>();
    for (const doc of documents) {
      const normalizedUrl = this.normalizeUrl(doc.url);
      if (!urlGroups.has(normalizedUrl)) {
        urlGroups.set(normalizedUrl, []);
      }
      urlGroups.get(normalizedUrl)!.push(doc);
    }

    // Step 2: Deduplicate within each URL group (keep highest score)
    const deduplicatedByUrl: ScrapedDocument[] = [];
    for (const group of urlGroups.values()) {
      if (group.length === 1) {
        deduplicatedByUrl.push(group[0]);
      } else {
        // Multiple documents with same normalized URL - keep the one with highest score
        const scored = group.map(doc => ({
          doc,
          score: this.calculateDocumentScore(doc)
        }));
        scored.sort((a, b) => b.score - a.score);
        
        // Merge all documents in the group, prioritizing the highest-scored one
        let merged = scored[0].doc;
        for (let i = 1; i < scored.length; i++) {
          merged = this.mergeDocuments(merged, scored[i].doc);
        }
        deduplicatedByUrl.push(merged);
      }
    }

    // Step 3: Check for duplicates by title similarity
    const deduplicatedByTitle: ScrapedDocument[] = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < deduplicatedByUrl.length; i++) {
      if (processedIndices.has(i)) continue;

      const current = deduplicatedByUrl[i];
      const duplicates: number[] = [i];

      // Find documents with similar titles
      for (let j = i + 1; j < deduplicatedByUrl.length; j++) {
        if (processedIndices.has(j)) continue;

        const other = deduplicatedByUrl[j];
        const titleSimilarity = this.calculateStringSimilarity(
          current.titel || '',
          other.titel || ''
        );

        if (titleSimilarity >= TITLE_SIMILARITY_THRESHOLD) {
          // Also check snippet similarity to confirm
          const snippetSimilarity = this.calculateStringSimilarity(
            current.samenvatting || '',
            other.samenvatting || ''
          );

          if (snippetSimilarity >= SNIPPET_SIMILARITY_THRESHOLD) {
            duplicates.push(j);
            processedIndices.add(j);
          }
        }
      }

      // Keep the document with highest score from duplicates
      if (duplicates.length === 1) {
        deduplicatedByTitle.push(current);
      } else {
        const duplicateDocs = duplicates.map(idx => deduplicatedByUrl[idx]);
        const scored = duplicateDocs.map(doc => ({
          doc,
          score: this.calculateDocumentScore(doc)
        }));
        scored.sort((a, b) => b.score - a.score);

        // Merge all duplicates, prioritizing the highest-scored one
        let merged = scored[0].doc;
        for (let i = 1; i < scored.length; i++) {
          merged = this.mergeDocuments(merged, scored[i].doc);
        }
        deduplicatedByTitle.push(merged);
      }

      processedIndices.add(i);
    }

    return deduplicatedByTitle;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      return url;
    }
  }

  /**
   * Determine document type from URL
   */
  private determineDocumentType(url: string): DocumentType {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('.pdf')) return 'PDF';
    if (lowerUrl.includes('.doc') || lowerUrl.includes('.docx')) return 'Beleidsdocument';
    if (lowerUrl.includes('nieuws') || lowerUrl.includes('news')) return 'Beleidsdocument';
    if (lowerUrl.includes('beleid') || lowerUrl.includes('policy')) return 'Beleidsdocument';
    if (lowerUrl.includes('rapport') || lowerUrl.includes('report')) return 'Rapport';
    if (lowerUrl.includes('verordening') || lowerUrl.includes('regelgeving')) return 'Verordening';
    if (lowerUrl.includes('omgevingsvisie')) return 'Omgevingsvisie';
    if (lowerUrl.includes('omgevingsplan')) return 'Omgevingsplan';
    if (lowerUrl.includes('bestemmingsplan')) return 'Bestemmingsplan';
    if (lowerUrl.includes('structuurvisie')) return 'Structuurvisie';
    if (lowerUrl.includes('besluit')) return 'Besluit';

    return 'Webpagina';
  }
  /**
   * Cross-reference a URL to see if it's indexed or find related pages
   */
  async crossReferenceUrl(url: string): Promise<ScrapedDocument[]> {
    if (!this.apiKey || !this.searchEngineId) {
      return [];
    }

    logger.debug({ url }, 'Cross-referencing URL');

    // Search for the URL itself to see if it's indexed
    const indexedDocs = await this.search(`site:${url}`, { numResults: 1 });

    // Search for related pages
    const relatedDocs = await this.search(`related:${url}`, { numResults: 5 });

    return [...indexedDocs, ...relatedDocs];
  }
}
