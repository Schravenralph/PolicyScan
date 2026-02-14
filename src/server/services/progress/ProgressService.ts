import { getDB } from '../../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import type {
  ProgressEvent,
  ProgressDocument,
  ProgressQueryFilters,
  JobProgressStatus,
} from '../../types/progress.js';
import { logger } from '../../utils/logger.js';
import { getWebSocketService } from '../infrastructure/WebSocketService.js';

const COLLECTION_NAME = 'job_progress';

/**
 * ProgressService manages progress tracking for queue jobs
 * 
 * Features:
 * - Persists progress events to MongoDB
 * - Broadcasts progress updates via WebSocket
 * - Provides query endpoints for progress history
 * - Supports Redis pub/sub for distributed progress updates
 */
export class ProgressService {
  /**
   * Get database instance (lazy initialization)
   */
  private get db() {
    return getDB();
  }

  /**
   * Get collection (lazy initialization)
   */
  private get collection() {
    return this.db.collection<ProgressDocument>(COLLECTION_NAME);
  }

  /**
   * Record a progress event for a job
   */
  async recordProgress(event: ProgressEvent): Promise<void> {
    try {
      // Get or create progress document
      const progressDoc: ProgressDocument | null = await this.collection.findOne({ jobId: event.jobId });

      const newProgress = this.getProgressFromEvent(event);

      if (!progressDoc) {
        // Create new progress document
        // Cast jobType to allowed ProgressDocument jobType (workflow/scraping map to processing)
        const allowedJobType = (event.jobType === 'workflow' || event.jobType === 'scraping')
          ? 'processing'
          : event.jobType as 'scan' | 'embedding' | 'processing' | 'export';
        
        const newDoc: Omit<ProgressDocument, '_id'> = {
          jobId: event.jobId,
          jobType: allowedJobType,
          queryId: event.queryId,
          status: this.getStatusFromEvent(event),
          progress: newProgress ?? 0,
          currentStep: this.getCurrentStepFromEvent(event),
          stepNumber: this.getStepNumberFromEvent(event),
          totalSteps: this.getTotalStepsFromEvent(event),
          message: this.getMessageFromEvent(event),
          metadata: this.getMetadataFromEvent(event),
          error: this.getErrorFromEvent(event),
          errorDetails: this.getErrorDetailsFromEvent(event),
          result: this.getResultFromEvent(event),
          events: [event],
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: this.getCompletedAtFromEvent(event),
        };
        await this.collection.insertOne(newDoc);
      } else {
        // Update existing progress document
        const update: Partial<ProgressDocument> = {
          status: this.getStatusFromEvent(event),
          currentStep: this.getCurrentStepFromEvent(event),
          stepNumber: this.getStepNumberFromEvent(event),
          totalSteps: this.getTotalStepsFromEvent(event),
          message: this.getMessageFromEvent(event),
          metadata: this.getMetadataFromEvent(event),
          error: this.getErrorFromEvent(event),
          errorDetails: this.getErrorDetailsFromEvent(event),
          result: this.getResultFromEvent(event),
          updatedAt: new Date(),
          completedAt: this.getCompletedAtFromEvent(event),
        };

        if (newProgress !== undefined) {
          update.progress = newProgress;
        }

        // Add event to events array
        await this.collection.updateOne(
          { jobId: event.jobId },
          {
            $set: update,
            $push: { events: event },
          }
        );
      }

      // Broadcast via WebSocket
      this.broadcastProgress(event);

      logger.debug({ jobId: event.jobId, eventType: event.type }, 'Progress event recorded');
    } catch (error) {
      logger.error({ error, jobId: event.jobId }, 'Failed to record progress event');
      // Don't throw - progress tracking should not break job execution
    }
  }

  /**
   * Get progress for a specific job
   */
  async getJobProgress(jobId: string): Promise<ProgressDocument | null> {
    try {
      const doc = await this.collection.findOne({ jobId });
      if (!doc) return null;
      // Convert MongoDB document to ProgressDocument (with _id as string)
      return {
        ...doc,
        _id: doc._id.toString(),
      } as ProgressDocument;
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to get job progress');
      return null;
    }
  }

