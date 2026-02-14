/**
 * Scraping Recovery Service
 * 
 * Provides partial scraping support and recovery functionality.
 */

import { ScrapedDocument } from '../infrastructure/types.js';
import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';

const SCRAPING_PROGRESS_COLLECTION = 'scraping_progress';

export interface ScrapingProgress {
  websiteUrl: string;
  queryId?: string;
  documents: ScrapedDocument[];
  lastPageScraped: number;
  totalPages: number;
  startedAt: Date;
  updatedAt: Date;
  status: 'in_progress' | 'completed' | 'failed';
  error?: string;
}

/**
 * Service for scraping recovery and partial result management
 */
export class ScrapingRecoveryService {
  /**
   * Save scraping progress
   */
  async saveProgress(progress: ScrapingProgress): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      await collection.updateOne(
        { websiteUrl: progress.websiteUrl, queryId: progress.queryId },
        {
          $set: {
            ...progress,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      logger.debug(
        { websiteUrl: progress.websiteUrl, documentsCount: progress.documents.length },
        'Scraping progress saved'
      );
    } catch (error) {
      logger.error(
        { error, websiteUrl: progress.websiteUrl },
        'Failed to save scraping progress'
      );
      // Don't throw - progress saving is best effort
    }
  }

  /**
   * Load scraping progress
   */
  async loadProgress(
    websiteUrl: string,
    queryId?: string
  ): Promise<ScrapingProgress | null> {
    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      const progress = await collection.findOne({
        websiteUrl,
        queryId: queryId || { $exists: false },
        status: 'in_progress',
      });

      return progress;
    } catch (error) {
      logger.error(
        { error, websiteUrl },
        'Failed to load scraping progress'
      );
      return null;
    }
  }

  /**
   * Mark scraping as completed
   */
  async markCompleted(websiteUrl: string, queryId?: string): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      await collection.updateOne(
        { websiteUrl, queryId: queryId || { $exists: false } },
        {
          $set: {
            status: 'completed',
            updatedAt: new Date(),
          },
        }
      );

      // Trigger cleanup of old records (best effort, don't fail if cleanup fails)
      try {
        const { getScrapingProgressCleanupService } = await import('./ScrapingProgressCleanupService.js');
        const cleanupService = getScrapingProgressCleanupService();
        // Run cleanup in background (don't await to avoid blocking)
        cleanupService.cleanupOldProgress().catch((error) => {
          logger.warn({ error }, 'Background cleanup of old scraping progress failed');
        });
      } catch (cleanupError) {
        // Ignore cleanup errors - this is best effort
        logger.debug({ error: cleanupError }, 'Could not trigger scraping progress cleanup');
      }
    } catch (error) {
      logger.error(
        { error, websiteUrl },
        'Failed to mark scraping as completed'
      );
    }
  }

  /**
   * Mark scraping as failed
   */
  async markFailed(
    websiteUrl: string,
    error: string,
    queryId?: string
  ): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<ScrapingProgress>(SCRAPING_PROGRESS_COLLECTION);

      await collection.updateOne(
        { websiteUrl, queryId: queryId || { $exists: false } },
        {
          $set: {
            status: 'failed',
            error,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      logger.error(
        { error, websiteUrl },
        'Failed to mark scraping as failed'
      );
    }
  }

  /**
   * Get partial results from progress
   */
  async getPartialResults(
    websiteUrl: string,
    queryId?: string
  ): Promise<ScrapedDocument[]> {
    const progress = await this.loadProgress(websiteUrl, queryId);
    return progress?.documents || [];
  }
}


