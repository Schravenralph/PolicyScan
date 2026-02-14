/**
 * PatternRepository - Data access layer for learned navigation patterns
 * 
 * Manages storage and retrieval of learned patterns from MongoDB.
 * Follows repository pattern for clean separation of concerns.
 * 
 * @see docs/ARCHITECTURE_NAVIGATION_PATTERN_LEARNING.md
 */

import { Db, Collection, ObjectId, Filter, UpdateFilter } from 'mongodb';
import { LearnedPattern, LearnedPatternInput, NavigationContext } from './types.js';
import { logger } from '../../utils/logger.js';

const COLLECTION_NAME = 'learned_navigation_patterns';

/**
 * MongoDB document schema for learned patterns
 */
interface LearnedPatternDocument {
  _id: ObjectId;
  pattern: string;
  patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  sourceUrl: string;
  context: {
    domain: string;
    urlPattern?: string;
    pageStructureHash?: string;
    errorType?: string;
    errorMessage?: string;
  };
  effectiveness: {
    successCount: number;
    failureCount: number;
    lastUsed?: Date;
    lastSuccess?: Date;
    lastFailure?: Date;
    confidence: number;
    averageMatchScore?: number;
  };
  metadata: {
    learnedAt: Date;
    learnedFrom: 'user_intervention' | 'auto_discovery' | 'manual';
    userId?: string;
    runId?: string;
    notes?: string;
  };
  status: 'active' | 'deprecated' | 'experimental';
  deprecatedAt?: Date;
  deprecatedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Repository interface for pattern data access
 */
export interface IPatternRepository {
  save(pattern: LearnedPatternInput): Promise<LearnedPattern>;
  findById(patternId: string): Promise<LearnedPattern | null>;
  findCandidates(context: NavigationContext): Promise<LearnedPattern[]>;
  updateEffectiveness(
    patternId: string,
    success: boolean,
    matchScore?: number
  ): Promise<void>;
  deprecatePattern(patternId: string, reason: string): Promise<void>;
  findActivePatterns(domain: string): Promise<LearnedPattern[]>;
  findByErrorType(errorType: string): Promise<LearnedPattern[]>;
}

/**
 * PatternRepository implementation
 */
export class PatternRepository implements IPatternRepository {
  private collection: Collection<LearnedPatternDocument>;

  constructor(db: Db) {
    this.collection = db.collection<LearnedPatternDocument>(COLLECTION_NAME);
    this.ensureIndexes().catch(err => {
      logger.error({ error: err }, 'Failed to create indexes for PatternRepository');
    });
  }

  /**
   * Ensure MongoDB indexes exist for efficient queries
   */
  private async ensureIndexes(): Promise<void> {
    try {
      // Index for domain + status queries
      await this.collection.createIndex(
        { domain: 1, status: 1 },
        { name: 'domain_status_idx' }
      );

      // Index for URL pattern matching
      await this.collection.createIndex(
        { 'context.urlPattern': 1 },
        { name: 'url_pattern_idx', sparse: true }
      );

      // Index for confidence sorting
      await this.collection.createIndex(
        { 'effectiveness.confidence': -1 },
        { name: 'confidence_idx' }
      );

      // Index for recency sorting
      await this.collection.createIndex(
        { 'effectiveness.lastUsed': -1 },
        { name: 'last_used_idx' }
      );

      // Index for pattern type
      await this.collection.createIndex(
        { patternType: 1 },
        { name: 'pattern_type_idx' }
      );

      // Index for error type
      await this.collection.createIndex(
        { 'context.errorType': 1 },
        { name: 'error_type_idx', sparse: true }
      );

      logger.info('PatternRepository indexes created successfully');
    } catch (error) {
      logger.warn({ error }, 'Some indexes may already exist');
    }
  }

