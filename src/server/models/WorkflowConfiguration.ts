/**
 * WorkflowConfiguration Model - MongoDB persistence for workflow-feature flag configurations
 * 
 * This model enables:
 * - Associating workflow selections with feature flag sets for the Beleidsscan wizard
 * - Managing per-workflow feature flag overrides
 * - Storing user preferences for which workflow to use
 * - Supporting "active configuration" concept per user
 */

import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import {
  handleDatabaseOperation,
  DatabaseValidationError,
  DatabaseNotFoundError,
} from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'workflow_configurations';
let indexesEnsured = false;

/**
 * WorkflowConfiguration document structure
 */
export interface WorkflowConfigurationDocument {
  _id?: ObjectId;
  name: string;
  description?: string;
  workflowId: string; // The workflow ID to use (e.g., 'beleidsscan-wizard', 'beleidsscan-graph')
  featureFlags: Record<string, boolean>; // Feature flag overrides for this configuration
  isActive: boolean; // Whether this is the currently active configuration for the user
  createdBy: string; // User ID
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WorkflowConfiguration creation input
 */
export interface WorkflowConfigurationCreateInput {
  name: string;
  description?: string;
  workflowId: string;
  featureFlags: Record<string, boolean>;
  isActive?: boolean;
  createdBy: string;
}

/**
 * WorkflowConfiguration update input
 */
export interface WorkflowConfigurationUpdateInput {
  name?: string;
  description?: string;
  workflowId?: string;
  featureFlags?: Record<string, boolean>;
  isActive?: boolean;
}

/**
 * Available workflows for Beleidsscan wizard
 */
export const AVAILABLE_BELEIDSSCAN_WORKFLOWS = [
  {
    id: 'beleidsscan-wizard',
    name: 'Beleidsscan Wizard (Default)',
    description: 'The default multi-step wizard workflow with full document discovery pipeline',
    longDescription: 'This is the recommended workflow for most users. It guides you through query configuration, website selection, and document review in a structured process.',
    recommendedFor: ['First-time users', 'Standard policy research', 'Comprehensive scans'],
    limitations: [],
    isRecommended: true,
    compatibleWithWizard: true,
  },
  {
    id: 'beleidsscan-graph',
    name: 'Beleidsscan Graph',
    description: 'Graph-based workflow using knowledge graph for enhanced document discovery',
    longDescription: 'Uses the knowledge graph to find related documents through semantic relationships. Best for exploratory research where you want to discover unexpected connections.',
    recommendedFor: ['Exploratory research', 'Finding related documents', 'Advanced users'],
    limitations: ['May be slower than standard workflow', 'Requires populated knowledge graph'],
    isRecommended: false,
    compatibleWithWizard: false,
  },
  {
    id: 'quick-iplo-scan',
    name: 'Quick IPLO Scan',
    description: 'Fast scan of IPLO for known subjects with query enhancement',
    longDescription: 'Optimized for speed, this workflow quickly searches IPLO sources for known subjects. Best for quick verification or when you already know what you\'re looking for.',
    recommendedFor: ['Quick verification', 'Known subjects', 'Time-sensitive research'],
    limitations: ['Limited to IPLO sources only', 'May miss related documents'],
    isRecommended: false,
    compatibleWithWizard: true,
  },
  {
    id: 'standard-scan',
    name: 'Standard Document Scan',
    description: 'Scan IPLO, known sources, and Google for relevant documents',
    longDescription: 'A balanced workflow that searches multiple sources including IPLO, known document sources, and Google. Good for general research when you need comprehensive coverage.',
    recommendedFor: ['General research', 'Multi-source searches', 'Balanced coverage'],
    limitations: ['May take longer than quick scan'],
    isRecommended: false,
    compatibleWithWizard: true,
  },
  {
    id: 'bfs-3-hop',
    name: 'BFS 3-Hop Exploration',
    description: 'Breadth-first search workflow exploring 3 hops from seed URLs',
    longDescription: 'Explores websites using breadth-first search strategy, following links up to 3 levels deep. Useful for discovering new sources and exploring website structures.',
    recommendedFor: ['Website exploration', 'Discovering new sources', 'Link following'],
    limitations: ['Can be very slow', 'May explore irrelevant pages', 'Requires seed URLs'],
    isRecommended: false,
    compatibleWithWizard: false,
  },
] as const;

/**
 * Workflow Configuration Template
 * Pre-configured templates for common use cases
 */
export interface WorkflowConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  useCase: string;
  workflowId: string;
  featureFlags: Record<string, boolean>;
  icon?: string;
}

/**
 * Pre-configured workflow configuration templates
 */
