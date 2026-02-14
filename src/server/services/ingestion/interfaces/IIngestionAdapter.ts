/**
 * Ingestion adapter interface
 * 
 * Defines the contract for source-specific ingestion adapters.
 */

import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../types/IngestionOptions.js';
import type { RawDocument } from '../types/RawDocument.js';

/**
 * Interface for ingestion adapters
 * 
 * Adapters are responsible for fetching raw documents from specific sources.
 * They do NOT parse documents - that is handled by the parsing layer.
 */
export interface IIngestionAdapter {
  /**
   * Check if this adapter can handle the given source
   * 
   * @param source - Data source to check
   * @returns True if adapter can handle the source
   */
  canHandle(source: DocumentSource): boolean;

  /**
   * Ingest documents from a source
   * 
   * @param source - Data source to ingest from
   * @param options - Ingestion options
   * @returns Raw documents (not parsed, not normalized)
   */
  ingest(source: DocumentSource, options: IngestionOptions): Promise<RawDocument[]>;
}
