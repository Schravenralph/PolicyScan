#!/usr/bin/env tsx
/**
 * Migration: Add Cleanup TTL Indexes
 * 
 * Adds TTL (Time To Live) indexes for automatic cleanup of transient data:
 * - scraping_progress: Index on updatedAt for completed/failed records
 * - job_progress: TTL index on completedAt for completed/failed/cancelled records
 * 
 * Note: MongoDB TTL indexes automatically delete documents after expiration.
 * However, for conditional TTL (only completed/failed records), we use partial indexes
 * combined with scheduled cleanup jobs.
 * 
 * Usage:
 *   tsx src/server/db/migrations/add-cleanup-ttl-indexes.ts
 */

import { connectDB, closeDB, getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { getScrapingProgressCleanupService } from '../../services/scraping/ScrapingProgressCleanupService.js';
import { getProgressCleanupService } from '../../services/progress/ProgressCleanupService.js';

async function addCleanupTTLIndexes(): Promise<void> {
  await connectDB();
  const db = getDB();

  logger.info('Adding cleanup TTL indexes...');

  try {
    // Ensure scraping_progress indexes
    logger.info('Ensuring indexes for scraping_progress collection...');
    const scrapingProgressCleanupService = getScrapingProgressCleanupService();
    const scrapingProgressIndex = await scrapingProgressCleanupService.ensureIndexes();
    logger.info(
      {
        indexName: scrapingProgressIndex.indexName,
        created: scrapingProgressIndex.indexCreated,
      },
      'Scraping progress indexes verified'
    );

    // Ensure job_progress TTL index
    logger.info('Ensuring TTL index for job_progress collection...');
    const progressCleanupService = getProgressCleanupService();
    
    // Default: 30 days retention (30 * 24 * 60 * 60 seconds)
    const retentionDays = parseInt(process.env.PROGRESS_RETENTION_DAYS || '30', 10);
    const expireAfterSeconds = retentionDays * 24 * 60 * 60;
    
    const progressIndex = await progressCleanupService.ensureTTLIndex(expireAfterSeconds);
    logger.info(
      {
        indexName: progressIndex.indexName,
        created: progressIndex.indexCreated,
        expireAfterSeconds,
        retentionDays,
      },
      'Progress TTL index verified'
    );

    // Verify existing TTL indexes on other collections
    logger.info('Verifying existing TTL indexes...');

    const collectionsToCheck = [
      { name: 'test_logs', expectedField: 'createdAt' },
      { name: 'test_runs', expectedField: 'timestamp' },
      { name: 'workflow_history', expectedField: 'completedAt' },
      { name: 'audit_logs', expectedField: 'timestamp' },
    ];

    for (const { name, expectedField } of collectionsToCheck) {
      try {
        const collection = db.collection(name);
        const indexes = await collection.indexes();
        const ttlIndex = indexes.find(
          (idx) =>
            idx.expireAfterSeconds !== undefined &&
            idx.expireAfterSeconds > 0 &&
            Object.keys(idx.key || {}).includes(expectedField)
        );

        if (ttlIndex) {
          logger.info(
            {
              collection: name,
              field: expectedField,
              expireAfterSeconds: ttlIndex.expireAfterSeconds,
            },
            `TTL index exists on ${name}.${expectedField}`
          );
        } else {
          logger.warn(
            {
              collection: name,
              expectedField,
            },
            `No TTL index found on ${name}.${expectedField} - consider adding one`
          );
        }
      } catch (error) {
        logger.warn({ error, collection: name }, `Could not verify TTL index for ${name}`);
      }
    }

    logger.info('✅ Cleanup TTL indexes migration completed');
  } catch (error) {
    logger.error({ error }, 'Failed to add cleanup TTL indexes');
    throw error;
  } finally {
    await closeDB();
  }
}

// Run migration if executed directly
// Check if this file is being run directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('add-cleanup-ttl-indexes.ts') ||
                     process.argv[1]?.endsWith('add-cleanup-ttl-indexes.js');

if (isMainModule) {
  addCleanupTTLIndexes()
    .then(() => {
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Migration failed');
      process.exit(1);
    });
}

export { addCleanupTTLIndexes };
