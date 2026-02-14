/**
 * Query Embedding Service
 * 
 * Implements query embedding generation for hybrid retrieval following
 * the recommendation from docs/improvements/01-hybrid-retrieval.md.
 * 
 * This service:
 * 1. Generates embeddings for search queries using LocalEmbeddingProvider
 * 2. Combines query components (query + onderwerp + thema)
 * 3. Optionally expands queries using QueryExpansionService
 * 4. Caches embeddings with LRU eviction and TTL (1 hour)
 * 5. Stores embeddings in workflow context for reuse
 * 
 * HOW IT WORKS:
 * 1. Combines query text with onderwerp and thema: "query onderwerp: {onderwerp} thema: {thema}"
 * 2. Optionally expands query using QueryExpansionService if expand=true
 * 3. Generates embedding using LocalEmbeddingProvider
 * 4. Caches result with hash-based key
 * 5. Returns embedding vector (384 dimensions for all-MiniLM-L6-v2)
 * 
 * TRIGGERING:
 * - Used in workflow action 'enhance-query' (workflowRoutes.ts)
 * - Can be called directly via embedQuery() method
 * 
 * TESTING:
 * - Generate embedding for simple query
 * - Generate embedding with onderwerp and thema
 * - Test query expansion integration
 * - Test caching (same query should use cache)
 * - Test with empty/null queries
 */

import { createHash } from 'crypto';
import { LocalEmbeddingProvider } from '../../query/VectorService.js';
import { QueryExpansionService } from '../../query/QueryExpansionService.js';
import { Cache } from '../../infrastructure/cache.js';

export interface QueryEmbeddingOptions {
  onderwerp?: string;
  thema?: string;
  expand?: boolean;
  workflowContext?: Record<string, unknown>; // For storing embedding in workflow context
}

export interface QueryEmbeddingResult {
  embedding: number[];
  queryText: string;
  expandedQuery?: string;
  cached: boolean;
}

/**
 * Query Embedding Service
 * 
 * Generates embeddings for search queries with optional expansion and caching.
 */
export interface EmbeddingProviderInterface {
  generateEmbedding(text: string): Promise<number[]>;
  init(): Promise<void>;
}

export class QueryEmbeddingService {
  private embeddingProvider: EmbeddingProviderInterface;
  private queryExpansionService: QueryExpansionService | null;
  private cache: Cache<number[]>;
  private cacheEnabled: boolean;
  private cacheSize: number;
  private cacheTTL: number; // in milliseconds

  constructor(
    queryExpansionService?: QueryExpansionService,
    cacheEnabled?: boolean,
    cacheSize?: number,
    cacheTTL?: number,
    embeddingProvider?: EmbeddingProviderInterface
  ) {
    this.embeddingProvider = embeddingProvider || new LocalEmbeddingProvider();
    this.queryExpansionService = queryExpansionService || null;
    
    // Read from environment variables with defaults
    this.cacheEnabled = cacheEnabled !== undefined 
      ? cacheEnabled 
      : process.env.QUERY_EMBEDDING_CACHE_ENABLED !== 'false'; // Default: true
    this.cacheSize = cacheSize !== undefined
      ? cacheSize
      : parseInt(process.env.QUERY_EMBEDDING_CACHE_SIZE || '1000', 10);
    this.cacheTTL = cacheTTL !== undefined
      ? cacheTTL
      : parseInt(process.env.QUERY_EMBEDDING_CACHE_TTL || '3600000', 10); // Default: 1 hour
    
    this.cache = new Cache<number[]>(this.cacheSize, this.cacheTTL);

    // Initialize embedding provider (lazy, but can preload)
    // Only init if no custom provider was provided (custom provider should handle its own init)
    if (!embeddingProvider) {
      this.embeddingProvider.init().catch(err => {
        console.warn('[QueryEmbeddingService] Failed to initialize embedding provider:', err);
      });
    }
  }

