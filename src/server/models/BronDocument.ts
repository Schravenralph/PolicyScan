import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter, type ClientSession } from 'mongodb';
import type { BronDocumentDocument, BronDocumentCreateInput } from '../types/index.js';
import { handleDatabaseOperation, DatabaseValidationError } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'brondocumenten';

/**
 * ⚠️ **DEPRECATED** - Legacy document model
 * 
 * This model is deprecated and will be removed in a future version.
 * Use `CanonicalDocumentService` from `src/server/services/canonical/CanonicalDocumentService.ts` instead.
 * 
 * @deprecated Use `CanonicalDocumentService` instead
 * @see src/server/services/canonical/CanonicalDocumentService.ts
 * @see WI-415: Backend Cleanup & Transformation Removal
 */
export class BronDocument {
  /**
   * ⚠️ **DEPRECATED** - Legacy index creation
   * 
   * This method is deprecated. Indexes for canonical documents are created via `ensureCanonicalIndexes()`.
   * 
   * @deprecated Use `ensureCanonicalIndexes()` instead
   * @see src/server/config/ensureCanonicalIndexes.ts
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);

    // Index for finding by URL (used in findByUrl and upserts)
    // Using compound index with queryId for optimal upsert performance in ScanJobProcessor
    // Note: This compound index also supports queries on just 'url' (prefix)
    await collection.createIndex({ url: 1, queryId: 1 });

    // Index for finding by website URL
    await collection.createIndex({ website_url: 1 });

    // Index for finding by query ID
    await collection.createIndex({ queryId: 1 });

    // Index for finding by workflow run ID
    await collection.createIndex({ workflowRunId: 1 });

    // Index for finding by source
    await collection.createIndex({ source: 1 });

    // Index for date range queries
    await collection.createIndex({ discoveredAt: 1 });
  }

  /**
   * Create a new bron document
   * 
   * @deprecated Use CanonicalDocumentService.create() instead
   * @param documentData - Document creation data
   * @param session - Optional MongoDB session for transaction support
   */
  static async create(documentData: BronDocumentCreateInput, session?: ClientSession): Promise<BronDocumentDocument> {
    return handleDatabaseOperation(async () => {
      const db = getDB();

      const document: BronDocumentDocument = {
        titel: documentData.titel,
        url: documentData.url,
        website_url: documentData.website_url,
        website_titel: documentData.website_titel || '',
        label: documentData.label,
        samenvatting: documentData.samenvatting,
        'relevantie voor zoekopdracht': documentData['relevantie voor zoekopdracht'],
        type_document: documentData.type_document,
        publicatiedatum: documentData.publicatiedatum || null,
        subjects: documentData.subjects || [],
        themes: documentData.themes || [],
        accepted: documentData.accepted ?? null,
        queryId: documentData.queryId ? new ObjectId(documentData.queryId) : undefined,
        // Workflow metadata fields
        workflowRunId: documentData.workflowRunId ? new ObjectId(documentData.workflowRunId) : undefined,
        workflowId: documentData.workflowId,
        stepId: documentData.stepId,
        source: documentData.source,
        discoveredAt: documentData.discoveredAt || new Date(),
        embedding: documentData.embedding,
        embeddingModel: documentData.embeddingModel,
        embeddingGeneratedAt: documentData.embeddingGeneratedAt,
        issuingAuthority: documentData.issuingAuthority || null,
        documentStatus: documentData.documentStatus || null,
        metadataConfidence: documentData.metadataConfidence,
        contentHash: documentData.contentHash,
        lastContentChange: documentData.lastContentChange || (documentData.contentHash ? new Date() : undefined),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection<BronDocumentDocument>(COLLECTION_NAME).insertOne(document, { session });
      return { ...document, _id: result.insertedId };
    }, 'BronDocument.create');
  }

  /**
   * Create multiple bron documents
   * 
   * @deprecated Use CanonicalDocumentService.upsertBatch() instead
   * @param documentsData - Array of document creation data
   * @param session - Optional MongoDB session for transaction support
   */
  static async createMany(documentsData: BronDocumentCreateInput[], session?: ClientSession): Promise<BronDocumentDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const documents: BronDocumentDocument[] = documentsData.map(data => ({
        titel: data.titel,
        url: data.url,
        website_url: data.website_url,
        website_titel: data.website_titel || '',
        label: data.label,
        samenvatting: data.samenvatting,
        'relevantie voor zoekopdracht': data['relevantie voor zoekopdracht'],
        type_document: data.type_document,
        publicatiedatum: data.publicatiedatum || null,
        subjects: data.subjects || [],
        themes: data.themes || [],
        accepted: data.accepted ?? null,
        queryId: data.queryId ? new ObjectId(data.queryId) : undefined,
        // Workflow metadata fields
        workflowRunId: data.workflowRunId ? new ObjectId(data.workflowRunId) : undefined,
        workflowId: data.workflowId,
        stepId: data.stepId,
        source: data.source,
        discoveredAt: data.discoveredAt || new Date(),
        embedding: data.embedding,
        embeddingModel: data.embeddingModel,
        embeddingGeneratedAt: data.embeddingGeneratedAt,
        issuingAuthority: data.issuingAuthority || null,
        documentStatus: data.documentStatus || null,
        metadataConfidence: data.metadataConfidence,
        contentHash: data.contentHash,
        lastContentChange: data.lastContentChange || (data.contentHash ? new Date() : undefined),
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const result = await db.collection<BronDocumentDocument>(COLLECTION_NAME).insertMany(
        documents,
        session ? { session } : undefined
      );
      return documents.map((document, index) => ({
        ...document,
        _id: result.insertedIds[index]
      }));
    }, 'BronDocument.createMany');
  }


  /**
   * Find a document by ID
   * @deprecated Use CanonicalDocumentService.findById() instead
   */
  static async findById(id: string): Promise<BronDocumentDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
    }, 'BronDocument.findById');
  }

  /**
   * Find documents by multiple IDs
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with multiple IDs instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findByIds(ids: string[]): Promise<BronDocumentDocument[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();

      // Limit array size to prevent memory exhaustion
      const MAX_IDS = parseInt(process.env.MAX_BRON_DOCUMENT_IDS || '1000', 10);
      const limitedIds = ids.slice(0, MAX_IDS);

      if (ids.length > MAX_IDS) {
        console.warn(
          `[BronDocument] IDs list truncated from ${ids.length} to ${MAX_IDS} to prevent memory exhaustion`
        );
      }

      const validIds = limitedIds
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

      if (validIds.length === 0) {
        return [];
      }

      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({ _id: { $in: validIds } })
        .limit(MAX_IDS)
        .toArray();
    }, 'BronDocument.findByIds');
  }

  /**
   * Find all documents with pagination support
   * @deprecated Use CanonicalDocumentService.findAll() instead
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  } = {}): Promise<BronDocumentDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit = 50, skip = 0, sort = { createdAt: -1 } } = options;

      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find()
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();
    }, 'BronDocument.findAll');
  }

  /**
   * Count total number of documents
   * 
   * @deprecated Use CanonicalDocumentService.count() instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async count(): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME).countDocuments({});
    }, 'BronDocument.count');
  }

  /**
   * Find documents by website URL
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with website filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findByWebsiteUrl(
    websiteUrl: string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<BronDocumentDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      // Default limit to prevent loading all documents into memory
      const defaultLimit = parseInt(process.env.MAX_BRON_DOCUMENT_RESULTS || '50', 10);
      const { limit = defaultLimit, skip } = options;
      const query = db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({ website_url: websiteUrl });

      if (skip) {
        query.skip(skip);
      }
      query.limit(limit);
      return await query.toArray();
    }, 'BronDocument.findByWebsiteUrl');
  }

  /**
   * Count documents by website URL
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with website filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countByWebsiteUrl(websiteUrl: string): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .countDocuments({ website_url: websiteUrl });
    }, 'BronDocument.countByWebsiteUrl');
  }

  /**
   * Count documents by query ID
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with queryId filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countByQueryId(queryId: string): Promise<number> {
    if (!ObjectId.isValid(queryId)) {
      return 0;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .countDocuments({ queryId: new ObjectId(queryId) });
    }, 'BronDocument.countByQueryId');
  }

  /**
   * Find documents by query ID with pagination
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with queryId filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findByQueryId(
    queryId: string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<BronDocumentDocument[]> {
    if (!ObjectId.isValid(queryId)) {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      // Default limit to prevent loading all documents into memory
      const defaultLimit = parseInt(process.env.MAX_BRON_DOCUMENT_RESULTS || '50', 10);
      const { limit = defaultLimit, skip } = options;
      const query = db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({ queryId: new ObjectId(queryId) });

      if (skip) {
        query.skip(skip);
      }
      query.limit(limit);
      return await query.toArray();
    }, 'BronDocument.findByQueryId');
  }

  /**
   * Find documents by workflow run ID with pagination
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with workflowRunId filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findByWorkflowRunId(
    workflowRunId: string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<BronDocumentDocument[]> {
    if (!ObjectId.isValid(workflowRunId)) {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const defaultLimit = parseInt(process.env.MAX_BRON_DOCUMENT_RESULTS || '50', 10);
      const { limit = defaultLimit, skip } = options;
      const query = db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({ workflowRunId: new ObjectId(workflowRunId) });

      if (skip) {
        query.skip(skip);
      }
      query.limit(limit);
      return await query.toArray();
    }, 'BronDocument.findByWorkflowRunId');
  }

  /**
   * Count documents by workflow run ID
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with workflowRunId filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countByWorkflowRunId(workflowRunId: string): Promise<number> {
    if (!ObjectId.isValid(workflowRunId)) {
      return 0;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .countDocuments({ workflowRunId: new ObjectId(workflowRunId) });
    }, 'BronDocument.countByWorkflowRunId');
  }

  /**
   * Find documents by source with pagination
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with source filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findBySource(
    source: string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<BronDocumentDocument[]> {
    if (!source || typeof source !== 'string') {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const defaultLimit = parseInt(process.env.MAX_BRON_DOCUMENT_RESULTS || '50', 10);
      const { limit = defaultLimit, skip } = options;
      const query = db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({ source });

      if (skip) {
        query.skip(skip);
      }
      query.limit(limit);
      return await query.toArray();
    }, 'BronDocument.findBySource');
  }

  /**
   * Count documents by source
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with source filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countBySource(source: string): Promise<number> {
    if (!source || typeof source !== 'string') {
      return 0;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .countDocuments({ source });
    }, 'BronDocument.countBySource');
  }

  /**
   * Find documents by date range with pagination
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with date range filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findByDateRange(
    startDate: Date,
    endDate: Date,
    options: { limit?: number; skip?: number } = {}
  ): Promise<BronDocumentDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const defaultLimit = parseInt(process.env.MAX_BRON_DOCUMENT_RESULTS || '50', 10);
      const { limit = defaultLimit, skip } = options;
      const query = db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({
          discoveredAt: {
            $gte: startDate,
            $lte: endDate
          }
        });

      if (skip) {
        query.skip(skip);
      }
      query.limit(limit);
      return await query.toArray();
    }, 'BronDocument.findByDateRange');
  }

  /**
   * Count documents by date range
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with date range filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countByDateRange(startDate: Date, endDate: Date): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .countDocuments({
          discoveredAt: {
            $gte: startDate,
            $lte: endDate
          }
        });
    }, 'BronDocument.countByDateRange');
  }

  /**
   * Find a document by URL
   * @deprecated Use CanonicalDocumentService.findByUrl() instead
   */
  static async findByUrl(url: string): Promise<BronDocumentDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME).findOne({ url });
    }, 'BronDocument.findByUrl');
  }

  /**
   * Find documents by multiple URLs, optionally filtering by embedding existence
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with URL filters instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findByUrls(
    urls: string[],
    options: { hasEmbedding?: boolean } = {}
  ): Promise<BronDocumentDocument[]> {
    if (!urls || urls.length === 0) {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();

      // Limit array size to prevent memory exhaustion
      const MAX_URLS = parseInt(process.env.MAX_BRON_DOCUMENT_URLS || '1000', 10);
      const limitedUrls = urls.slice(0, MAX_URLS);

      if (urls.length > MAX_URLS) {
        console.warn(
          `[BronDocument] URLs list truncated from ${urls.length} to ${MAX_URLS} to prevent memory exhaustion`
        );
      }

      const query: Filter<BronDocumentDocument> = { url: { $in: limitedUrls } };

      if (options.hasEmbedding === true) {
        (query as Record<string, unknown>).embedding = { $exists: true, $ne: null };
      }

      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find(query)
        .limit(MAX_URLS)
        .toArray();
    }, 'BronDocument.findByUrls');
  }

  /**
   * Update a document
   * 
   * @deprecated Use CanonicalDocumentService.update() instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async update(id: string, updateData: Partial<BronDocumentCreateInput>): Promise<BronDocumentDocument | null> {
    if (!ObjectId.isValid(id)) {
      throw new DatabaseValidationError('Invalid document ID');
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();

      // Convert queryId and workflowRunId from string to ObjectId if provided
      const { queryId, workflowRunId, contentHash, ...rest } = updateData;

      // Build update payload - exclude workflowRunId and queryId from type
      // workflowRunId and queryId are handled separately below with proper ObjectId conversion
      // Use Omit to exclude these fields from the type since they need conversion
      const updatePayload: Partial<Omit<BronDocumentDocument, 'queryId' | 'workflowRunId'>> & {
        queryId?: ObjectId;
        workflowRunId?: ObjectId;
      } = {
        ...(rest as Omit<Partial<BronDocumentCreateInput>, 'queryId' | 'workflowRunId' | 'contentHash'>),
        updatedAt: new Date()
      };

      if (queryId !== undefined) {
        if (queryId && ObjectId.isValid(queryId)) {
          updatePayload.queryId = new ObjectId(queryId);
        } else {
          updatePayload.queryId = undefined;
        }
      }

      if (workflowRunId !== undefined) {
        if (workflowRunId && ObjectId.isValid(workflowRunId)) {
          updatePayload.workflowRunId = new ObjectId(workflowRunId);
        } else {
          updatePayload.workflowRunId = undefined;
        }
      }

      // Handle contentHash changes - set lastContentChange if hash is being updated
      if (contentHash !== undefined) {
        updatePayload.contentHash = contentHash;
        // Get existing document to compare hashes
        const existing = await db.collection<BronDocumentDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
        if (existing && existing.contentHash && existing.contentHash !== contentHash) {
          // Content hash changed - update lastContentChange timestamp
          updatePayload.lastContentChange = new Date();
        } else if (!existing?.contentHash && contentHash) {
          // First time setting hash
          updatePayload.lastContentChange = new Date();
        }
      }

      const updateFilter: UpdateFilter<BronDocumentDocument> = { $set: updatePayload };
      const result = await db.collection<BronDocumentDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(id) },
        updateFilter,
        { returnDocument: 'after' }
      );

      return result || null;
    }, 'BronDocument.update');
  }

  /**
   * Update acceptance status
   * 
   * @deprecated Use CanonicalDocumentService.updateAcceptance() instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async updateAcceptance(id: string, accepted: boolean | null): Promise<BronDocumentDocument | null> {
    return await this.update(id, { accepted });
  }

  /**
   * Delete a document
   * 
   * @deprecated Use CanonicalDocumentService.delete() instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db.collection<BronDocumentDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
      return result.deletedCount > 0;
    }, 'BronDocument.delete');
  }

  /**
   * Update document with embedding
   * Helper method for migration and async embedding generation
   * 
   * @deprecated Use CanonicalDocumentService.updateEmbedding() instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async updateEmbedding(
    id: string,
    embedding: number[],
    embeddingModel: string,
    embeddingGeneratedAt: Date = new Date()
  ): Promise<BronDocumentDocument | null> {
    if (!ObjectId.isValid(id)) {
      throw new DatabaseValidationError('Invalid document ID');
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();

      const updateFilter: UpdateFilter<BronDocumentDocument> = {
        $set: {
          embedding,
          embeddingModel,
          embeddingGeneratedAt,
          updatedAt: new Date()
        }
      };
      const result = await db.collection<BronDocumentDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(id) },
        updateFilter,
        { returnDocument: 'after' }
      );

      return result || null;
    }, 'BronDocument.updateEmbedding');
  }

  /**
   * Find documents without embeddings
   * Helper method for migration
   */
  static async findWithoutEmbeddings(limit: number = 100): Promise<BronDocumentDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find({
          $or: [
            { embedding: { $exists: false } },
            // Some older records might store null instead of omitting the field
            { embedding: null as unknown as undefined }
          ]
        })
        .limit(limit)
        .toArray();
    }, 'BronDocument.findWithoutEmbeddings');
  }

  /**
   * Count documents without embeddings
   * Helper method for migration progress tracking
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with embedding filter instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countWithoutEmbeddings(): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const query: Filter<BronDocumentDocument> = {
        $or: [
          { embedding: { $exists: false } },
          { embedding: null as unknown as undefined }
        ]
      };
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME).countDocuments(query);
    }, 'BronDocument.countWithoutEmbeddings');
  }

  /**
   * Find documents that need embedding updates
   * 
   * Returns documents that:
   * 1. Don't have embeddings (no embedding or embeddingGeneratedAt)
   * 2. Have content changes (lastContentChange > embeddingGeneratedAt)
   * 3. Have been updated after embedding was generated (updatedAt > embeddingGeneratedAt)
   * 
   * @param limit - Maximum number of documents to return
   * @returns Array of documents that need embedding updates
   * 
   * @deprecated Use CanonicalDocumentService.findByQuery() with embedding update filters instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async findNeedingEmbeddingUpdates(limit: number = 100): Promise<BronDocumentDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const query: Filter<BronDocumentDocument> = {
        $or: [
          // Documents without embeddings
          { embedding: { $exists: false } },
          { embedding: null as unknown as undefined },
          { embeddingGeneratedAt: { $exists: false } },
          // Documents where content changed after embedding was generated
          {
            $and: [
              { lastContentChange: { $exists: true } },
              { embeddingGeneratedAt: { $exists: true } },
              { $expr: { $gt: ['$lastContentChange', '$embeddingGeneratedAt'] } }
            ]
          },
          // Documents updated after embedding was generated (fallback if lastContentChange not set)
          {
            $and: [
              { lastContentChange: { $exists: false } },
              { embeddingGeneratedAt: { $exists: true } },
              { $expr: { $gt: ['$updatedAt', '$embeddingGeneratedAt'] } }
            ]
          }
        ]
      };
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME)
        .find(query)
        .limit(limit)
        .toArray();
    }, 'BronDocument.findNeedingEmbeddingUpdates');
  }

  /**
   * Count documents that need embedding updates
   * Helper method for progress tracking
   * 
   * @deprecated Use CanonicalDocumentService.countDocuments() with embedding update filters instead
   * @see src/server/services/canonical/CanonicalDocumentService.ts
   */
  static async countNeedingEmbeddingUpdates(): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const query: Filter<BronDocumentDocument> = {
        $or: [
          // Documents without embeddings
          { embedding: { $exists: false } },
          { embedding: null as unknown as undefined },
          { embeddingGeneratedAt: { $exists: false } },
          // Documents where content changed after embedding was generated
          {
            $and: [
              { lastContentChange: { $exists: true } },
              { embeddingGeneratedAt: { $exists: true } },
              { $expr: { $gt: ['$lastContentChange', '$embeddingGeneratedAt'] } }
            ]
          },
          // Documents updated after embedding was generated (fallback if lastContentChange not set)
          {
            $and: [
              { lastContentChange: { $exists: false } },
              { embeddingGeneratedAt: { $exists: true } },
              { $expr: { $gt: ['$updatedAt', '$embeddingGeneratedAt'] } }
            ]
          }
        ]
      };
      return await db.collection<BronDocumentDocument>(COLLECTION_NAME).countDocuments(query);
    }, 'BronDocument.countNeedingEmbeddingUpdates');
  }
}
