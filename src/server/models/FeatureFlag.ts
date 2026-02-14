import { getDB, ensureDBConnection } from '../config/database.js';
import { ObjectId, type UpdateFilter } from 'mongodb';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

const COLLECTION_NAME = 'feature_flags';

/**
 * Knowledge Graph feature flag names
 */
export enum KGFeatureFlag {
  KG_ENABLED = 'KG_ENABLED', // Master flag: Enable/disable all KG features
  KG_RETRIEVAL_ENABLED = 'KG_RETRIEVAL_ENABLED',
  KG_EXTRACTION_ENABLED = 'KG_EXTRACTION_ENABLED',
  KG_RELATIONSHIP_EXTRACTION_ENABLED = 'KG_RELATIONSHIP_EXTRACTION_ENABLED',
  KG_VALIDATION_ENABLED = 'KG_VALIDATION_ENABLED',
  KG_REASONING_ENABLED = 'KG_REASONING_ENABLED',
  KG_DEDUPLICATION_ENABLED = 'KG_DEDUPLICATION_ENABLED',
  KG_TRAVERSAL_ENABLED = 'KG_TRAVERSAL_ENABLED', // Graph traversal for multi-hop reasoning
  KG_HYBRID_SCORING_ENABLED = 'KG_HYBRID_SCORING_ENABLED', // Hybrid scoring combining KG confidence with vector similarity
  KG_TRUTH_DISCOVERY_ENABLED = 'KG_TRUTH_DISCOVERY_ENABLED', // Truth discovery and conflict resolution
  KG_FUSION_ENABLED = 'KG_FUSION_ENABLED', // Knowledge fusion service for merging facts from multiple sources
  KG_GRAPHRAG_RETRIEVAL_ENABLED = 'KG_GRAPHRAG_RETRIEVAL_ENABLED', // GraphRAG retrieval service orchestrator
  KG_CONTEXTUAL_ENRICHMENT_ENABLED = 'KG_CONTEXTUAL_ENRICHMENT_ENABLED', // Contextual enrichment service for vector chunk retrieval
  KG_TRAVERSAL_CACHING_ENABLED = 'KG_TRAVERSAL_CACHING_ENABLED', // Traversal caching and performance optimization
  KG_COMMUNITY_RETRIEVAL_ENABLED = 'KG_COMMUNITY_RETRIEVAL_ENABLED', // Community-based retrieval (Microsoft GraphRAG pattern)
  KG_LLM_ANSWER_GENERATION_ENABLED = 'KG_LLM_ANSWER_GENERATION_ENABLED', // LLM answer generation from KG facts
  KG_TRUTHFULRAG_ENABLED = 'KG_TRUTHFULRAG_ENABLED', // TruthfulRAG conflict resolution with entropy-based filtering
  KG_STEINER_TREE_ENABLED = 'KG_STEINER_TREE_ENABLED', // Steiner tree algorithm for optimal path finding
  KG_SEMANTIC_LABELING_ENABLED = 'KG_SEMANTIC_LABELING_ENABLED', // Semantic community label generation using LLM
  KG_COMMUNITY_REPORTS_ENABLED = 'KG_COMMUNITY_REPORTS_ENABLED', // Community report generation with key entities, relationships, and examples
  KG_CHANGE_DETECTION_ENABLED = 'KG_CHANGE_DETECTION_ENABLED', // Change detection service for detecting document and entity changes
  KG_ENTITY_VERSIONING_ENABLED = 'KG_ENTITY_VERSIONING_ENABLED', // Entity versioning and temporal tracking
  KG_HIERARCHICAL_STRUCTURE_ENABLED = 'KG_HIERARCHICAL_STRUCTURE_ENABLED', // Hierarchical structure for legal/regulatory entities
  KG_INCREMENTAL_UPDATES_ENABLED = 'KG_INCREMENTAL_UPDATES_ENABLED', // Incremental update pipeline for efficient graph updates
  KG_ADAPTIVE_TRAVERSAL_ENABLED = 'KG_ADAPTIVE_TRAVERSAL_ENABLED', // Adaptive traversal with KG-driven BFS/DFS scraping paths
  KG_TEMPORAL_QUERIES_ENABLED = 'KG_TEMPORAL_QUERIES_ENABLED', // Temporal queries for legal/regulatory entities (effective dates, version comparison)
  KG_DOCUMENT_DEPENDENCIES_ENABLED = 'KG_DOCUMENT_DEPENDENCIES_ENABLED', // Document dependency tracking with citation parsing and impact analysis
  KG_ONTOLOGY_ALIGNMENT_ENABLED = 'KG_ONTOLOGY_ALIGNMENT_ENABLED', // Legal ontology alignment (IMBOR, EuroVoc) for domain-specific terminology and cross-referencing
  KG_LEGAL_FEATURES_ENABLED = 'KG_LEGAL_FEATURES_ENABLED', // Master flag: Enable/disable all legal/regulatory features (hierarchical structure, document dependencies, temporal queries, ontology alignment)
  KG_MAX_WEIGHT_MATCHING_ENABLED = 'KG_MAX_WEIGHT_MATCHING_ENABLED', // Maximum weight matching (HERA algorithm) for optimal entity resolution in heterogeneous data
  KG_HETEROGNN_SCORING_ENABLED = 'KG_HETEROGNN_SCORING_ENABLED', // Heterogeneous GNN scoring for relationship probability prediction
}