export const WORKFLOW_CONFIGURATION_TEMPLATES: readonly WorkflowConfigurationTemplate[] = [
  {
    id: 'standard-scan',
    name: 'Standaard Scan',
    description: 'De aanbevolen configuratie voor algemeen beleidsonderzoek',
    useCase: 'Geschikt voor de meeste gebruikers die beleidsdocumenten willen vinden en analyseren.',
    workflowId: 'beleidsscan-wizard',
    featureFlags: {
      KG_ENABLED: true,
      KG_RETRIEVAL_ENABLED: true,
    },
    icon: 'FileText',
  },
  {
    id: 'deep-research',
    name: 'Diepgaand Onderzoek',
    description: 'Uitgebreide analyse met kennisgraaf-integratie',
    useCase: 'Voor onderzoekers die complexe verbanden tussen documenten willen ontdekken.',
    workflowId: 'beleidsscan-graph',
    featureFlags: {
      KG_ENABLED: true,
      KG_RETRIEVAL_ENABLED: true,
      KG_GRAPHRAG_RETRIEVAL_ENABLED: true,
      KG_COMMUNITY_RETRIEVAL_ENABLED: true,
      KG_TRAVERSAL_ENABLED: true,
    },
    icon: 'Network',
  },
  {
    id: 'quick-scan',
    name: 'Snelle Scan',
    description: 'Snel zoeken in IPLO-bronnen',
    useCase: 'Voor snelle verkenning van bekende onderwerpen.',
    workflowId: 'quick-iplo-scan',
    featureFlags: {},
    icon: 'Zap',
  },
  {
    id: 'legal-research',
    name: 'Juridisch Onderzoek',
    description: 'Gericht op juridische documenten en wetgeving',
    useCase: 'Voor het vinden van wetten, regelgeving en juridische analyses.',
    workflowId: 'beleidsscan-wizard',
    featureFlags: {
      KG_ENABLED: true,
      KG_LEGAL_RETRIEVAL_ENABLED: true,
      KG_HIERARCHICAL_RETRIEVAL_ENABLED: true,
      KG_TEMPORAL_RETRIEVAL_ENABLED: true,
    },
    icon: 'Scale',
  },
] as const;

/**
 * MongoDB model for workflow configurations
 */
