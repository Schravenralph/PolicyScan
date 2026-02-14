/**
 * ArtifactStore Interface
 * 
 * Content-addressed storage for artifacts with sha256-based addressing.
 * Artifacts are immutable: identical bytes produce identical storage keys.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

import type { ArtifactRef, ArtifactProvenance } from '../contracts/types.js';

/**
 * Options for storing an artifact
 */
export interface StoreArtifactOptions {
  bytes: Buffer;
  mimeType: string;
  provenance: ArtifactProvenance;
}

/**
 * ArtifactStore interface
 * 
 * All implementations must:
 * - Use sha256 content addressing (identical bytes → identical storageKey)
 * - Never modify artifacts in place (immutability)
 * - Verify sha256 on read for integrity
 * - Deduplicate by sha256 (same bytes stored twice → same ArtifactRef, no duplicate storage)
 */
export interface ArtifactStore {
  /**
   * Store an artifact
   * 
   * If an artifact with the same sha256 already exists, returns the existing ArtifactRef
   * without duplicating storage.
   * 
   * @param options - Artifact data and metadata
   * @returns ArtifactRef with sha256, storageKey, and provenance
   * @throws Error if storage fails
   */
  store(options: StoreArtifactOptions): Promise<ArtifactRef>;

  /**
   * Read an artifact by sha256
   * 
   * Verifies sha256 integrity on read. Throws if artifact is corrupted or missing.
   * 
   * @param sha256 - SHA-256 hash (64-character hex string)
   * @returns Artifact bytes
   * @throws Error if artifact not found or integrity check fails
   */
  read(sha256: string): Promise<Buffer>;

  /**
   * Check if an artifact exists
   * 
   * @param sha256 - SHA-256 hash (64-character hex string)
   * @returns true if artifact exists, false otherwise
   */
  exists(sha256: string): Promise<boolean>;

  /**
   * Get ArtifactRef metadata without reading bytes
   * 
   * @param sha256 - SHA-256 hash (64-character hex string)
   * @returns ArtifactRef or null if not found
   */
  getRef(sha256: string): Promise<ArtifactRef | null>;
}

