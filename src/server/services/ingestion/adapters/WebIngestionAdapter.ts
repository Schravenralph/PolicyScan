/**
 * Web Ingestion Adapter
 * 
 * Fetches raw documents from web sources (scraping, URLs, etc.).
 * This adapter only handles ingestion - parsing is handled by the parsing layer.
 */

import crypto from 'crypto';
import type { IIngestionAdapter } from '../interfaces/IIngestionAdapter.js';
import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../types/IngestionOptions.js';
import type { RawDocument } from '../types/RawDocument.js';
import { logger } from '../../../utils/logger.js';
import { createHttpClient } from '../../../config/httpClient.js';
import { validateUrls, isValidUrl } from '../../../utils/urlValidator.js';

/**
 * Web ingestion adapter configuration
 */
export interface WebIngestionAdapterConfig {
  /** User agent for web requests */
  userAgent?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum redirects to follow */
  maxRedirects?: number;
}

/**
 * Web Ingestion Adapter
 * 
 * Fetches raw documents from web sources without parsing.
 */
export class WebIngestionAdapter implements IIngestionAdapter {
  private config: WebIngestionAdapterConfig;

  constructor(config: WebIngestionAdapterConfig = {}) {
    this.config = {
      userAgent: config.userAgent || 'Beleidsscan/1.0',
      timeout: config.timeout || 30000,
      maxRedirects: config.maxRedirects || 5,
    };
  }

  /**
   * Check if this adapter can handle the given source
   */
  canHandle(source: DocumentSource): boolean {
    return source === 'Web' || source === 'Gemeente';
  }

  /**
   * Ingest documents from web source
   * 
   * @param source - Data source (must be 'Web' or 'Gemeente')
   * @param options - Ingestion options
   * @returns Raw documents (not parsed)
   */
  async ingest(source: DocumentSource, options: IngestionOptions): Promise<RawDocument[]> {
    if (!this.canHandle(source)) {
      throw new Error(`WebIngestionAdapter cannot handle source: ${source}`);
    }

    const targetUrls: string[] = [];

    // Extract URLs from options.query
    if (typeof options.query === 'string' && isValidUrl(options.query)) {
      targetUrls.push(options.query);
    }

    // Extract URLs from options.urls
    // Use bracket notation to access dynamic property
    const urlsOption = options['urls'];
    if (Array.isArray(urlsOption)) {
      // Filter valid URLs
      targetUrls.push(...validateUrls(urlsOption as string[]));
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(targetUrls)];

    if (uniqueUrls.length === 0) {
      logger.debug({ source, options }, 'No valid URLs found for ingestion');
      return [];
    }

    // Create HTTP client
    const client = createHttpClient({
      timeout: this.config.timeout,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      maxRedirects: this.config.maxRedirects,
    });

    const results: RawDocument[] = [];
    const CONCURRENCY_LIMIT = 5;

    // Process URLs in batches to limit concurrency
    for (let i = 0; i < uniqueUrls.length; i += CONCURRENCY_LIMIT) {
      const batch = uniqueUrls.slice(i, i + CONCURRENCY_LIMIT);

      const batchPromises = batch.map(async (url) => {
        try {
          const response = await client.get(url);

          // Generate deterministic ID
          const id = crypto.createHash('sha256').update(url).digest('hex');

          const doc: RawDocument = {
            id,
            url,
            content: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
            metadata: {
              source,
              contentType: response.headers['content-type'],
              status: response.status,
              ingestedAt: new Date().toISOString(),
            }
          };

          return doc;
        } catch (error) {
          // Log error but continue with other URLs
          logger.error({ error, url }, 'Failed to fetch URL during ingestion');
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // Filter out failed requests (nulls) and add to results
      results.push(...batchResults.filter((doc): doc is RawDocument => doc !== null));
    }

    return results;
  }
}
