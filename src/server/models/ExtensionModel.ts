/**
 * ExtensionModel - MongoDB persistence for document extensions
 * 
 * Stores domain-specific metadata (Geo, Legal, Web) as sidecars to canonical documents.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/02-extensions.md
 */

import { getDB } from '../config/database.js';
import { ObjectId, type ClientSession, type Filter, type UpdateFilter } from 'mongodb';
import { logger } from '../utils/logger.js';
import type { ExtensionType } from '../contracts/types.js';

const COLLECTION_NAME = 'extensions';
let indexesEnsured = false;

/**
 * Extension document schema
 */
export interface ExtensionDocument {
  _id?: ObjectId;
  documentId: string;
  type: ExtensionType;
  version: string; // schema version of payload
  payload: Record<string, unknown>; // JSON payload
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ExtensionModel - MongoDB model for extensions
 */
export class ExtensionModel {
  /**
   * Ensure database indexes exist
   */
  static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    try {
      // Unique index on (documentId, type) - idempotency key
      await collection.createIndex(
        { documentId: 1, type: 1 },
        { unique: true, name: 'idx_documentId_type' }
      );
      
      // Index on documentId for lookups
      await collection.createIndex(
        { documentId: 1 },
        { name: 'idx_documentId' }
      );
      
      // Index on type for filtering
      await collection.createIndex(
        { type: 1 },
        { name: 'idx_type' }
      );
      
      // Index on createdAt for sorting
      await collection.createIndex(
        { createdAt: -1 },
        { name: 'idx_createdAt' }
      );
      
      // Compound index on (type, updatedAt) for filtering by type and sorting by update time
      // Useful for queries like "get all geo extensions updated recently"
      await collection.createIndex(
        { type: 1, updatedAt: -1 },
        { name: 'idx_type_updatedAt', background: true }
      );
      
      indexesEnsured = true;
      logger.debug('ExtensionModel indexes created successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to create ExtensionModel indexes');
      throw error;
    }
  }

  /**
   * Upsert extension by (documentId, type) - idempotent
   * 
   * @param documentId - Document ID
   * @param type - Extension type
   * @param version - Schema version
   * @param payload - Extension payload
   * @param session - Optional MongoDB session for transactions
   * @returns Extension document
   */
  static async upsert(
    documentId: string,
    type: ExtensionType,
    version: string,
    payload: Record<string, unknown>,
    session?: ClientSession
  ): Promise<ExtensionDocument> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    const now = new Date();
    
    const filter: Filter<ExtensionDocument> = {
      documentId,
      type,
    };
    
    const update: UpdateFilter<ExtensionDocument> = {
      $set: {
        documentId,
        type,
        version,
        payload,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    };
    
    const result = await collection.findOneAndUpdate(
      filter,
      update,
      {
        session,
        upsert: true,
        returnDocument: 'after',
      }
    );
    
    if (!result) {
      throw new Error(`Failed to upsert extension for documentId=${documentId}, type=${type}`);
    }
    
    return result;
  }

