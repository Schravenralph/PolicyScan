/**
 * Shared Document Models
 *
 * This module defines shared document types used across layers.
 * These types provide a stable contract for document flow between layers.
 */

import type { DocumentSource } from '../../../contracts/types.js';

/**
 * NormalizedDocument - Shared contract for normalized documents
 *
 * This is the output of the ingestion layer and input to parsing layer.
 * It represents a document that has been normalized but not yet parsed.
 *
 * This type is used as the shared contract between ingestion and parsing layers
 * to eliminate ad-hoc conversions and field loss bugs.
 */
export interface NormalizedDocument {
  /** Unique identifier from source */
  sourceId: string;
  /** URL of the document */
  sourceUrl: string;
  /** Source of the document (DSO, IPLO, Web, etc.) */
  source: DocumentSource;
  /** Document title */
  title: string;
  /** Document content */
  content: string;
  /** MIME type of the document */
  mimeType: string;
  /** Raw data from source (before normalization) */
  rawData: unknown;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}
