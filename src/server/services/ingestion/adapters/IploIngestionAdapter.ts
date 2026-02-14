/**
 * IPLO Ingestion Adapter
 * 
 * Fetches raw documents from IPLO (Informatiepunt Leefomgeving) sources.
 * This adapter only handles ingestion - parsing is handled by the parsing layer.
 */

import type { IIngestionAdapter } from '../interfaces/IIngestionAdapter.js';
import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../types/IngestionOptions.js';
import type { RawDocument } from '../types/RawDocument.js';
import { logger } from '../../../utils/logger.js';
import { IPLOScraper } from '../../scraping/iploScraper.js';
import type { ScrapedDocument } from '../../infrastructure/types.js';

/**
 * IPLO ingestion adapter configuration
 */
export interface IploIngestionAdapterConfig {
  /** API endpoint URL (optional) */
  apiUrl?: string;
  /** API key (optional) */
  apiKey?: string;
  /** Use live IPLO scraping (default: false) */
  useLiveApi?: boolean;
}

/**
 * IPLO Ingestion Adapter
 * 
 * Fetches raw documents from IPLO sources without parsing.
 */
export class IploIngestionAdapter implements IIngestionAdapter {
  private config: IploIngestionAdapterConfig;
  private scraper?: IPLOScraper;

  constructor(config: IploIngestionAdapterConfig = {}) {
    this.config = config;
    if (config.useLiveApi) {
      this.scraper = new IPLOScraper();
    }
  }

  /**
   * Check if this adapter can handle the given source
   */
  canHandle(source: DocumentSource): boolean {
    return source === 'IPLO';
  }

  /**
   * Ingest documents from IPLO source
   * 
   * @param source - Data source (must be 'IPLO')
   * @param options - Ingestion options
   * @returns Raw documents (not parsed)
   */
  async ingest(source: DocumentSource, options: IngestionOptions): Promise<RawDocument[]> {
    if (!this.canHandle(source)) {
      throw new Error(`IploIngestionAdapter cannot handle source: ${source}`);
    }

    if (this.config.useLiveApi && this.scraper) {
      return this.ingestLive(options);
    } else {
      return this.ingestOffline(options);
    }
  }

  private async ingestLive(options: IngestionOptions): Promise<RawDocument[]> {
    const { query } = options;
    const thema = (options.thema as string) || '';
    const overheidsinstantie = (options.overheidsinstantie as string) || undefined;

    if (!query) {
      throw new Error('Query must be provided for IPLO live ingestion');
    }

    try {
      const scrapedDocs = await this.scraper!.scrapeByQuery(
        query,
        thema,
        undefined, // runManager
        undefined, // runId
        overheidsinstantie
      );

      return scrapedDocs.map(doc => this.mapScrapedDocumentToRawDocument(doc));
    } catch (error) {
      logger.error({ error, options }, 'Error scraping IPLO');
      throw error;
    }
  }

  private async ingestOffline(options: IngestionOptions): Promise<RawDocument[]> {
    const { query } = options;
    logger.warn({ options }, 'IPLO ingestion running in offline mode. Only fixture discovery supported.');

    if (query && typeof query === 'string') {
      // Treat query as fixture filename
      return Promise.resolve([
        {
          id: query,
          url: '', // No URL for fixture, or maybe dummy URL
          title: `Fixture: ${query}`,
          metadata: {
            discovery: {
              fixtureFilename: query
            }
          }
        }
      ]);
    }

    throw new Error('Query must be provided for IPLO offline ingestion');
  }

  private mapScrapedDocumentToRawDocument(doc: ScrapedDocument): RawDocument {
    return {
      id: doc.url,
      url: doc.url,
      title: doc.titel,
      // We don't have full content, but we have summary.
      // RawDocument content is optional.
      // We store everything in metadata.
      metadata: {
        samenvatting: doc.samenvatting,
        type_document: doc.type_document,
        publicatiedatum: doc.publicatiedatum,
        sourceType: doc.sourceType,
        authorityLevel: doc.authorityLevel,
        website_url: doc.website_url,
        website_titel: doc.website_titel
      }
    };
  }
}
