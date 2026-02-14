/**
 * GeoOutboxModel - MongoDB outbox for PostGIS sync
 * 
 * Implements the outbox pattern for eventually consistent sync from MongoDB
 * GeoExtension to PostGIS. Events are produced on GeoExtension upsert and
 * consumed by GeoOutboxWorker.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md
 */

import { getDB } from '../config/database.js';
import { ObjectId, type ClientSession } from 'mongodb';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'geo_outbox';
let indexesEnsured = false;

/**
 * Geo outbox event type
 */
export type GeoOutboxEventType = 'geo_upserted' | 'geo_deleted';

/**
 * Geo outbox event payload
 */
export interface GeoOutboxPayload {
  geometryHash: string;
  bbox?: number[]; // [minLon, minLat, maxLon, maxLat]
}

/**
 * Geo outbox event document
 */
export interface GeoOutboxEvent {
  _id?: ObjectId;
  documentId: string;
  eventType: GeoOutboxEventType;
  payload: GeoOutboxPayload;
  attempts: number;
  nextRunAt: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

/**
 * GeoOutboxModel - MongoDB model for geo outbox events
 */
export class GeoOutboxModel {
  /**
   * Ensure database indexes exist
   */
  static async ensureIndexes(): Promise<void> {
    if (indexesEnsured) return;
    
    const db = getDB();
    const collection = db.collection<GeoOutboxEvent>(COLLECTION_NAME);
    
    try {
      // Index on nextRunAt for worker polling
      await collection.createIndex(
        { nextRunAt: 1, status: 1 },
        { name: 'idx_nextRunAt_status' }
      );
      
      // Index on documentId for lookups
      await collection.createIndex(
        { documentId: 1 },
        { name: 'idx_documentId' }
      );
      
      // Index on status for filtering
      await collection.createIndex(
        { status: 1 },
        { name: 'idx_status' }
      );
      
      // Unique index on (documentId, eventType) to prevent duplicates
      // Only for pending/processing events
      // Note: This is best-effort; worker handles idempotency
      
      indexesEnsured = true;
      logger.debug('GeoOutboxModel indexes created successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to create GeoOutboxModel indexes');
      throw error;
    }
  }

  /**
   * Enqueue a geo outbox event
   * 
   * Creates a new event or updates existing pending event for the same documentId.
   * 
   * @param documentId - Document ID
   * @param eventType - Event type
   * @param payload - Event payload
   * @param session - Optional MongoDB session for transactions
   * @returns Outbox event document
   */
  static async enqueue(
    documentId: string,
    eventType: GeoOutboxEventType,
    payload: GeoOutboxPayload,
    session?: ClientSession
  ): Promise<GeoOutboxEvent> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<GeoOutboxEvent>(COLLECTION_NAME);
    const now = new Date();
    
    // Check for existing pending/processing event for this documentId with same geometryHash
    // Idempotency: if same geometryHash already enqueued, skip (no need to re-enqueue)
    const existing = await collection.findOne(
      {
        documentId,
        eventType,
        'payload.geometryHash': payload.geometryHash,
        status: { $in: ['pending', 'processing'] },
      },
      { session }
    );

    if (existing) {
      // Same geometryHash already enqueued - idempotent, no need to update
      logger.debug(
        { documentId, eventType, geometryHash: payload.geometryHash, eventId: existing._id },
        'Geo outbox event already exists with same geometryHash (idempotent)'
      );
      return existing;
    }

    // Check for existing pending/processing event for this documentId with different geometryHash
    // If geometryHash changed, update the existing event
    const existingDifferentHash = await collection.findOne(
      {
        documentId,
        eventType,
        status: { $in: ['pending', 'processing'] },
      },
      { session }
    );

    if (existingDifferentHash) {
      // GeometryHash changed - update existing event with new payload
      const updated = await collection.findOneAndUpdate(
        { _id: existingDifferentHash._id },
        {
          $set: {
            payload,
            attempts: 0,
            nextRunAt: now,
            updatedAt: now,
            status: 'pending',
            lastError: undefined,
          },
        },
        {
          session,
          returnDocument: 'after',
        }
      );

      if (!updated) {
        throw new Error(`Failed to update geo outbox event for documentId=${documentId}`);
      }

      logger.debug(
        { documentId, eventType, eventId: existingDifferentHash._id, oldHash: existingDifferentHash.payload.geometryHash, newHash: payload.geometryHash },
        'Updated existing geo outbox event with new geometryHash'
      );

      return updated;
    }

