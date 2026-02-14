import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { BadRequestError } from '../types/errors.js';

/**
 * Benchmark Configuration Template Database Schema
 * 
 * Stores benchmark configuration templates for reuse across benchmark runs.
 * Templates define which benchmark types to run and optional feature flag configurations.
 * 
 * Collection: benchmark_config_templates
 */

export interface BenchmarkConfigTemplateDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  benchmarkTypes: string[];
  featureFlags?: Record<string, boolean>;
  isPublic: boolean;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
}

export interface BenchmarkConfigTemplateCreateInput {
  name: string;
  description?: string;
  benchmarkTypes: string[];
  featureFlags?: Record<string, boolean>;
  isPublic?: boolean;
  isDefault?: boolean;
  createdBy?: string;
}

export interface BenchmarkConfigTemplateUpdateInput {
  name?: string;
  description?: string;
  benchmarkTypes?: string[];
  featureFlags?: Record<string, boolean>;
  isPublic?: boolean;
  isDefault?: boolean;
}

const COLLECTION_NAME = 'benchmark_config_templates';

/**
 * BenchmarkConfigTemplate model for MongoDB operations
 */
export class BenchmarkConfigTemplate {
  /**
   * Create a new benchmark configuration template
   */
  static async create(input: BenchmarkConfigTemplateCreateInput): Promise<BenchmarkConfigTemplateDocument> {
    const db = getDB();
    const now = new Date();

    // Check if name already exists
    // Note: We also rely on unique index for duplicate prevention, but check first for better error messages
    // Trim name to handle whitespace issues
    const trimmedName = input.name.trim();
    
    // Use the same collection name as the test cleanup
    const collection = db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME);
    const existing = await collection.findOne({
      name: trimmedName,
    });
    
    if (existing) {
      throw new BadRequestError(`Template with name "${trimmedName}" already exists`);
    }

    // If setting as default, unset other defaults
    if (input.isDefault) {
      await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).updateMany(
        { isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const template: BenchmarkConfigTemplateDocument = {
      name: input.name.trim(),
      description: input.description,
      benchmarkTypes: input.benchmarkTypes,
      featureFlags: input.featureFlags,
      isPublic: input.isPublic ?? false,
      isDefault: input.isDefault ?? false,
      createdBy: input.createdBy || 'system',
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    };

    try {
      const result = await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).insertOne(template);
      
      return {
        ...template,
        _id: result.insertedId,
      };
    } catch (error: any) {
      // Handle MongoDB duplicate key error (E11000) - unique index violation
      // This can happen if the duplicate check didn't find the template but unique index catches it
      if (error?.code === 11000 || error?.codeName === 'DuplicateKey' || (error?.name === 'MongoServerError' && error?.code === 11000)) {
        throw new BadRequestError(`Template with name "${input.name}" already exists`);
      }
      throw error;
    }
  }

  /**
   * Find templates with optional filters
   */
  static async find(filters: {
    name?: string;
    createdBy?: string;
    isPublic?: boolean;
    isDefault?: boolean;
    search?: string;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ entries: BenchmarkConfigTemplateDocument[]; total: number }> {
    const db = getDB();
    const {
      name,
      createdBy,
      isPublic,
      isDefault,
      search,
      limit = 100,
      skip = 0,
      sort = { createdAt: -1 },
    } = filters;

    const query: Filter<BenchmarkConfigTemplateDocument> = {};

    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }

    if (createdBy) {
      query.createdBy = createdBy;
    }

    if (isPublic !== undefined) {
      query.isPublic = isPublic;
    }

    if (isDefault !== undefined) {
      query.isDefault = isDefault;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [entries, total] = await Promise.all([
      db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME)
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).countDocuments(query),
    ]);

    return { entries, total };
  }

  /**
   * Find template by ID
   */
  static async findById(id: string): Promise<BenchmarkConfigTemplateDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    const db = getDB();
    return await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).findOne({
      _id: new ObjectId(id),
    });
  }

  /**
   * Find template by name
   */
  static async findByName(name: string): Promise<BenchmarkConfigTemplateDocument | null> {
    const db = getDB();
    return await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).findOne({
      name,
    });
  }

  /**
   * Update a template
   */
  static async update(
    id: string,
    updates: BenchmarkConfigTemplateUpdateInput
  ): Promise<BenchmarkConfigTemplateDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    const db = getDB();
    const updateData: Partial<BenchmarkConfigTemplateDocument> = {
      ...updates,
      updatedAt: new Date(),
    };

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).updateMany(
        { isDefault: true, _id: { $ne: new ObjectId(id) } },
        { $set: { isDefault: false } }
      );
    }

    // If name is being updated, check for conflicts
    if (updates.name) {
      const existing = await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).findOne({
        name: updates.name,
        _id: { $ne: new ObjectId(id) },
      });
      if (existing) {
        throw new Error(`Template with name "${updates.name}" already exists`);
      }
    }

    const result = await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Delete a template
   */
  static async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }

    const db = getDB();
    const result = await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).deleteOne({
      _id: new ObjectId(id),
    });

    return result.deletedCount > 0;
  }

  /**
   * Increment usage count for a template
   */
  static async incrementUsage(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      return;
    }

    const db = getDB();
    await db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $inc: { usageCount: 1 } }
    );
  }

  /**
   * Ensure database indexes exist
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<BenchmarkConfigTemplateDocument>(COLLECTION_NAME);

    await collection.createIndex({ name: 1 }, { unique: true });
    await collection.createIndex({ createdBy: 1 });
    await collection.createIndex({ isPublic: 1 });
    await collection.createIndex({ isDefault: 1 });
    await collection.createIndex({ createdAt: -1 });
    await collection.createIndex({ usageCount: -1 });
  }
}

