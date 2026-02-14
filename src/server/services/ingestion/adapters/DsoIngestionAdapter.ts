/**
 * DSO Ingestion Adapter
 * 
 * Fetches raw documents from DSO (Stelselcatalogus Omgevingswet) sources.
 * This adapter only handles ingestion - parsing is handled by the parsing layer.
 */

import type { IIngestionAdapter } from '../interfaces/IIngestionAdapter.js';
import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../types/IngestionOptions.js';
import type { RawDocument } from '../types/RawDocument.js';
import { logger } from '../../../utils/logger.js';
import { DsoLiveClient, type DsoDiscoveryResult } from '../../../adapters/dso/DsoLiveClient.js';
import type { Point } from 'geojson';

/**
 * DSO ingestion adapter configuration
 */
export interface DsoIngestionAdapterConfig {
  /** Use live DSO API (default: false) */
  useLiveApi?: boolean;
  /** Use production API (default: false, uses preprod) */
  useProduction?: boolean;
  /** DSO API key (optional, uses env var if not provided) */
  apiKey?: string;
}

/**
 * DSO Ingestion Adapter
 * 
 * Fetches raw documents from DSO sources without parsing.
 */
export class DsoIngestionAdapter implements IIngestionAdapter {
  private config: DsoIngestionAdapterConfig;
  private liveClient?: DsoLiveClient;

  constructor(config: DsoIngestionAdapterConfig = {}) {
    this.config = config;
    if (config.useLiveApi) {
      try {
        this.liveClient = new DsoLiveClient({
          useProduction: config.useProduction,
          apiKey: config.apiKey,
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize DSO live client, will use offline mode');
        // Fallback to offline mode implies liveClient is undefined
      }
    }
  }

  /**
   * Check if this adapter can handle the given source
   */
  canHandle(source: DocumentSource): boolean {
    return source === 'DSO';
  }

  /**
   * Ingest documents from DSO source
   * 
   * @param source - Data source (must be 'DSO')
   * @param options - Ingestion options
   * @returns Raw documents (not parsed)
   */
  async ingest(source: DocumentSource, options: IngestionOptions): Promise<RawDocument[]> {
    if (!this.canHandle(source)) {
      throw new Error(`DsoIngestionAdapter cannot handle source: ${source}`);
    }

    // 1. Check for offline mode or live mode
    if (this.config.useLiveApi && this.liveClient) {
      return this.ingestLive(options);
    } else {
      return this.ingestOffline(options);
    }
  }

  private async ingestLive(options: IngestionOptions): Promise<RawDocument[]> {
    // Extract geometry from options (if present)
    const geometry = (options as { geometry?: unknown }).geometry;
    const { query } = options;

    let results: DsoDiscoveryResult[] = [];

    if (geometry) {
      if (this.isPoint(geometry)) {
        results = await this.liveClient!.discoverByGeometry(geometry);
      } else {
        throw new Error('Only Point geometry is supported for DSO live ingestion');
      }
    } else if (query) {
      results = await this.liveClient!.discoverByQuery(query);
    } else {
      throw new Error('Either query or geometry must be provided for DSO live ingestion');
    }

    return results.map(result => this.mapDiscoveryResultToRawDocument(result));
  }

  private ingestOffline(options: IngestionOptions): Promise<RawDocument[]> {
    const { query } = options;
    const geometry = (options as { geometry?: unknown }).geometry;
    logger.warn({ options }, 'DSO ingestion running in offline mode. Only fixture discovery supported.');

    if (query && typeof query === 'string') {
      // Treat query as fixture filename
      return Promise.resolve([
        {
          id: query,
          url: '', // No URL for fixture
          title: `Fixture: ${query}`,
          metadata: {
            discovery: {
              fixtureFilename: query
            }
          }
        }
      ]);
    }

    if (!query && !geometry) {
      throw new Error('Either query or geometry must be provided for DSO offline ingestion');
    }

    return Promise.resolve([]);
  }

  private mapDiscoveryResultToRawDocument(result: DsoDiscoveryResult): RawDocument {
    return {
      id: result.identificatie,
      url: result.publicatieLink || `dso:${result.identificatie}`,
      title: result.titel,
      metadata: result as unknown as Record<string, unknown>
    };
  }

  private isPoint(geometry: unknown): geometry is Point {
    return (
      typeof geometry === 'object' &&
      geometry !== null &&
      (geometry as any).type === 'Point' &&
      Array.isArray((geometry as any).coordinates)
    );
  }
}
