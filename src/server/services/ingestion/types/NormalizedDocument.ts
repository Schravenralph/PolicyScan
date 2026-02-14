/**
 * Normalized Document Type
 * 
 * Represents a document that has been normalized by the ingestion layer.
 * This is the output of normalization and input to deduplication.
 *
 * @deprecated Use the shared NormalizedDocument from services/shared/types/DocumentModels.ts
 * This file is kept for backward compatibility during migration.
 */

import type { NormalizedDocument as SharedNormalizedDocument } from '../../shared/types/DocumentModels.js';

/**
 * Normalized document from ingestion layer
 * 
 * Re-exports the shared NormalizedDocument type to maintain backward compatibility.
 * All new code should import from services/shared/types/DocumentModels.ts directly.
 *
 * @see services/shared/types/DocumentModels.ts - Shared document model
 */
export type NormalizedDocument = SharedNormalizedDocument;
