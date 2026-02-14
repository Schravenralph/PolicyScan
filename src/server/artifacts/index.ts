/**
 * Artifact Storage Module
 * 
 * Content-addressed artifact storage with sha256-based addressing.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

export type { ArtifactStore, StoreArtifactOptions } from './ArtifactStore.js';
export { FileSystemArtifactStore } from './FileSystemArtifactStore.js';
export { ObjectStorageArtifactStore } from './ObjectStorageArtifactStore.js';
export type { ObjectStorageConfig } from './ObjectStorageArtifactStore.js';
export {
  buildArtifactRef,
  computeStorageKey,
  redactProvenanceHeaders,
} from './ArtifactRefBuilder.js';
export {
  DEFAULT_RETENTION_POLICIES,
  shouldRetainArtifact,
  shouldKeepMetadataAfterPurge,
  createTombstone,
} from './RetentionPolicy.js';
export type { RetentionPolicy, ArtifactTombstone } from './RetentionPolicy.js';
export { recordArtifactOperation } from './ArtifactMetrics.js';
export { createArtifactStore, createArtifactStoreFromEnv } from './ArtifactStoreFactory.js';
export type { ArtifactStoreConfig } from './ArtifactStoreFactory.js';

