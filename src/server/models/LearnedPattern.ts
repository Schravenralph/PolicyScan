import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import type { LearnedPattern, LearnedPatternInput } from '../services/patternLearning/types.js';
import { handleDatabaseOperation, DatabaseValidationError } from '../utils/databaseErrorHandler.js';

const COLLECTION_NAME = 'learned_navigation_patterns';

/**
 * MongoDB document interface for learned patterns
 * Extends LearnedPattern with MongoDB _id field
 */
export interface LearnedPatternDocument extends Omit<LearnedPattern, 'id'> {
  _id: ObjectId;
}

/**
 * Input for updating a learned pattern
 */
export interface LearnedPatternUpdateInput {
  pattern?: string;
  patternType?: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  sourceUrl?: string;
  context?: Partial<LearnedPattern['context']>;
  effectiveness?: Partial<LearnedPattern['effectiveness']>;
  metadata?: Partial<LearnedPattern['metadata']>;
  status?: 'active' | 'deprecated' | 'experimental';
  deprecatedAt?: Date;
  deprecatedReason?: string;
}

/**
 * LearnedPattern Model
 * 
 * Static model class for learned navigation patterns following the same pattern
 * as other models in the codebase (BronDocument, BronWebsite).
 * 
 * Provides CRUD operations and validation for learned patterns.
 * 
 * @see src/server/services/patternLearning/PatternRepository.ts - Low-level repository
 * @see src/server/services/patternLearning/types.ts - Type definitions
 */
export class LearnedPatternModel {
  /**
   * Convert MongoDB document to LearnedPattern interface
   */
  private static documentToPattern(doc: LearnedPatternDocument): LearnedPattern {
    return {
      id: doc._id.toString(),
      pattern: doc.pattern,
      patternType: doc.patternType,
      sourceUrl: doc.sourceUrl,
      context: doc.context,
      effectiveness: doc.effectiveness,
      metadata: doc.metadata,
      status: doc.status,
      deprecatedAt: doc.deprecatedAt,
      deprecatedReason: doc.deprecatedReason,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * Convert LearnedPatternInput to MongoDB document
   */
  private static inputToDocument(input: LearnedPatternInput): Omit<LearnedPatternDocument, '_id'> {
    const now = new Date();
    return {
      pattern: input.pattern,
      patternType: input.patternType,
      sourceUrl: input.sourceUrl,
      context: input.context,
      effectiveness: {
        successCount: 0,
        failureCount: 0,
        confidence: 0.5, // Start with neutral confidence
      },
      metadata: {
        ...input.metadata,
        learnedAt: now,
      },
      status: 'experimental', // New patterns start as experimental
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Validate pattern input
   */
  private static validatePatternInput(input: LearnedPatternInput): void {
    if (!input.pattern || input.pattern.trim().length === 0) {
      throw new DatabaseValidationError('Pattern cannot be empty');
    }

    if (!input.patternType) {
      throw new DatabaseValidationError('Pattern type is required');
    }

    if (!input.sourceUrl || !this.isValidUrl(input.sourceUrl)) {
      throw new DatabaseValidationError('Valid source URL is required');
    }

    if (!input.context || !input.context.domain || input.context.domain.trim().length === 0) {
      throw new DatabaseValidationError('Context domain is required');
    }

    if (!input.metadata || !input.metadata.learnedFrom) {
      throw new DatabaseValidationError('Metadata learnedFrom is required');
    }
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new learned pattern
   */
  static async create(patternData: LearnedPatternInput): Promise<LearnedPattern> {
    this.validatePatternInput(patternData);

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const document = this.inputToDocument(patternData);

      const result = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).insertOne(
        document as LearnedPatternDocument
      );

      const saved = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).findOne({
        _id: result.insertedId,
      });

      if (!saved) {
        throw new Error('Failed to retrieve saved pattern');
      }

      return this.documentToPattern(saved);
    }, 'LearnedPatternModel.create');
  }

  /**
   * Find a pattern by ID
   */
  static async findById(id: string): Promise<LearnedPattern | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const doc = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).findOne({
        _id: new ObjectId(id),
      });

