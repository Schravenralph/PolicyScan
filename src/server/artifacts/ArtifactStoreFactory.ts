/**
 * Artifact Store Factory
 * 
 * Factory function to create the appropriate ArtifactStore implementation
 * based on configuration (filesystem for dev, object storage for production).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

import type { ArtifactStore } from './ArtifactStore.js';
import { FileSystemArtifactStore } from './FileSystemArtifactStore.js';
import { ObjectStorageArtifactStore, type ObjectStorageConfig } from './ObjectStorageArtifactStore.js';
import { logger } from '../utils/logger.js';

/**
 * Configuration for artifact store factory
 */
export interface ArtifactStoreConfig {
  /** Storage backend type */
  type: 'filesystem' | 'object-storage';
  /** Filesystem base path (for filesystem backend) */
  filesystemBasePath?: string;
  /** Object storage configuration (for object-storage backend) */
  objectStorage?: ObjectStorageConfig;
}

/**
 * Create an ArtifactStore instance based on configuration
 * 
 * @param config - Artifact store configuration
 * @returns ArtifactStore instance
 */
export function createArtifactStore(config: ArtifactStoreConfig): ArtifactStore {
  if (config.type === 'filesystem') {
    logger.info(
      { basePath: config.filesystemBasePath },
      'Creating FileSystemArtifactStore'
    );
    return new FileSystemArtifactStore(config.filesystemBasePath);
  }

  if (config.type === 'object-storage') {
    if (!config.objectStorage) {
      throw new Error('Object storage configuration required for object-storage backend');
    }
    logger.info(
      { bucket: config.objectStorage.bucket, endpoint: config.objectStorage.endpoint },
      'Creating ObjectStorageArtifactStore'
    );
    return new ObjectStorageArtifactStore(config.objectStorage);
  }

  throw new Error(`Unknown artifact store type: ${config.type}`);
}

/**
 * Create an ArtifactStore from environment variables
 * 
 * Environment variables:
 * - ARTIFACT_STORE_TYPE: 'filesystem' | 'object-storage' (default: 'filesystem')
 * - ARTIFACT_STORE_FILESYSTEM_PATH: Base path for filesystem storage (default: data/artifacts)
 * - ARTIFACT_STORE_S3_BUCKET: S3 bucket name (required for object-storage)
 * - ARTIFACT_STORE_S3_ENDPOINT: S3 endpoint URL (optional, for S3-compatible services)
 * - ARTIFACT_STORE_S3_REGION: AWS region (default: us-east-1)
 * - ARTIFACT_STORE_S3_ACCESS_KEY_ID: Access key ID (optional, uses AWS credentials if not set)
 * - ARTIFACT_STORE_S3_SECRET_ACCESS_KEY: Secret access key (optional, uses AWS credentials if not set)
 * - ARTIFACT_STORE_S3_FORCE_PATH_STYLE: Force path-style addressing (default: true for custom endpoints)
 * 
 * @returns ArtifactStore instance
 */
export function createArtifactStoreFromEnv(): ArtifactStore {
  const storeType = (process.env.ARTIFACT_STORE_TYPE || 'filesystem') as 'filesystem' | 'object-storage';

  if (storeType === 'filesystem') {
    const basePath = process.env.ARTIFACT_STORE_FILESYSTEM_PATH;
    return createArtifactStore({
      type: 'filesystem',
      filesystemBasePath: basePath,
    });
  }

  if (storeType === 'object-storage') {
    const bucket = process.env.ARTIFACT_STORE_S3_BUCKET;
    if (!bucket) {
      throw new Error('ARTIFACT_STORE_S3_BUCKET environment variable is required for object-storage backend');
    }

    const endpoint = process.env.ARTIFACT_STORE_S3_ENDPOINT;
    const region = process.env.ARTIFACT_STORE_S3_REGION || 'us-east-1';
    const accessKeyId = process.env.ARTIFACT_STORE_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.ARTIFACT_STORE_S3_SECRET_ACCESS_KEY;
    const forcePathStyle = process.env.ARTIFACT_STORE_S3_FORCE_PATH_STYLE !== 'false';

    return createArtifactStore({
      type: 'object-storage',
      objectStorage: {
        bucket,
        endpoint,
        region,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: endpoint ? forcePathStyle : undefined,
      },
    });
  }

  throw new Error(`Unknown artifact store type from environment: ${storeType}`);
}