  /**
   * Query progress documents with filters
   */
  async queryProgress(filters: ProgressQueryFilters): Promise<ProgressDocument[]> {
    try {
      const query: Filter<ProgressDocument> = {};

      if (filters.jobId) {
        query.jobId = filters.jobId;
      }

      if (filters.jobType) {
        query.jobType = filters.jobType;
      }

      if (filters.queryId) {
        query.queryId = filters.queryId;
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query.status = { $in: filters.status };
        } else {
          query.status = filters.status;
        }
      }

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt = { ...query.createdAt, $gte: filters.startDate };
        }
        if (filters.endDate) {
          query.createdAt = { ...query.createdAt, $lte: filters.endDate };
        }
      }

      const cursor = this.collection.find(query).sort({ createdAt: -1 });

      if (filters.skip) {
        cursor.skip(filters.skip);
      }

      if (filters.limit) {
        cursor.limit(filters.limit);
      }

      return await cursor.toArray();
    } catch (error) {
      logger.error({ error, filters }, 'Failed to query progress');
      return [];
    }
  }

  /**
   * Get progress for all jobs related to a query
   */
  async getProgressForQuery(queryId: string): Promise<ProgressDocument[]> {
    return this.queryProgress({ queryId, limit: 100 });
  }

  /**
   * Broadcast progress event via WebSocket
   */
  private broadcastProgress(event: ProgressEvent): void {
    try {
      const webSocketService = getWebSocketService();
      const io = webSocketService.getIO();

      if (io) {
        // Broadcast to all clients
        io.emit('job_progress', event);

        // Also broadcast to room for specific job (if clients join rooms)
        io.to(`job:${event.jobId}`).emit('job_progress', event);

        // Broadcast to room for specific query (if clients join rooms)
        if (event.queryId) {
          io.to(`query:${event.queryId}`).emit('job_progress', event);
        }
      }
    } catch (error) {
      logger.error({ error, jobId: event.jobId }, 'Failed to broadcast progress event');
      // Don't throw - WebSocket failures should not break job execution
    }
  }

  /**
   * Helper methods to extract data from events
   */
  private getStatusFromEvent(event: ProgressEvent): JobProgressStatus {
    switch (event.type) {
      case 'job_started':
        return 'active';
      case 'job_completed':
        return 'completed';
      case 'job_failed':
        return 'failed';
      case 'job_cancelled':
        return 'cancelled';
      default:
        return 'active';
    }
  }

  private getProgressFromEvent(event: ProgressEvent): number | undefined {
    if (event.type === 'job_progress') {
      return event.data.progress;
    }
    if (event.type === 'job_completed') {
      return 100;
    }
    if (event.type === 'job_started') {
      return 0;
    }
    if (event.type === 'job_failed' || event.type === 'job_cancelled') {
      return 0;
    }
    // For other events (like job_step), return undefined to preserve existing progress
    return undefined;
  }

  private getCurrentStepFromEvent(event: ProgressEvent): string | undefined {
    if (event.type === 'job_step') {
      return event.data.step;
    }
    return undefined;
  }

  private getStepNumberFromEvent(event: ProgressEvent): number | undefined {
    if (event.type === 'job_step') {
      return event.data.stepNumber;
    }
    return undefined;
  }

  private getTotalStepsFromEvent(event: ProgressEvent): number | undefined {
    if (event.type === 'job_step') {
      return event.data.totalSteps;
    }
    return undefined;
  }

  private getMessageFromEvent(event: ProgressEvent): string | undefined {
    if (event.type === 'job_progress' || event.type === 'job_step') {
      return event.data.message;
    }
    if (event.type === 'job_started') {
      return event.data.message;
    }
    if (event.type === 'job_completed') {
      return event.data.message;
    }
    if (event.type === 'job_cancelled') {
      return event.data.message;
    }
    return undefined;
  }

  private getMetadataFromEvent(event: ProgressEvent): Record<string, unknown> | undefined {
    if (event.type === 'job_progress' || event.type === 'job_step' || event.type === 'job_completed') {
      return event.data.metadata;
    }
    return undefined;
  }

  private getErrorFromEvent(event: ProgressEvent): string | undefined {
    if (event.type === 'job_failed') {
      return event.data.error;
    }
    return undefined;
  }

  private getErrorDetailsFromEvent(event: ProgressEvent): unknown | undefined {
    if (event.type === 'job_failed') {
      return event.data.errorDetails;
    }
    return undefined;
  }

  private getResultFromEvent(event: ProgressEvent): unknown | undefined {
    if (event.type === 'job_completed') {
      return event.data.result;
    }
    return undefined;
  }

  private getCompletedAtFromEvent(event: ProgressEvent): Date | undefined {
    if (event.type === 'job_completed' || event.type === 'job_failed' || event.type === 'job_cancelled') {
      return new Date();
    }
    return undefined;
  }

  /**
   * Clean up old progress records
   * Delegates to ProgressCleanupService
   * 
   * @param retentionDays - Number of days to retain completed/failed records (default: 30)
   * @param truncateEvents - Whether to truncate events array instead of deleting (default: false)
   */
  async cleanupOldProgress(
    retentionDays: number = 30,
    truncateEvents: boolean = false
  ): Promise<{
    deletedCount: number;
    truncatedCount: number;
    cutoffDate: Date;
    retentionDays: number;
    activePreserved: number;
  }> {
    const { getProgressCleanupService } = await import('./ProgressCleanupService.js');
    const cleanupService = getProgressCleanupService();
    return cleanupService.cleanupOldProgress(retentionDays, truncateEvents);
  }
}

// Singleton instance
let progressServiceInstance: ProgressService | null = null;

/**
 * Get or create the ProgressService singleton
 */
export function getProgressService(): ProgressService {
  if (!progressServiceInstance) {
    progressServiceInstance = new ProgressService();
  }
  return progressServiceInstance;
}
