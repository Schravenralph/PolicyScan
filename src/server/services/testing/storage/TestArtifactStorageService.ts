/**
 * Test Artifact Storage Service
 * 
 * Handles storage of ephemeral test artifacts to disk (screenshots, videos, traces, logs).
 * These are large files that should not be stored in MongoDB.
 * 
 * Single Responsibility: Store test artifacts to disk only.
 * 
 * @module src/server/services/testing/storage/TestArtifactStorageService
 */

import { logger } from '../../../utils/logger.js';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { ensureDBConnection } from '../../../config/database.js';

/**
 * Test artifact types
 */
export type ArtifactType = 'screenshot' | 'video' | 'trace' | 'log' | 'other';

/**
 * Input for saving a test artifact
 */
export interface TestArtifactInput {
  /** Run ID or test ID */
  runId: string;
  /** Type of artifact */
  type: ArtifactType;
  /** Artifact file path (source) */
  sourcePath: string;
  /** Optional destination filename (defaults to source filename) */
  destinationFilename?: string;
  /** Optional subdirectory within artifact type directory */
  subdirectory?: string;
}

/**
 * Service for storing test artifacts to disk
 * 
 * This service handles ONLY storage of test artifacts to disk.
 * It does NOT handle:
 * - Routing decisions (handled by TestResultIngestionService)
 * - Artifact processing (handled by test runners)
 * - Artifact cleanup (handled by separate cleanup service)
 */
export class TestArtifactStorageService {
  private static instance: TestArtifactStorageService | null = null;
  private readonly baseDir: string;

  private constructor() {
    // Private constructor for singleton pattern
    this.baseDir = join(process.cwd(), 'test-artifacts');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestArtifactStorageService {
    if (!TestArtifactStorageService.instance) {
      TestArtifactStorageService.instance = new TestArtifactStorageService();
    }
    return TestArtifactStorageService.instance;
  }

  /**
   * Ensure artifact directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.baseDir,
      join(this.baseDir, 'screenshots'),
      join(this.baseDir, 'videos'),
      join(this.baseDir, 'traces'),
      join(this.baseDir, 'logs'),
      join(this.baseDir, 'other'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Get artifact directory path for a given type
   */
  private getArtifactDir(type: ArtifactType): string {
    return join(this.baseDir, type);
  }

  /**
   * Sanitize and normalize artifact input
   * 
   * Performs basic sanitization for defense in depth:
   * - Trims string fields
   * - Normalizes file paths
   * - Validates paths to prevent directory traversal
   * 
   * @param input Artifact data to sanitize
   * @returns Sanitized input
   */
  private sanitizeInput(input: TestArtifactInput): TestArtifactInput {
    // Sanitize run ID
    const runId = typeof input.runId === 'string' ? input.runId.trim() : input.runId;

    // Normalize source path (convert backslashes to forward slashes for consistency)
    const sourcePath = typeof input.sourcePath === 'string'
      ? input.sourcePath.replace(/\\/g, '/')
      : input.sourcePath;

    // Sanitize destination filename (prevent directory traversal)
    let destinationFilename = input.destinationFilename;
    if (destinationFilename) {
      // Remove path separators and parent directory references
      destinationFilename = destinationFilename
        .replace(/[/\\]/g, '')
        .replace(/\.\./g, '')
        .trim();
      
      // Ensure filename is not empty after sanitization
      if (!destinationFilename) {
        destinationFilename = undefined;
      }
    }

    // Sanitize subdirectory (prevent directory traversal)
    let subdirectory = input.subdirectory;
    if (subdirectory) {
      // Remove parent directory references and normalize
      subdirectory = subdirectory
        .replace(/\.\./g, '')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
        .trim();
      
      // Ensure subdirectory is not empty after sanitization
      if (!subdirectory) {
        subdirectory = undefined;
      }
    }

    return {
      ...input,
      runId,
      sourcePath,
      destinationFilename,
      subdirectory,
    };
  }

  /**
   * Save test artifact to disk
   * 
   * @param input Artifact data to save
   * @returns Path to saved artifact
   */
  async save(input: TestArtifactInput): Promise<string> {
    try {
      // Sanitize input for defense in depth
      const sanitizedInput = this.sanitizeInput(input);

      this.ensureDirectories();

      const artifactDir = this.getArtifactDir(sanitizedInput.type);
      
      // Create subdirectory if specified
      let destinationDir = artifactDir;
      if (sanitizedInput.subdirectory) {
        destinationDir = join(artifactDir, sanitizedInput.subdirectory);
        if (!existsSync(destinationDir)) {
          mkdirSync(destinationDir, { recursive: true });
        }
      }

      // Determine destination filename
      const filename = sanitizedInput.destinationFilename || 
        sanitizedInput.sourcePath.split(/[/\\]/).pop() || 
        `artifact-${Date.now()}`;
      
      const destinationPath = join(destinationDir, filename);

      // Copy file from source to destination
      if (!existsSync(sanitizedInput.sourcePath)) {
        throw new Error(`Source artifact file does not exist: ${sanitizedInput.sourcePath}`);
      }

      copyFileSync(sanitizedInput.sourcePath, destinationPath);

      logger.debug(
        { 
          runId: sanitizedInput.runId, 
          type: sanitizedInput.type,
          sourcePath: sanitizedInput.sourcePath,
          destinationPath,
        },
        'Test artifact saved'
      );

      return destinationPath;
    } catch (error) {
      logger.error({ error, runId: input.runId, type: input.type }, 'Failed to save test artifact');
      throw error;
    }
  }

  /**
   * Save test artifact content directly (for cases where we have content, not a file)
   * 
   * @param input Artifact data with content
   * @returns Path to saved artifact
   */
  async saveContent(input: {
    runId: string;
    type: ArtifactType;
    content: string | Buffer;
    filename: string;
    subdirectory?: string;
  }): Promise<string> {
    try {
      this.ensureDirectories();

      const artifactDir = this.getArtifactDir(input.type);
      
      // Create subdirectory if specified
      let destinationDir = artifactDir;
      if (input.subdirectory) {
        destinationDir = join(artifactDir, input.subdirectory);
        if (!existsSync(destinationDir)) {
          mkdirSync(destinationDir, { recursive: true });
        }
      }

      const destinationPath = join(destinationDir, input.filename);

      // Write content to file
      writeFileSync(destinationPath, input.content);

      logger.debug(
        { 
          runId: input.runId, 
          type: input.type,
          destinationPath,
        },
        'Test artifact content saved'
      );

      return destinationPath;
    } catch (error) {
      logger.error({ error, runId: input.runId, type: input.type }, 'Failed to save test artifact content');
      throw error;
    }
  }

  /**
   * Get artifact path (for reading artifacts)
   * 
   * @param runId Run ID or test ID
   * @param type Artifact type
   * @param filename Artifact filename
   * @param subdirectory Optional subdirectory
   * @returns Full path to artifact, or null if not found
   */
  getArtifactPath(
    runId: string,
    type: ArtifactType,
    filename: string,
    subdirectory?: string
  ): string | null {
    const artifactDir = this.getArtifactDir(type);
    const dir = subdirectory ? join(artifactDir, subdirectory) : artifactDir;
    const path = join(dir, filename);
    
    return existsSync(path) ? path : null;
  }
}

/**
 * Get singleton instance of TestArtifactStorageService
 */
export function getTestArtifactStorageService(): TestArtifactStorageService {
  return TestArtifactStorageService.getInstance();
}
