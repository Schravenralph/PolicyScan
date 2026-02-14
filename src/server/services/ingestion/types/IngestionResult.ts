/**
 * Ingestion Result Type
 * 
 * Represents the result of an ingestion operation.
 */

import type { DocumentSource } from '../../../contracts/types.js';
import type { NormalizedDocument } from './NormalizedDocument.js';

/**
 * Metadata about an ingestion operation
 */
export interface IngestionMetadata {
  /** Number of documents ingested */
  count: number;
  /** Number of documents that failed ingestion */
  failedCount?: number;
  /** Errors encountered during ingestion */
  errors?: Array<{ documentId: string; error: string }>;
  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Result of an ingestion operation
 */
export interface IngestionResult {
  /** Normalized documents from ingestion */
  documents: NormalizedDocument[];
  /** Source of the documents */
  source: DocumentSource;
  /** Timestamp when ingestion occurred */
  ingestedAt: Date;
  /** Additional metadata about the ingestion */
  metadata: IngestionMetadata;
}
