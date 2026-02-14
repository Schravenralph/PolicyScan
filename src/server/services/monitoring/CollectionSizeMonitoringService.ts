/**
 * Collection Size Monitoring Service
 * 
 * Tracks collection sizes over time and alerts when collections exceed thresholds.
 * Integrates with ResourceThresholdService for alerting.
 */

import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';

export interface CollectionSizeStats {
  collection: string;
  documentCount: number;
  dataSize: number; // bytes
  storageSize: number; // bytes
  totalIndexSize: number; // bytes
  averageDocumentSize: number; // bytes
}

export interface CollectionSizeReport {
  timestamp: Date;
  databaseStats: {
    dataSize: number; // bytes
    storageSize: number; // bytes
    totalIndexSize: number; // bytes
    collections: number;
  };
  collections: CollectionSizeStats[];
  topCollections: CollectionSizeStats[]; // Top 10 by size
  collectionsOverThreshold: CollectionSizeStats[]; // Collections exceeding size threshold
}

export interface CollectionSizeThreshold {
  collection: string;
  warningMB: number;
  criticalMB: number;
}

const DEFAULT_WARNING_THRESHOLD_MB = 100; // Warn at 100MB
const DEFAULT_CRITICAL_THRESHOLD_MB = 1000; // Critical at 1GB

/**
 * Service for monitoring collection sizes
 */
export class CollectionSizeMonitoringService {
  private thresholds: Map<string, { warningMB: number; criticalMB: number }> = new Map();

  /**
   * Set threshold for a specific collection
   */
  setThreshold(collection: string, warningMB: number, criticalMB: number): void {
    this.thresholds.set(collection, { warningMB, criticalMB });
  }

  /**
   * Get threshold for a collection (or default)
   */
  private getThreshold(collection: string): { warningMB: number; criticalMB: number } {
    return (
      this.thresholds.get(collection) || {
        warningMB: DEFAULT_WARNING_THRESHOLD_MB,
        criticalMB: DEFAULT_CRITICAL_THRESHOLD_MB,
      }
    );
  }

  /**
   * Get size statistics for all collections
   */
  async getCollectionSizes(): Promise<CollectionSizeReport> {
    const db = getDB();

    // Get overall database stats
    const dbStats = await db.stats();
    const databaseStats = {
      dataSize: dbStats.dataSize || 0,
      storageSize: dbStats.storageSize || 0,
      totalIndexSize: dbStats.totalIndexSize || 0,
      collections: dbStats.collections || 0,
    };

    // Get all collections
    const collections = await db.listCollections().toArray();
    const collectionStats: CollectionSizeStats[] = [];

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;

      // Skip system collections
      if (collectionName.startsWith('system.')) {
        continue;
      }

      try {
        const collStats = await db.command({ collStats: collectionName });
        const documentCount = (collStats.count as number) || 0;
        const dataSize = (collStats.size as number) || 0;
        const storageSize = (collStats.storageSize as number) || 0;
        const totalIndexSize = (collStats.totalIndexSize as number) || 0;
        const averageDocumentSize = documentCount > 0 ? dataSize / documentCount : 0;

        collectionStats.push({
          collection: collectionName,
          documentCount,
          dataSize,
          storageSize,
          totalIndexSize,
          averageDocumentSize,
        });
      } catch (error) {
        logger.warn({ error, collection: collectionName }, 'Failed to get stats for collection');
      }
    }

    // Sort by storage size (descending)
    collectionStats.sort((a, b) => b.storageSize - a.storageSize);

    // Get top 10 largest collections
    const topCollections = collectionStats.slice(0, 10);

    // Find collections exceeding thresholds
    const collectionsOverThreshold = collectionStats.filter((stats) => {
      const threshold = this.getThreshold(stats.collection);
      const sizeMB = stats.storageSize / 1024 / 1024;
      return sizeMB >= threshold.warningMB;
    });

