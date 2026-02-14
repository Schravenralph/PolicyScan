/**
 * GeoOutboxWorker - Worker for syncing GeoExtension to PostGIS
 * 
 * Polls geo_outbox collection and syncs geometries to PostGIS idempotently.
 * Implements retry/backoff and poison event handling.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md
 */

import { GeoOutboxModel, type GeoOutboxEvent } from '../models/GeoOutboxModel.js';
import { GeoExtensionService } from '../services/extensions/GeoExtensionService.js';
import { GeoIndexService } from '../geo/GeoIndexService.js';
import { logger } from '../utils/logger.js';
import { ObjectId } from 'mongodb';

/**
 * Configuration for GeoOutboxWorker
 */
export interface GeoOutboxWorkerConfig {
  pollIntervalMs?: number; // Default: 5000 (5 seconds)
  batchSize?: number; // Default: 10
  maxRetries?: number; // Default: 10
  baseBackoffMs?: number; // Default: 1000 (1 second)
  maxBackoffMs?: number; // Default: 300000 (5 minutes)
}

/**
 * GeoOutboxWorker - Worker for syncing geo extensions to PostGIS
 */
export class GeoOutboxWorker {
  private readonly geoExtensionService: GeoExtensionService;
  private readonly geoIndexService: GeoIndexService;
  private readonly config: Required<GeoOutboxWorkerConfig>;
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;

  constructor(config: GeoOutboxWorkerConfig = {}) {
    this.geoExtensionService = new GeoExtensionService();
    this.geoIndexService = new GeoIndexService();
    this.config = {
      pollIntervalMs: config.pollIntervalMs ?? 5000,
      batchSize: config.batchSize ?? 10,
      maxRetries: config.maxRetries ?? 10,
      baseBackoffMs: config.baseBackoffMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 300000,
    };
  }

  /**
   * Start the worker
   * 
   * Begins polling for outbox events and processing them.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('GeoOutboxWorker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('GeoOutboxWorker started');

    // Ensure PostGIS schema exists
    try {
      await this.geoIndexService.ensureSchema();
    } catch (error) {
      logger.error({ error }, 'Failed to ensure PostGIS schema');
      // Continue anyway - schema might already exist
    }

    // Reset any stuck events from previous run
    await GeoOutboxModel.resetStuckEvents();

    // Start polling
    this.poll();
  }

  /**
   * Stop the worker
   * 
   * Stops polling and waits for current batch to complete.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for current processing to complete
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('GeoOutboxWorker stopped');
  }

  /**
   * Poll for pending events and process them
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Process a batch of events
      await this.processBatch();
    } catch (error) {
      logger.error({ error }, 'Error in GeoOutboxWorker poll cycle');
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => {
        this.poll();
      }, this.config.pollIntervalMs);
    }
  }

  /**
   * Process a batch of outbox events
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing
    }

    this.isProcessing = true;

    try {
      const events = await GeoOutboxModel.getNextPending(this.config.batchSize);

      if (events.length === 0) {
        return; // No events to process
      }

      logger.debug(
        { count: events.length },
        'Processing batch of geo outbox events'
      );

      // Process events in parallel (with concurrency limit)
      const concurrency = 3;
      for (let i = 0; i < events.length; i += concurrency) {
        const batch = events.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(event => this.processEvent(event))
        );
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single outbox event
   * 
   * @param event - Outbox event to process
   */
  private async processEvent(event: GeoOutboxEvent): Promise<void> {
    const { _id, documentId, eventType, payload } = event;

    if (!_id) {
      logger.error({ event }, 'Geo outbox event missing _id');
      return;
    }

    try {
      if (eventType === 'geo_upserted') {
        await this.processUpsert(documentId, payload);
      } else if (eventType === 'geo_deleted') {
        await this.processDelete(documentId);
      } else {
        throw new Error(`Unknown event type: ${eventType}`);
      }

      // Mark as completed
      await GeoOutboxModel.markCompleted(_id);

      logger.debug(
        { eventId: _id, documentId, eventType },
        'Successfully processed geo outbox event'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Calculate exponential backoff
      const backoffMs = Math.min(
        this.config.baseBackoffMs * Math.pow(2, event.attempts),
        this.config.maxBackoffMs
      );
      const nextRunAt = new Date(Date.now() + backoffMs);

      // Mark as failed and schedule retry
      await GeoOutboxModel.markFailed(_id, errorMessage, nextRunAt);

      logger.error(
        { 
          eventId: _id, 
          documentId, 
          eventType, 
          error: errorMessage,
          attempts: event.attempts + 1,
          nextRunAt,
        },
        'Failed to process geo outbox event'
      );
    }
  }

  /**
   * Process a geo_upserted event
   * 
   * Loads GeoExtension from MongoDB and upserts to PostGIS.
   * Idempotent by (documentId, geometryHash).
   * 
   * @param documentId - Document ID
   * @param payload - Event payload
   */
  private async processUpsert(
    documentId: string,
    payload: { geometryHash: string; bbox?: number[] }
  ): Promise<void> {
    // Load GeoExtension from MongoDB
    const geoExtension = await this.geoExtensionService.get(documentId);

    if (!geoExtension) {
      throw new Error(`GeoExtension not found for documentId: ${documentId}`);
    }

    // Verify geometry hash matches (idempotency check)
    if (geoExtension.geometryHash !== payload.geometryHash) {
      // Geometry has changed since event was enqueued
      // This is okay - we'll process the current geometry
      logger.debug(
        { documentId, expectedHash: payload.geometryHash, actualHash: geoExtension.geometryHash },
        'Geometry hash mismatch (geometry updated since event enqueued)'
      );
    }

    // Upsert to PostGIS
    // Use bbox from payload if available, otherwise from geoExtension
    const bbox = payload.bbox ?? geoExtension.bboxWgs84;

    await this.geoIndexService.upsertGeometries(
      documentId,
      geoExtension.geometriesWgs84,
      bbox,
      geoExtension.geometryHash
    );
  }

  /**
   * Process a geo_deleted event
   * 
   * Deletes geometry from PostGIS.
   * 
   * @param documentId - Document ID
   */
  private async processDelete(documentId: string): Promise<void> {
    await this.geoIndexService.deleteGeometry(documentId);
  }

  /**
   * Manually trigger processing of pending events
   * 
   * Useful for testing or manual sync.
   */
  async processPending(): Promise<number> {
    const events = await GeoOutboxModel.getNextPending(this.config.batchSize);
    
    for (const event of events) {
      await this.processEvent(event);
    }

    return events.length;
  }
}