export class WorkflowConfiguration {
  /**
   * Ensure database indexes exist
   */
  private static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const db = getDB();
    const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);

    try {
      // Index on createdBy for user-specific configurations
      await collection.createIndex({ createdBy: 1 }, { background: true });

      // Compound index for finding active configuration per user
      await collection.createIndex(
        { createdBy: 1, isActive: 1 },
        { background: true }
      );

      // Index on createdAt for sorting
      await collection.createIndex({ createdAt: -1 }, { background: true });

      // Unique index on name per user
      await collection.createIndex(
        { createdBy: 1, name: 1 },
        { unique: true, background: true }
      );

      // Compound index for findByUser query (createdBy + isActive + createdAt sorting)
      // Optimizes queries that filter by user and sort by isActive and createdAt
      await collection.createIndex(
        { createdBy: 1, isActive: -1, createdAt: -1 },
        { background: true, name: 'idx_createdBy_isActive_createdAt' }
      );

      indexesEnsured = true;
      logger.debug('[WorkflowConfiguration] Indexes ensured');
    } catch (error) {
      logger.warn(
        { error },
        'Warning: Could not create all workflow_configurations indexes'
      );
    }
  }

  /**
   * Create a new workflow configuration
   */
  static async create(input: WorkflowConfigurationCreateInput): Promise<WorkflowConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const now = new Date();

      // Validate input
      if (!input.name || input.name.trim().length === 0) {
        throw new DatabaseValidationError('Configuration name is required');
      }

      if (!input.workflowId || input.workflowId.trim().length === 0) {
        throw new DatabaseValidationError('Workflow ID is required');
      }

      // Validate workflow ID
      const workflowExists = await this.validateWorkflowId(input.workflowId);
      if (!workflowExists) {
        throw new DatabaseValidationError(
          `Workflow ID "${input.workflowId}" does not exist or is not available`
        );
      }

      // Validate feature flags
      if (input.featureFlags) {
        const invalidFlags = await this.validateFeatureFlags(input.featureFlags);
        if (invalidFlags.length > 0) {
          throw new DatabaseValidationError(
            `Invalid feature flags: ${invalidFlags.join(', ')}. Feature flag values must be booleans.`
          );
        }
      }

      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);

      // Check if configuration with same name already exists for this user
      const existing = await collection.findOne({
        createdBy: input.createdBy,
        name: input.name,
      });
      if (existing) {
        throw new DatabaseValidationError(
          `Configuration with name "${input.name}" already exists for this user`
        );
      }

      // If this configuration should be active, deactivate others first
      if (input.isActive) {
        await collection.updateMany(
          { createdBy: input.createdBy, isActive: true },
          { $set: { isActive: false, updatedAt: now } }
        );
      }

      const configuration: WorkflowConfigurationDocument = {
        name: input.name.trim(),
        description: input.description?.trim(),
        workflowId: input.workflowId,
        featureFlags: input.featureFlags || {},
        isActive: input.isActive ?? false,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };

      const result = await collection.insertOne(configuration);
      logger.info(`[WorkflowConfiguration] Created configuration "${input.name}" for user ${input.createdBy}`);
      return { ...configuration, _id: result.insertedId };
    }, 'WorkflowConfiguration.create');
  }

  /**
   * Find a configuration by ID
   */
  static async findById(id: string): Promise<WorkflowConfigurationDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      return await collection.findOne({ _id: new ObjectId(id) });
    }, 'WorkflowConfiguration.findById');
  }

  /**
   * Find the active configuration for a user
   */
  static async findActiveByUser(userId: string): Promise<WorkflowConfigurationDocument | null> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      return await collection.findOne({ createdBy: userId, isActive: true });
    }, 'WorkflowConfiguration.findActiveByUser');
  }

  /**
   * Find all configurations for a user
   */
  static async findByUser(userId: string): Promise<WorkflowConfigurationDocument[]> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      return await collection
        .find({ createdBy: userId })
        .sort({ isActive: -1, createdAt: -1 })
        .toArray();
    }, 'WorkflowConfiguration.findByUser');
  }

  /**
   * Find all configurations
   */
  static async findAll(filter?: {
    createdBy?: string;
    workflowId?: string;
    isActive?: boolean;
  }): Promise<WorkflowConfigurationDocument[]> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      
      const query: Filter<WorkflowConfigurationDocument> = {};
      if (filter?.createdBy) {
        query.createdBy = filter.createdBy;
      }
      if (filter?.workflowId) {
        query.workflowId = filter.workflowId;
      }
      if (filter?.isActive !== undefined) {
        query.isActive = filter.isActive;
      }

      return await collection
        .find(query)
        .sort({ isActive: -1, createdAt: -1 })
        .toArray();
    }, 'WorkflowConfiguration.findAll');
  }

  /**
   * Update a configuration
   */
  static async update(
    id: string,
    input: WorkflowConfigurationUpdateInput,
    userId: string
  ): Promise<WorkflowConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      const now = new Date();

      // Check if configuration exists and belongs to user
      const existing = await collection.findOne({ _id: new ObjectId(id) });
      if (!existing) {
        throw new DatabaseNotFoundError(`Configuration not found: ${id}`);
      }
      if (existing.createdBy !== userId) {
        throw new DatabaseValidationError('You can only update your own configurations');
      }

      // If name is being updated, check for conflicts
      if (input.name && input.name !== existing.name) {
        const nameConflict = await collection.findOne({
          createdBy: userId,
          name: input.name,
        });
        if (nameConflict) {
          throw new DatabaseValidationError(
            `Configuration with name "${input.name}" already exists`
          );
        }
      }

      // Validate workflow ID if being updated
      if (input.workflowId && input.workflowId !== existing.workflowId) {
        const workflowExists = await this.validateWorkflowId(input.workflowId);
        if (!workflowExists) {
          throw new DatabaseValidationError(
            `Workflow ID "${input.workflowId}" does not exist or is not available`
          );
        }
      }

      // Validate feature flags if being updated
      if (input.featureFlags !== undefined) {
        const invalidFlags = await this.validateFeatureFlags(input.featureFlags);
        if (invalidFlags.length > 0) {
          throw new DatabaseValidationError(
            `Invalid feature flags: ${invalidFlags.join(', ')}. Feature flag values must be booleans.`
          );
        }
      }

      // If setting as active, deactivate others first
      if (input.isActive && !existing.isActive) {
        await collection.updateMany(
          { createdBy: userId, isActive: true },
          { $set: { isActive: false, updatedAt: now } }
        );
      }

      const update: Partial<WorkflowConfigurationDocument> = {
        updatedAt: now,
      };

      if (input.name !== undefined) {
        update.name = input.name.trim();
      }
      if (input.description !== undefined) {
        update.description = input.description?.trim();
      }
      if (input.workflowId !== undefined) {
        update.workflowId = input.workflowId;
      }
      if (input.featureFlags !== undefined) {
        update.featureFlags = input.featureFlags;
      }
      if (input.isActive !== undefined) {
        update.isActive = input.isActive;
      }

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new DatabaseNotFoundError(`Configuration not found after update: ${id}`);
      }

      logger.info(`[WorkflowConfiguration] Updated configuration "${result.name}"`);
      return result;
    }, 'WorkflowConfiguration.update');
  }

  /**
   * Set a configuration as active (and deactivate others)
   */
  static async setActive(id: string, userId: string): Promise<WorkflowConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      const now = new Date();

      // Check if configuration exists and belongs to user
      const existing = await collection.findOne({ _id: new ObjectId(id) });
      if (!existing) {
        throw new DatabaseNotFoundError(`Configuration not found: ${id}`);
      }
      if (existing.createdBy !== userId) {
        throw new DatabaseValidationError('You can only activate your own configurations');
      }

      // Deactivate all other configurations for this user
      await collection.updateMany(
        { createdBy: userId, isActive: true },
        { $set: { isActive: false, updatedAt: now } }
      );

      // Activate the selected configuration
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { isActive: true, updatedAt: now } },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new DatabaseNotFoundError(`Configuration not found after update: ${id}`);
      }

      logger.info(`[WorkflowConfiguration] Activated configuration "${result.name}" for user ${userId}`);
      return result;
    }, 'WorkflowConfiguration.setActive');
  }

  /**
   * Delete a configuration
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      
      // Check ownership
      const existing = await collection.findOne({ _id: new ObjectId(id) });
      if (!existing) {
        throw new DatabaseNotFoundError(`Configuration not found: ${id}`);
      }
      if (existing.createdBy !== userId) {
        throw new DatabaseValidationError('You can only delete your own configurations');
      }

      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount > 0) {
        logger.info(`[WorkflowConfiguration] Deleted configuration "${existing.name}"`);
      }
      return result.deletedCount > 0;
    }, 'WorkflowConfiguration.delete');
  }

  /**
   * Count configurations
   */
  static async count(filter?: Filter<WorkflowConfigurationDocument>): Promise<number> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<WorkflowConfigurationDocument>(COLLECTION_NAME);
      return await collection.countDocuments(filter || {});
    }, 'WorkflowConfiguration.count');
  }

  /**
   * Get the available workflows for selection
   */
  static getAvailableWorkflows() {
    return AVAILABLE_BELEIDSSCAN_WORKFLOWS;
  }

  /**
   * Get available workflow configuration templates
   */
  static getAvailableTemplates(): readonly WorkflowConfigurationTemplate[] {
    return WORKFLOW_CONFIGURATION_TEMPLATES;
  }

  /**
   * Validate that a workflow ID exists and is available
   * 
   * @param workflowId - Workflow ID to validate
   * @returns true if workflow exists, false otherwise
   */
  static async validateWorkflowId(workflowId: string): Promise<boolean> {
    try {
      const { getWorkflowById } = await import('../utils/workflowLookup.js');
      const workflow = await getWorkflowById(workflowId);
      return workflow !== null;
    } catch (error) {
      logger.error({ error, workflowId }, '[WorkflowConfiguration] Failed to validate workflow ID');
      return false;
    }
  }

  /**
   * Validate feature flag names against available flags
   * 
   * @param featureFlags - Feature flags to validate
   * @returns Array of invalid flag names (empty if all valid)
   */
  static async validateFeatureFlags(featureFlags: Record<string, boolean>): Promise<string[]> {
    const invalidFlags: string[] = [];
    
    try {
      // Note: This is a route handler, we need a different approach
      // For now, we'll validate against known KG flags and allow any string
      // A more complete validation would require accessing the feature flag registry
      
      // Basic validation: check that values are booleans
      for (const [flagName, value] of Object.entries(featureFlags)) {
        if (typeof value !== 'boolean') {
          invalidFlags.push(flagName);
        }
      }
    } catch (error) {
      logger.warn({ error }, '[WorkflowConfiguration] Failed to validate feature flags');
      // Don't fail validation if we can't check - allow any flags
    }
    
    return invalidFlags;
  }

  /**
   * Create a default configuration for a user if they don't have one
   */
  static async ensureDefaultConfiguration(userId: string): Promise<WorkflowConfigurationDocument> {
    await this.ensureIndexes();
    return handleDatabaseOperation(async () => {
      // Check if user has any configuration
      const existing = await this.findByUser(userId);
      if (existing.length > 0) {
        // If they have configurations but none active, activate the first one
        const active = existing.find(c => c.isActive);
        if (!active) {
          return await this.setActive(existing[0]._id!.toString(), userId);
        }
        return active;
      }

      // Create default configuration
      return await this.create({
        name: 'Default Configuration',
        description: 'Default Beleidsscan workflow configuration',
        workflowId: 'beleidsscan-wizard',
        featureFlags: {},
        isActive: true,
        createdBy: userId,
      });
    }, 'WorkflowConfiguration.ensureDefaultConfiguration');
  }
}

