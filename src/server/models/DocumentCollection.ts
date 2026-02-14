import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { handleDatabaseOperation } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'document_collections';

export interface DocumentCollectionDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  color?: string; // Hex color code for UI
  icon?: string; // Icon identifier
  documentIds: string[]; // Array of document IDs
  userId?: string; // User who created the collection
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentCollectionCreateInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  userId?: string;
}

export class DocumentCollection {
  /**
   * Ensure database indexes exist for optimal query performance
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);

    // Index for user-specific collections
    await collection.createIndex({ userId: 1 });

    // Index for document IDs (for finding collections containing a document)
    await collection.createIndex({ documentIds: 1 });

    // Index for name (for searching)
    await collection.createIndex({ name: 1 });
  }

  /**
   * Create a new document collection
   */
  static async create(collectionData: DocumentCollectionCreateInput): Promise<DocumentCollectionDocument> {
    return handleDatabaseOperation(async () => {
      const db = getDB();

      const collection: DocumentCollectionDocument = {
        name: collectionData.name,
        description: collectionData.description,
        color: collectionData.color,
        icon: collectionData.icon,
        documentIds: [],
        userId: collectionData.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection<DocumentCollectionDocument>(COLLECTION_NAME).insertOne(collection);
      return { ...collection, _id: result.insertedId };
    }, 'DocumentCollection.create');
  }

  /**
   * Find a collection by ID
   */
  static async findById(id: string): Promise<DocumentCollectionDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!ObjectId.isValid(id)) {
        return null;
      }
      return await db.collection<DocumentCollectionDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
    }, 'DocumentCollection.findById');
  }

  /**
   * Find all collections, optionally filtered by userId
   */
  static async findMany(filter: { userId?: string } = {}): Promise<DocumentCollectionDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const query: Filter<DocumentCollectionDocument> = {};

      if (filter.userId) {
        query.userId = filter.userId;
      }

      return await db.collection<DocumentCollectionDocument>(COLLECTION_NAME)
        .find(query)
        .sort({ updatedAt: -1, name: 1 })
        .toArray();
    }, 'DocumentCollection.findMany');
  }

  /**
   * Find collections containing a specific document
   */
  static async findByDocumentId(documentId: string): Promise<DocumentCollectionDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<DocumentCollectionDocument>(COLLECTION_NAME)
        .find({ documentIds: documentId })
        .sort({ name: 1 })
        .toArray();
    }, 'DocumentCollection.findByDocumentId');
  }

  /**
   * Update collection metadata
   */
  static async update(
    collectionId: string,
    updates: Partial<Pick<DocumentCollectionDocument, 'name' | 'description' | 'color' | 'icon'>>
  ): Promise<DocumentCollectionDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!ObjectId.isValid(collectionId)) {
        return null;
      }
      const result = await db.collection<DocumentCollectionDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(collectionId) },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      return result || null;
    }, 'DocumentCollection.update');
  }

  /**
   * Add a document to a collection
   */
  static async addDocument(collectionId: string, documentId: string): Promise<DocumentCollectionDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!ObjectId.isValid(collectionId)) {
        return null;
      }
      const result = await db.collection<DocumentCollectionDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(collectionId), documentIds: { $ne: documentId } },
        { $addToSet: { documentIds: documentId }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      return result || null;
    }, 'DocumentCollection.addDocument');
  }

  /**
   * Remove a document from a collection
   */
  static async removeDocument(collectionId: string, documentId: string): Promise<DocumentCollectionDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!ObjectId.isValid(collectionId)) {
        return null;
      }
      const result = await db.collection<DocumentCollectionDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(collectionId) },
        { $pull: { documentIds: documentId }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      return result || null;
    }, 'DocumentCollection.removeDocument');
  }

  /**
   * Delete a collection
   */
  static async delete(collectionId: string): Promise<boolean> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      if (!ObjectId.isValid(collectionId)) {
        return false;
      }
      const result = await db.collection<DocumentCollectionDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(collectionId) });
      return result.deletedCount > 0;
    }, 'DocumentCollection.delete');
  }
}
