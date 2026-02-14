/**
 * FeatureFlagTemplate Model - MongoDB persistence for feature flag templates
 * 
 * This model enables:
 * - Saving feature flag configurations as reusable templates
 * - Managing template metadata (name, description, public/private)
 * - Tracking template usage
 * - Default templates for common configurations
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import {
  handleDatabaseOperation,
  DatabaseValidationError,
  DatabaseNotFoundError,
} from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'feature_flag_templates';
let indexesEnsured = false;

/**
 * FeatureFlagTemplate document structure
 */
export interface FeatureFlagTemplateDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  flags: Record<string, boolean>; // flag name -> enabled state
  isPublic: boolean;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number; // track how often template is used
}

/**
 * FeatureFlagTemplate creation input
 */
export interface FeatureFlagTemplateCreateInput {
  name: string;
  description?: string;
  flags: Record<string, boolean>;
  isPublic?: boolean;
  isDefault?: boolean;
  createdBy: string;
}

/**
 * FeatureFlagTemplate update input
 */
export interface FeatureFlagTemplateUpdateInput {
  name?: string;
  description?: string;
  flags?: Record<string, boolean>;
  isPublic?: boolean;
  isDefault?: boolean;
  usageCount?: number;
}

/**
 * MongoDB model for feature flag templates
 */
export class FeatureFlagTemplate {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const db = getDB();
    const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);

    try {
      // Unique index on name
      await collection.createIndex({ name: 1 }, { unique: true, background: true });

      // Index on isPublic for filtering public templates
      await collection.createIndex({ isPublic: 1 }, { background: true });

      // Index on isDefault for filtering default templates
      await collection.createIndex({ isDefault: 1 }, { background: true });

      // Index on createdBy for user-specific templates
      await collection.createIndex({ createdBy: 1 }, { background: true });

      // Index on createdAt for sorting
      await collection.createIndex({ createdAt: -1 }, { background: true });

      indexesEnsured = true;
    } catch (error) {
      logger.warn({ error }, 'Warning: Could not create all feature_flag_templates indexes');
    }
  }

  /**
   * Create a new feature flag template
   */
  static async create(input: FeatureFlagTemplateCreateInput): Promise<FeatureFlagTemplateDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const now = new Date();

      // Validate input
      if (!input.name || input.name.trim().length === 0) {
        throw new DatabaseValidationError('Template name is required');
      }

      if (!input.flags || Object.keys(input.flags).length === 0) {
        throw new DatabaseValidationError('Template must contain at least one flag');
      }

      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);

      // Check if template with same name already exists
      const existing = await collection.findOne({ name: input.name });
      if (existing) {
        throw new DatabaseValidationError(`Template with name "${input.name}" already exists`);
      }

      const template: FeatureFlagTemplateDocument = {
        name: input.name.trim(),
        description: input.description?.trim(),
        flags: input.flags,
        isPublic: input.isPublic ?? false,
        isDefault: input.isDefault ?? false,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      };

      const result = await collection.insertOne(template);
      return { ...template, _id: result.insertedId };
    }, 'FeatureFlagTemplate.create');
  }

  /**
   * Find a template by ID
   */
  static async findById(id: string): Promise<FeatureFlagTemplateDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      return await collection.findOne({ _id: new ObjectId(id) });
    }, 'FeatureFlagTemplate.findById');
  }

  /**
   * Find a template by name
   */
  static async findByName(name: string): Promise<FeatureFlagTemplateDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      return await collection.findOne({ name });
    }, 'FeatureFlagTemplate.findByName');
  }

  /**
   * Find all templates
   */
  static async findAll(filter?: {
    isPublic?: boolean;
    isDefault?: boolean;
    createdBy?: string;
  }): Promise<FeatureFlagTemplateDocument[]> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      
      const query: Filter<FeatureFlagTemplateDocument> = {};
      if (filter?.isPublic !== undefined) {
        query.isPublic = filter.isPublic;
      }
      if (filter?.isDefault !== undefined) {
        query.isDefault = filter.isDefault;
      }
      if (filter?.createdBy) {
        query.createdBy = filter.createdBy;
      }

      return await collection
        .find(query)
        .sort({ isDefault: -1, createdAt: -1 })
        .toArray();
    }, 'FeatureFlagTemplate.findAll');
  }

  /**
   * Update a template
   */
  static async update(
    id: string,
    input: FeatureFlagTemplateUpdateInput
  ): Promise<FeatureFlagTemplateDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      const now = new Date();

      // Check if template exists
      const existing = await collection.findOne({ _id: new ObjectId(id) });
      if (!existing) {
        throw new DatabaseNotFoundError(`Template not found: ${id}`);
      }

      // If name is being updated, check for conflicts
      if (input.name && input.name !== existing.name) {
        const nameConflict = await collection.findOne({ name: input.name });
        if (nameConflict) {
          throw new DatabaseValidationError(`Template with name "${input.name}" already exists`);
        }
      }

      const update: Partial<FeatureFlagTemplateDocument> = {
        updatedAt: now,
      };

      if (input.name !== undefined) {
        update.name = input.name.trim();
      }
      if (input.description !== undefined) {
        update.description = input.description?.trim();
      }
      if (input.flags !== undefined) {
        update.flags = input.flags;
      }
      if (input.isPublic !== undefined) {
        update.isPublic = input.isPublic;
      }
      if (input.isDefault !== undefined) {
        update.isDefault = input.isDefault;
      }
      if (input.usageCount !== undefined) {
        update.usageCount = input.usageCount;
      }

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new DatabaseNotFoundError(`Template not found after update: ${id}`);
      }

      return result;
    }, 'FeatureFlagTemplate.update');
  }

  /**
   * Increment usage count for a template
   */
  static async incrementUsage(id: string): Promise<void> {
    await this.ensureIndexes();
    await handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { usageCount: 1 }, $set: { updatedAt: new Date() } }
      );
    }, 'FeatureFlagTemplate.incrementUsage');
  }

  /**
   * Delete a template
   */
  static async delete(id: string): Promise<boolean> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      return result.deletedCount > 0;
    }, 'FeatureFlagTemplate.delete');
  }

  /**
   * Count templates
   */
  static async count(filter?: Filter<FeatureFlagTemplateDocument>): Promise<number> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<FeatureFlagTemplateDocument>(COLLECTION_NAME);
      return await collection.countDocuments(filter || {});
    }, 'FeatureFlagTemplate.count');
  }
}

