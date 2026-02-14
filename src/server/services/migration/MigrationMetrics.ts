/**
 * MigrationMetrics
 * 
 * Metrics collection for v2 rollout monitoring and reconciliation.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/13-migrations-and-backfills.md
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { Filter, Sort } from 'mongodb';

/**
 * Migration metrics document
 */
export interface MigrationMetricsDocument {
  _id?: string;
  timestamp: Date;
  phase: 'A' | 'B' | 'C' | 'D' | 'E';
  metrics: {
    legacyDocuments?: number;
    canonicalDocuments?: number;
    canonicalChunks?: number;
    chunksWithEmbeddings?: number;
    geoExtensions?: number;
    legalExtensions?: number;
    webExtensions?: number;
    outboxEvents?: number;
    processedOutboxEvents?: number;
  };
  comparison?: {
    documentsMatch?: boolean;
    differences?: string[];
  };
}

/**
 * MigrationMetrics - Collect and store migration metrics
 */
export class MigrationMetrics {
  private readonly collectionName = 'migration_metrics';

  /**
   * Collect current migration metrics
   */
  async collectMetrics(phase: 'A' | 'B' | 'C' | 'D' | 'E'): Promise<MigrationMetricsDocument> {
    const db = getDB();
    const legacyCollection = db.collection('brondocumenten');
    const canonicalCollection = db.collection('canonical_documents');
    const chunksCollection = db.collection('canonical_chunks');
    const extensionsCollection = db.collection('extensions');
    const outboxCollection = db.collection('geo_outbox');

    const metrics: MigrationMetricsDocument['metrics'] = {};

    try {
      // Count legacy documents
      metrics.legacyDocuments = await legacyCollection.countDocuments();

      // Count canonical documents
      metrics.canonicalDocuments = await canonicalCollection.countDocuments();

      // Count chunks
      metrics.canonicalChunks = await chunksCollection.countDocuments();

      // Count chunks with embeddings
      metrics.chunksWithEmbeddings = await chunksCollection.countDocuments({
        'embedding.vectorRef': { $exists: true },
      });

      // Count extensions by type
      metrics.geoExtensions = await extensionsCollection.countDocuments({ type: 'geo' });
      metrics.legalExtensions = await extensionsCollection.countDocuments({ type: 'legal' });
      metrics.webExtensions = await extensionsCollection.countDocuments({ type: 'web' });

      // Count outbox events
      metrics.outboxEvents = await outboxCollection.countDocuments();
      metrics.processedOutboxEvents = await outboxCollection.countDocuments({
        processedAt: { $exists: true },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to collect migration metrics');
      throw error;
    }

    // Compare legacy vs canonical (if both exist)
    let comparison: MigrationMetricsDocument['comparison'] | undefined;
    if (metrics.legacyDocuments && metrics.canonicalDocuments) {
      const differences: string[] = [];
      
      if (metrics.legacyDocuments !== metrics.canonicalDocuments) {
        differences.push(
          `Document count mismatch: legacy=${metrics.legacyDocuments}, canonical=${metrics.canonicalDocuments}`
        );
      }

      comparison = {
        documentsMatch: differences.length === 0,
        differences: differences.length > 0 ? differences : undefined,
      };
    }

    const document: MigrationMetricsDocument = {
      timestamp: new Date(),
      phase,
      metrics,
      comparison,
    };

    // Store metrics
    try {
      // Remove _id if present to let MongoDB generate it
      const { _id, ...docWithoutId } = document;
      await db.collection(this.collectionName).insertOne(docWithoutId as Omit<MigrationMetricsDocument, '_id'>);
    } catch (error) {
      logger.error({ error }, 'Failed to store migration metrics');
      // Don't throw - metrics collection should be non-blocking
    }

    return document;
  }

  /**
   * Get latest metrics for a phase
   */
  async getLatestMetrics(phase?: 'A' | 'B' | 'C' | 'D' | 'E'): Promise<MigrationMetricsDocument | null> {
    const db = getDB();
    const collection = db.collection<MigrationMetricsDocument>(this.collectionName);

    const filter: { phase?: string } = {};
    if (phase) {
      filter.phase = phase;
    }

    const latest = await collection
      .find(filter as Filter<MigrationMetricsDocument>)
      .sort({ timestamp: -1 } as Sort)
      .limit(1)
      .toArray();

    return latest.length > 0 ? latest[0] : null;
  }

  /**
   * Get metrics history
   */
  async getMetricsHistory(
    phase?: 'A' | 'B' | 'C' | 'D' | 'E',
    limit: number = 100
  ): Promise<MigrationMetricsDocument[]> {
    const db = getDB();
    const collection = db.collection<MigrationMetricsDocument>(this.collectionName);

    const filter: { phase?: string } = {};
    if (phase) {
      filter.phase = phase;
    }

    return await collection
      .find(filter as Filter<MigrationMetricsDocument>)
      .sort({ timestamp: -1 } as Sort)
      .limit(limit)
      .toArray();
  }
}

// Singleton instance
let migrationMetrics: MigrationMetrics | null = null;

/**
 * Get singleton instance of MigrationMetrics
 */
export function getMigrationMetrics(): MigrationMetrics {
  if (!migrationMetrics) {
    migrationMetrics = new MigrationMetrics();
  }
  return migrationMetrics;
}