export type FeatureFlagCategory = 
  | 'Knowledge Graph Core'
  | 'Knowledge Graph Advanced'
  | 'Legal Features'
  | 'Retrieval'
  | 'Extraction'
  | 'Other';

/**
 * Get the category for a feature flag based on its name
 */
export function getFeatureFlagCategory(flagName: string): FeatureFlagCategory {
  if (flagName.startsWith('KG_')) {
    if (flagName.includes('LEGAL') || flagName.includes('HIERARCHICAL') || flagName.includes('TEMPORAL') || flagName.includes('DOCUMENT_DEPENDENCIES') || flagName.includes('ONTOLOGY')) {
      return 'Legal Features';
    }
    if (flagName.includes('RETRIEVAL') || flagName.includes('GRAPHRAG') || flagName.includes('COMMUNITY') || flagName.includes('CONTEXTUAL') || flagName.includes('LLM_ANSWER')) {
      return 'Retrieval';
    }
    if (flagName.includes('EXTRACTION') || flagName.includes('RELATIONSHIP')) {
      return 'Extraction';
    }
    if (flagName.includes('TRAVERSAL') || flagName.includes('TRUTH') || flagName.includes('FUSION') || flagName.includes('STEINER') || flagName.includes('SEMANTIC') || flagName.includes('CHANGE') || flagName.includes('VERSIONING') || flagName.includes('INCREMENTAL') || flagName.includes('ADAPTIVE') || flagName.includes('MAX_WEIGHT') || flagName.includes('HETEROGNN')) {
      return 'Knowledge Graph Advanced';
    }
    return 'Knowledge Graph Core';
  }
  return 'Other';
}

export interface FeatureFlagDocument {
  _id?: ObjectId;
  name: string;
  enabled: boolean;
  description?: string;
  category?: FeatureFlagCategory;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string; // User email or system
}

export interface FeatureFlagCreateInput {
  name: string;
  enabled: boolean;
  description?: string;
  category?: FeatureFlagCategory;
  updatedBy?: string;
}

export interface FeatureFlagUpdateInput {
  enabled?: boolean;
  description?: string;
  category?: FeatureFlagCategory;
  updatedBy?: string;
  updatedAt?: Date;
}

/**
 * MongoDB model for feature flags
 */
export class FeatureFlag {
  /**
   * Get all feature flags
   */
  static async findAll(): Promise<FeatureFlagDocument[]> {
    const db = getDB();
    const collection = db.collection<FeatureFlagDocument>(COLLECTION_NAME);
    
    // Limit to prevent memory exhaustion (feature flags are typically small, but protect against growth)
    // Default limit: 1000 flags, configurable via environment variable
    const MAX_FEATURE_FLAGS = parseInt(process.env.MAX_FEATURE_FLAGS || '1000', 10);
    
    const flags = await collection
      .find({})
      .sort({ name: 1 })
      .limit(MAX_FEATURE_FLAGS)
      .toArray();
    
    if (flags.length === MAX_FEATURE_FLAGS) {
      console.warn(
        `[FeatureFlag] findAll() query may have been truncated at ${MAX_FEATURE_FLAGS} entries. ` +
        `Consider increasing MAX_FEATURE_FLAGS.`
      );
    }
    
    return flags;
  }

  /**
   * Get a feature flag by name
   */
  static async findByName(name: string): Promise<FeatureFlagDocument | null> {
    const db = getDB();
    const collection = db.collection<FeatureFlagDocument>(COLLECTION_NAME);
    return await collection.findOne({ name });
  }