    return {
      timestamp: new Date(),
      databaseStats,
      collections: collectionStats,
      topCollections,
      collectionsOverThreshold,
    };
  }

  /**
   * Get size statistics for a specific collection
   */
  async getCollectionSize(collectionName: string): Promise<CollectionSizeStats | null> {
    try {
      const db = getDB();
      const collStats = await db.command({ collStats: collectionName });
      const documentCount = (collStats.count as number) || 0;
      const dataSize = (collStats.size as number) || 0;
      const storageSize = (collStats.storageSize as number) || 0;
      const totalIndexSize = (collStats.totalIndexSize as number) || 0;
      const averageDocumentSize = documentCount > 0 ? dataSize / documentCount : 0;

      return {
        collection: collectionName,
        documentCount,
        dataSize,
        storageSize,
        totalIndexSize,
        averageDocumentSize,
      };
    } catch (error) {
      logger.error({ error, collection: collectionName }, 'Failed to get collection size');
      return null;
    }
  }

  /**
   * Check if any collections exceed thresholds and return alerts
   */
  async checkThresholds(): Promise<{
    warnings: Array<{ collection: string; sizeMB: number; thresholdMB: number }>;
    criticals: Array<{ collection: string; sizeMB: number; thresholdMB: number }>;
  }> {
    const report = await this.getCollectionSizes();
    const warnings: Array<{ collection: string; sizeMB: number; thresholdMB: number }> = [];
    const criticals: Array<{ collection: string; sizeMB: number; thresholdMB: number }> = [];

    for (const stats of report.collections) {
      const threshold = this.getThreshold(stats.collection);
      const sizeMB = stats.storageSize / 1024 / 1024;

      if (sizeMB >= threshold.criticalMB) {
        criticals.push({
          collection: stats.collection,
          sizeMB,
          thresholdMB: threshold.criticalMB,
        });
      } else if (sizeMB >= threshold.warningMB) {
        warnings.push({
          collection: stats.collection,
          sizeMB,
          thresholdMB: threshold.warningMB,
        });
      }
    }

    return { warnings, criticals };
  }

  /**
   * Get summary statistics for dashboard/metrics
   */
  async getSummary(): Promise<{
    totalSizeGB: number;
    totalCollections: number;
    largestCollection: string;
    largestCollectionSizeGB: number;
    collectionsOver100MB: number;
    collectionsOver1GB: number;
  }> {
    const report = await this.getCollectionSizes();

    const totalSizeGB = report.databaseStats.storageSize / 1024 / 1024 / 1024;
    const largestCollection = report.topCollections[0]?.collection || '';
    const largestCollectionSizeGB = report.topCollections[0]
      ? report.topCollections[0].storageSize / 1024 / 1024 / 1024
      : 0;
    const collectionsOver100MB = report.collections.filter(
      (c) => c.storageSize >= 100 * 1024 * 1024
    ).length;
    const collectionsOver1GB = report.collections.filter(
      (c) => c.storageSize >= 1024 * 1024 * 1024
    ).length;

    return {
      totalSizeGB,
      totalCollections: report.collections.length,
      largestCollection,
      largestCollectionSizeGB,
      collectionsOver100MB,
      collectionsOver1GB,
    };
  }
}

// Singleton instance
let collectionSizeMonitoringServiceInstance: CollectionSizeMonitoringService | null = null;

/**
 * Get the singleton instance of CollectionSizeMonitoringService
 */
export function getCollectionSizeMonitoringService(): CollectionSizeMonitoringService {
  if (!collectionSizeMonitoringServiceInstance) {
    collectionSizeMonitoringServiceInstance = new CollectionSizeMonitoringService();

    // Set custom thresholds for known large collections
    collectionSizeMonitoringServiceInstance.setThreshold('canonical_documents', 500, 5000);
    collectionSizeMonitoringServiceInstance.setThreshold('canonical_chunks', 500, 5000);
    collectionSizeMonitoringServiceInstance.setThreshold('scraping_progress', 100, 500);
    collectionSizeMonitoringServiceInstance.setThreshold('job_progress', 100, 500);
    collectionSizeMonitoringServiceInstance.setThreshold('commoncrawl_index', 1000, 10000);
  }
  return collectionSizeMonitoringServiceInstance;
}
