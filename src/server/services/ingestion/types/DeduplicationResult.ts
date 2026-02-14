/**
 * Deduplication Result Type
 * 
 * Represents the result of a deduplication operation.
 */

import type { NormalizedDocument } from './NormalizedDocument.js';

/**
 * Result of deduplication operation
 */
export interface DeduplicationResult {
  /** Deduplicated documents */
  documents: NormalizedDocument[];
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Information about removed duplicates */
  duplicateInfo?: Array<{
    originalId: string;
    duplicateId: string;
    reason: string;
  }>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
