/**
 * Ingestion Orchestrator - Main ingestion service orchestrator
 * 
 * Coordinates ingestion from multiple sources, normalization, and deduplication.
 * This is the main entry point for the ingestion layer.
 */

import type { IIngestionService } from './interfaces/IIngestionService.js';
import type { IIngestionAdapter } from './interfaces/IIngestionAdapter.js';
import type { DocumentSource } from '../../contracts/types.js';
import type { IngestionOptions } from './types/IngestionOptions.js';
import type { IngestionResult } from './types/IngestionResult.js';
import type { NormalizedDocument } from './types/NormalizedDocument.js';
import type { RawDocument } from './types/RawDocument.js';
import type { DeduplicationResult } from './types/DeduplicationResult.js';
import { DocumentNormalizer } from './normalizers/DocumentNormalizer.js';
import { DocumentDeduplicator } from './deduplicators/DocumentDeduplicator.js';
import { DsoIngestionAdapter } from './adapters/DsoIngestionAdapter.js';
import { IploIngestionAdapter } from './adapters/IploIngestionAdapter.js';
import { WebIngestionAdapter } from './adapters/WebIngestionAdapter.js';
import { CommonCrawlIngestionAdapter } from './adapters/CommonCrawlIngestionAdapter.js';
import { logger } from '../../utils/logger.js';

/**
 * Configuration for IngestionOrchestrator
 */
export interface IngestionOrchestratorConfig {
  /** Custom adapters to use (optional, defaults to all built-in adapters) */
  adapters?: IIngestionAdapter[];
  /** Custom normalizer (optional, defaults to DocumentNormalizer) */
  normalizer?: DocumentNormalizer;
  /** Custom deduplicator (optional, defaults to DocumentDeduplicator) */
  deduplicator?: DocumentDeduplicator;
}

/**
 * Main ingestion orchestrator
 * 
 * Coordinates adapters, normalizers, and deduplicators to provide
 * unified ingestion functionality.
 */
export class IngestionOrchestrator implements IIngestionService {
  private adapters: IIngestionAdapter[];
  private normalizer: DocumentNormalizer;
  private deduplicator: DocumentDeduplicator;

  constructor(config: IngestionOrchestratorConfig = {}) {
    // Register adapters (use provided or default to all built-in adapters)
    this.adapters = config.adapters || [
      new DsoIngestionAdapter(),
      new IploIngestionAdapter(),
      new WebIngestionAdapter(),
      new CommonCrawlIngestionAdapter(),
    ];

    // Initialize normalizer and deduplicator
    this.normalizer = config.normalizer || new DocumentNormalizer();
    this.deduplicator = config.deduplicator || new DocumentDeduplicator();
  }

  /**
   * Ingest documents from a source
   * 
   * Workflow:
   * 1. Find appropriate adapter for the source
   * 2. Ingest raw documents from the adapter
   * 3. Normalize documents (if options.normalize is true)
   * 4. Deduplicate documents (if options.deduplicate is true)
   * 
   * @param source - Data source to ingest from
   * @param options - Ingestion options
   * @returns Ingestion result with normalized documents
   */
  async ingest(source: DocumentSource, options: IngestionOptions): Promise<IngestionResult> {
    // Find appropriate adapter
    const adapter = this.adapters.find(a => a.canHandle(source));
    if (!adapter) {
      throw new Error(`No adapter found for source: ${source}`);
    }

    logger.debug({ source, options }, 'Starting ingestion');

    // Ingest raw documents from adapter
    const rawDocuments = await adapter.ingest(source, options);

    logger.debug({ source, rawCount: rawDocuments.length }, 'Raw documents ingested');

    // Normalize documents (if enabled, default: true)
    const shouldNormalize = !options.skipNormalization;
    let normalized: NormalizedDocument[];
    if (shouldNormalize) {
      normalized = await this.normalize(rawDocuments);
      logger.debug({ source, normalizedCount: normalized.length }, 'Documents normalized');
    } else {
      // If normalization is disabled, we still need NormalizedDocument[] for deduplication
      // For now, we'll normalize anyway but log a warning
      logger.warn({ source }, 'Normalization disabled but required for deduplication, normalizing anyway');
      normalized = await this.normalize(rawDocuments);
    }

    // Deduplicate documents (if enabled, default: true)
    const shouldDeduplicate = !options.skipDeduplication;
    let deduplicationResult: DeduplicationResult;
    if (shouldDeduplicate) {
      deduplicationResult = await this.deduplicate(normalized);
      logger.debug(
        { source, duplicatesRemoved: deduplicationResult.duplicatesRemoved },
        'Documents deduplicated'
      );
    } else {
      // If deduplication is disabled, return all normalized documents
      deduplicationResult = {
        documents: normalized,
        duplicatesRemoved: 0,
      };
    }

    const result: IngestionResult = {
      documents: deduplicationResult.documents,
      source,
      ingestedAt: new Date(),
      metadata: {
        count: deduplicationResult.documents.length,
        failedCount: rawDocuments.length - normalized.length,
        duplicatesRemoved: deduplicationResult.duplicatesRemoved,
      },
    };

    logger.info(
      {
        source,
        totalIngested: rawDocuments.length,
        finalCount: result.documents.length,
        duplicatesRemoved: deduplicationResult.duplicatesRemoved,
      },
      'Ingestion completed'
    );

    return result;
  }

  /**
   * Normalize raw documents
   * 
   * @param documents - Raw documents to normalize
   * @returns Normalized documents
   */
  async normalize(documents: RawDocument[]): Promise<NormalizedDocument[]> {
    return this.normalizer.normalizeDocuments(documents);
  }

  /**
   * Deduplicate normalized documents
   * 
   * @param documents - Normalized documents to deduplicate
   * @returns Deduplication result
   */
  async deduplicate(documents: NormalizedDocument[]): Promise<DeduplicationResult> {
    return this.deduplicator.deduplicate(documents);
  }
}
