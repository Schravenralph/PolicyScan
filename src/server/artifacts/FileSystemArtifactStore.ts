/**
 * FileSystemArtifactStore
 * 
 * Filesystem-based implementation of ArtifactStore for development.
 * Stores artifacts under data/artifacts/{sha256[0:2]}/{sha256}
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/14-artifact-storage.md
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { ArtifactStore, StoreArtifactOptions } from './ArtifactStore.js';
import type { ArtifactRef, ArtifactProvenance } from '../contracts/types.js';
import { buildArtifactRef, computeStorageKey } from './ArtifactRefBuilder.js';
import { logger } from '../utils/logger.js';
import { recordArtifactOperation } from './ArtifactMetrics.js';

/**
 * FileSystemArtifactStore implementation
 */
export class FileSystemArtifactStore implements ArtifactStore {
  private readonly basePath: string;

  /**
   * @param basePath - Base directory for artifact storage (default: data/artifacts)
   */
  constructor(basePath?: string) {
    this.basePath = basePath || join(process.cwd(), 'data', 'artifacts');
  }

  /**
   * Store an artifact
   * 
   * If an artifact with the same sha256 already exists, returns the existing ArtifactRef
   * without duplicating storage.
   */
  async store(options: StoreArtifactOptions): Promise<ArtifactRef> {
    const startTime = Date.now();
    const { bytes, mimeType, provenance } = options;
    const source = provenance.source;

    try {
      // Validate buffer
      if (!Buffer.isBuffer(bytes)) {
        throw new Error('Artifact bytes must be a Buffer instance');
      }
      if (bytes.length === 0) {
        throw new Error('Artifact bytes cannot be empty');
      }

      // Ensure buffer is a contiguous buffer (not a view) to prevent offset errors
      // Buffers created from ArrayBuffer views can have internal offset issues that cause
      // "offset out of range" errors when used in hash computation or file writes
      let normalizedBuffer = bytes;
      const bufferInfo = bytes as any;
      const isBufferView = bufferInfo.parent || (bufferInfo.offset !== undefined && bufferInfo.offset !== 0);
      
      if (isBufferView) {
        logger.debug(
          {
            bufferLength: bytes.length,
            hasParent: !!bufferInfo.parent,
            offset: bufferInfo.offset,
          },
          'Buffer appears to be a view, creating contiguous copy to prevent offset errors'
        );
        // Create a new contiguous buffer to avoid offset issues
        normalizedBuffer = Buffer.allocUnsafe(bytes.length);
        bytes.copy(normalizedBuffer, 0, 0, bytes.length);
      }

      // Compute sha256 with normalized buffer
      // Wrap in try-catch to handle any remaining offset errors gracefully
      let sha256: string;
      try {
        sha256 = createHash('sha256').update(normalizedBuffer).digest('hex');
      } catch (hashError) {
        // If hash computation still fails with offset error, try creating a fresh buffer
        if (hashError instanceof Error && hashError.message.includes('offset') && hashError.message.includes('out of range')) {
          logger.warn(
            {
              error: hashError,
              bufferLength: bytes.length,
            },
            'Buffer offset error during hash computation, creating fresh contiguous buffer'
          );
          // Create a completely fresh buffer by copying byte by byte if needed
          normalizedBuffer = Buffer.from(normalizedBuffer);
          sha256 = createHash('sha256').update(normalizedBuffer).digest('hex');
        } else {
          throw hashError;
        }
      }

      // Check if already exists
      const existing = await this.getRef(sha256);
      if (existing) {
        logger.debug({ sha256, storageKey: existing.storageKey }, 'Artifact already exists, returning existing ref');
        const duration = (Date.now() - startTime) / 1000;
        recordArtifactOperation('store', 'deduplicated', source, duration);
        return existing;
      }

    // Compute storage key
    const storageKey = computeStorageKey(sha256);
    const filePath = join(this.basePath, storageKey);

    // Write file atomically (write to temp file, then rename)
    const tempPath = `${filePath}.tmp`;
    try {
      // Ensure directory exists
      await fs.mkdir(dirname(filePath), { recursive: true });

      await fs.writeFile(tempPath, normalizedBuffer);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      
      // Handle permission errors gracefully
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EACCES') {
        logger.error(
          {
            error,
            filePath,
            basePath: this.basePath,
            sha256,
          },
          'Permission denied writing artifact. Check file system permissions or use object storage backend.'
        );
        throw new Error(
          `Permission denied writing artifact to ${filePath}. ` +
          `Ensure directory has write permissions or set ARTIFACT_STORE_TYPE=object-storage. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      
      throw error;
    }

    // Store metadata separately (for getRef to work)
    const metadataPath = `${filePath}.meta.json`;
    const metadata = {
      sha256,
      mimeType,
      sizeBytes: bytes.length,
      createdAt: new Date().toISOString(),
      provenance,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

      // Build and return ArtifactRef
      const artifactRef = buildArtifactRef(normalizedBuffer, mimeType, provenance, storageKey);

      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('store', 'success', source, duration, normalizedBuffer.length, mimeType);

      logger.debug(
        { sha256, storageKey, sizeBytes: normalizedBuffer.length, mimeType },
        'Artifact stored successfully'
      );

      return artifactRef;
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('store', 'error', source, duration);
      throw error;
    }
  }

  /**
   * Read an artifact by sha256
   * 
   * Verifies sha256 integrity on read.
   */
  async read(sha256: string): Promise<Buffer> {
    const startTime = Date.now();
    
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      throw new Error(`Invalid sha256 format: ${sha256}`);
    }

    const storageKey = computeStorageKey(sha256);
    const filePath = join(this.basePath, storageKey);

    try {
      const bytes = await fs.readFile(filePath);

      // Verify integrity
      const computedSha256 = createHash('sha256').update(bytes).digest('hex');
      if (computedSha256 !== sha256.toLowerCase()) {
        // Try to get source from metadata for metrics
        let source = 'unknown';
        try {
          const ref = await this.getRef(sha256);
          if (ref) source = ref.provenance.source;
        } catch {
          // Ignore errors getting source
        }
        
        const duration = (Date.now() - startTime) / 1000;
        recordArtifactOperation('read', 'integrity_failed', source, duration);
        
        throw new Error(
          `Artifact integrity check failed: expected ${sha256}, got ${computedSha256}`
        );
      }

      // Try to get source from metadata for metrics
      let source = 'unknown';
      try {
        const ref = await this.getRef(sha256);
        if (ref) source = ref.provenance.source;
      } catch {
        // Ignore errors getting source
      }
      
      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('read', 'success', source, duration);

      return bytes;
    } catch (error) {
      // Try to get source from metadata for metrics
      let source = 'unknown';
      try {
        const ref = await this.getRef(sha256);
        if (ref) source = ref.provenance.source;
      } catch {
        // Ignore errors getting source
      }
      
      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('read', 'error', source, duration);
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Artifact not found: ${sha256}`);
      }
      throw error;
    }
  }