      return doc ? this.documentToPattern(doc) : null;
    }, 'LearnedPatternModel.findById');
  }

  /**
   * Find all patterns with pagination support
   */
  static async findAll(options: {
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    filter?: {
      status?: 'active' | 'deprecated' | 'experimental';
      domain?: string;
      patternType?: 'xpath' | 'css' | 'url_pattern' | 'semantic';
    };
  } = {}): Promise<LearnedPattern[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit = 50, skip = 0, sort = { createdAt: -1 }, filter } = options;

      const query: Record<string, unknown> = {};
      if (filter?.status) {
        query.status = filter.status;
      }
      if (filter?.domain) {
        query['context.domain'] = filter.domain;
      }
      if (filter?.patternType) {
        query.patternType = filter.patternType;
      }

      const docs = await db.collection<LearnedPatternDocument>(COLLECTION_NAME)
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray();

      return docs.map(doc => this.documentToPattern(doc));
    }, 'LearnedPatternModel.findAll');
  }

  /**
   * Count total number of patterns
   */
  static async count(filter?: {
    status?: 'active' | 'deprecated' | 'experimental';
    domain?: string;
  }): Promise<number> {
    return handleDatabaseOperation(async () => {
      const db = getDB();

      const query: Record<string, unknown> = {};
      if (filter?.status) {
        query.status = filter.status;
      }
      if (filter?.domain) {
        query['context.domain'] = filter.domain;
      }

      return await db.collection<LearnedPatternDocument>(COLLECTION_NAME).countDocuments(query);
    }, 'LearnedPatternModel.count');
  }

  /**
   * Find patterns by domain
   */
  static async findByDomain(
    domain: string,
    options: { limit?: number; skip?: number; status?: 'active' | 'deprecated' | 'experimental' } = {}
  ): Promise<LearnedPattern[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit, skip, status } = options;

      const query: Record<string, unknown> = { 'context.domain': domain };
      if (status) {
        query.status = status;
      }

      // Default limit to prevent memory exhaustion when limit is not provided
      // Default: 1000 patterns, configurable via environment variable
      const MAX_LEARNED_PATTERNS = parseInt(process.env.MAX_LEARNED_PATTERNS || '1000', 10);
      const effectiveLimit = limit ?? MAX_LEARNED_PATTERNS;

      const queryBuilder = db.collection<LearnedPatternDocument>(COLLECTION_NAME).find(query);

      if (skip) {
        queryBuilder.skip(skip);
      }
      queryBuilder.limit(effectiveLimit);

      const docs = await queryBuilder
        .sort({ 'effectiveness.confidence': -1, createdAt: -1 })
        .toArray();

      // Log warning if we hit the limit and default was used (indicates possible truncation)
      if (!limit && docs.length === MAX_LEARNED_PATTERNS) {
        console.warn(
          `[LearnedPattern] findByDomain() query may have been truncated at ${MAX_LEARNED_PATTERNS} entries. ` +
          `Consider providing a limit or increasing MAX_LEARNED_PATTERNS.`
        );
      }

      return docs.map(doc => this.documentToPattern(doc));
    }, 'LearnedPatternModel.findByDomain');
  }

  /**
   * Find patterns by error type
   */
  static async findByErrorType(
    errorType: string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<LearnedPattern[]> {
    return handleDatabaseOperation(async () => {
      const db = getDB();
      const { limit, skip } = options;

      const queryFilter: {
        'context.errorType': string;
        status: { $in: ('active' | 'deprecated' | 'experimental')[] };
      } = {
        'context.errorType': errorType,
        status: { $in: ['active', 'experimental'] as ('active' | 'deprecated' | 'experimental')[] },
      };

      // Default limit to prevent memory exhaustion when limit is not provided
      // Default: 1000 patterns, configurable via environment variable
      const MAX_LEARNED_PATTERNS = parseInt(process.env.MAX_LEARNED_PATTERNS || '1000', 10);
      const effectiveLimit = limit ?? MAX_LEARNED_PATTERNS;

      const query = db.collection<LearnedPatternDocument>(COLLECTION_NAME).find(queryFilter);

      if (skip) {
        query.skip(skip);
      }
      query.limit(effectiveLimit);

      const docs = await query
        .sort({ 'effectiveness.confidence': -1 })
        .toArray();

      // Log warning if we hit the limit and default was used (indicates possible truncation)
      if (!limit && docs.length === MAX_LEARNED_PATTERNS) {
        console.warn(
          `[LearnedPattern] findByErrorType() query may have been truncated at ${MAX_LEARNED_PATTERNS} entries. ` +
          `Consider providing a limit or increasing MAX_LEARNED_PATTERNS.`
        );
      }

      return docs.map(doc => this.documentToPattern(doc));
    }, 'LearnedPatternModel.findByErrorType');
  }

  /**
   * Find active patterns
   */
  static async findActive(domain?: string): Promise<LearnedPattern[]> {
    const filter: { status: 'active'; domain?: string } = { status: 'active' };
    if (domain) {
      filter.domain = domain;
    }
    return this.findAll({ filter, sort: { 'effectiveness.confidence': -1 } });
  }

  /**
   * Update a pattern
   */
  static async update(id: string, updateData: LearnedPatternUpdateInput): Promise<LearnedPattern | null> {
    if (!ObjectId.isValid(id)) {
      throw new DatabaseValidationError('Invalid pattern ID');
    }

    // Validate before database operation to throw proper error type
    if (updateData.pattern !== undefined) {
      if (!updateData.pattern || updateData.pattern.trim().length === 0) {
        throw new DatabaseValidationError('Pattern cannot be empty', 'pattern');
      }
    }

    if (updateData.sourceUrl && !this.isValidUrl(updateData.sourceUrl)) {
      throw new DatabaseValidationError('Invalid source URL format', 'sourceUrl');
    }

    return handleDatabaseOperation(async () => {
      const db = getDB();

      // Fetch existing document once (needed for context, effectiveness, and metadata updates)
      const existing = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).findOne({
        _id: new ObjectId(id),
      });

      if (!existing) {
        return null;
      }

      const updatePayload: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (updateData.pattern !== undefined) {
        updatePayload.pattern = updateData.pattern;
      }

      if (updateData.patternType !== undefined) {
        updatePayload.patternType = updateData.patternType;
      }

      if (updateData.sourceUrl !== undefined) {
        updatePayload.sourceUrl = updateData.sourceUrl;
      }

      if (updateData.context !== undefined) {
        updatePayload.context = {
          ...existing.context,
          ...updateData.context,
        } as LearnedPattern['context'];
      }

      if (updateData.effectiveness !== undefined) {
        // Calculate confidence if effectiveness is updated
        const updatedEffectiveness = {
          ...existing.effectiveness,
          ...updateData.effectiveness,
        };

        // Recalculate confidence
        const total = updatedEffectiveness.successCount + updatedEffectiveness.failureCount;
        const newConfidence = total > 0 ? updatedEffectiveness.successCount / total : 0.5;

        // Use dot notation for nested fields to match MongoDB update syntax
        updatePayload['effectiveness.successCount'] = updatedEffectiveness.successCount;
        updatePayload['effectiveness.failureCount'] = updatedEffectiveness.failureCount;
        updatePayload['effectiveness.confidence'] = newConfidence;
        if (updatedEffectiveness.lastUsed !== undefined) {
          updatePayload['effectiveness.lastUsed'] = updatedEffectiveness.lastUsed;
        }
        if (updatedEffectiveness.lastSuccess !== undefined) {
          updatePayload['effectiveness.lastSuccess'] = updatedEffectiveness.lastSuccess;
        }
        if (updatedEffectiveness.lastFailure !== undefined) {
          updatePayload['effectiveness.lastFailure'] = updatedEffectiveness.lastFailure;
        }
        if (updatedEffectiveness.averageMatchScore !== undefined) {
          updatePayload['effectiveness.averageMatchScore'] = updatedEffectiveness.averageMatchScore;
        }
      }

      if (updateData.metadata !== undefined) {
        updatePayload.metadata = {
          ...existing.metadata,
          ...updateData.metadata,
        } as LearnedPattern['metadata'];
      }

      if (updateData.status !== undefined) {
        updatePayload.status = updateData.status;
        // Automatically set deprecatedAt when status is set to deprecated
        if (updateData.status === 'deprecated' && updateData.deprecatedAt === undefined) {
          updatePayload.deprecatedAt = new Date();
        }
      }

      if (updateData.deprecatedAt !== undefined) {
        updatePayload.deprecatedAt = updateData.deprecatedAt;
      }

      if (updateData.deprecatedReason !== undefined) {
        updatePayload.deprecatedReason = updateData.deprecatedReason;
      }

      const result = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updatePayload },
        { returnDocument: 'after' }
      );

      return result ? this.documentToPattern(result) : null;
    }, 'LearnedPatternModel.update');
  }

  /**
   * Update pattern effectiveness
   */
  static async updateEffectiveness(
    id: string,
    success: boolean,
    matchScore?: number
  ): Promise<LearnedPattern | null> {
    if (!ObjectId.isValid(id)) {
      throw new DatabaseValidationError('Invalid pattern ID');
    }

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const pattern = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).findOne({
        _id: new ObjectId(id),
      });

      if (!pattern) {
        return null;
      }

      const newSuccessCount = pattern.effectiveness.successCount + (success ? 1 : 0);
      const newFailureCount = pattern.effectiveness.failureCount + (success ? 0 : 1);
      const total = newSuccessCount + newFailureCount;
      const newConfidence = total > 0 ? newSuccessCount / total : 0.5;

      // Update average match score if provided
      let averageMatchScore = pattern.effectiveness.averageMatchScore;
      if (matchScore !== undefined) {
        const currentAvg = pattern.effectiveness.averageMatchScore || 0;
        const currentTotal = pattern.effectiveness.successCount + pattern.effectiveness.failureCount;
        averageMatchScore = (currentAvg * currentTotal + matchScore) / (total);
      }

      const updatePayload: Record<string, unknown> = {
        'effectiveness.successCount': newSuccessCount,
        'effectiveness.failureCount': newFailureCount,
        'effectiveness.confidence': newConfidence,
        'effectiveness.lastUsed': new Date(),
        updatedAt: new Date(),
      };

      if (success) {
        updatePayload['effectiveness.lastSuccess'] = new Date();
      } else {
        updatePayload['effectiveness.lastFailure'] = new Date();
      }

      if (averageMatchScore !== undefined) {
        updatePayload['effectiveness.averageMatchScore'] = averageMatchScore;
      }

      // Promote experimental patterns to active if confidence is high
      if (pattern.status === 'experimental' && newConfidence >= 0.7 && total >= 5) {
        updatePayload.status = 'active';
      }

      const result = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updatePayload },
        { returnDocument: 'after' }
      );

      return result ? this.documentToPattern(result) : null;
    }, 'LearnedPatternModel.updateEffectiveness');
  }

  /**
   * Deprecate a pattern
   */
  static async deprecate(id: string, reason: string): Promise<LearnedPattern | null> {
    return this.update(id, {
      status: 'deprecated',
      deprecatedAt: new Date(),
      deprecatedReason: reason,
    });
  }

  /**
   * Delete a pattern
   */
  static async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const result = await db.collection<LearnedPatternDocument>(COLLECTION_NAME).deleteOne({
        _id: new ObjectId(id),
      });
      return result.deletedCount > 0;
    }, 'LearnedPatternModel.delete');
  }
}