  /**
   * Find extension by documentId and type
   * 
   * @param documentId - Document ID
   * @param type - Extension type
   * @param session - Optional MongoDB session for transactions
   * @returns Extension document or null if not found
   */
  static async findByDocumentIdAndType(
    documentId: string,
    type: ExtensionType,
    session?: ClientSession
  ): Promise<ExtensionDocument | null> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    return await collection.findOne(
      { documentId, type },
      { session }
    );
  }

  /**
   * Find all extensions for a document
   * 
   * @param documentId - Document ID
   * @param session - Optional MongoDB session for transactions
   * @returns Array of extension documents
   */
  static async findByDocumentId(
    documentId: string,
    session?: ClientSession
  ): Promise<ExtensionDocument[]> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    return await collection.find(
      { documentId },
      { session }
    ).toArray();
  }

  /**
   * Find extensions by type with pagination
   * 
   * @param type - Extension type
   * @param skip - Number of documents to skip
   * @param limit - Maximum number of documents to return
   * @param session - Optional MongoDB session for transactions
   * @returns Array of extension documents
   */
  static async findByType(
    type: ExtensionType,
    skip: number = 0,
    limit: number = 100,
    session?: ClientSession
  ): Promise<ExtensionDocument[]> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    return await collection
      .find({ type }, { session })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Delete extension by documentId and type
   * 
   * @param documentId - Document ID
   * @param type - Extension type
   * @param session - Optional MongoDB session for transactions
   * @returns True if deleted, false if not found
   */
  static async delete(
    documentId: string,
    type: ExtensionType,
    session?: ClientSession
  ): Promise<boolean> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    const result = await collection.deleteOne(
      { documentId, type },
      { session }
    );
    
    return result.deletedCount > 0;
  }

  /**
   * Delete all extensions for a document
   * 
   * @param documentId - Document ID
   * @param session - Optional MongoDB session for transactions
   * @returns Number of deleted extensions
   */
  static async deleteByDocumentId(
    documentId: string,
    session?: ClientSession
  ): Promise<number> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    const result = await collection.deleteMany(
      { documentId },
      { session }
    );
    
    return result.deletedCount;
  }

  /**
   * Find extensions for multiple documents (batch loading)
   * 
   * Efficiently loads extensions for multiple documents in a single query.
   * Returns a map of documentId -> ExtensionDocument[] for easy lookup.
   * 
   * @param documentIds - Array of document IDs
   * @param types - Optional array of extension types to filter by
   * @param session - Optional MongoDB session for transactions
   * @returns Map of documentId to array of extension documents
   * 
   * @example
   * ```typescript
   * const extensions = await ExtensionModel.findByDocumentIds(
   *   ['doc1', 'doc2', 'doc3'],
   *   ['geo', 'legal']
   * );
   * // extensions.get('doc1') => [geoExtension, legalExtension]
   * ```
   */
  static async findByDocumentIds(
    documentIds: string[],
    types?: ExtensionType[],
    session?: ClientSession
  ): Promise<Map<string, ExtensionDocument[]>> {
    await this.ensureIndexes();
    
    if (documentIds.length === 0) {
      return new Map();
    }
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    const filter: Filter<ExtensionDocument> = {
      documentId: { $in: documentIds },
    };
    
    if (types && types.length > 0) {
      filter.type = { $in: types };
    }
    
    const extensions = await collection.find(filter, { session }).toArray();
    
    // Group by documentId
    const result = new Map<string, ExtensionDocument[]>();
    for (const ext of extensions) {
      const existing = result.get(ext.documentId) || [];
      existing.push(ext);
      result.set(ext.documentId, existing);
    }
    
    // Ensure all documentIds have entries (even if empty)
    for (const docId of documentIds) {
      if (!result.has(docId)) {
        result.set(docId, []);
      }
    }
    
    return result;
  }

  /**
   * Find extensions by documentIds and type (optimized batch query)
   * 
   * Efficiently loads a specific extension type for multiple documents.
   * 
   * @param documentIds - Array of document IDs
   * @param type - Extension type to load
   * @param session - Optional MongoDB session for transactions
   * @returns Map of documentId to extension document (or null if not found)
   * 
   * @example
   * ```typescript
   * const geoExtensions = await ExtensionModel.findByDocumentIdsAndType(
   *   ['doc1', 'doc2', 'doc3'],
   *   'geo'
   * );
   * // geoExtensions.get('doc1') => geoExtension or null
   * ```
   */
  static async findByDocumentIdsAndType(
    documentIds: string[],
    type: ExtensionType,
    session?: ClientSession
  ): Promise<Map<string, ExtensionDocument | null>> {
    await this.ensureIndexes();
    
    if (documentIds.length === 0) {
      return new Map();
    }
    
    const db = getDB();
    const collection = db.collection<ExtensionDocument>(COLLECTION_NAME);
    
    const extensions = await collection.find(
      {
        documentId: { $in: documentIds },
        type,
      },
      { session }
    ).toArray();
    
    // Create map of documentId -> extension
    const result = new Map<string, ExtensionDocument | null>();
    for (const docId of documentIds) {
      result.set(docId, null); // Initialize with null
    }
    
    for (const ext of extensions) {
      result.set(ext.documentId, ext);
    }
    
    return result;
  }
}

