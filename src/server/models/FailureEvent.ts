import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { logger } from '../utils/logger.js';

/**
 * Failure Event Database Schema
 * 
 * Append-only collection tracking failure resolution history.
 * Enables MTTR (Mean Time To Resolution) calculation, recurrence rate analysis,
 * and identification of chronic offenders.
 * 
 * Collection: failure_events
 */

export type FailureEventType = 'created' | 'updated' | 'resolved' | 'state_changed';

export interface FailureEventDocument {
  _id?: ObjectId;
  activeFailureId: ObjectId; // Reference to active_failure
  testId?: string; // Denormalized for easier querying
  testFilePath?: string; // Denormalized for easier querying
  eventType: FailureEventType;
  timestamp: Date;
  metadata: {
    state?: string;
    previousState?: string; // For state_changed events
    newState?: string; // For state_changed events
    seenCount?: number;
    consecutiveFailures?: number;
    duration?: number; // Time from firstSeenAt to resolvedAt (ms)
    severity?: string;
    isFlaky?: boolean;
    environmentKey?: string;
    [key: string]: unknown; // Allow additional metadata
  };
}

export interface FailureEventCreateInput {
  activeFailureId: string | ObjectId;
  testId?: string;
  testFilePath?: string;
  eventType: FailureEventType;
  timestamp?: Date;
  metadata: FailureEventDocument['metadata'];
}

const COLLECTION_NAME = 'failure_events';

/**
 * FailureEvent model for MongoDB operations
 */
export class FailureEvent {
  /**
   * Create a new failure event (append-only)
   */
  static async create(input: FailureEventCreateInput): Promise<FailureEventDocument> {
    const db = getDB();
    const now = input.timestamp || new Date();
    const activeFailureId = typeof input.activeFailureId === 'string' 
      ? new ObjectId(input.activeFailureId)
      : input.activeFailureId;

    const event: FailureEventDocument = {
      activeFailureId,
      testId: input.testId,
      testFilePath: input.testFilePath,
      eventType: input.eventType,
      timestamp: now,
      metadata: input.metadata,
    };

    const result = await db
      .collection<FailureEventDocument>(COLLECTION_NAME)
      .insertOne(event);

    return { ...event, _id: result.insertedId };
  }

  /**
   * Create multiple failure events (append-only)
   */
  static async bulkCreate(inputs: FailureEventCreateInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    const db = getDB();
    const now = new Date();

    const events: FailureEventDocument[] = inputs.map(input => ({
      activeFailureId: typeof input.activeFailureId === 'string'
        ? new ObjectId(input.activeFailureId)
        : input.activeFailureId,
      testId: input.testId,
      testFilePath: input.testFilePath,
      eventType: input.eventType,
      timestamp: input.timestamp || now,
      metadata: input.metadata,
    }));

    await db
      .collection<FailureEventDocument>(COLLECTION_NAME)
      .insertMany(events);
  }

  /**
   * Find failure events by filters
   */
  static async find(filters: {
    activeFailureId?: string | ObjectId | (string | ObjectId)[];
    testId?: string;
    testFilePath?: string;
    eventType?: FailureEventType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  }): Promise<FailureEventDocument[]> {
    const db = getDB();
    const {
      activeFailureId,
      testId,
      testFilePath,
      eventType,
      startDate,
      endDate,
      limit = 1000,
      skip = 0,
      sort = { timestamp: -1 },
    } = filters;

    const query: Filter<FailureEventDocument> = {};

    if (activeFailureId) {
      if (Array.isArray(activeFailureId)) {
        query.activeFailureId = {
          $in: activeFailureId.map((id) => (typeof id === 'string' ? new ObjectId(id) : id)),
        };
      } else {
        query.activeFailureId =
          typeof activeFailureId === 'string'
            ? new ObjectId(activeFailureId)
            : activeFailureId;
      }
    }
    if (testId) query.testId = testId;
    if (testFilePath) query.testFilePath = testFilePath;
    if (eventType) query.eventType = eventType;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    return await db
      .collection<FailureEventDocument>(COLLECTION_NAME)
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
  }

  /**
   * Get events for a specific active failure
   */
  static async findByActiveFailureId(
    activeFailureId: string | ObjectId
  ): Promise<FailureEventDocument[]> {
    return await this.find({
      activeFailureId,
      sort: { timestamp: 1 }, // Chronological order
    });
  }

  /**
   * Get events for a specific test
   */
  static async findByTestId(
    testId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      eventType?: FailureEventType;
      limit?: number;
    } = {}
  ): Promise<FailureEventDocument[]> {
    return await this.find({
      testId,
      ...options,
      sort: { timestamp: 1 }, // Chronological order
    });
  }

  /**
   * Ensure database indexes exist for efficient querying
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<FailureEventDocument>(COLLECTION_NAME);

    try {
      // Index on activeFailureId for lookup
      await collection.createIndex(
        { activeFailureId: 1 },
        { background: true, name: 'idx_active_failure_id' }
      );

      // Index on testId for analytics queries
      await collection.createIndex(
        { testId: 1 },
        { background: true, name: 'idx_test_id' }
      );

      // Index on testFilePath for filtering
      await collection.createIndex(
        { testFilePath: 1 },
        { background: true, name: 'idx_test_file_path' }
      );

      // Index on eventType for filtering
      await collection.createIndex(
        { eventType: 1 },
        { background: true, name: 'idx_event_type' }
      );

      // Index on timestamp for time-based queries
      await collection.createIndex(
        { timestamp: -1 },
        { background: true, name: 'idx_timestamp' }
      );

      // Compound index for common queries (testId + eventType + timestamp)
      await collection.createIndex(
        { testId: 1, eventType: 1, timestamp: -1 },
        { background: true, name: 'idx_test_event_timestamp' }
      );

      // Compound index for active failure queries (activeFailureId + timestamp)
      await collection.createIndex(
        { activeFailureId: 1, timestamp: -1 },
        { background: true, name: 'idx_failure_timestamp' }
      );

      logger.debug('FailureEvent indexes created successfully');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('already exists')) {
        console.warn('[FailureEvent] Warning: Could not create all indexes:', error);
      }
    }
  }
}