  /**
   * Get multiple feature flags by names
   */
  static async findByNames(names: string[]): Promise<FeatureFlagDocument[]> {
    const db = getDB();
    const collection = db.collection<FeatureFlagDocument>(COLLECTION_NAME);
    
    // Limit array size to prevent memory exhaustion
    const MAX_FEATURE_FLAG_NAMES = parseInt(process.env.MAX_FEATURE_FLAG_NAMES || '1000', 10);
    const limitedNames = names.slice(0, MAX_FEATURE_FLAG_NAMES);
    
    if (names.length > MAX_FEATURE_FLAG_NAMES) {
      console.warn(
        `[FeatureFlag] Names list truncated from ${names.length} to ${MAX_FEATURE_FLAG_NAMES} to prevent memory exhaustion`
      );
    }
    
    return await collection
      .find({ name: { $in: limitedNames } })
      .limit(MAX_FEATURE_FLAG_NAMES)
      .toArray();
  }

  /**
   * Create or update a feature flag
   */
  static async upsert(
    flagData: FeatureFlagCreateInput
  ): Promise<FeatureFlagDocument> {
    const db = getDB();
    const collection = db.collection<FeatureFlagDocument>(COLLECTION_NAME);

    const existing = await collection.findOne({ name: flagData.name });

    if (existing) {
      // Update existing flag
      const updateData: FeatureFlagUpdateInput = {
        enabled: flagData.enabled,
        description: flagData.description,
        category: flagData.category,
        updatedBy: flagData.updatedBy,
        updatedAt: new Date(),
      };

      const update: UpdateFilter<FeatureFlagDocument> = {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        },
      };
      const result = await collection.findOneAndUpdate(
        { name: flagData.name },
        update,
        { returnDocument: 'after', upsert: false }
      );

      if (!result) {
        throw new Error(`Failed to update feature flag: ${flagData.name}`);
      }

      return result;
    } else {
      // Create new flag
      const flag: FeatureFlagDocument = {
        ...flagData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await collection.insertOne(flag);
      return { ...flag, _id: result.insertedId };
    }
  }

