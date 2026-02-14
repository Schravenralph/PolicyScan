/**
 * ExtensionService - Base service for document extensions
 * 
 * Provides replay-safe upserts with schema version enforcement.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */

import { type ClientSession } from 'mongodb';
import { ExtensionModel, type ExtensionDocument } from '../../models/ExtensionModel.js';
import type { ExtensionType, ServiceContext } from '../../contracts/types.js';
import { logger } from '../../utils/logger.js';
import { migrationRegistry } from './migrations/MigrationHook.js';

/**
 * Base ExtensionService implementation
 * 
 * Provides generic extension operations with transaction support.
 * Typed services (GeoExtensionService, etc.) extend this base.
 */
export class ExtensionService<T = Record<string, unknown>> {
  protected readonly type: ExtensionType;
  protected readonly defaultVersion: string;

  constructor(type: ExtensionType, defaultVersion: string = 'v1') {
    this.type = type;
    this.defaultVersion = defaultVersion;
  }

  /**
   * Get MongoDB session from service context
   */
  protected getSession(ctx?: ServiceContext): ClientSession | undefined {
    return ctx?.session as ClientSession | undefined;
  }

  /**
   * Upsert extension - idempotent by (documentId, type)
   * 
   * Validates payload before persistence. If version mismatch, throws error
   * (or could migrate explicitly in future).
   * 
   * @param documentId - Document ID
   * @param payload - Extension payload (will be validated by typed service)
   * @param ctx - Service context (may include session for transactions)
   * @returns Extension document
   */
  async upsert(
    documentId: string,
    payload: T,
    ctx?: ServiceContext
  ): Promise<ExtensionDocument> {
    const session = this.getSession(ctx);
    
    // Validate payload - this should be overridden by typed services
    // but we provide a default that accepts any object
    if (!payload || typeof payload !== 'object') {
      throw new Error(`Invalid payload for ${this.type} extension: must be an object`);
    }

    // Use default version if not provided in payload
    const version = (payload as { version?: string }).version || this.defaultVersion;

    // Upsert to MongoDB
    const result = await ExtensionModel.upsert(
      documentId,
      this.type,
      version,
      payload as Record<string, unknown>,
      session
    );

    logger.debug(
      { documentId, type: this.type, version },
      `Upserted ${this.type} extension`
    );

    return result;
  }

  /**
   * Get extension by documentId
   * 
   * Automatically migrates payload to latest version if migration hooks are registered.
   * 
   * @param documentId - Document ID
   * @param ctx - Optional service context (for transaction support)
   * @param autoMigrate - Whether to automatically migrate to latest version (default: true)
   * @returns Extension payload or null if not found
   */
  async get(
    documentId: string,
    ctx?: ServiceContext,
    autoMigrate: boolean = true
  ): Promise<T | null> {
    const session = this.getSession(ctx);
    
    const doc = await ExtensionModel.findByDocumentIdAndType(
      documentId,
      this.type,
      session
    );

    if (!doc) {
      return null;
    }

    let payload = doc.payload as T;

    // Auto-migrate if enabled and migration path exists
    if (autoMigrate && doc.version !== this.defaultVersion) {
      const migrationPath = migrationRegistry.getMigrationPath(
        this.type,
        doc.version,
        this.defaultVersion
      );

      if (migrationPath && migrationPath.migrations.length > 0) {
        logger.debug(
          { documentId, type: this.type, fromVersion: doc.version, toVersion: this.defaultVersion },
          'Auto-migrating extension payload'
        );

        // Apply migrations in sequence
        let migratedPayload = payload;
        for (const migration of migrationPath.migrations) {
          migratedPayload = migration.migrate(
            migratedPayload,
            migrationPath.fromVersion,
            migrationPath.toVersion
          ) as T;
        }

        // Update extension with migrated payload (non-blocking)
        // This happens asynchronously to avoid blocking the read
        this.upsert(documentId, migratedPayload, ctx).catch((error) => {
          logger.warn(
            { error, documentId, type: this.type },
            'Failed to persist migrated extension payload (non-fatal)'
          );
        });

        payload = migratedPayload;
      }
    }

    return payload;
  }

  /**
   * Process extension document payload (with migration if needed)
   * 
   * Similar to get() but works with an already-loaded extension document,
   * avoiding an extra database query. Useful for batch loading scenarios.
   * 
   * @param extDoc - Already-loaded extension document
   * @param ctx - Optional service context
   * @param autoMigrate - Whether to automatically migrate to latest version (default: true)
   * @returns Extension payload or null if document is null
   */
  async processExtensionDocument(
    extDoc: ExtensionDocument | null,
    ctx?: ServiceContext,
    autoMigrate: boolean = true
  ): Promise<T | null> {
    if (!extDoc) {
      return null;
    }

    let payload = extDoc.payload as T;

    // Auto-migrate if enabled and migration path exists
    if (autoMigrate && extDoc.version !== this.defaultVersion) {
      const migrationPath = migrationRegistry.getMigrationPath(
        this.type,
        extDoc.version,
        this.defaultVersion
      );

      if (migrationPath && migrationPath.migrations.length > 0) {
        logger.debug(
          { documentId: extDoc.documentId, type: this.type, fromVersion: extDoc.version, toVersion: this.defaultVersion },
          'Auto-migrating extension payload'
        );

        // Apply migrations in sequence
        let migratedPayload = payload;
        for (const migration of migrationPath.migrations) {
          migratedPayload = migration.migrate(
            migratedPayload,
            migrationPath.fromVersion,
            migrationPath.toVersion
          ) as T;
        }

        // Update extension with migrated payload (non-blocking)
        // This happens asynchronously to avoid blocking the read
        this.upsert(extDoc.documentId, migratedPayload, ctx).catch((error) => {
          logger.warn(
            { error, documentId: extDoc.documentId, type: this.type },
            'Failed to persist migrated extension payload (non-fatal)'
          );
        });

        payload = migratedPayload;
      }
    }

    return payload;
  }

