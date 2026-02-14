/**
 * CanonicalChunkService
 * 
 * Service for persisting and retrieving canonical chunks with idempotent upserts.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */

import { getDB } from '../../config/database.js';
import { ObjectId, type ClientSession, type Filter, type UpdateFilter } from 'mongodb';
import { logger } from '../../utils/logger.js';
import type {
  CanonicalChunkDraft,
  CanonicalChunk,
  ServiceContext,
  PagingParams,
  DocumentFilters,
} from '../../contracts/types.js';
import { validateCanonicalChunkDrafts } from '../../validation/canonicalSchemas.js';
import { VectorService } from '../query/VectorService.js';
import { PgVectorProvider } from '../../vector/PgVectorProvider.js';

const COLLECTION_NAME = 'canonical_chunks';

/**
 * CanonicalChunkService implementation
 */
export class CanonicalChunkService {
  private vectorService: VectorService | null = null;
  private pgVectorProvider: PgVectorProvider | null = null;

  private async _getVectorService(): Promise<VectorService> {
    if (!this.vectorService) {
      this.vectorService = new VectorService();
      await this.vectorService.init();
    }
    return this.vectorService;
  }

  private async getPgVectorProvider(): Promise<PgVectorProvider> {
    if (!this.pgVectorProvider) {
      this.pgVectorProvider = new PgVectorProvider();
      await this.pgVectorProvider.ensureSchema();
    }
    return this.pgVectorProvider;
  }

  /**
   * Upsert chunks for a document - idempotent
   * 
   * Chunks are identified by chunkId (deterministic). If chunk exists, updates it.
   * If chunk doesn't exist, creates it. Replaying the same chunks will not create duplicates.
   * 
   * @param documentId - Document ID
   * @param chunks - Array of chunk drafts to upsert
   * @param ctx - Service context (may include session for transactions)
   * @returns Array of persisted canonical chunks
   */
  async upsertChunks(
    documentId: string,
    chunks: CanonicalChunkDraft[],
    ctx: ServiceContext
  ): Promise<CanonicalChunk[]> {
    // Validate chunks
    validateCanonicalChunkDrafts(chunks);
    
    // Ensure all chunks belong to the same document
    for (const chunk of chunks) {
      if (chunk.documentId !== documentId) {
        throw new Error(`Chunk chunkId=${chunk.chunkId} has documentId=${chunk.documentId}, expected ${documentId}`);
      }
    }
    
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);
    const session = ctx.session as ClientSession | undefined;
    
    const now = new Date();
    const results: CanonicalChunk[] = [];
    
    // Process each chunk
    for (const chunkDraft of chunks) {
      // Build filter for chunkId (unique)
      const filter: Filter<CanonicalChunk> = {
        chunkId: chunkDraft.chunkId,
      };
      
      // Check if chunk exists
      let existing;
      if (session) {
        // @ts-expect-error - MongoDB driver overload issue with session parameter
        existing = await collection.findOne(filter, { session });
      } else {
        // @ts-expect-error - MongoDB driver overload issue
        existing = await collection.findOne(filter);
      }
      
      if (existing) {
        // Chunk exists - update it (idempotent)
        const update: UpdateFilter<CanonicalChunk> = {
          $set: {
            documentId: chunkDraft.documentId,
            chunkIndex: chunkDraft.chunkIndex,
            text: chunkDraft.text,
            offsets: chunkDraft.offsets,
            headingPath: chunkDraft.headingPath,
            legalRefs: chunkDraft.legalRefs,
            chunkFingerprint: chunkDraft.chunkFingerprint,
            embedding: chunkDraft.embedding,
            updatedAt: now,
          },
        };
        
        let result;
        if (session) {
          result = await collection.findOneAndUpdate(
            // @ts-expect-error - MongoDB driver overload issue with session parameter
            filter,
            update,
            { session, returnDocument: 'after' as const }
          );
        } else {
          result = await collection.findOneAndUpdate(
            // @ts-expect-error - MongoDB driver overload issue
            filter,
            update,
            { returnDocument: 'after' as const }
          );
        }
        
        if (!result) {
          throw new Error(`Failed to update canonical chunk chunkId=${chunkDraft.chunkId}`);
        }
        
        results.push(this.mapToCanonicalChunk(result));
      } else {
        // Chunk doesn't exist - create it
        const chunk: Omit<CanonicalChunk, '_id'> & { _id?: ObjectId } = {
          _id: new ObjectId(),
          chunkId: chunkDraft.chunkId,
          documentId: chunkDraft.documentId,
          chunkIndex: chunkDraft.chunkIndex,
          text: chunkDraft.text,
          offsets: chunkDraft.offsets,
          headingPath: chunkDraft.headingPath,
          legalRefs: chunkDraft.legalRefs,
          chunkFingerprint: chunkDraft.chunkFingerprint,
          embedding: chunkDraft.embedding,
          createdAt: now,
          updatedAt: now,
        };
        
        if (session) {
          await collection.insertOne(chunk, { session });
        } else {
          await collection.insertOne(chunk);
        }
        results.push(this.mapToCanonicalChunk(chunk));
      }
    }
    