  /**
   * Update a feature flag by name
   */
  static async updateByName(
    name: string,
    updateData: FeatureFlagUpdateInput
  ): Promise<FeatureFlagDocument | null> {
    const db = getDB();
    const collection = db.collection<FeatureFlagDocument>(COLLECTION_NAME);

    const update: UpdateFilter<FeatureFlagDocument> = {
      $set: {
        ...updateData,
        updatedAt: new Date(),
      },
    };
    const result = await collection.findOneAndUpdate(
      { name },
      update,
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Delete a feature flag by name
   */
  static async deleteByName(name: string): Promise<boolean> {
    const db = getDB();
    const collection = db.collection<FeatureFlagDocument>(COLLECTION_NAME);
    const result = await collection.deleteOne({ name });
    return result.deletedCount > 0;
  }

  /**
   * Get all KG feature flags
   */
  static async getKGFlags(): Promise<FeatureFlagDocument[]> {
    const kgFlagNames = Object.values(KGFeatureFlag);
    return await this.findByNames(kgFlagNames);
  }

  /**
   * Initialize default KG feature flags if they don't exist
   */
  static async initializeKGFlags(): Promise<void> {
    const defaultFlags: Array<{
      name: KGFeatureFlag;
      enabled: boolean;
      description: string;
    }> = [
      {
        name: KGFeatureFlag.KG_ENABLED,
        enabled: true,
        description: 'Master flag: Enable/disable all knowledge graph features',
      },
      {
        name: KGFeatureFlag.KG_RETRIEVAL_ENABLED,
        enabled: true,
        description: 'Enable KG-based retrieval in hybrid search',
      },
      {
        name: KGFeatureFlag.KG_EXTRACTION_ENABLED,
        enabled: true,
        description: 'Enable structured extraction from documents',
      },
      {
        name: KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED,
        enabled: false,
        description: 'Enable LLM-based relationship extraction from documents',
      },
      {
        name: KGFeatureFlag.KG_VALIDATION_ENABLED,
        enabled: true,
        description: 'Enable KG validation pipeline',
      },
      {
        name: KGFeatureFlag.KG_REASONING_ENABLED,
        enabled: true,
        description: 'Enable multi-hop graph reasoning',
      },
      {
        name: KGFeatureFlag.KG_TRAVERSAL_ENABLED,
        enabled: false,
        description: 'Enable graph traversal service for BFS/DFS multi-hop reasoning',
      },
      {
        name: KGFeatureFlag.KG_DEDUPLICATION_ENABLED,
        enabled: true,
        description: 'Enable enhanced entity deduplication with semantic matching',
      },
      {
        name: KGFeatureFlag.KG_HYBRID_SCORING_ENABLED,
        enabled: true,
        description: 'Enable hybrid scoring combining KG confidence with vector similarity',
      },
      {
        name: KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED,
        enabled: false,
        description: 'Enable truth discovery and conflict resolution for knowledge graph entities',
      },
      {
        name: KGFeatureFlag.KG_FUSION_ENABLED,
        enabled: false,
        description: 'Enable knowledge fusion service for merging facts from multiple sources',
      },
      {
        name: KGFeatureFlag.KG_GRAPHRAG_RETRIEVAL_ENABLED,
        enabled: false,
        description: 'Enable GraphRAG retrieval service orchestrator (combines fact-first retrieval, contextual enrichment, and hybrid scoring)',
      },
      {
        name: KGFeatureFlag.KG_CONTEXTUAL_ENRICHMENT_ENABLED,
        enabled: false,
        description: 'Enable contextual enrichment service for retrieving relevant vector chunks alongside KG facts',
      },
      {
        name: KGFeatureFlag.KG_TRAVERSAL_CACHING_ENABLED,
        enabled: false,
        description: 'Enable caching and performance optimizations for graph traversal operations',
      },
      {
        name: KGFeatureFlag.KG_COMMUNITY_RETRIEVAL_ENABLED,
        enabled: false,
        description: 'Enable community-based retrieval following Microsoft GraphRAG pattern (dynamic community selection and hierarchical retrieval)',
      },
      {
        name: KGFeatureFlag.KG_TRUTHFULRAG_ENABLED,
        enabled: false,
        description: 'Enable TruthfulRAG conflict resolution with entropy-based filtering to detect factual conflicts between vector content and KG facts',
      },
      {
        name: KGFeatureFlag.KG_STEINER_TREE_ENABLED,
        enabled: false,
        description: 'Enable Steiner tree algorithm for finding minimum weighted paths connecting key concepts',
      },
      {
        name: KGFeatureFlag.KG_SEMANTIC_LABELING_ENABLED,
        enabled: false,
        description: 'Enable semantic community label generation using LLM to replace structural cluster IDs with meaningful labels',
      },
      {
        name: KGFeatureFlag.KG_COMMUNITY_REPORTS_ENABLED,
        enabled: false,
        description: 'Enable community report generation with key entities, relationships, and examples for GraphRAG context',
      },
      {
        name: KGFeatureFlag.KG_CHANGE_DETECTION_ENABLED,
        enabled: false,
        description: 'Enable change detection service for detecting changes in source documents and knowledge graph entities',
      },
      {
        name: KGFeatureFlag.KG_HIERARCHICAL_STRUCTURE_ENABLED,
        enabled: false,
        description: 'Enable hierarchical structure for policy documents and jurisdictions (municipality → province → national → european)',
      },
      {
        name: KGFeatureFlag.KG_ENTITY_VERSIONING_ENABLED,
        enabled: false,
        description: 'Enable entity versioning and temporal tracking to track entity changes over time and support temporal queries',
      },
      {
        name: KGFeatureFlag.KG_INCREMENTAL_UPDATES_ENABLED,
        enabled: false,
        description: 'Enable incremental update pipeline for processing change sets to update only changed entities in the knowledge graph',
      },
      {
        name: KGFeatureFlag.KG_ADAPTIVE_TRAVERSAL_ENABLED,
        enabled: false,
        description: 'Enable adaptive traversal with KG-driven BFS/DFS scraping paths based on semantic relevance',
      },
      {
        name: KGFeatureFlag.KG_TEMPORAL_QUERIES_ENABLED,
        enabled: false,
        description: 'Enable temporal queries for legal/regulatory entities (query by effective dates, compare versions, find entities active in date ranges)',
      },
      {
        name: KGFeatureFlag.KG_DOCUMENT_DEPENDENCIES_ENABLED,
        enabled: false,
        description: 'Enable document dependency tracking with citation parsing, dependency extraction, and impact analysis',
      },
      {
        name: KGFeatureFlag.KG_ONTOLOGY_ALIGNMENT_ENABLED,
        enabled: false,
        description: 'Enable legal ontology alignment (IMBOR, EuroVoc) for domain-specific terminology and cross-referencing',
      },
      {
        name: KGFeatureFlag.KG_LEGAL_FEATURES_ENABLED,
        enabled: false,
        description: 'Master flag: Enable/disable all legal/regulatory features (hierarchical structure, document dependencies, temporal queries, ontology alignment)',
      },
      {
        name: KGFeatureFlag.KG_MAX_WEIGHT_MATCHING_ENABLED,
        enabled: false,
        description: 'Enable maximum weight matching (HERA algorithm) for optimal entity resolution in heterogeneous data with missing schema information',
      },
    ];

    for (const flag of defaultFlags) {
      const existing = await this.findByName(flag.name);
      const category = getFeatureFlagCategory(flag.name);
      if (!existing) {
        await this.upsert({
          name: flag.name,
          enabled: flag.enabled,
          description: flag.description,
          category,
          updatedBy: 'system',
        });
      } else if (!existing.category) {
        // Update existing flags without category
        await this.updateByName(flag.name, {
          category,
          updatedBy: 'system',
        });
      }
    }
  }

  // ============================================================================
  // Service Layer: Runtime feature flag management with caching
  // ============================================================================

  private static cache: Map<string, boolean> = new Map();
  private static cacheTimestamp: Map<string, number> = new Map();
  private static cacheTTL: number = 60000; // 1 minute cache TTL
  private static initialized: boolean = false;
  private static eventEmitter: EventEmitter = new EventEmitter();

  /**
   * Initialize the feature flag service and load flags from database
   */
  static async initializeService(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure database connection is available before initializing
      try {
        await ensureDBConnection();
      } catch (dbError) {
        logger.warn({ error: dbError }, '[FeatureFlag] Database not available, continuing with env var defaults');
        // Continue with env var defaults even if DB is not available
        this.initialized = true;
        return;
      }

      // Initialize default flags in database if they don't exist
      await this.initializeKGFlags();
      
      // Load flags from database and cache them
      await this.refreshCache();
      
      this.initialized = true;
      logger.info('[FeatureFlag] Service initialized');
    } catch (error) {
      logger.error({ error }, '[FeatureFlag] Failed to initialize service');
      // Continue with env var defaults even if DB fails
      this.initialized = true;
    }
  }

  /**
   * Refresh the in-memory cache from database
   */
  static async refreshCache(): Promise<void> {
    try {
      const flags = await this.getKGFlags();
      
      for (const flag of flags) {
        this.cache.set(flag.name, flag.enabled);
        this.cacheTimestamp.set(flag.name, Date.now());
      }

      this.eventEmitter.emit('cache-refreshed', flags);
    } catch (error) {
      logger.error({ error }, '[FeatureFlag] Failed to refresh cache');
    }
  }

  /**
   * Check if a feature flag is enabled
   * Priority: Environment variable > Database cache > Default (true)
   * 
   * @param flagName The feature flag name
   * @param defaultValue Default value if flag not found (default: true for backwards compatibility)
   * @returns true if enabled, false otherwise
   */
  static isEnabled(flagName: KGFeatureFlag, defaultValue: boolean = true): boolean {
    // 1. Check environment variable (highest priority)
    const envValue = process.env[flagName];
    if (envValue !== undefined) {
      const enabled = envValue.toLowerCase() === 'true' || envValue === '1';
      if (enabled !== defaultValue) {
        logger.debug(`[FeatureFlag] ${flagName} = ${enabled} (from env var)`);
      }
      return enabled;
    }

    // 2. Check cache (fast path)
    const cached = this.cache.get(flagName);
    const cacheTime = this.cacheTimestamp.get(flagName);
    
    if (cached !== undefined && cacheTime && (Date.now() - cacheTime) < this.cacheTTL) {
      return cached;
    }

    // 3. Fallback to default (for backwards compatibility, default to enabled)
    return defaultValue;
  }

  /**
   * Get all KG feature flag states
   */
  static getAllKGFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    
    for (const flagName of Object.values(KGFeatureFlag)) {
      result[flagName] = this.isEnabled(flagName);
    }
    
    return result;
  }

