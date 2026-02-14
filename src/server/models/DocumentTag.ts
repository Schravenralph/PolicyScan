import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { handleDatabaseOperation } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'document_tags';

export interface DocumentTagDocument {
  _id?: ObjectId;
  id: string; // Unique tag identifier (slug)
  label: string; // Display label
  category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
  color?: string; // Hex color code for UI
  description?: string;
  userId?: string; // User who created the tag (for custom tags)
  usageCount?: number; // Number of documents using this tag
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentTagCreateInput {
  id: string;
  label: string;
  category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
  color?: string;
  description?: string;
  userId?: string;
}

export class DocumentTag {
  /**
   * Ensure database indexes exist for optimal query performance
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);

    // Unique index on tag id
    await collection.createIndex({ id: 1 }, { unique: true });

    // Index for category-based queries
    await collection.createIndex({ category: 1 });

    // Index for user-specific tags
    await collection.createIndex({ userId: 1 });

    // Index for usage count (for sorting popular tags)
    await collection.createIndex({ usageCount: -1 });
  }

  /**
   * Create a new document tag
   */
  static async create(tagData: DocumentTagCreateInput): Promise<DocumentTagDocument> {
    return handleDatabaseOperation(async () => {
      const db = getDB();

      const tag: DocumentTagDocument = {
        id: tagData.id,
        label: tagData.label,
        category: tagData.category || 'custom',
        color: tagData.color,
        description: tagData.description,
        userId: tagData.userId,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection<DocumentTagDocument>(COLLECTION_NAME).insertOne(tag);
      return { ...tag, _id: result.insertedId };
    }, 'DocumentTag.create');
  }

  /**
   * Find a tag by ID
   */
  static async findById(id: string): Promise<DocumentTagDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<DocumentTagDocument>(COLLECTION_NAME).findOne({ id });
    }, 'DocumentTag.findById');
  }

  /**
   * Find all tags, optionally filtered by category or userId
   */
  static async findMany(filter: {
    category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
    userId?: string;
  } = {}): Promise<DocumentTagDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const query: Filter<DocumentTagDocument> = {};

      if (filter.category) {
        query.category = filter.category;
      }

      if (filter.userId) {
        query.userId = filter.userId;
      }

      return await db.collection<DocumentTagDocument>(COLLECTION_NAME)
        .find(query)
        .sort({ usageCount: -1, label: 1 })
        .toArray();
    }, 'DocumentTag.findMany');
  }

  /**
   * Update tag usage count
   */
  static async incrementUsageCount(tagId: string): Promise<void> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      await db.collection<DocumentTagDocument>(COLLECTION_NAME).updateOne(
        { id: tagId },
        { $inc: { usageCount: 1 }, $set: { updatedAt: new Date() } }
      );
    }, 'DocumentTag.incrementUsageCount');
  }

  /**
   * Decrement tag usage count
   */
  static async decrementUsageCount(tagId: string): Promise<void> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      await db.collection<DocumentTagDocument>(COLLECTION_NAME).updateOne(
        { id: tagId },
        { $inc: { usageCount: -1 }, $set: { updatedAt: new Date() } }
      );
    }, 'DocumentTag.decrementUsageCount');
  }

  /**
   * Update tag metadata
   */
  static async update(
    tagId: string,
    updates: Partial<Pick<DocumentTagDocument, 'label' | 'color' | 'description'>>
  ): Promise<DocumentTagDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db.collection<DocumentTagDocument>(COLLECTION_NAME).findOneAndUpdate(
        { id: tagId },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      return result || null;
    }, 'DocumentTag.update');
  }

  /**
   * Delete a tag
   */
  static async delete(tagId: string): Promise<boolean> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db.collection<DocumentTagDocument>(COLLECTION_NAME).deleteOne({ id: tagId });
      return result.deletedCount > 0;
    }, 'DocumentTag.delete');
  }
}
