/**
 * Validation Result Storage Service
 * 
 * Persists validation results to MongoDB for historical tracking,
 * metrics aggregation, and quality trend analysis.
 * 
 * Used in IPLO workflows to track validation results for entities
 * extracted from markdown knowledge base documents.
 */

import type { Db, Collection } from 'mongodb';
import { getDB } from '../../../config/database.js';
import { logger } from '../../../utils/logger.js';
import type { SHACLValidationResult } from './SHACLValidator.js';
import type { RelationshipValidationResult } from './RelationshipValidator.js';
import type { FactValidationResult } from './FactValidator.js';

export interface ValidationResult {
  id: string;
  entityId?: string;
  relationshipId?: string;
  validationType: 'schema' | 'relationship' | 'consistency' | 'fact' | 'shacl' | 'external';
  timestamp: Date;
  isValid: boolean;
  confidence?: number;
  errors: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
  workflowRunId?: string;
  workflowId?: string;
  source?: string; // e.g., 'iplo', 'dso', etc.
}

export interface ValidationMetrics {
  totalValidations: number;
  validCount: number;
  invalidCount: number;
  averageConfidence: number;
  errorRate: number;
  warningRate: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Service for storing and retrieving validation results
 */
export class ValidationResultStorage {
  private collection: Collection<ValidationResult> | null = null;
  private db: Db | null = null;

  constructor(db?: Db) {
    this.db = db || null;
  }

  /**
   * Initialize storage service
   */
  async initialize(): Promise<void> {
    if (this.collection) {
      return;
    }

    try {
      this.db = this.db || getDB();
      this.collection = this.db.collection<ValidationResult>('validation_results');

      // Create indexes for efficient queries
      await this.collection.createIndex({ entityId: 1 });
      await this.collection.createIndex({ relationshipId: 1 });
      await this.collection.createIndex({ validationType: 1 });
      await this.collection.createIndex({ timestamp: -1 });
      await this.collection.createIndex({ workflowRunId: 1 });
      await this.collection.createIndex({ source: 1 });
      await this.collection.createIndex({ isValid: 1 });
      
      // Compound index for common queries
      await this.collection.createIndex({ 
        validationType: 1, 
        timestamp: -1 
      });
      await this.collection.createIndex({ 
        source: 1, 
        timestamp: -1 
      });

      // TTL index: delete validation results older than 90 days
      await this.collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
      );

      logger.debug('ValidationResultStorage initialized with indexes');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize ValidationResultStorage');
      throw error;
    }
  }

  /**
   * Store validation result
   */
  async storeResult(result: ValidationResult): Promise<void> {
    await this.ensureInitialized();

    try {
      await this.collection!.insertOne({
        ...result,
        timestamp: result.timestamp || new Date(),
      });
    } catch (error) {
      logger.error({ error, resultId: result.id }, 'Failed to store validation result');
      throw error;
    }
  }

  /**
   * Store multiple validation results
   */
  async storeResults(results: ValidationResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    await this.ensureInitialized();

    try {
      const documents = results.map(result => ({
        ...result,
        timestamp: result.timestamp || new Date(),
      }));

      await this.collection!.insertMany(documents);
    } catch (error) {
      logger.error({ error, count: results.length }, 'Failed to store validation results');
      throw error;
    }
  }

  /**
   * Store SHACL validation result
   */
  async storeSHACLResult(
    result: SHACLValidationResult,
    metadata?: {
      workflowRunId?: string;
      workflowId?: string;
      source?: string;
    }
  ): Promise<void> {
    await this.storeResult({
      id: `shacl-${result.entityId}-${Date.now()}`,
      entityId: result.entityId,
      validationType: 'shacl',
      timestamp: new Date(),
      isValid: result.isValid,
      errors: result.errors.map(e => `${e.property}: ${e.message}`),
      warnings: result.warnings.map(w => `${w.property}: ${w.message}`),
      metadata: {
        entityType: result.entityType,
        errors: result.errors,
        warnings: result.warnings,
        ...metadata,
      },
      workflowRunId: metadata?.workflowRunId,
      workflowId: metadata?.workflowId,
      source: metadata?.source,
    });
  }

