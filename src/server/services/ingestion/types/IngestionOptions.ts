/**
 * Ingestion Options Type
 * 
 * Options for configuring ingestion operations.
 */

import type { DocumentSource } from '../../../contracts/types.js';

/**
 * Options for ingestion operations
 */
export interface IngestionOptions {
  /** Query or filter parameters (source-specific) */
  query?: string;
  /** Date range for ingestion */
  dateRange?: { start: Date; end: Date };
  /** Maximum number of documents to ingest */
  limit?: number;
  /** Whether to skip normalization step (default: false, normalization is enabled by default) */
  skipNormalization?: boolean;
  /** Whether to skip deduplication step (default: false, deduplication is enabled by default) */
  skipDeduplication?: boolean;
  /** Additional source-specific options */
  [key: string]: unknown;
}
