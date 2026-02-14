import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import type { CommonCrawlResultDocument, CommonCrawlResultCreateInput } from '../types/index.js';

const COLLECTION_NAME = 'commonCrawlResults';

export class CommonCrawlResult {
  /**
   * Create a new Common Crawl result
   */
  static async create(resultData: CommonCrawlResultCreateInput): Promise<CommonCrawlResultDocument> {
    const db = getDB();

    const result: CommonCrawlResultDocument = {
      queryId: new ObjectId(resultData.queryId),
      urlkey: resultData.urlkey,
      timestamp: resultData.timestamp,
      url: resultData.url,
      mime: resultData.mime,
      status: resultData.status,
      digest: resultData.digest,
      length: resultData.length,
      offset: resultData.offset,
      filename: resultData.filename,
      approved: resultData.approved || false,
      bronDocumentId: resultData.bronDocumentId ? new ObjectId(resultData.bronDocumentId) : undefined,
      createdAt: new Date()
    };

    const insertResult = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).insertOne(result);
    return { ...result, _id: insertResult.insertedId };
  }

  /**
   * Create multiple results
   */
  static async createMany(resultsData: CommonCrawlResultCreateInput[]): Promise<CommonCrawlResultDocument[]> {
    const db = getDB();
    
    const results: CommonCrawlResultDocument[] = resultsData.map(data => ({
      queryId: new ObjectId(data.queryId),
      urlkey: data.urlkey,
      timestamp: data.timestamp,
      url: data.url,
      mime: data.mime,
      status: data.status,
      digest: data.digest,
      length: data.length,
      offset: data.offset,
      filename: data.filename,
      approved: data.approved || false,
      bronDocumentId: data.bronDocumentId ? new ObjectId(data.bronDocumentId) : undefined,
      createdAt: new Date()
    }));

    if (results.length === 0) return [];

    const insertResult = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).insertMany(results);
    return results.map((result, index) => ({
      ...result,
      _id: insertResult.insertedIds[index]
    }));
  }

  /**
   * Find a result by ID
   */
  static async findById(id: string): Promise<CommonCrawlResultDocument | null> {
    const db = getDB();
    return await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  }

  /**
   * Find all results for a query
   */
  static async findByQueryId(queryId: string, options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    approved?: boolean;
  } = {}): Promise<CommonCrawlResultDocument[]> {
    const db = getDB();
    const { limit = 100, skip = 0, sort = { timestamp: -1 }, approved } = options;

    const filter: Filter<CommonCrawlResultDocument> = { queryId: new ObjectId(queryId) };
    if (approved !== undefined) {
      filter.approved = approved;
    }

    return await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME)
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Update a result
   */
  static async update(id: string, updateData: Partial<CommonCrawlResultCreateInput>): Promise<CommonCrawlResultDocument | null> {
    const db = getDB();
    
    const { queryId, bronDocumentId, ...rest } = updateData;
    const update: Partial<CommonCrawlResultDocument> = {
      ...rest,
      ...(queryId ? { queryId: new ObjectId(queryId) } : {}),
      ...(bronDocumentId ? { bronDocumentId: new ObjectId(bronDocumentId) } : {})
    };

    const filter: Filter<CommonCrawlResultDocument> = { _id: new ObjectId(id) };
    const updateFilter: UpdateFilter<CommonCrawlResultDocument> = { $set: update };
    const result = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).findOneAndUpdate(
      filter,
      updateFilter,
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Approve a result
   */
  static async approve(id: string): Promise<CommonCrawlResultDocument | null> {
    return this.update(id, { approved: true });
  }

  /**
   * Approve multiple results
   */
  static async approveMany(ids: string[]): Promise<number> {
    const db = getDB();
    const objectIds = ids.map(id => new ObjectId(id));
    
    const filter: Filter<CommonCrawlResultDocument> = { _id: { $in: objectIds } };
    const update: UpdateFilter<CommonCrawlResultDocument> = { $set: { approved: true } };
    const result = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).updateMany(
      filter,
      update
    );

    return result.modifiedCount;
  }

  /**
   * Delete a result
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDB();
    const result = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  /**
   * Delete all results for a query
   */
  static async deleteByQueryId(queryId: string): Promise<number> {
    const db = getDB();
    const result = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).deleteMany({ queryId: new ObjectId(queryId) });
    return result.deletedCount;
  }

  /**
   * Count results by query ID
   */
  static async countByQueryId(queryId: string, options: {
    approved?: boolean;
  } = {}): Promise<number> {
    const db = getDB();
    const filter: Filter<CommonCrawlResultDocument> = { queryId: new ObjectId(queryId) };
    if (options.approved !== undefined) {
      filter.approved = options.approved;
    }
    return await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).countDocuments(filter);
  }

  /**
   * Count results by multiple query IDs
   */
  static async countByQueryIds(queryIds: string[]): Promise<Record<string, number>> {
    const db = getDB();
    const objectIds = queryIds.map(id => new ObjectId(id));

    const pipeline = [
      {
        $match: {
          queryId: { $in: objectIds }
        }
      },
      {
        $group: {
          _id: '$queryId',
          count: { $sum: 1 }
        }
      }
    ];

    const results = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).aggregate(pipeline).toArray();

    // Convert to map for easy lookup
    const countMap: Record<string, number> = {};
    results.forEach((result) => {
      // The aggregation returns objects with _id (the grouped key) and count
      // We need to cast result to accessing properties safely if not using generic aggregate<T>
      const countResult = result as { _id: ObjectId; count: number };
      countMap[countResult._id.toString()] = countResult.count;
    });

    return countMap;
  }

  /**
   * Find existing URLs for a query from a list of candidates
   */
  static async findExistingUrls(queryId: string, urls: string[]): Promise<Set<string>> {
    const db = getDB();
    // Use Set to remove duplicates from input before querying
    const uniqueUrls = [...new Set(urls)];

    if (uniqueUrls.length === 0) {
      return new Set();
    }

    // Process in chunks to avoid exceeding MongoDB's BSON document size limit
    const CHUNK_SIZE = 1000;
    const existingUrls = new Set<string>();

    for (let i = 0; i < uniqueUrls.length; i += CHUNK_SIZE) {
      const chunk = uniqueUrls.slice(i, i + CHUNK_SIZE);
      const results = await db.collection<CommonCrawlResultDocument>(COLLECTION_NAME).find(
        {
          queryId: new ObjectId(queryId),
          url: { $in: chunk }
        },
        { projection: { url: 1 } }
      ).toArray();

      for (const r of results) {
        existingUrls.add(r.url);
      }
    }

    return existingUrls;
  }
}