  /**
   * Generate embedding for a query
   * 
   * Supports two method signatures:
   * 1. embedQuery(query, onderwerp?, thema?, expand?) - matches requirements
   * 2. embedQuery(query, options) - flexible options object
   * 
   * @param query The base query text
   * @param onderwerpOrOptions Optional onderwerp string or options object
   * @param thema Optional thema string (if using first signature)
   * @param expand Optional expand boolean (if using first signature)
   * @returns Query embedding result with vector and metadata
   */
  async embedQuery(
    query: string,
    onderwerpOrOptions?: string | QueryEmbeddingOptions,
    thema?: string,
    expand?: boolean
  ): Promise<QueryEmbeddingResult> {
    // Handle both method signatures
    let onderwerp: string | undefined;
    let expandFlag: boolean;
    let workflowContext: Record<string, unknown> | undefined;

    if (typeof onderwerpOrOptions === 'string' || onderwerpOrOptions === undefined) {
      // First signature: embedQuery(query, onderwerp?, thema?, expand?)
      onderwerp = onderwerpOrOptions;
      expandFlag = expand || false;
      workflowContext = undefined;
    } else {
      // Second signature: embedQuery(query, options)
      const options = onderwerpOrOptions;
      onderwerp = options.onderwerp;
      thema = options.thema;
      expandFlag = options.expand || false;
      workflowContext = options.workflowContext;
    }

    // Handle empty queries gracefully
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    // Build combined query text
    const queryText = this.buildQueryText(query, onderwerp, thema);

    // Check cache first
    const cacheKey = this.getCacheKey(query, onderwerp, thema, expandFlag);
    if (this.cacheEnabled) {
      const cachedEmbedding = this.cache.getSync(cacheKey);
      if (cachedEmbedding) {
        // Store in workflow context if provided
        if (workflowContext) {
          workflowContext.queryEmbedding = cachedEmbedding;
        }
        return {
          embedding: cachedEmbedding,
          queryText,
          cached: true
        };
      }
    }

    // Optionally expand query
    let expandedQuery: string | undefined;
    let finalQueryText = queryText;

    if (expandFlag && this.queryExpansionService) {
      try {
        const expanded = await this.queryExpansionService.expandQuery({
          onderwerp: onderwerp || query,
          thema: thema || '',
          domain: this.detectDomain(query, onderwerp, thema)
        });

        // Use expanded terms to enhance query
        if (expanded.allTerms.length > 0) {
          expandedQuery = expanded.allTerms.join(' ');
          finalQueryText = this.buildQueryText(expandedQuery, onderwerp, thema);
        }
      } catch (err) {
        console.warn('[QueryEmbeddingService] Query expansion failed, using original query:', err);
        // Continue with original query if expansion fails
      }
    }

    // Generate embedding
    let embedding: number[];
    try {
      embedding = await this.embeddingProvider.generateEmbedding(finalQueryText);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to generate query embedding: ${errorMessage}`);
    }

    // Validate embedding
    if (!embedding || embedding.length === 0) {
      throw new Error('Generated embedding is empty');
    }

    // Cache the embedding (use original components for consistent key)
    if (this.cacheEnabled) {
      const finalCacheKey = this.getCacheKey(query, onderwerp, thema, expandFlag);
      this.cache.setSync(finalCacheKey, embedding);
    }

    // Store in workflow context if provided
    if (workflowContext) {
      workflowContext.queryEmbedding = embedding;
    }

    return {
      embedding,
      queryText: finalQueryText,
      expandedQuery,
      cached: false
    };
  }

  /**
   * Build combined query text from components
   * 
   * Format: "query onderwerp: {onderwerp} thema: {thema}"
   */
  private buildQueryText(query: string, onderwerp?: string, thema?: string): string {
    const parts: string[] = [query.trim()];

    if (onderwerp && onderwerp.trim().length > 0) {
      parts.push(`onderwerp: ${onderwerp.trim()}`);
    }

    if (thema && thema.trim().length > 0) {
      parts.push(`thema: ${thema.trim()}`);
    }

    return parts.join(' ');
  }

  /**
   * Generate cache key from query components and expansion flag
   * 
   * Uses SHA-256 hash for consistent cache keys.
   * Hashes query + onderwerp + thema + expand flag separately for explicit cache key strategy.
   */
  private getCacheKey(query: string, onderwerp?: string, thema?: string, expanded?: boolean): string {
    // Normalize components to handle special characters and ensure consistent hashing
    const normalizedQuery = (query || '').trim();
    const normalizedOnderwerp = (onderwerp || '').trim();
    const normalizedThema = (thema || '').trim();
    const expandFlag = expanded ? 'true' : 'false';
    
    // Create key data with explicit component separation
    const keyData = `${normalizedQuery}|onderwerp:${normalizedOnderwerp}|thema:${normalizedThema}|expanded:${expandFlag}`;
    
    // Use SHA-256 for consistent hashing (handles special characters automatically)
    return createHash('sha256').update(keyData).digest('hex');
  }

  /**
   * Detect domain from query components
   * 
   * Used for query expansion domain detection.
   */
  private detectDomain(query: string, onderwerp?: string, thema?: string): 'planning' | 'housing' | 'policy' | 'general' {
    const text = `${query} ${onderwerp || ''} ${thema || ''}`.toLowerCase();

    // Domain keywords (matching QueryExpansionService logic)
    const planningKeywords = ['planning', 'bestemmingsplan', 'ruimtelijk', 'stedenbouw', 'omgevingswet', 'bodem'];
    const housingKeywords = ['huisvesting', 'woning', 'woonruimte', 'accommodatie', 'arbeidsmigranten'];
    const policyKeywords = ['beleid', 'regelgeving', 'nota', 'richtlijn', 'verordening'];

    if (planningKeywords.some(kw => text.includes(kw))) return 'planning';
    if (housingKeywords.some(kw => text.includes(kw))) return 'housing';
    if (policyKeywords.some(kw => text.includes(kw))) return 'policy';

    return 'general';
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate?: number; enabled: boolean; ttl: number } {
    const stats = this.cache.getStats();
    return {
      ...stats,
      enabled: this.cacheEnabled,
      ttl: this.cacheTTL
    };
  }

  /**
   * Clean expired cache entries
   * 
   * Returns number of entries cleaned.
   */
  async cleanExpiredCache(): Promise<number> {
    return await this.cache.cleanExpired();
  }
}
