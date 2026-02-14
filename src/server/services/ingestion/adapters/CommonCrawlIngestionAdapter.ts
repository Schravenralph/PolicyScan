/**
 * Common Crawl Ingestion Adapter
 * 
 * Fetches raw documents from Common Crawl archive.
 * This adapter only handles ingestion - parsing is handled by the parsing layer.
 */

import type { IIngestionAdapter } from '../interfaces/IIngestionAdapter.js';
import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../types/IngestionOptions.js';
import type { RawDocument } from '../types/RawDocument.js';
import { logger } from '../../../utils/logger.js';
import axios from 'axios';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

/**
 * Common Crawl ingestion adapter configuration
 */
export interface CommonCrawlIngestionAdapterConfig {
  /** Common Crawl index URL (optional) */
  indexUrl?: string;
  /** Maximum number of documents to fetch */
  maxDocuments?: number;
}

/**
 * Common Crawl Ingestion Adapter
 * 
 * Fetches raw documents from Common Crawl archive without parsing.
 */
export class CommonCrawlIngestionAdapter implements IIngestionAdapter {
  private config: CommonCrawlIngestionAdapterConfig;

  constructor(config: CommonCrawlIngestionAdapterConfig = {}) {
    this.config = config;
  }

  /**
   * Check if this adapter can handle the given source
   */
  canHandle(source: DocumentSource): boolean {
    // Common Crawl is used for Web ingestion
    return source === 'Web';
  }

  /**
   * Ingest documents from Common Crawl source
   * 
   * @param source - Data source
   * @param options - Ingestion options
   * @returns Raw documents (not parsed)
   */
  async ingest(source: DocumentSource, options: IngestionOptions): Promise<RawDocument[]> {
    if (!this.canHandle(source)) {
      throw new Error(`CommonCrawlIngestionAdapter cannot handle source: ${source}`);
    }

    const query = options.query;
    if (!query) {
      // If no query is provided, we can't search Common Crawl.
      // However, the adapter interface might be called with URLs directly in other options?
      // For now, require query.
      logger.warn({ source, options }, 'Common Crawl ingestion requires a query option');
      return [];
    }

    const limit = options.limit || this.config.maxDocuments || 10;
    // Use a recent crawl ID as default if not provided
    const crawlId = (options.crawlId as string) || 'CC-MAIN-2025-47';

    logger.info({ source, query, crawlId, limit }, 'Starting Common Crawl ingestion');

    try {
      // 1. Query Common Crawl index
      const cdxRecords = await this.queryIndex(crawlId, query, limit);
      logger.info({ count: cdxRecords.length, query }, 'Found CDX records');

      // 2. Fetch documents from Common Crawl archive
      const rawDocuments: RawDocument[] = [];

      for (const record of cdxRecords) {
        try {
          const content = await this.fetchContent(record);
          if (content) {
            rawDocuments.push({
              id: record.digest || `${record.url}-${record.timestamp}`,
              url: record.url,
              title: undefined, // Common Crawl doesn't give title in CDX, needs parsing from content
              content: content,
              metadata: {
                source: 'CommonCrawl',
                crawlId: record.crawlId,
                timestamp: record.timestamp,
                mimeType: record.mime,
                originalRecord: record
              }
            });
          }
        } catch (error) {
          logger.warn({ url: record.url, error: error instanceof Error ? error.message : String(error) }, 'Failed to fetch content from Common Crawl');
          // Continue with next record
        }
      }

      return rawDocuments;
    } catch (error) {
      logger.error({ error }, 'Common Crawl ingestion failed');
      throw error;
    }
  }

  /**
   * Query Common Crawl CDX Index
   */
  private async queryIndex(crawlId: string, url: string, limit: number): Promise<any[]> {
    const baseUrl = this.config.indexUrl || 'https://index.commoncrawl.org';
    const indexUrl = `${baseUrl}/${crawlId}-index`;

    // Construct query parameters
    const params = new URLSearchParams({
      url: url,
      output: 'json',
      limit: limit.toString()
    });

    try {
      const response = await axios.get(`${indexUrl}?${params.toString()}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'Beleidsscan/1.0' }
      });

      // Parse NDJSON response
      const data = response.data;
      if (typeof data === 'object' && !Array.isArray(data)) {
        // Single JSON object or message
         if (data.message && data.message.includes('No Captures found')) {
             return [];
         }
         // If it's a single record
         return [{ ...data, crawlId }];
      }

      const lines = (data as string).trim().split('\n');
      const records = lines
        .filter(line => line.trim().length > 0)
        .map(line => {
          try {
            const record = JSON.parse(line);
            // Check for "No Captures found" message in JSON
            if (record.message && record.message.includes('No Captures found')) {
                return null;
            }
            return { ...record, crawlId };
          } catch (e) {
            return null;
          }
        })
        .filter(record => record !== null);

      return records;
    } catch (error) {
        // Handle 404 (no results) gracefully
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            return [];
        }
        throw error;
    }
  }

  /**
   * Fetch content from Common Crawl archive
   */
  private async fetchContent(record: any): Promise<string | null> {
    if (!record.filename || !record.offset || !record.length) {
      return null;
    }

    const offset = parseInt(record.offset);
    const length = parseInt(record.length);
    const end = offset + length - 1;

    const url = `https://data.commoncrawl.org/${record.filename}`;

    try {
        const response = await axios.get(url, {
        headers: {
            'Range': `bytes=${offset}-${end}`,
            'User-Agent': 'Beleidsscan/1.0'
        },
        responseType: 'arraybuffer', // Get buffer directly
        timeout: 60000
        });

        // Decompress gzip content
        const buffer = Buffer.from(response.data);
        const decompressed = await gunzipAsync(buffer);
        const warcContent = decompressed.toString('utf-8');

        return this.parseWarcResponse(warcContent);
    } catch (error) {
        // Log detailed error
        logger.debug({ error, url, range: `bytes=${offset}-${end}` }, 'Error fetching WARC segment');
        throw error;
    }
  }

  /**
   * Parse WARC response to extract HTTP body
   */
  private parseWarcResponse(warcContent: string): string | null {
    // WARC format:
    // WARC header
    // \r\n\r\n
    // HTTP header
    // \r\n\r\n
    // Body

    // 1. Split WARC header and payload
    // WARC headers end with \r\n\r\n
    const warcHeaderEnd = warcContent.indexOf('\r\n\r\n');
    if (warcHeaderEnd === -1) return null;

    const payload = warcContent.substring(warcHeaderEnd + 4);

    // 2. The payload is the HTTP response (Header + Body)
    // HTTP headers also end with \r\n\r\n
    const httpHeaderEnd = payload.indexOf('\r\n\r\n');
    if (httpHeaderEnd === -1) {
        // Sometimes payload might just be body if WARC type is not response?
        // But we expect 'response'.
        // Or maybe it's just headers?
        return payload;
    }

    const body = payload.substring(httpHeaderEnd + 4);

    // Trim trailing WARC record terminator (\r\n\r\n) if present
    if (body.endsWith('\r\n\r\n')) {
      return body.slice(0, -4);
    }

    return body;
  }
}
