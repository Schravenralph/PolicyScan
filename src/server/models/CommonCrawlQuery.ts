import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import type { CommonCrawlQueryDocument, CommonCrawlQueryCreateInput } from '../types/index.js';

const COLLECTION_NAME = 'commonCrawlQueries';

export class CommonCrawlQuery {
  /**
   * Create a new Common Crawl query
   */
  static async create(queryData: CommonCrawlQueryCreateInput): Promise<CommonCrawlQueryDocument> {
    const db = getDB();

    const query: CommonCrawlQueryDocument = {
      query: queryData.query,
      domainFilter: queryData.domainFilter || '',
      crawlId: queryData.crawlId,
      status: queryData.status || 'pending',
      userId: queryData.userId ? new ObjectId(queryData.userId) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection<CommonCrawlQueryDocument>(COLLECTION_NAME).insertOne(query);
    return { ...query, _id: result.insertedId };
  }

  /**
   * Find a query by ID
   */
  static async findById(id: string): Promise<CommonCrawlQueryDocument | null> {
    const db = getDB();
    if (!ObjectId.isValid(id)) return null;
    return await db.collection<CommonCrawlQueryDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  }

  /**
   * Find all queries
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    status?: 'pending' | 'approved' | 'rejected';
  } = {}): Promise<CommonCrawlQueryDocument[]> {
    const db = getDB();
    const { limit = 50, skip = 0, sort = { createdAt: -1 }, status } = options;

    const filter: Filter<CommonCrawlQueryDocument> = {};
    if (status) {
      filter.status = status;
    }

    return await db.collection<CommonCrawlQueryDocument>(COLLECTION_NAME)
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Update a query
   */
  static async update(id: string, updateData: Partial<CommonCrawlQueryCreateInput>): Promise<CommonCrawlQueryDocument | null> {
    const db = getDB();
    if (!ObjectId.isValid(id)) return null;
    const { userId, ...rest } = updateData;
    const update: Partial<CommonCrawlQueryDocument> = {
      ...rest,
      ...(userId && ObjectId.isValid(userId) ? { userId: new ObjectId(userId) } : {}),
      updatedAt: new Date()
    };
    const filter: Filter<CommonCrawlQueryDocument> = { _id: new ObjectId(id) };
    const updateFilter: UpdateFilter<CommonCrawlQueryDocument> = {
      $set: {
        ...update
      }
    };
    const result = await db.collection<CommonCrawlQueryDocument>(COLLECTION_NAME).findOneAndUpdate(
      filter,
      updateFilter,
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Delete a query
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDB();
    if (!ObjectId.isValid(id)) return false;
    const result = await db.collection<CommonCrawlQueryDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  /**
   * Count queries with filtering
   */
  static async count(options: {
    status?: 'pending' | 'approved' | 'rejected';
  } = {}): Promise<number> {
    const db = getDB();
    const { status } = options;

    const filter: Filter<CommonCrawlQueryDocument> = {};
    if (status) {
      filter.status = status;
    }

    return await db.collection<CommonCrawlQueryDocument>(COLLECTION_NAME).countDocuments(filter);
  }

  /**
   * Get query with result count
   */
  static async findByIdWithResultCount(id: string): Promise<(CommonCrawlQueryDocument & { resultCount: number }) | null> {
    const db = getDB();
    const query = await this.findById(id);
    if (!query) return null;

    const resultCount = await db.collection('commonCrawlResults').countDocuments({ queryId: new ObjectId(id) });
    return { ...query, resultCount };
  }
}