  /**
   * Set a feature flag value (updates database and cache)
   * 
   * @param flagName The feature flag name
   * @param enabled Whether the flag should be enabled
   * @param updatedBy User email or system identifier
   */
  static async setKGFlag(
    flagName: KGFeatureFlag,
    enabled: boolean,
    updatedBy?: string
  ): Promise<void> {
    try {
      const previousValue = this.isEnabled(flagName);
      
      // Update database
      await this.upsert({
        name: flagName,
        enabled,
        updatedBy: updatedBy || 'system',
      });

      // Update cache immediately
      this.cache.set(flagName, enabled);
      this.cacheTimestamp.set(flagName, Date.now());

      // Emit event for monitoring/auditing
      if (previousValue !== enabled) {
        this.eventEmitter.emit('flag-changed', {
          flagName,
          previousValue,
          newValue: enabled,
          updatedBy: updatedBy || 'system',
          timestamp: new Date(),
        });

        logger.info(
          `[FeatureFlag] ${flagName} changed from ${previousValue} to ${enabled} by ${updatedBy || 'system'}`
        );
      }
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlag] Failed to set flag');
      throw error;
    }
  }

  /**
   * Check if KG is enabled (master flag)
   */
  static isKGEnabled(): boolean {
    return this.isEnabled(KGFeatureFlag.KG_ENABLED, true);
  }

  /**
   * Check if KG retrieval is enabled (for HybridSearchService)
   * Returns false if KG_ENABLED is false
   */
  static isRetrievalEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_RETRIEVAL_ENABLED, true);
  }

  /**
   * Check if KG extraction is enabled (for document extraction services)
   * Returns false if KG_ENABLED is false
   */
  static isExtractionEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_EXTRACTION_ENABLED, true);
  }

  /**
   * Check if KG relationship extraction is enabled (for relationship extraction services)
   * Returns false if KG_ENABLED is false
   */
  static isRelationshipExtractionEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_RELATIONSHIP_EXTRACTION_ENABLED, false);
  }

  /**
   * Check if KG validation is enabled (for validation services)
   * Returns false if KG_ENABLED is false
   */
  static isValidationEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_VALIDATION_ENABLED, true);
  }

  /**
   * Check if KG reasoning is enabled (for multi-hop reasoning)
   * Returns false if KG_ENABLED is false
   */
  static isReasoningEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_REASONING_ENABLED, true);
  }

  /**
   * Check if KG deduplication is enabled (for deduplication services)
   * Returns false if KG_ENABLED is false
   */
  static isDeduplicationEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_DEDUPLICATION_ENABLED, true);
  }

  /**
   * Check if KG truth discovery is enabled (for truth discovery services)
   * Returns false if KG_ENABLED is false
   */
  static isTruthDiscoveryEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_TRUTH_DISCOVERY_ENABLED, false);
  }

  /**
   * Check if KG fusion is enabled (for knowledge fusion services)
   * Returns false if KG_ENABLED is false
   */
  static isFusionEnabled(): boolean {
    if (!this.isKGEnabled()) return false;
    return this.isEnabled(KGFeatureFlag.KG_FUSION_ENABLED, false);
  }

  /**
   * Get feature flag configuration for benchmarking
   * Returns a snapshot of all flags that can be used in benchmark metadata
   */
  static getBenchmarkConfig(): Record<string, boolean | number> {
    return {
      ...this.getAllKGFlags(),
      timestamp: Date.now(),
    };
  }

  /**
   * Set multiple flags from a benchmark configuration
   * Useful for restoring flag states after benchmark runs
   */
  static async setFlagsFromConfig(
    config: Record<string, boolean>,
    updatedBy?: string
  ): Promise<void> {
    for (const [flagName, enabled] of Object.entries(config)) {
      // Skip non-KG flags and metadata fields
      if (Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag) && flagName !== 'timestamp') {
        await this.setKGFlag(flagName as KGFeatureFlag, enabled, updatedBy);
      }
    }
  }

  /**
   * Set multiple flags (alias for setFlagsFromConfig for backward compatibility)
   */
  static async setFlags(
    config: Record<string, boolean>,
    updatedBy?: string
  ): Promise<void> {
    return this.setFlagsFromConfig(config, updatedBy);
  }

  /**
   * Get the event emitter for listening to flag changes
   */
  static getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

// Initialize service on module load (async, but don't block)
FeatureFlag.initializeService().catch((error) => {
  logger.error({ error }, '[FeatureFlag] Failed to initialize service on module load');
});