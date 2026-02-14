/**
 * Document Identifier Matching Service
 * 
 * Matches documents across different identifier formats using normalization adapters.
 * 
 * @see docs/21-issues/WI-DOCUMENT-IDENTITY-001-document-identifier-matching.md
 */

import { logger } from '../../utils/logger.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import type { DocumentIdentifier, IdentifierNormalizer } from '../../contracts/documentIdentifier.js';
import { UrlIdentifierNormalizer } from './UrlIdentifierNormalizer.js';
import { DsoIdentifierNormalizer } from './DsoIdentifierNormalizer.js';
import { RechtspraakIdentifierNormalizer } from './RechtspraakIdentifierNormalizer.js';
import { WetgevingIdentifierNormalizer } from './WetgevingIdentifierNormalizer.js';
import { GemeenteIdentifierNormalizer } from './GemeenteIdentifierNormalizer.js';
import type { CanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';

interface CacheEntry {
  document: CanonicalDocument | null;
  cachedAt: number;
}

interface RetryConfig {
  maxRetries: number;
  retryDelay: number; // milliseconds
  backoffMultiplier: number;
  maxDelay: number; // milliseconds
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 100, // Start with 100ms
  backoffMultiplier: 2,
  maxDelay: 2000, // Max 2 seconds
};

/**
 * Check if an error is retryable (transient database error)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // MongoDB/Mongoose retryable errors
  const retryablePatterns = [
    'timeout',
    'connection',
    'network',
    'econnreset',
    'etimedout',
    'econnrefused',
    'socket',
    'pool',
    'transient',
    'temporary',
    'server selection',
    'topology',
    'mongonetworkerror',
    'mongoservererror',
  ];

  return retryablePatterns.some(pattern => 
    errorMessage.includes(pattern) || errorName.includes(pattern)
  );
}

/**
 * Execute an operation with retry logic for transient errors
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string
): Promise<T> {
  let lastError: Error | unknown;
  let delay = config.retryDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable and we haven't exceeded max retries
      if (attempt < config.maxRetries && isRetryableError(error)) {
        logger.debug(
          {
            attempt: attempt + 1,
            maxRetries: config.maxRetries + 1,
            delay,
            context,
            error: error instanceof Error ? error.message : String(error),
          },
          'Retrying operation after transient error'
        );

        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        continue;
      }

      // Non-retryable error or max retries reached
      throw error;
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

export class DocumentIdentifierMatchingService {
  private normalizers: IdentifierNormalizer[] = [];
  private documentService: CanonicalDocumentService;
  private retryConfig: RetryConfig;
  
  // Cache for document lookups (identifier -> document)
  private documentCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  
  // Metrics for monitoring
  private metrics = {
    totalLookups: 0,
    cacheHits: 0,
    cacheMisses: 0,
    successfulMatches: 0,
    failedMatches: 0,
    normalizationErrors: 0,
    retryAttempts: 0,
  };
  
  constructor(documentService: CanonicalDocumentService, retryConfig?: Partial<RetryConfig>) {
    this.documentService = documentService;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    
    // Register normalizers (order matters - more specific first)
    this.normalizers = [
      new DsoIdentifierNormalizer(),
      new WetgevingIdentifierNormalizer(),
      new RechtspraakIdentifierNormalizer(),
      new GemeenteIdentifierNormalizer(),
      new UrlIdentifierNormalizer(), // Most generic, should be last
    ];
  }
  
  /**
   * Find canonical document by any identifier format
   * 
   * Tries multiple matching strategies:
   * 1. Direct sourceId match (if source can be determined)
   * 2. URL match (canonicalUrl, sourceMetadata.legacyUrl)
   * 3. Alternate identifier match (AKN, IMRO, ECLI)
   * 4. Content fingerprint match (fallback)
   * 
   * @param identifier - Any identifier format (URL, sourceId, ECLI, etc.)
   * @returns Canonical document or null if not found
   */
  async findDocument(identifier: string): Promise<CanonicalDocument | null> {
    this.metrics.totalLookups++;
    
    if (!identifier || typeof identifier !== 'string' || identifier.trim().length === 0) {
      logger.warn({ identifier }, 'Invalid identifier provided to findDocument');
      return null;
    }
    
    const trimmedIdentifier = identifier.trim();
    
    // Check cache first
    const cached = this.documentCache.get(trimmedIdentifier);
    const now = Date.now();
    if (cached && (now - cached.cachedAt) < this.CACHE_TTL_MS) {
      this.metrics.cacheHits++;
      logger.debug({ identifier: trimmedIdentifier }, 'Cache hit for identifier');
      return cached.document;
    }
    this.metrics.cacheMisses++;
    
    // Step 1: Normalize identifier
    let normalized: DocumentIdentifier | null;
    try {
      normalized = this.normalizeIdentifier(trimmedIdentifier);
    } catch (error) {
      this.metrics.normalizationErrors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ 
        error: errorMessage, 
        identifier: trimmedIdentifier,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      }, 'Error normalizing identifier');
      return null;
    }
    
    if (!normalized) {
      logger.debug({ identifier: trimmedIdentifier }, 'Could not normalize identifier');
      // Cache null result to avoid repeated normalization attempts
      this.documentCache.set(trimmedIdentifier, { document: null, cachedAt: now });
      return null;
    }
    
    logger.debug({ 
      identifier: trimmedIdentifier, 
      normalized: {
        source: normalized.source,
        sourceId: normalized.sourceId,
        hasCanonicalUrl: !!normalized.canonicalUrl,
        alternateCount: normalized.alternateIdentifiers?.length || 0,
      }
    }, 'Normalized identifier');
    
    // Step 2: Try direct sourceId match
    if (normalized.sourceId) {
      try {
        const bySourceId = await withRetry(
          async () => {
            const result = await this.documentService.findByQuery({
              source: normalized.source,
              sourceId: normalized.sourceId,
            }, { limit: 1 });
            return (result as unknown as CanonicalDocument[]) || [];
          },
          this.retryConfig,
          `findDocument by sourceId: ${trimmedIdentifier}`
        );
        
        if (bySourceId.length > 0) {
          this.metrics.successfulMatches++;
          const document = bySourceId[0];
          // Cache the result
          this.documentCache.set(trimmedIdentifier, { document, cachedAt: now });
          logger.debug({ 
            identifier: trimmedIdentifier, 
            matchedBy: 'sourceId',
            documentId: document._id 
          }, 'Found document by sourceId');
          return document;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn({ 
          error: errorMessage, 
          identifier: trimmedIdentifier,
          strategy: 'sourceId',
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }, 'Error finding document by sourceId');
      }
    }
    
    // Step 3: Try URL match
    if (normalized.canonicalUrl) {
      try {
        const byUrl = await withRetry(
          () => this.documentService.findByUrl(normalized.canonicalUrl!),
          this.retryConfig,
          `findDocument by URL: ${trimmedIdentifier}`
        );
        if (byUrl) {
          this.metrics.successfulMatches++;
          // Cache the result
          this.documentCache.set(trimmedIdentifier, { document: byUrl, cachedAt: now });
          logger.debug({ 
            identifier: trimmedIdentifier, 
            matchedBy: 'canonicalUrl',
            documentId: byUrl._id 
          }, 'Found document by URL');
          return byUrl;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn({ 
          error: errorMessage, 
          identifier: trimmedIdentifier,
          strategy: 'canonicalUrl',
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }, 'Error finding document by URL');
      }
    }
    
    // Step 4: Try alternate identifier match
    if (normalized.alternateIdentifiers && normalized.alternateIdentifiers.length > 0) {
      for (const altId of normalized.alternateIdentifiers) {
        try {
          // Search in sourceMetadata for alternate identifiers
          // Try different metadata paths where alternate identifiers might be stored
          const searchPaths = [
            `sourceMetadata.${altId.source}`,
            `sourceMetadata.discovery.${altId.source}`,
            `sourceMetadata.alternateIdentifiers.${altId.source}`,
          ];
          
          for (const path of searchPaths) {
            const byAltId = await withRetry(
              async () => {
                const result = await this.documentService.findByQuery({
                  [`sourceMetadata.${path}`]: altId.identifier,
                } as any, { limit: 1 });
                return (result as unknown as CanonicalDocument[]) || [];
              },
              this.retryConfig,
              `findDocument by alternate identifier: ${trimmedIdentifier}`
            );
            
            if (byAltId.length > 0) {
              this.metrics.successfulMatches++;
              const document = byAltId[0];
              // Cache the result
              this.documentCache.set(trimmedIdentifier, { document, cachedAt: now });
              logger.debug({ 
                identifier: trimmedIdentifier, 
                matchedBy: 'alternateIdentifier',
                alternateSource: altId.source,
                documentId: document._id 
              }, 'Found document by alternate identifier');
              return document;
            }
          }
          
          // Also try searching by sourceId if alternate identifier matches sourceId pattern
          if (altId.source === 'AKN' || altId.source === 'IMRO') {
            const byAltSourceId = await withRetry(
              async () => {
                const result = await this.documentService.findByQuery({
                  source: 'DSO',
                  sourceId: altId.identifier,
                }, { limit: 1 });
                return (result as unknown as CanonicalDocument[]) || [];
              },
              this.retryConfig,
              `findDocument by alternate sourceId: ${trimmedIdentifier}`
            );
            
            if (byAltSourceId.length > 0) {
              this.metrics.successfulMatches++;
              const document = byAltSourceId[0];
              // Cache the result
              this.documentCache.set(trimmedIdentifier, { document, cachedAt: now });
              logger.debug({ 
                identifier: trimmedIdentifier, 
                matchedBy: 'alternateIdentifierAsSourceId',
                alternateSource: altId.source,
                documentId: document._id 
              }, 'Found document by alternate identifier as sourceId');
              return document;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn({ 
            error: errorMessage, 
            identifier: trimmedIdentifier, 
            altId,
            strategy: 'alternateIdentifier',
            errorType: error instanceof Error ? error.constructor.name : typeof error
          }, 'Error finding document by alternate identifier');
        }
      }
    }
    
    // Step 5: Try content fingerprint match (if provided)
    if (normalized.contentFingerprint) {
      try {
        const byFingerprint = await withRetry(
          async () => {
            const result = await this.documentService.findByQuery({
              contentFingerprint: normalized.contentFingerprint,
            }, { limit: 1 });
            return (result as unknown as CanonicalDocument[]) || [];
          },
          this.retryConfig,
          `findDocument by content fingerprint: ${trimmedIdentifier}`
        );
        
        if (byFingerprint.length > 0) {
          this.metrics.successfulMatches++;
          const document = byFingerprint[0];
          // Cache the result
          this.documentCache.set(trimmedIdentifier, { document, cachedAt: now });
          logger.debug({ 
            identifier: trimmedIdentifier, 
            matchedBy: 'contentFingerprint',
            documentId: document._id 
          }, 'Found document by content fingerprint');
          return document;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn({ 
          error: errorMessage, 
          identifier: trimmedIdentifier,
          strategy: 'contentFingerprint',
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }, 'Error finding document by content fingerprint');
      }
    }
    
    this.metrics.failedMatches++;
    // Cache null result to avoid repeated lookup attempts
    this.documentCache.set(trimmedIdentifier, { document: null, cachedAt: now });
    logger.debug({ identifier: trimmedIdentifier }, 'No matching document found');
    return null;
  }
  
  /**
   * Get performance metrics
   * 
   * @returns Current metrics snapshot
   */
  getMetrics(): {
    totalLookups: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    successfulMatches: number;
    failedMatches: number;
    successRate: number;
    normalizationErrors: number;
    cacheSize: number;
  } {
    const cacheHitRate = this.metrics.totalLookups > 0
      ? this.metrics.cacheHits / this.metrics.totalLookups
      : 0;
    
    const totalMatches = this.metrics.successfulMatches + this.metrics.failedMatches;
    const successRate = totalMatches > 0
      ? this.metrics.successfulMatches / totalMatches
      : 0;
    
    return {
      ...this.metrics,
      cacheHitRate,
      successRate,
      cacheSize: this.documentCache.size,
    };
  }
  
  /**
   * Clear the document cache
   * Useful for testing or when documents are updated
   */
  clearCache(): void {
    this.documentCache.clear();
    logger.debug('Document identifier matching cache cleared');
  }
  
  /**
   * Clean expired cache entries
   * Should be called periodically to prevent memory leaks
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.documentCache.entries()) {
      if (now - entry.cachedAt >= this.CACHE_TTL_MS) {
        this.documentCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug({ cleaned, remaining: this.documentCache.size }, 'Cleaned expired cache entries');
    }
  }
  
  /**
   * Normalize identifier using registered normalizers
   */
  private normalizeIdentifier(identifier: string): DocumentIdentifier | null {
    for (const normalizer of this.normalizers) {
      if (normalizer.canNormalize(identifier)) {
        const normalized = normalizer.normalize(identifier);
        if (normalized) {
          return normalized;
        }
      }
    }
    return null;
  }
  
  /**
   * Extract all possible identifiers from a canonical document
   * 
   * Useful for building identifier indexes or cross-referencing
   * 
   * @param document - Canonical document to extract identifiers from
   * @returns Array of all possible identifiers for this document
   */
  async extractAllIdentifiers(document: CanonicalDocument): Promise<DocumentIdentifier[]> {
    const identifiers: DocumentIdentifier[] = [];
    
    for (const normalizer of this.normalizers) {
      try {
        const extracted = normalizer.extractIdentifiers(document);
        identifiers.push(...extracted);
      } catch (error) {
        logger.warn({ error, documentId: document._id }, 'Error extracting identifiers from normalizer');
      }
    }
    
    // Deduplicate by (source, sourceId) combination
    const unique = new Map<string, DocumentIdentifier>();
    for (const id of identifiers) {
      const key = `${id.source}:${id.sourceId}`;
      if (!unique.has(key)) {
        unique.set(key, id);
      } else {
        // Merge alternate identifiers if they exist
        const existing = unique.get(key)!;
        if (id.alternateIdentifiers && existing.alternateIdentifiers) {
          const merged = new Map<string, string>();
          existing.alternateIdentifiers.forEach(alt => merged.set(alt.source, alt.identifier));
          id.alternateIdentifiers.forEach(alt => merged.set(alt.source, alt.identifier));
          existing.alternateIdentifiers = Array.from(merged.entries()).map(([source, identifier]) => ({ source, identifier }));
        } else if (id.alternateIdentifiers) {
          existing.alternateIdentifiers = id.alternateIdentifiers;
        }
        // Merge canonicalUrl if not present
        if (!existing.canonicalUrl && id.canonicalUrl) {
          existing.canonicalUrl = id.canonicalUrl;
        }
      }
    }
    
    return Array.from(unique.values());
  }
  
  /**
   * Find multiple documents by identifiers (batch processing)
   * 
   * Processes identifiers in parallel with concurrency limit for better performance.
   * 
   * @param identifiers - Array of identifier formats (URL, sourceId, ECLI, etc.)
   * @param options - Batch processing options
   * @returns Map of identifier -> document (or null if not found)
   */
  async findDocuments(
    identifiers: string[],
    options: {
      concurrency?: number; // Default: 10
      continueOnError?: boolean; // Default: true
    } = {}
  ): Promise<Map<string, CanonicalDocument | null>> {
    const { concurrency = 10, continueOnError = true } = options;
    const results = new Map<string, CanonicalDocument | null>();
    
    logger.debug({ 
      totalIdentifiers: identifiers.length, 
      concurrency 
    }, 'Starting batch document matching');
    
    // Process in batches with concurrency limit
    for (let i = 0; i < identifiers.length; i += concurrency) {
      const batch = identifiers.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (identifier) => {
        try {
          const document = await this.findDocument(identifier);
          return { identifier, document };
        } catch (error) {
          if (continueOnError) {
            logger.warn({ error, identifier }, 'Error in batch matching, continuing');
            return { identifier, document: null };
          }
          throw error;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const { identifier, document } of batchResults) {
        results.set(identifier, document);
      }
    }
    
    const foundCount = Array.from(results.values()).filter(doc => doc !== null).length;
    logger.debug({ 
      totalIdentifiers: identifiers.length,
      foundCount,
      notFoundCount: identifiers.length - foundCount
    }, 'Batch document matching completed');
    
    return results;
  }
  
  /**
   * Register a new identifier normalizer
   * 
   * @param normalizer - Normalizer to register
   * @param priority - Priority (lower = higher priority, checked first)
   */
  registerNormalizer(normalizer: IdentifierNormalizer, priority: number = 100): void {
    this.normalizers.splice(priority, 0, normalizer);
  }
  
  /**
   * Start periodic cache cleanup
   * Should be called at server startup
   * 
   * @param intervalMs - Cleanup interval in milliseconds (default: 10 minutes)
   */
  startCacheCleanup(intervalMs: number = 10 * 60 * 1000): NodeJS.Timeout {
    const interval = setInterval(() => {
      this.cleanExpiredCache();
    }, intervalMs);
    
    logger.info({ intervalMs }, 'Started periodic cache cleanup for document identifier matching');
    return interval;
  }
  
  /**
   * Stop periodic cache cleanup
   * 
   * @param intervalId - Interval ID returned from startCacheCleanup
   */
  stopCacheCleanup(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    logger.debug('Stopped periodic cache cleanup for document identifier matching');
  }
}