  /**
   * Migrate extension to target version
   * 
   * @param documentId - Document ID
   * @param targetVersion - Target version
   * @param ctx - Optional service context
   * @returns True if migration was successful
   */
  async migrateExtension(
    documentId: string,
    targetVersion: string,
    ctx?: ServiceContext
  ): Promise<boolean> {
    const session = this.getSession(ctx);
    
    const doc = await ExtensionModel.findByDocumentIdAndType(
      documentId,
      this.type,
      session
    );

    if (!doc) {
      return false;
    }

    if (doc.version === targetVersion) {
      return true; // Already at target version
    }

    const migrationPath = migrationRegistry.getMigrationPath(
      this.type,
      doc.version,
      targetVersion
    );

    if (!migrationPath || migrationPath.migrations.length === 0) {
      logger.warn(
        { documentId, type: this.type, fromVersion: doc.version, toVersion: targetVersion },
        'No migration path found'
      );
      return false;
    }

    // Apply migrations in sequence
    let migratedPayload: Record<string, unknown> = doc.payload as Record<string, unknown>;
    for (const migration of migrationPath.migrations) {
      migratedPayload = migration.migrate(
        migratedPayload,
        migrationPath.fromVersion,
        migrationPath.toVersion
      ) as Record<string, unknown>;
    }

    // Update extension with migrated payload
    await this.upsert(documentId, migratedPayload as T, ctx);

    logger.info(
      { documentId, type: this.type, fromVersion: doc.version, toVersion: targetVersion },
      'Migrated extension payload'
    );

    return true;
  }

  /**
   * Migrate all extensions of this type to target version
   * 
   * @param targetVersion - Target version
   * @param batchSize - Batch size for processing (default: 100)
   * @returns Number of extensions migrated
   */
  async migrateAllExtensions(
    targetVersion: string,
    batchSize: number = 100
  ): Promise<number> {
    const { ExtensionModel } = await import('../../models/ExtensionModel.js');
    
    let migrated = 0;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const extensions = await ExtensionModel.findByType(this.type, skip, batchSize);
      
      if (extensions.length === 0) {
        hasMore = false;
        break;
      }

      for (const ext of extensions) {
        if (ext.version === targetVersion) {
          continue; // Already at target version
        }

        const success = await this.migrateExtension(ext.documentId, targetVersion);
        if (success) {
          migrated++;
        }
      }

      skip += batchSize;
      hasMore = extensions.length === batchSize;
    }

    logger.info(
      { type: this.type, targetVersion, migrated },
      'Completed bulk extension migration'
    );

    return migrated;
  }

  /**
   * Delete extension by documentId
   * 
   * @param documentId - Document ID
   * @param ctx - Optional service context (for transaction support)
   */
  async delete(documentId: string, ctx?: ServiceContext): Promise<void> {
    const session = this.getSession(ctx);
    
    const deleted = await ExtensionModel.delete(documentId, this.type, session);
    
    if (!deleted) {
      logger.warn(
        { documentId, type: this.type },
        `Extension not found for deletion`
      );
    } else {
      logger.debug(
        { documentId, type: this.type },
        `Deleted ${this.type} extension`
      );
    }
  }

  /**
   * Get extension document (includes metadata)
   * 
   * @param documentId - Document ID
   * @param ctx - Optional service context (for transaction support)
   * @returns Extension document or null if not found
   */
  async getDocument(documentId: string, ctx?: ServiceContext): Promise<ExtensionDocument | null> {
    const session = this.getSession(ctx);
    
    return await ExtensionModel.findByDocumentIdAndType(
      documentId,
      this.type,
      session
    );
  }

  /**
   * Get multiple extensions in bulk
   *
   * @param documentIds - Array of Document IDs
   * @param ctx - Optional service context (for transaction support)
   * @param autoMigrate - Whether to automatically migrate to latest version (default: true)
   * @returns Map of documentId to extension payload
   */
  async getMany(
    documentIds: string[],
    ctx?: ServiceContext,
    autoMigrate: boolean = true
  ): Promise<Map<string, T>> {
    const session = this.getSession(ctx);

    const extDocsMap = await ExtensionModel.findByDocumentIdsAndType(
      documentIds,
      this.type,
      session
    );

    const result = new Map<string, T>();
    const processingPromises: Promise<void>[] = [];

    for (const [docId, extDoc] of extDocsMap.entries()) {
      if (extDoc) {
        // Process each extension (migration, payload extraction)
        // We use processExtensionDocument to reuse the logic from get()
        const promise = this.processExtensionDocument(extDoc, ctx, autoMigrate)
          .then(payload => {
            if (payload) {
              result.set(docId, payload);
            }
          })
          .catch(error => {
            logger.warn(
              { error, documentId: docId, type: this.type },
              'Failed to process extension during bulk retrieval'
            );
          });

        processingPromises.push(promise);
      }
    }

    await Promise.all(processingPromises);

    return result;
  }
}

