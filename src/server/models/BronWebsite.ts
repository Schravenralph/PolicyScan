import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';
import type { BronWebsiteDocument, BronWebsiteCreateInput } from '../types/index.js';
import { handleDatabaseOperation, DatabaseValidationError } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'bronwebsites';

export class BronWebsite {
  /**
   * Ensure indexes exist for the collection
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection(COLLECTION_NAME);

    // Index for finding by query ID (used in findByQueryId and countByQueryId)
    await collection.createIndex({ queryId: 1 });

    // Index for finding by URL
    await collection.createIndex({ url: 1 });

    // Index for sorting by createdAt
    await collection.createIndex({ createdAt: -1 });
  }

  /**
   * Create a new bron website
   */
  static async create(websiteData: BronWebsiteCreateInput): Promise<BronWebsiteDocument> {
    return handleDatabaseOperation(async () => {
      const db = getDB();

      const website: BronWebsiteDocument = {
        titel: websiteData.titel,
        url: websiteData.url,
        label: websiteData.label,
        samenvatting: websiteData.samenvatting,
        'relevantie voor zoekopdracht': websiteData['relevantie voor zoekopdracht'],
        accepted: websiteData.accepted ?? null,
        // Explicitly check for undefined to preserve empty arrays
        subjects: websiteData.subjects !== undefined ? websiteData.subjects : [],
        themes: websiteData.themes !== undefined ? websiteData.themes : [],
        website_types: websiteData.website_types !== undefined ? websiteData.website_types : [],
        queryId: websiteData.queryId ? new ObjectId(websiteData.queryId) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection<BronWebsiteDocument>(COLLECTION_NAME).insertOne(website);
      return { ...website, _id: result.insertedId };
    }, 'BronWebsite.create');
  }

  /**
   * Create multiple bron websites
   */
  static async createMany(websitesData: BronWebsiteCreateInput[]): Promise<BronWebsiteDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const websites: BronWebsiteDocument[] = websitesData.map(data => ({
        titel: data.titel,
        url: data.url,
        label: data.label,
        samenvatting: data.samenvatting,
        'relevantie voor zoekopdracht': data['relevantie voor zoekopdracht'],
        accepted: data.accepted ?? null,
        subjects: data.subjects || [],
        themes: data.themes || [],
        website_types: data.website_types || [],
        queryId: data.queryId ? new ObjectId(data.queryId) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const result = await db.collection<BronWebsiteDocument>(COLLECTION_NAME).insertMany(websites);
      return websites.map((website, index) => ({
        ...website,
        _id: result.insertedIds[index]
      }));
    }, 'BronWebsite.createMany');
  }

  /**
   * Find all websites with pagination support
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  } = {}): Promise<BronWebsiteDocument[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit = 50, skip = 0, sort = { createdAt: -1 } } = options;

      return await db.collection<BronWebsiteDocument>(COLLECTION_NAME)
        .find()
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();
    }, 'BronWebsite.findAll');
  }

  /**
   * Count total number of websites
   */
  static async count(): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronWebsiteDocument>(COLLECTION_NAME).countDocuments({});
    }, 'BronWebsite.count');
  }

  /**
   * Find websites by query ID with pagination
   */
  static async findByQueryId(
    queryId: string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<BronWebsiteDocument[]> {
    if (!ObjectId.isValid(queryId)) {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit, skip } = options;
      const query = db.collection<BronWebsiteDocument>(COLLECTION_NAME)
        .find({ queryId: new ObjectId(queryId) });

      if (skip) {
        query.skip(skip);
      }
      if (limit) {
        query.limit(limit);
      }
      return await query.toArray();
    }, 'BronWebsite.findByQueryId');
  }

  /**
   * Count websites by query ID
   */
  static async countByQueryId(queryId: string): Promise<number> {
    if (!ObjectId.isValid(queryId)) {
      return 0;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronWebsiteDocument>(COLLECTION_NAME)
        .countDocuments({ queryId: new ObjectId(queryId) });
    }, 'BronWebsite.countByQueryId');
  }

  /**
   * Find a website by ID
   */
  static async findById(id: string): Promise<BronWebsiteDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      return await db.collection<BronWebsiteDocument>(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
    }, 'BronWebsite.findById');
  }

  /**
   * Find websites by multiple IDs
   */
  static async findByIds(ids: string[]): Promise<BronWebsiteDocument[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      
      // Limit array size to prevent memory exhaustion
      const MAX_BRON_WEBSITE_IDS = parseInt(process.env.MAX_BRON_WEBSITE_IDS || '1000', 10);
      const limitedIds = ids.slice(0, MAX_BRON_WEBSITE_IDS);
      
      if (ids.length > MAX_BRON_WEBSITE_IDS) {
        console.warn(
          `[BronWebsite] IDs list truncated from ${ids.length} to ${MAX_BRON_WEBSITE_IDS} to prevent memory exhaustion`
        );
      }
      
      const validIds = limitedIds
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));
      
      if (validIds.length === 0) {
        return [];
      }
      
      return await db.collection<BronWebsiteDocument>(COLLECTION_NAME)
        .find({ _id: { $in: validIds } })
        .limit(MAX_BRON_WEBSITE_IDS)
        .toArray();
    }, 'BronWebsite.findByIds');
  }

  /**
   * Update a website
   */
  static async update(id: string, updateData: Partial<BronWebsiteCreateInput>): Promise<BronWebsiteDocument | null> {
    if (!ObjectId.isValid(id)) {
      throw new DatabaseValidationError('Invalid website ID');
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      
      // Convert queryId from string to ObjectId if provided
      const { queryId, ...rest } = updateData;
      const updatePayload: Partial<BronWebsiteDocument> = {
        ...rest,
        updatedAt: new Date()
      };
      
      if (queryId !== undefined) {
        if (queryId && ObjectId.isValid(queryId)) {
          updatePayload.queryId = new ObjectId(queryId);
        } else {
          updatePayload.queryId = undefined;
        }
      }
      
      const filter: Filter<BronWebsiteDocument> = { _id: new ObjectId(id) };
      const update: UpdateFilter<BronWebsiteDocument> = { $set: updatePayload };
      const result = await db.collection<BronWebsiteDocument>(COLLECTION_NAME).findOneAndUpdate(
        filter,
        update,
        { returnDocument: 'after' }
      );

      return result || null;
    }, 'BronWebsite.update');
  }

  /**
   * Update acceptance status
   */
  static async updateAcceptance(id: string, accepted: boolean | null): Promise<BronWebsiteDocument | null> {
    return await this.update(id, { accepted });
  }

  /**
   * Delete a website
   */
  static async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db.collection<BronWebsiteDocument>(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
      return result.deletedCount > 0;
    }, 'BronWebsite.delete');
  }
}