    logger.debug(
      { documentId, chunkCount: chunks.length, upsertedCount: results.length },
      'Upserted canonical chunks'
    );
    
    return results;
  }
  
  /**
   * Find chunks for a document
   * 
   * @param documentId - Document ID
   * @param paging - Paging parameters
   * @returns Array of canonical chunks
   */
  async findChunks(
    documentId: string,
    paging?: PagingParams
  ): Promise<CanonicalChunk[]> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);
    
    // Build filter
    const filter: Filter<CanonicalChunk> = {
      documentId,
    };
    
    // Build query options
    const options: {
      limit?: number;
      skip?: number;
      sort?: { chunkIndex: number };
    } = {
      sort: { chunkIndex: 1 }, // Sort by chunkIndex ascending
    };
    
    if (paging) {
      if (paging.limit) {
        options.limit = paging.limit;
      }
      if (paging.skip !== undefined) {
        options.skip = paging.skip;
      } else if (paging.page && paging.limit) {
        options.skip = (paging.page - 1) * paging.limit;
      }
    }
    
    // @ts-expect-error - MongoDB driver overload issue with find options
    const chunks = await collection.find(filter, options).toArray();
    
    return chunks.map(chunk => this.mapToCanonicalChunk(chunk));
  }
  
  /**
   * Find chunk by chunkId
   * 
   * @param chunkId - Chunk ID
   * @param ctx - Optional service context (for transaction support)
   * @returns Canonical chunk or null if not found
   */
  async findByChunkId(
    chunkId: string,
    ctx?: ServiceContext
  ): Promise<CanonicalChunk | null> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);
    const session = ctx?.session as ClientSession | undefined;
    
    let doc;
    if (session) {
      doc = await collection.findOne({ chunkId }, { session });
    } else {
      doc = await collection.findOne({ chunkId });
    }

    if (!doc) {
      return null;
    }

    return this.mapToCanonicalChunk(doc);
  }

  /**
   * Find chunks by multiple chunkIds
   *
   * @param chunkIds - Array of chunk IDs
   * @param ctx - Optional service context (for transaction support)
   * @returns Array of found canonical chunks
   */
  async findByChunkIds(
    chunkIds: string[],
    ctx?: ServiceContext
  ): Promise<CanonicalChunk[]> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);
    const session = ctx?.session as ClientSession | undefined;

    // Build filter
    const filter: Filter<CanonicalChunk> = {
      chunkId: { $in: chunkIds },
    };

    let docs;
    if (session) {
      // @ts-expect-error - MongoDB driver overload issue with session parameter
      docs = await collection.find(filter, { session }).toArray();
    } else {
      // @ts-expect-error - MongoDB driver overload issue
      docs = await collection.find(filter).toArray();
    }

    return docs.map(doc => this.mapToCanonicalChunk(doc));
  }

  /**
   * Find document IDs that don't have chunks with embeddings
   * 
   * Returns document IDs for documents that either:
   * - Don't have any chunks
   * - Have chunks but none of them have embeddings
   * 
   * @param limit - Maximum number of document IDs to return
   * @returns Array of document IDs (as strings)
   */
  async findDocumentsWithoutEmbeddings(limit: number = 100): Promise<string[]> {
    const db = getDB();
    const chunksCollection = db.collection(COLLECTION_NAME);
    const documentsCollection = db.collection('canonical_documents');
    
    // Get all document IDs that have chunks with embeddings
    const documentsWithEmbeddings = await chunksCollection
      .distinct('documentId', {
        embedding: { $exists: true, $ne: null },
        'embedding.vectorRef': { $exists: true }
      });
    
    // Get all document IDs
    const allDocumentIds = await documentsCollection
      .find({}, { projection: { _id: 1 } })
      .limit(limit * 2) // Get more to account for filtering
      .toArray();
    
    // Filter out documents that have embeddings
    const documentIdsWithoutEmbeddings = allDocumentIds
      .map(doc => doc._id.toString())
      .filter(id => !documentsWithEmbeddings.includes(id))
      .slice(0, limit);
    
    return documentIdsWithoutEmbeddings;
  }
  
  /**
   * Count documents that don't have chunks with embeddings
   * 
   * @returns Count of documents without embeddings
   */
  async countDocumentsWithoutEmbeddings(): Promise<number> {
    const db = getDB();
    const chunksCollection = db.collection(COLLECTION_NAME);
    const documentsCollection = db.collection('canonical_documents');
    
    // Get all document IDs that have chunks with embeddings
    const documentsWithEmbeddings = await chunksCollection
      .distinct('documentId', {
        embedding: { $exists: true, $ne: null },
        'embedding.vectorRef': { $exists: true }
      });
    
    // Count all documents
    const totalDocuments = await documentsCollection.countDocuments();
    
    // Count documents with embeddings
    const documentsWithEmbeddingsCount = documentsWithEmbeddings.length;
    
    // Return difference (documents without embeddings)
    return Math.max(0, totalDocuments - documentsWithEmbeddingsCount);
  }
  
  /**
   * Find document IDs that need embedding updates
   * 
   * Returns document IDs for documents that:
   * - Don't have chunks with embeddings
   * - Have chunks that were updated after embeddings were generated
   * 
   * @param limit - Maximum number of document IDs to return
   * @returns Array of document IDs (as strings)
   */
  async findDocumentsNeedingEmbeddingUpdates(limit: number = 100): Promise<string[]> {
    const db = getDB();
    const chunksCollection = db.collection(COLLECTION_NAME);
    
    // Find chunks that were updated but don't have embeddings
    // or chunks that were updated after embedding was generated
    const chunksNeedingUpdates = await chunksCollection
      .find({
        $or: [
          // Chunks without embeddings
          {
            $or: [
              { embedding: { $exists: false } },
              { embedding: null },
              { 'embedding.vectorRef': { $exists: false } }
            ]
          },
          // Chunks updated after embedding was generated
          {
            $expr: {
              $and: [
                { $gt: ['$updatedAt', { $ifNull: ['$embedding.generatedAt', new Date(0)] }] },
                { $ne: ['$embedding', null] }
              ]
            }
          }
        ]
      })
      .limit(limit)
      .toArray();
    
    // Get unique document IDs
    const documentIds = Array.from(
      new Set(chunksNeedingUpdates.map(chunk => chunk.documentId as string))
    ).slice(0, limit);
    
    return documentIds;
  }
  
  /**
   * Count documents that need embedding updates
   * 
   * @returns Count of documents needing embedding updates
   */
  async countDocumentsNeedingEmbeddingUpdates(): Promise<number> {
    const db = getDB();
    const chunksCollection = db.collection(COLLECTION_NAME);
    
    // Find chunks that need updates
    const chunksNeedingUpdates = await chunksCollection
      .find({
        $or: [
          // Chunks without embeddings
          {
            $or: [
              { embedding: { $exists: false } },
              { embedding: null },
              { 'embedding.vectorRef': { $exists: false } }
            ]
          },
          // Chunks updated after embedding was generated
          {
            $expr: {
              $and: [
                { $gt: ['$updatedAt', { $ifNull: ['$embedding.generatedAt', new Date(0)] }] },
                { $ne: ['$embedding', null] }
              ]
            }
          }
        ]
      })
      .toArray();
    
    // Get unique document IDs
    const documentIds = new Set(chunksNeedingUpdates.map(chunk => chunk.documentId as string));
    
    return documentIds.size;
  }

  /**
   * Semantic retrieve - search chunks by embedding similarity
   * 
   * Implements chunk-based embedding search using cosine similarity.
   * Retrieves chunks with embeddings, calculates similarity to query embedding,
   * and returns top-K most similar chunks.
   * 
   * @param queryEmbedding - Query embedding vector
   * @param filters - Document filters (optional)
   * @param topK - Number of results to return
   * @returns Array of canonical chunks sorted by similarity
   */
  async semanticRetrieve(
    queryEmbedding: number[],
    filters: DocumentFilters | unknown = {},
    topK: number = 10,
    modelId: string = 'Xenova/all-MiniLM-L6-v2@v1'
  ): Promise<Array<CanonicalChunk & { score: number }>> {
    const vectorProvider = await this.getPgVectorProvider();

    // Prepare filters
    const docFilters = filters as DocumentFilters;
    const vectorFilters: { documentIds?: string[] } = {};

    // Check if we have filters that require document lookup
    const hasMetadataFilters =
      docFilters.validFrom ||
      docFilters.validTo ||
      docFilters.publishedAfter ||
      docFilters.publishedBefore ||
      docFilters.areaId ||
      (docFilters.areaIds && docFilters.areaIds.length > 0) ||
      docFilters.documentFamily ||
      docFilters.documentType ||
      docFilters.publisherAuthority ||
      docFilters.source ||
      docFilters.sourceId;

    if (docFilters.documentId && typeof docFilters.documentId === 'string') {
      vectorFilters.documentIds = [docFilters.documentId];
    }

    if (hasMetadataFilters) {
      // Query canonical_documents to get matching IDs
      const db = getDB();
      const documentsCollection = db.collection('canonical_documents');
      const mongoFilter: Record<string, unknown> = {};

      if (docFilters.documentFamily) {
        if (Array.isArray(docFilters.documentFamily)) {
          mongoFilter.documentFamily = { $in: docFilters.documentFamily };
        } else {
          mongoFilter.documentFamily = docFilters.documentFamily;
        }
      }
      if (docFilters.documentType) {
        if (Array.isArray(docFilters.documentType)) {
          mongoFilter.documentType = { $in: docFilters.documentType };
        } else {
          mongoFilter.documentType = docFilters.documentType;
        }
      }
      if (docFilters.publisherAuthority) mongoFilter.publisherAuthority = docFilters.publisherAuthority;
      if (docFilters.source) mongoFilter.source = docFilters.source;
      if (docFilters.sourceId) mongoFilter.sourceId = docFilters.sourceId;

      // Temporal filters
      if (docFilters.validFrom) mongoFilter['dates.validFrom'] = { $gte: docFilters.validFrom };
      if (docFilters.validTo) mongoFilter['dates.validTo'] = { $lte: docFilters.validTo };
      if (docFilters.publishedAfter) {
        const current = (mongoFilter['dates.publishedAt'] as any) || {};
        mongoFilter['dates.publishedAt'] = { ...current, $gte: docFilters.publishedAfter };
      }
      if (docFilters.publishedBefore) {
        const current = (mongoFilter['dates.publishedAt'] as any) || {};
        mongoFilter['dates.publishedAt'] = { ...current, $lte: docFilters.publishedBefore };
      }

      // Spatial filters
      if (docFilters.areaId) mongoFilter['sourceMetadata.spatialMetadata.areaId'] = docFilters.areaId;
      if (docFilters.areaIds && docFilters.areaIds.length > 0) {
        mongoFilter['sourceMetadata.spatialMetadata.areaId'] = { $in: docFilters.areaIds };
      }

      const matchingDocs = await documentsCollection
          .find(mongoFilter, { projection: { _id: 1 } })
          .toArray();

      const matchingIds = matchingDocs.map(d => d._id.toString());

      if (vectorFilters.documentIds) {
        // Intersect with existing documentId filter
        vectorFilters.documentIds = vectorFilters.documentIds.filter(id => matchingIds.includes(id));
      } else {
        vectorFilters.documentIds = matchingIds;
      }

      // Optimization: If no documents match, return empty result immediately
      if (vectorFilters.documentIds.length === 0) {
          return [];
      }
    }

    // Search for similar vectors using PgVectorProvider
    // Fetch more results than topK to account for filtering (if needed)
    // PgVectorProvider supports documentIds filter efficiently.
    const vectorResults = await vectorProvider.search(
      queryEmbedding,
      modelId,
      topK * 5,
      vectorFilters
    );

    if (vectorResults.length === 0) {
      logger.debug('No vectors found for semantic retrieval');
      return [];
    }

    // Extract chunk IDs and create score map
    const chunkIds = vectorResults.map(r => r.chunkId);
    const scoreMap = new Map<string, number>();
    vectorResults.forEach(r => scoreMap.set(r.chunkId, r.score));

    const db = getDB();
    const collection = db.collection<CanonicalChunk>(COLLECTION_NAME);
    
    // Build filter
    const chunkFilter: Filter<CanonicalChunk> = {
      chunkId: { $in: chunkIds }
    };
    
    // Apply additional filters that weren't handled by vector search
    // (e.g., documentFamily)
    
    // Fetch chunks
    const chunks = await collection.find(chunkFilter).toArray();
    
    if (chunks.length === 0) {
      logger.debug('No matching chunks found in database');
      return [];
    }
    
    // Map to CanonicalChunk
    const canonicalChunks = chunks.map(c => this.mapToCanonicalChunk(c));
    
    // Sort by score and attach score to result
    const sortedChunks = canonicalChunks
      .map(chunk => ({
        ...chunk,
        score: scoreMap.get(chunk.chunkId) || 0
      }))
      .sort((a, b) => b.score - a.score);
    
    const result = sortedChunks.slice(0, topK);

    logger.debug(
      { 
        queryEmbeddingDims: queryEmbedding.length,
        vectorsFound: vectorResults.length,
        chunksFound: chunks.length,
        resultCount: result.length,
      },
      'Semantic retrieval completed'
    );
    
    return result;
  }
  
  /**
   * Map MongoDB document to CanonicalChunk
   */
  private mapToCanonicalChunk(doc: unknown): CanonicalChunk {
    const d = doc as { _id: ObjectId; [key: string]: unknown };
    return {
      _id: d._id.toString(),
      chunkId: d.chunkId as string,
      documentId: d.documentId as string,
      chunkIndex: d.chunkIndex as number,
      text: d.text as string,
      offsets: d.offsets as CanonicalChunk['offsets'],
      headingPath: d.headingPath as string[] | undefined,
      legalRefs: d.legalRefs as string[] | undefined,
      chunkFingerprint: d.chunkFingerprint as string,
      embedding: d.embedding as CanonicalChunk['embedding'],
      createdAt: d.createdAt as Date,
      updatedAt: d.updatedAt as Date,
    };
  }
}

// Singleton instance
let canonicalChunkService: CanonicalChunkService | null = null;

/**
 * Get singleton instance of CanonicalChunkService
 */
export function getCanonicalChunkService(): CanonicalChunkService {
  if (!canonicalChunkService) {
    canonicalChunkService = new CanonicalChunkService();
  }
  return canonicalChunkService;
}

