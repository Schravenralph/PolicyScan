/**
 * CDX Migration Health Service
 * 
 * Provides health status and monitoring for Common Crawl CDX file migration.
 */

import { logger } from '../../utils/logger.js';
import { CommonCrawlIndexService } from './CommonCrawlIndexService.js';
import { CDXFileDownloadService } from './CDXFileDownloadService.js';
import { getDB } from '../../config/database.js';

export interface HealthStatus {
  healthy: boolean;
  services: {
    database: boolean;
    downloadService: boolean;
    indexService: boolean;
  };
  latestCrawlId?: string;
  timestamp: Date;
}

export interface MigrationStatus {
  latestCrawlId?: string;
  loadedCrawls: Array<{
    crawlId: string;
    recordCount: number;
    loadedAt?: Date;
    source?: string;
  }>;
  totalRecords: number;
  lastMigration?: {
    crawlId: string;
    completedAt: Date;
    recordCount: number;
  };
}

/**
 * Service for monitoring CDX migration health and status
 */
export class CDXMigrationHealthService {
  private readonly indexService: CommonCrawlIndexService;
  private readonly downloadService: CDXFileDownloadService;

  constructor() {
    this.indexService = new CommonCrawlIndexService();
    this.downloadService = new CDXFileDownloadService();
  }

  /**
   * Get health status of migration services
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const services = {
      database: false,
      downloadService: false,
      indexService: false,
    };

    try {
      // Check database connection
      const db = getDB();
      await db.admin().ping();
      services.database = true;
    } catch (error) {
      logger.warn({ error }, 'Database health check failed');
    }

    try {
      // Check download service (can fetch latest crawl ID)
      await this.downloadService.getLatestCrawlId();
      services.downloadService = true;
    } catch (error) {
      logger.warn({ error }, 'Download service health check failed');
    }

    try {
      // Check index service (can query collection)
      const db = getDB();
      const collection = db.collection('commoncrawl_index');
      await collection.findOne({}, { projection: { _id: 1 } });
      services.indexService = true;
    } catch (error) {
      logger.warn({ error }, 'Index service health check failed');
    }

    // Get latest crawl ID
    let latestCrawlId: string | undefined;
    try {
      latestCrawlId = await this.downloadService.getLatestCrawlId();
    } catch (error) {
      logger.warn({ error }, 'Failed to get latest crawl ID');
    }

    const healthy =
      services.database && services.downloadService && services.indexService;

    return {
      healthy,
      services,
      latestCrawlId,
      timestamp: new Date(),
    };
  }

  /**
   * Get migration status (loaded crawls, record counts, etc.)
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    const status: MigrationStatus = {
      loadedCrawls: [],
      totalRecords: 0,
    };

    try {
      const db = getDB();
      const collection = db.collection('commoncrawl_index');

      // Use aggregation pipeline for better performance
      const pipeline = [
        {
          $group: {
            _id: '$crawlId',
            recordCount: { $sum: 1 },
            source: { $first: '$source' },
            loadedAt: { $max: '$createdAt' },
          },
        },
        {
          $sort: { _id: -1 },
        },
      ];

      const results = await collection.aggregate(pipeline).toArray();

      for (const result of results) {
        status.loadedCrawls.push({
          crawlId: result._id,
          recordCount: result.recordCount,
          loadedAt: result.loadedAt,
          source: result.source,
        });
        status.totalRecords += result.recordCount;
      }

      // Get latest crawl ID
      if (status.loadedCrawls.length > 0) {
        status.latestCrawlId = status.loadedCrawls[0].crawlId;

        // Get last migration info
        const latestCrawl = status.loadedCrawls[0];
        if (latestCrawl && latestCrawl.loadedAt) {
          status.lastMigration = {
            crawlId: latestCrawl.crawlId,
            completedAt: latestCrawl.loadedAt,
            recordCount: latestCrawl.recordCount,
          };
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Error getting migration status');
    }

    return status;
  }

  /**
   * Get detailed migration statistics
   */
  async getMigrationStatistics(): Promise<{
    totalCrawls: number;
    totalRecords: number;
    recordsByCrawl: Array<{
      crawlId: string;
      recordCount: number;
      source?: string;
    }>;
    recordsBySource: Record<string, number>;
    averageRecordsPerCrawl: number;
  }> {
    try {
      const db = getDB();
      const collection = db.collection('commoncrawl_index');

      // Use aggregation for better performance
      const pipeline = [
        {
          $group: {
            _id: '$crawlId',
            recordCount: { $sum: 1 },
            source: { $first: '$source' },
          },
        },
        {
          $sort: { _id: -1 },
        },
      ];

      const results = await collection.aggregate(pipeline).toArray();

      const recordsByCrawl = results.map((r) => ({
        crawlId: r._id,
        recordCount: r.recordCount,
        source: r.source,
      }));

      const totalRecords = recordsByCrawl.reduce(
        (sum, c) => sum + c.recordCount,
        0
      );

      // Group by source
      const recordsBySource: Record<string, number> = {};
      for (const crawl of recordsByCrawl) {
        const source = crawl.source || 'unknown';
        recordsBySource[source] =
          (recordsBySource[source] || 0) + crawl.recordCount;
      }

      const averageRecordsPerCrawl =
        recordsByCrawl.length > 0
          ? Math.round(totalRecords / recordsByCrawl.length)
          : 0;

      return {
        totalCrawls: recordsByCrawl.length,
        totalRecords,
        recordsByCrawl,
        recordsBySource,
        averageRecordsPerCrawl,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting migration statistics');
      throw error;
    }
  }
}