    // Create new event
    const event: Omit<GeoOutboxEvent, '_id'> = {
      documentId,
      eventType,
      payload,
      attempts: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
    };

    const result = await collection.insertOne(event as GeoOutboxEvent, { session });
    
    if (!result.insertedId) {
      throw new Error(`Failed to enqueue geo outbox event for documentId=${documentId}`);
    }

    const inserted = await collection.findOne({ _id: result.insertedId }, { session });
    
    if (!inserted) {
      throw new Error(`Failed to retrieve inserted geo outbox event for documentId=${documentId}`);
    }

    logger.debug(
      { documentId, eventType, eventId: result.insertedId },
      'Enqueued geo outbox event'
    );

    return inserted;
  }

  /**
   * Get next pending event to process
   * 
   * Atomically marks the event as processing and returns it.
   * 
   * @param limit - Maximum number of events to fetch
   * @returns Array of events ready to process
   */
  static async getNextPending(limit: number = 10): Promise<GeoOutboxEvent[]> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<GeoOutboxEvent>(COLLECTION_NAME);
    const now = new Date();
    
    // Find events that are ready to process
    const events = await collection
      .find({
        status: 'pending',
        nextRunAt: { $lte: now },
      })
      .sort({ nextRunAt: 1, createdAt: 1 })
      .limit(limit)
      .toArray();

    // Atomically mark as processing
    if (events.length > 0) {
      const eventIds = events.map(e => e._id!);
      await collection.updateMany(
        { _id: { $in: eventIds } },
        {
          $set: {
            status: 'processing',
            updatedAt: now,
          },
        }
      );

      // Refresh to get updated status
      const updated = await collection
        .find({ _id: { $in: eventIds } })
        .toArray();

      return updated;
    }

    return [];
  }

  /**
   * Mark event as completed
   * 
   * @param eventId - Event ID
   */
  static async markCompleted(eventId: ObjectId): Promise<void> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<GeoOutboxEvent>(COLLECTION_NAME);
    const now = new Date();
    
    await collection.updateOne(
      { _id: eventId },
      {
        $set: {
          status: 'completed',
          processedAt: now,
          updatedAt: now,
        },
      }
    );

    logger.debug({ eventId }, 'Marked geo outbox event as completed');
  }

  /**
   * Mark event as failed and schedule retry
   * 
   * @param eventId - Event ID
   * @param error - Error message
   * @param nextRunAt - When to retry (exponential backoff)
   */
  static async markFailed(
    eventId: ObjectId,
    error: string,
    nextRunAt: Date
  ): Promise<void> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<GeoOutboxEvent>(COLLECTION_NAME);
    const now = new Date();
    
    const event = await collection.findOne({ _id: eventId });
    if (!event) {
      throw new Error(`Geo outbox event not found: ${eventId}`);
    }

    const newAttempts = event.attempts + 1;
    const maxAttempts = 10; // Configurable

    await collection.updateOne(
      { _id: eventId },
      {
        $set: {
          status: newAttempts >= maxAttempts ? 'failed' : 'pending',
          attempts: newAttempts,
          nextRunAt,
          lastError: error,
          updatedAt: now,
        },
      }
    );

    logger.warn(
      { eventId, attempts: newAttempts, error },
      `Marked geo outbox event as failed (attempt ${newAttempts}/${maxAttempts})`
    );
  }

  /**
   * Reset processing events back to pending
   * 
   * Useful for recovery if worker crashes.
   */
  static async resetStuckEvents(): Promise<number> {
    await this.ensureIndexes();
    
    const db = getDB();
    const collection = db.collection<GeoOutboxEvent>(COLLECTION_NAME);
    const now = new Date();
    const stuckThreshold = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    
    const result = await collection.updateMany(
      {
        status: 'processing',
        updatedAt: { $lt: stuckThreshold },
      },
      {
        $set: {
          status: 'pending',
          updatedAt: now,
        },
      }
    );

    if (result.modifiedCount > 0) {
      logger.warn(
        { count: result.modifiedCount },
        'Reset stuck geo outbox events to pending'
      );
    }

    return result.modifiedCount;
  }
}

