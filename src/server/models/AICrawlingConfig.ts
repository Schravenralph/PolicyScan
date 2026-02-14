import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';

const COLLECTION_NAME = 'ai_crawling_configs';

export type AggressivenessLevel = 'low' | 'medium' | 'high';
export type StrategyType = 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
export type ConfigScope = 'global' | 'site' | 'query';

export interface AICrawlingConfigDocument {
  _id?: ObjectId;
  scope: ConfigScope;
  siteUrl?: string; // Required for site scope, optional for global
  aggressiveness: AggressivenessLevel;
  strategy: StrategyType;
  maxDepth?: number;
  maxLinks?: number;
  llmModel?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number; // in seconds
  timeout?: number; // in milliseconds
  fallbackBehavior?: 'traditional' | 'skip';
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // User email or system
}

export interface AICrawlingConfigCreateInput {
  scope: ConfigScope;
  siteUrl?: string;
  aggressiveness: AggressivenessLevel;
  strategy: StrategyType;
  maxDepth?: number;
  maxLinks?: number;
  llmModel?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  timeout?: number;
  fallbackBehavior?: 'traditional' | 'skip';
  enabled: boolean;
  createdBy?: string;
}

export interface AICrawlingConfigUpdateInput {
  aggressiveness?: AggressivenessLevel;
  strategy?: StrategyType;
  maxDepth?: number;
  maxLinks?: number;
  llmModel?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  timeout?: number;
  fallbackBehavior?: 'traditional' | 'skip';
  enabled?: boolean;
}

export class AICrawlingConfig {
  /**
   * Get merged configuration for a site
   * Merges in order: global -> site -> query (if provided)
   */
  static async getMergedConfig(
    siteUrl?: string,
    queryConfig?: Partial<AICrawlingConfigDocument>
  ): Promise<AICrawlingConfigDocument> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);

    // Start with defaults
    const defaultConfig: AICrawlingConfigDocument = {
      scope: 'global',
      aggressiveness: 'medium',
      strategy: 'auto',
      maxDepth: 4,
      maxLinks: 15,
      cacheEnabled: true,
      cacheTTL: 604800, // 7 days
      timeout: 30000, // 30 seconds
      fallbackBehavior: 'traditional',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Load global config
    const globalConfig = await collection.findOne({
      scope: 'global',
      enabled: true
    });

    // Load site config if siteUrl provided
    let siteConfig: AICrawlingConfigDocument | null = null;
    if (siteUrl) {
      siteConfig = await collection.findOne({
        scope: 'site',
        siteUrl,
        enabled: true
      });
    }

    // Merge: defaults -> global -> site -> query
    const merged: AICrawlingConfigDocument = {
      ...defaultConfig,
      ...(globalConfig ? this.sanitizeConfig(globalConfig) : {}),
      ...(siteConfig ? this.sanitizeConfig(siteConfig) : {}),
      ...(queryConfig ? this.sanitizeConfig(queryConfig as AICrawlingConfigDocument) : {}),
      scope: 'query', // Final scope is always query
      updatedAt: new Date()
    };

    return merged;
  }

  /**
   * Sanitize config by removing MongoDB-specific fields
   */
  private static sanitizeConfig(config: AICrawlingConfigDocument): Partial<AICrawlingConfigDocument> {
    const { _id, createdAt: _createdAt, updatedAt: _updatedAt, scope: _scope, ...sanitized } = config;
    return sanitized;
  }

  /**
   * Create a new configuration
   */
  static async create(configData: AICrawlingConfigCreateInput): Promise<AICrawlingConfigDocument> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);

    // Validate site URL for site scope
    if (configData.scope === 'site' && !configData.siteUrl) {
      throw new Error('siteUrl is required for site scope configuration');
    }

    // Check for existing config with same scope and siteUrl
    if (configData.scope === 'site' && configData.siteUrl) {
      const existing = await collection.findOne({
        scope: 'site',
        siteUrl: configData.siteUrl
      });
      if (existing) {
        throw new Error(`Configuration already exists for site: ${configData.siteUrl}`);
      }
    }

    const config: AICrawlingConfigDocument = {
      ...configData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await collection.insertOne(config);
    return { ...config, _id: result.insertedId };
  }

  /**
   * Find configuration by ID
   */
  static async findById(id: string): Promise<AICrawlingConfigDocument | null> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  /**
   * Find all configurations with optional filters
   */
  static async findAll(filters: {
    scope?: ConfigScope;
    siteUrl?: string;
    enabled?: boolean;
    limit?: number;
    skip?: number;
  } = {}): Promise<AICrawlingConfigDocument[]> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);

    const query: Record<string, unknown> = {};
    if (filters.scope) query.scope = filters.scope;
    if (filters.siteUrl) query.siteUrl = filters.siteUrl;
    if (filters.enabled !== undefined) query.enabled = filters.enabled;

    const limit = filters.limit || 100;
    const skip = filters.skip || 0;

    return await collection
      .find(query)
      .sort({ scope: 1, siteUrl: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Update a configuration
   */
  static async update(
    id: string,
    updateData: AICrawlingConfigUpdateInput
  ): Promise<AICrawlingConfigDocument | null> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);

    const filter: Filter<AICrawlingConfigDocument> = { _id: new ObjectId(id) };
    const update: UpdateFilter<AICrawlingConfigDocument> = {
      $set: {
        ...updateData,
        updatedAt: new Date()
      }
    };
    const result = await collection.findOneAndUpdate(
      filter,
      update,
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Delete a configuration
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }

  /**
   * Find configuration by site URL
   */
  static async findBySiteUrl(siteUrl: string): Promise<AICrawlingConfigDocument | null> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);
    return await collection.findOne({
      scope: 'site',
      siteUrl,
      enabled: true
    });
  }

  /**
   * Get global configuration
   */
  static async getGlobalConfig(): Promise<AICrawlingConfigDocument | null> {
    const db = getDB();
    const collection = db.collection<AICrawlingConfigDocument>(COLLECTION_NAME);
    return await collection.findOne({
      scope: 'global',
      enabled: true
    });
  }
}