  /**
   * Convert MongoDB document to LearnedPattern
   */
  private documentToPattern(doc: LearnedPatternDocument): LearnedPattern {
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
  private inputToDocument(input: LearnedPatternInput): Omit<LearnedPatternDocument, '_id'> {
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
   * Save a new learned pattern
   */
  async save(pattern: LearnedPatternInput): Promise<LearnedPattern> {
    try {
      const doc = this.inputToDocument(pattern);
      const result = await this.collection.insertOne(doc as LearnedPatternDocument);
      
      const saved = await this.collection.findOne({ _id: result.insertedId });
      if (!saved) {
        throw new Error('Failed to retrieve saved pattern');
      }

      logger.info({ patternId: result.insertedId.toString() }, 'Pattern saved successfully');
      return this.documentToPattern(saved);
    } catch (error) {
      logger.error({ error, pattern }, 'Failed to save pattern');
      throw error;
    }
  }

  /**
   * Find pattern by ID
   */
  async findById(patternId: string): Promise<LearnedPattern | null> {
    try {
      if (!ObjectId.isValid(patternId)) {
        return null;
      }

      const doc = await this.collection.findOne({ _id: new ObjectId(patternId) });
      return doc ? this.documentToPattern(doc) : null;
    } catch (error) {
      logger.error({ error, patternId }, 'Failed to find pattern by ID');
      throw error;
    }
  }

  /**
   * Find candidate patterns for a navigation context
   */
  async findCandidates(context: NavigationContext): Promise<LearnedPattern[]> {
    try {
      const query: Filter<LearnedPatternDocument> = {
        status: { $in: ['active', 'experimental'] },
        $or: [
          { 'context.domain': context.domain },
          { 'context.urlPattern': { $exists: true } }, // Will match if URL pattern matches
        ],
      };

      // If error type is known, include it in query
      if (context.errorType && query.$or) {
        query.$or.push({ 'context.errorType': context.errorType });
      }

      const docs = await this.collection
        .find(query)
        .sort({ 'effectiveness.confidence': -1, 'effectiveness.lastUsed': -1 })
        .limit(50) // Limit to top 50 candidates
        .toArray();

      // Filter by URL pattern if specified
      const patterns = docs
        .map(doc => this.documentToPattern(doc))
        .filter(pattern => {
          // If pattern has URL pattern, check if it matches
          if (pattern.context.urlPattern) {
            try {
              const regex = new RegExp(pattern.context.urlPattern);
              return regex.test(context.url);
            } catch {
              // Invalid regex, skip this pattern
              return false;
            }
          }
          return true;
        });

      logger.debug(
        { context, candidateCount: patterns.length },
        'Found pattern candidates'
      );
      return patterns;
    } catch (error) {
      logger.error({ error, context }, 'Failed to find pattern candidates');
      throw error;
    }
  }

  /**
   * Update pattern effectiveness metrics
   */
  async updateEffectiveness(
    patternId: string,
    success: boolean,
    matchScore?: number
  ): Promise<void> {
    try {
      if (!ObjectId.isValid(patternId)) {
        throw new Error('Invalid pattern ID');
      }

      const update: UpdateFilter<LearnedPatternDocument> = {
        $inc: success
          ? { 'effectiveness.successCount': 1 }
          : { 'effectiveness.failureCount': 1 },
        $set: {
          'effectiveness.lastUsed': new Date(),
          updatedAt: new Date(),
        },
      };

      if (success && update.$set) {
        update.$set['effectiveness.lastSuccess'] = new Date();
      } else if (update.$set) {
        update.$set['effectiveness.lastFailure'] = new Date();
      }

      // Update average match score if provided
      if (matchScore !== undefined) {
        const pattern = await this.findById(patternId);
        if (pattern && update.$set) {
          const currentAvg = pattern.effectiveness.averageMatchScore || 0;
          const totalUses = pattern.effectiveness.successCount + pattern.effectiveness.failureCount;
          const newAvg = (currentAvg * totalUses + matchScore) / (totalUses + 1);
          update.$set['effectiveness.averageMatchScore'] = newAvg;
        }
      }

      // Recalculate confidence
      const pattern = await this.findById(patternId);
      if (pattern && update.$set) {
        const total = pattern.effectiveness.successCount + pattern.effectiveness.failureCount;
        const newSuccessCount = success
          ? pattern.effectiveness.successCount + 1
          : pattern.effectiveness.successCount;
        const newConfidence = total > 0 ? newSuccessCount / (total + 1) : 0.5;

        update.$set['effectiveness.confidence'] = newConfidence;

        // Promote experimental patterns to active if confidence is high
        if (pattern.status === 'experimental' && newConfidence >= 0.7 && total >= 5) {
          (update.$set as Record<string, unknown>)['status'] = 'active';
        }
      }

      await this.collection.updateOne(
        { _id: new ObjectId(patternId) },
        update
      );

      logger.debug(
        { patternId, success, matchScore },
        'Pattern effectiveness updated'
      );
    } catch (error) {
      logger.error({ error, patternId, success }, 'Failed to update pattern effectiveness');
      throw error;
    }
  }

  /**
   * Deprecate a pattern
   */
  async deprecatePattern(patternId: string, reason: string): Promise<void> {
    try {
      if (!ObjectId.isValid(patternId)) {
        throw new Error('Invalid pattern ID');
      }

      await this.collection.updateOne(
        { _id: new ObjectId(patternId) },
        {
          $set: {
            status: 'deprecated',
            deprecatedAt: new Date(),
            deprecatedReason: reason,
            updatedAt: new Date(),
          },
        }
      );

      logger.info({ patternId, reason }, 'Pattern deprecated');
    } catch (error) {
      logger.error({ error, patternId }, 'Failed to deprecate pattern');
      throw error;
    }
  }

  /**
   * Find active patterns for a domain
   */
  async findActivePatterns(domain: string): Promise<LearnedPattern[]> {
    try {
      const docs = await this.collection
        .find({
          'context.domain': domain,
          status: 'active',
        })
        .sort({ 'effectiveness.confidence': -1 })
        .toArray();

      return docs.map(doc => this.documentToPattern(doc));
    } catch (error) {
      logger.error({ error, domain }, 'Failed to find active patterns');
      throw error;
    }
  }

  /**
   * Find patterns by error type
   */
  async findByErrorType(errorType: string): Promise<LearnedPattern[]> {
    try {
      const docs = await this.collection
        .find({
          'context.errorType': errorType,
          status: { $in: ['active', 'experimental'] },
        })
        .sort({ 'effectiveness.confidence': -1 })
        .toArray();

      return docs.map(doc => this.documentToPattern(doc));
    } catch (error) {
      logger.error({ error, errorType }, 'Failed to find patterns by error type');
      throw error;
    }
  }
}