  /**
   * Store relationship validation result
   */
  async storeRelationshipResult(
    relationshipId: string,
    result: RelationshipValidationResult,
    metadata?: {
      workflowRunId?: string;
      workflowId?: string;
      source?: string;
    }
  ): Promise<void> {
    await this.storeResult({
      id: `relationship-${relationshipId}-${Date.now()}`,
      relationshipId,
      validationType: 'relationship',
      timestamp: new Date(),
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
      metadata: {
        ...metadata,
      },
      workflowRunId: metadata?.workflowRunId,
      workflowId: metadata?.workflowId,
      source: metadata?.source,
    });
  }

  /**
   * Store fact validation result
   */
  async storeFactResult(
    relationshipId: string,
    result: FactValidationResult,
    metadata?: {
      workflowRunId?: string;
      workflowId?: string;
      source?: string;
    }
  ): Promise<void> {
    await this.storeResult({
      id: `fact-${relationshipId}-${Date.now()}`,
      relationshipId,
      validationType: 'fact',
      timestamp: new Date(),
      isValid: result.confidence >= 0.7, // Threshold for validity
      confidence: result.confidence,
      errors: result.issues,
      warnings: [],
      metadata: {
        confidence: result.confidence,
        sources: result.sources,
        validationMethods: result.validationMethods,
        ...metadata,
      },
      workflowRunId: metadata?.workflowRunId,
      workflowId: metadata?.workflowId,
      source: metadata?.source,
    });
  }

  /**
   * Get validation results for entity
   */
  async getEntityResults(
    entityId: string,
    limit: number = 10
  ): Promise<ValidationResult[]> {
    await this.ensureInitialized();

    return this.collection!
      .find({ entityId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get validation results for workflow run
   */
  async getWorkflowResults(
    workflowRunId: string
  ): Promise<ValidationResult[]> {
    await this.ensureInitialized();

    return this.collection!
      .find({ workflowRunId })
      .sort({ timestamp: 1 })
      .toArray();
  }

  /**
   * Get validation metrics
   */
  async getMetrics(options: {
    startDate?: Date;
    endDate?: Date;
    source?: string;
    validationType?: string;
  } = {}): Promise<ValidationMetrics> {
    await this.ensureInitialized();

    const query: Record<string, unknown> = {};
    
    if (options.startDate || options.endDate) {
      const timestampQuery: Record<string, unknown> = {};
      if (options.startDate) {
        timestampQuery.$gte = options.startDate;
      }
      if (options.endDate) {
        timestampQuery.$lte = options.endDate;
      }
      query.timestamp = timestampQuery;
    }

    if (options.source) {
      query.source = options.source;
    }

    if (options.validationType) {
      query.validationType = options.validationType;
    }

    const results = await this.collection!.find(query).toArray();

    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.length - validCount;
    const confidences = results
      .filter(r => r.confidence !== undefined)
      .map(r => r.confidence!);
    const averageConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const result of results) {
      byType[result.validationType] = (byType[result.validationType] || 0) + 1;
      if (result.source) {
        bySource[result.source] = (bySource[result.source] || 0) + 1;
      }
    }

    const timestamps = results.map(r => r.timestamp);
    const timeRange = {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : new Date(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : new Date(),
    };

    return {
      totalValidations: results.length,
      validCount,
      invalidCount,
      averageConfidence,
      errorRate: results.length > 0 ? invalidCount / results.length : 0,
      warningRate: results.length > 0
        ? results.filter(r => r.warnings.length > 0).length / results.length
        : 0,
      byType,
      bySource,
      timeRange,
    };
  }

  /**
   * Ensure storage is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }
  }
}
