/**
 * Main ingestion service interface
 * 
 * Defines the contract for the ingestion layer orchestrator.
 */

import type { DocumentSource } from '../../../contracts/types.js';
import type { IngestionOptions } from '../types/IngestionOptions.js';
import type { IngestionResult } from '../types/IngestionResult.js';
import type { NormalizedDocument } from '../types/NormalizedDocument.js';
import type { RawDocument } from '../types/RawDocument.js';
import type { DeduplicationResult } from '../types/DeduplicationResult.js';

/**
 * Main interface for ingestion service
 */
export interface IIngestionService {
  /**
   * Ingest documents from a source
   * 
   * @param source - Data source to ingest from
   * @param options - Ingestion options
   * @returns Ingestion result with normalized documents
   */
  ingest(source: DocumentSource, options: IngestionOptions): Promise<IngestionResult>;

  /**
   * Normalize raw documents
   * 
   * @param documents - Raw documents to normalize
   * @returns Normalized documents
   */
  normalize(documents: RawDocument[]): Promise<NormalizedDocument[]>;

  /**
   * Deduplicate normalized documents
   * 
   * @param documents - Normalized documents to deduplicate
   * @returns Deduplication result
   */
  deduplicate(documents: NormalizedDocument[]): Promise<DeduplicationResult>;
}
