/**
 * Discovery Result Type
 * 
 * Result type for document discovery operations.
 */

import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import type { DocumentSource } from '../../../contracts/types.js';

/**
 * Metadata for discovery operations
 */
export interface DiscoveryMetadata {
  /** Total number of documents discovered */
  totalDiscovered: number;
  /** Number of documents after deduplication */
  afterDeduplication: number;
  /** Sources that were queried */
  sourcesQueried: DocumentSource[];
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Result of document discovery operation
 */
export interface DiscoveryResult {
  /** Discovered and normalized documents */
  documents: NormalizedDocument[];
  /** Sources from which documents were discovered */
  sources: DocumentSource[];
  /** Timestamp when discovery was completed */
  discoveredAt: Date;
  /** Discovery operation metadata */
  metadata: DiscoveryMetadata;
}
