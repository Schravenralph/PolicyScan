import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter, type ClientSession } from 'mongodb';
import type { QueryDocument, QueryCreateInput } from '../types/index.js';
import { handleDatabaseOperation, DatabaseValidationError } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'queries';

export class Query {
  /**
   * Create a new query/scan
   * 
   * @param queryData - Query creation data
   * @param session - Optional MongoDB session for transaction support
   */
  static async create(queryData: QueryCreateInput, session?: ClientSession): Promise<QueryDocument> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const query: QueryDocument = {
        ...queryData,
        status: queryData.status || 'draft', // Default to 'draft' if not specified
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection<QueryDocument>(COLLECTION_NAME).insertOne(
        query,
        session ? { session } : undefined
      );
      return { ...query, _id: result.insertedId };
    }, 'Query.create');
  }

  /**
   * Find a query by ID
   */
  static async findById(id: string): Promise<QueryDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<QueryDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
    }, 'Query.findById');
  }

  /**
   * Find a query by parameters (for idempotency checks)
   */
  static async findByParameters(params: {
    overheidstype: string;
    overheidsinstantie?: string | null;
    onderwerp: string;
  }): Promise<QueryDocument | null> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      
      // Handle overheidsinstantie: match if both are undefined/null or both have the same value
      let filter: Filter<QueryDocument>;
      if (params.overheidsinstantie !== undefined && params.overheidsinstantie !== null) {
        filter = {
          overheidstype: params.overheidstype,
          overheidsinstantie: params.overheidsinstantie,
          onderwerp: params.onderwerp,
        };
      } else {
        // Match queries where overheidsinstantie is null or undefined
        filter = {
          overheidstype: params.overheidstype,
          onderwerp: params.onderwerp,
          $or: [
            { overheidsinstantie: null as any },
            { overheidsinstantie: { $exists: false } },
          ],
        };
      }
      
      return await db.collection<QueryDocument>(COLLECTION_NAME).findOne(filter);
    }, 'Query.findByParameters');
  }

  /**
   * Find all queries
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    status?: 'draft' | 'completed';
    createdBy?: string;
  } = {}): Promise<QueryDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit = 50, skip = 0, sort = { createdAt: -1 }, status, createdBy } = options;

      const filter: Filter<QueryDocument> = {};
      if (status) {
        filter.status = status;
      }
      if (createdBy !== undefined) {
        filter.createdBy = createdBy;
      }


      return await db.collection<QueryDocument>(COLLECTION_NAME)
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();
    }, 'Query.findAll');
  }

  /**
   * Update a query
   */
  static async update(id: string, updateData: Partial<QueryCreateInput>): Promise<QueryDocument | null> {
    if (!ObjectId.isValid(id)) {
      throw new DatabaseValidationError('Invalid query ID');
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const filter: Filter<QueryDocument> = { _id: new ObjectId(id) };
      const update: UpdateFilter<QueryDocument> = {
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      };
      const result = await db.collection<QueryDocument>(COLLECTION_NAME).findOneAndUpdate(
        filter,
        update,
        { returnDocument: 'after' }
      );

      return result || null;
    }, 'Query.update');
  }

  /**
   * Count total number of queries
   */
  static async count(filter: Filter<QueryDocument> = {}): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<QueryDocument>(COLLECTION_NAME).countDocuments(filter);
    }, 'Query.count');
  }

  /**
   * Delete a query
   */
  static async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db.collection<QueryDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
      return result.deletedCount > 0;
    }, 'Query.delete');
  }
}