  /**
   * Check if an artifact exists
   */
  async exists(sha256: string): Promise<boolean> {
    const startTime = Date.now();
    
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      return false;
    }

    const storageKey = computeStorageKey(sha256);
    const filePath = join(this.basePath, storageKey);

    try {
      await fs.access(filePath);
      // Try to get source from metadata for metrics
      let source = 'unknown';
      try {
        const ref = await this.getRef(sha256);
        if (ref) source = ref.provenance.source;
      } catch {
        // Ignore errors getting source
      }
      
      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('exists', 'success', source, duration);
      
      return true;
    } catch {
      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('exists', 'success', 'unknown', duration); // Not found is still success
      return false;
    }
  }

  /**
   * Get ArtifactRef metadata without reading bytes
   * 
   * Reads metadata from .meta.json file stored alongside the artifact.
   */
  async getRef(sha256: string): Promise<ArtifactRef | null> {
    const startTime = Date.now();
    
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      return null;
    }

    const storageKey = computeStorageKey(sha256);
    const filePath = join(this.basePath, storageKey);
    const metadataPath = `${filePath}.meta.json`;

    try {
      // Read metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent) as {
        sha256: string;
        mimeType: string;
        sizeBytes: number;
        createdAt: string;
        provenance: ArtifactProvenance;
      };

      // Verify file exists and size matches
      const stats = await fs.stat(filePath);
      if (stats.size !== metadata.sizeBytes) {
        logger.warn(
          { sha256, expectedSize: metadata.sizeBytes, actualSize: stats.size },
          'Artifact size mismatch in getRef'
        );
        const duration = (Date.now() - startTime) / 1000;
        recordArtifactOperation('getRef', 'error', metadata.provenance.source, duration);
        return null;
      }

      const duration = (Date.now() - startTime) / 1000;
      recordArtifactOperation('getRef', 'success', metadata.provenance.source, duration);

      // Convert provenance dates back to Date objects (they're stored as ISO strings in JSON)
      const provenance = {
        ...metadata.provenance,
        acquiredAt: new Date(metadata.provenance.acquiredAt),
      };

      return {
        sha256: sha256.toLowerCase(),
        storageKey,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        createdAt: new Date(metadata.createdAt),
        provenance,
      };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        recordArtifactOperation('getRef', 'success', 'unknown', duration); // Not found is still success
        return null;
      }
      recordArtifactOperation('getRef', 'error', 'unknown', duration);
      throw error;
    }
  }
}

