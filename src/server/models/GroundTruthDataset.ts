import { getDB } from '../config/database.js';
import { ObjectId, type Filter, BSON } from 'mongodb';

/**
 * Ground Truth Dataset Database Schema
 * 
 * Stores ground truth datasets for workflow evaluation.
 * Each dataset contains queries with their relevant documents and relevance scores.
 * 
 * Collection: ground_truth_datasets
 */

export interface RelevantDocument {
  url: string; // URL of the document (required for backward compatibility)
  relevance: number; // 0-4 scale or binary (0/1)
  documentId?: string; // Optional: MongoDB ObjectId of canonical document (if selected from canonical documents)
  source?: string; // Optional: Document source (DSO, Rechtspraak, etc.) for reference
}

export interface GroundTruthQuery {
  query: string;
  relevant_documents: RelevantDocument[];
}

export interface GroundTruthDatasetDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  queries: GroundTruthQuery[];
  created_at: Date;
  created_by?: string;
  updated_at?: Date;
}

export interface GroundTruthDatasetCreateInput {
  name: string;
  description?: string;
  queries: GroundTruthQuery[];
  created_by?: string;
}

const COLLECTION_NAME = 'ground_truth_datasets';

/**
 * GroundTruthDataset model for MongoDB operations
 */
export class GroundTruthDataset {
  /**
   * Create a new ground truth dataset
   */
  static async create(input: GroundTruthDatasetCreateInput): Promise<GroundTruthDatasetDocument> {
    const db = getDB();
    const now = new Date();

    const dataset: GroundTruthDatasetDocument = {
      name: input.name,
      description: input.description,
      queries: input.queries,
      created_at: now,
      created_by: input.created_by,
      updated_at: now,
    };

    const result = await db.collection<GroundTruthDatasetDocument>(COLLECTION_NAME).insertOne(dataset);
    
    return {
      ...dataset,
      _id: result.insertedId,
    };
  }

  /**
   * Find datasets with optional filters
   */
  static async find(filters: {
    name?: string;
    created_by?: string;
    search?: string; // Search in name or description
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ entries: GroundTruthDatasetDocument[]; total: number }> {
    const db = getDB();
    const {
      name,
      created_by,
      search,
      limit = 100,
      skip = 0,
      sort = { created_at: -1 },
    } = filters;

    const query: Filter<GroundTruthDatasetDocument> = {};

    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }

    if (created_by) {
      query.created_by = created_by;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [entries, total] = await Promise.all([
      db
        .collection<GroundTruthDatasetDocument>(COLLECTION_NAME)
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<GroundTruthDatasetDocument>(COLLECTION_NAME).countDocuments(query),
    ]);

    return { entries, total };
  }

  /**
   * Find dataset by ID
   */
  static async findById(id: string): Promise<GroundTruthDatasetDocument | null> {
    const db = getDB();
    return await db
      .collection<GroundTruthDatasetDocument>(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
  }

  /**
   * Check if dataset exists
   */
  static async exists(id: string): Promise<boolean> {
    const db = getDB();
    try {
      // Use countDocuments with limit 1 for efficiency
      const count = await db
        .collection<GroundTruthDatasetDocument>(COLLECTION_NAME)
        .countDocuments({ _id: new ObjectId(id) }, { limit: 1 });
      return count > 0;
    } catch (error) {
      // Handle invalid ObjectId
      if (error instanceof BSON.BSONError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Update a dataset
   */
  static async update(
    id: string,
    updates: {
      name?: string;
      description?: string;
      queries?: GroundTruthQuery[];
    }
  ): Promise<GroundTruthDatasetDocument | null> {
    const db = getDB();
    const updateDoc: Partial<GroundTruthDatasetDocument> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) {
      updateDoc.name = updates.name;
    }
    if (updates.description !== undefined) {
      updateDoc.description = updates.description;
    }
    if (updates.queries !== undefined) {
      updateDoc.queries = updates.queries;
    }

    const result = await db
      .collection<GroundTruthDatasetDocument>(COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateDoc },
        { returnDocument: 'after' }
      );

    return result || null;
  }

  /**
   * Delete a dataset
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDB();
    const result = await db
      .collection<GroundTruthDatasetDocument>(COLLECTION_NAME)
      .deleteOne({ _id: new ObjectId(id) });

    return result.deletedCount > 0;
  }

  /**
   * Get statistics for a dataset
   */
  static async getStatistics(id: string): Promise<{
    totalQueries: number;
    totalDocuments: number;
    averageDocumentsPerQuery: number;
    relevanceDistribution: Record<number, number>;
  } | null> {
    const dataset = await this.findById(id);
    
    if (!dataset) {
      return null;
    }

    const totalQueries = dataset.queries.length;
    let totalDocuments = 0;
    const relevanceDistribution: Record<number, number> = {};

    for (const query of dataset.queries) {
      totalDocuments += query.relevant_documents.length;
      for (const doc of query.relevant_documents) {
        relevanceDistribution[doc.relevance] = (relevanceDistribution[doc.relevance] || 0) + 1;
      }
    }

    return {
      totalQueries,
      totalDocuments,
      averageDocumentsPerQuery: totalQueries > 0 ? totalDocuments / totalQueries : 0,
      relevanceDistribution,
    };
  }

  /**
   * Ensure indexes exist for efficient querying
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<GroundTruthDatasetDocument>(COLLECTION_NAME);

    try {
      // Index on name for search
      await collection.createIndex(
        { name: 1 },
        { background: true, name: 'idx_name' }
      );

      // Index on created_at for sorting
      await collection.createIndex(
        { created_at: -1 },
        { background: true, name: 'idx_created_at' }
      );

      // Index on created_by for filtering
      await collection.createIndex(
        { created_by: 1 },
        { background: true, sparse: true, name: 'idx_created_by' }
      );

      // Text index for search in name and description
      await collection.createIndex(
        { name: 'text', description: 'text' },
        { background: true, name: 'idx_text_search' }
      );
    } catch (error) {
      if (error instanceof Error && !error.message.includes('already exists')) {
        console.warn('[GroundTruthDataset] Warning: Could not create all indexes:', error);
      }
    }
  }
}
