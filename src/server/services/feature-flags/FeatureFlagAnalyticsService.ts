/**
 * Feature Flag Analytics and Monitoring Service
 * 
 * Tracks feature flag usage, performance, and changes for analytics and monitoring.
 */

import { getDB } from '../../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';

const COLLECTION_FLAG_CHECKS = 'feature_flag_checks';
const COLLECTION_FLAG_CHANGES = 'feature_flag_changes';
const COLLECTION_FLAG_USAGE_STATS = 'feature_flag_usage_stats';

export interface FlagCheckRecord {
  _id?: ObjectId;
  flagName: string;
  enabled: boolean;
  source: 'environment' | 'database' | 'default';
  latencyMs: number;
  timestamp: Date;
  service?: string;
  workflow?: string;
  userId?: string;
  userRole?: string;
}

export interface FlagChangeRecord {
  _id?: ObjectId;
  flagName: string;
  previousValue: boolean;
  newValue: boolean;
  changedBy: string;
  changedAt: Date;
  reason?: string;
  cascadeFlags?: string[];
}

export interface FlagUsageStats {
  _id?: ObjectId;
  flagName: string;
  date: Date;
  totalChecks: number;
  enabledChecks: number;
  disabledChecks: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  checksByHour: Record<number, number>;
  checksByService: Record<string, number>;
  lastCheckedAt?: Date;
}

export interface FlagHealthMetrics {
  flagName: string;
  isUsed: boolean;
  lastCheckedAt?: Date;
  totalChecks: number;
  avgLatencyMs: number;
  changeCount: number;
  lastChangedAt?: Date;
  usageTrend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Feature Flag Analytics Service
 */
export class FeatureFlagAnalyticsService extends EventEmitter {
  private checkBuffer: FlagCheckRecord[] = [];
  private bufferSize: number = 100;
  private flushInterval: number = 5000; // 5 seconds
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.startFlushTimer();
  }

  /**
   * Start periodic flush of buffered check records
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushCheckBuffer().catch(error => {
        logger.error({ error }, '[FeatureFlagAnalytics] Failed to flush check buffer');
      });
    }, this.flushInterval);
  }

  /**
   * Stop the flush timer (for cleanup)
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    // Flush remaining buffer
    this.flushCheckBuffer().catch(error => {
      logger.error({ error }, '[FeatureFlagAnalytics] Failed to flush check buffer on stop');
    });
  }

  /**
   * Track a flag check
   */
  trackCheck(
    flagName: string,
    enabled: boolean,
    latencyMs: number,
    source: 'environment' | 'database' | 'default',
    context?: {
      service?: string;
      workflow?: string;
      userId?: string;
      userRole?: string;
    }
  ): void {
    const record: FlagCheckRecord = {
      flagName,
      enabled,
      source,
      latencyMs,
      timestamp: new Date(),
      service: context?.service,
      workflow: context?.workflow,
      userId: context?.userId,
      userRole: context?.userRole,
    };

    this.checkBuffer.push(record);

    // Flush if buffer is full
    if (this.checkBuffer.length >= this.bufferSize) {
      this.flushCheckBuffer().catch(error => {
        logger.error({ error }, '[FeatureFlagAnalytics] Failed to flush check buffer');
      });
    }
  }

  /**
   * Track a flag change
   */
  async trackChange(
    flagName: string,
    previousValue: boolean,
    newValue: boolean,
    changedBy: string,
    reason?: string,
    cascadeFlags?: string[]
  ): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<FlagChangeRecord>(COLLECTION_FLAG_CHANGES);

      const record: FlagChangeRecord = {
        flagName,
        previousValue,
        newValue,
        changedBy,
        changedAt: new Date(),
        reason,
        cascadeFlags,
      };

      await collection.insertOne(record);
      this.emit('flag-changed', record);
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to track flag change');
    }
  }

  /**
   * Flush buffered check records to database
   */
  private async flushCheckBuffer(): Promise<void> {
    if (this.checkBuffer.length === 0) {
      return;
    }

    const records = [...this.checkBuffer];
    this.checkBuffer = [];

    try {
      const db = getDB();
      const collection = db.collection<FlagCheckRecord>(COLLECTION_FLAG_CHECKS);

      // Insert records in batches
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await collection.insertMany(batch, { ordered: false });
      }

      // Update usage stats
      await this.updateUsageStats(records);
    } catch (error) {
      logger.error({ error }, '[FeatureFlagAnalytics] Failed to flush check buffer');
      // Re-add records to buffer if flush failed
      this.checkBuffer.unshift(...records);
    }
  }

  /**
   * Update usage statistics from check records
   */
  private async updateUsageStats(records: FlagCheckRecord[]): Promise<void> {
    try {
      const db = getDB();
      const collection = db.collection<FlagUsageStats>(COLLECTION_FLAG_USAGE_STATS);

      // Group records by flag name and date
      const statsMap = new Map<string, Map<string, FlagUsageStats>>();

      for (const record of records) {
        const dateKey = record.timestamp.toISOString().split('T')[0];

        if (!statsMap.has(record.flagName)) {
          statsMap.set(record.flagName, new Map());
        }

        const dateMap = statsMap.get(record.flagName)!;
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, {
            flagName: record.flagName,
            date: new Date(dateKey),
            totalChecks: 0,
            enabledChecks: 0,
            disabledChecks: 0,
            avgLatencyMs: 0,
            maxLatencyMs: 0,
            minLatencyMs: Infinity,
            checksByHour: {},
            checksByService: {},
            lastCheckedAt: record.timestamp,
          });
        }

        const stats = dateMap.get(dateKey)!;
        stats.totalChecks++;
        if (record.enabled) {
          stats.enabledChecks++;
        } else {
          stats.disabledChecks++;
        }

        const hour = record.timestamp.getHours();
        stats.checksByHour[hour] = (stats.checksByHour[hour] || 0) + 1;

        if (record.service) {
          stats.checksByService[record.service] = (stats.checksByService[record.service] || 0) + 1;
        }

        stats.avgLatencyMs = (stats.avgLatencyMs * (stats.totalChecks - 1) + record.latencyMs) / stats.totalChecks;
        stats.maxLatencyMs = Math.max(stats.maxLatencyMs, record.latencyMs);
        stats.minLatencyMs = Math.min(stats.minLatencyMs, record.latencyMs);

        if (!stats.lastCheckedAt || record.timestamp > stats.lastCheckedAt) {
          stats.lastCheckedAt = record.timestamp;
        }
      }

      // Upsert stats
      for (const [flagName, dateMap] of statsMap) {
        for (const [dateKey, stats] of dateMap) {
          await collection.updateOne(
            { flagName, date: new Date(dateKey) },
            { $set: stats },
            { upsert: true }
          );
        }
      }
    } catch (error) {
      logger.error({ error }, '[FeatureFlagAnalytics] Failed to update usage stats');
    }
  }

  /**
   * Get flag check history
   */
  async getCheckHistory(
    flagName?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<FlagCheckRecord[]> {
    try {
      const db = getDB();
      const collection = db.collection<FlagCheckRecord>(COLLECTION_FLAG_CHECKS);

      const query: Filter<FlagCheckRecord> = {};
      if (flagName) {
        query.flagName = flagName;
      }
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = startDate;
        }
        if (endDate) {
          query.timestamp.$lte = endDate;
        }
      }

      return await collection
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to get check history');
      return [];
    }
  }

  /**
   * Get the most recent change for a flag (for rollback)
   */
  async getLastChange(flagName: string): Promise<FlagChangeRecord | null> {
    try {
      const db = getDB();
      const collection = db.collection<FlagChangeRecord>(COLLECTION_FLAG_CHANGES);

      const change = await collection
        .findOne(
          { flagName },
          { sort: { changedAt: -1 } }
        );

      return change || null;
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to get last change');
      return null;
    }
  }

  /**
   * Get flag change history
   */
  async getChangeHistory(
    flagName?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<FlagChangeRecord[]> {
    try {
      const db = getDB();
      const collection = db.collection<FlagChangeRecord>(COLLECTION_FLAG_CHANGES);

      const query: Filter<FlagChangeRecord> = {};
      if (flagName) {
        query.flagName = flagName;
      }
      if (startDate || endDate) {
        query.changedAt = {};
        if (startDate) {
          query.changedAt.$gte = startDate;
        }
        if (endDate) {
          query.changedAt.$lte = endDate;
        }
      }

      return await collection
        .find(query)
        .sort({ changedAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to get change history');
      return [];
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(
    flagName?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<FlagUsageStats[]> {
    try {
      const db = getDB();
      const collection = db.collection<FlagUsageStats>(COLLECTION_FLAG_USAGE_STATS);

      const query: Filter<FlagUsageStats> = {};
      if (flagName) {
        query.flagName = flagName;
      }
      if (startDate || endDate) {
        query.date = {};
        if (startDate) {
          query.date.$gte = startDate;
        }
        if (endDate) {
          query.date.$lte = endDate;
        }
      }

      return await collection
        .find(query)
        .sort({ date: -1 })
        .toArray();
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to get usage stats');
      return [];
    }
  }

  /**
   * Get flag health metrics
   */
  async getFlagHealthMetrics(flagName: string, days: number = 30): Promise<FlagHealthMetrics | null> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [stats, changes] = await Promise.all([
        this.getUsageStats(flagName, startDate, endDate),
        this.getChangeHistory(flagName, startDate, endDate),
      ]);

      if (stats.length === 0) {
        return {
          flagName,
          isUsed: false,
          totalChecks: 0,
          avgLatencyMs: 0,
          changeCount: changes.length,
          lastChangedAt: changes[0]?.changedAt,
          usageTrend: 'stable',
        };
      }

      const totalChecks = stats.reduce((sum, s) => sum + s.totalChecks, 0);
      const totalLatency = stats.reduce((sum, s) => sum + s.avgLatencyMs * s.totalChecks, 0);
      const avgLatencyMs = totalChecks > 0 ? totalLatency / totalChecks : 0;

      const lastCheckedAt = stats.reduce((latest, s) => {
        if (!s.lastCheckedAt) return latest;
        return !latest || s.lastCheckedAt > latest ? s.lastCheckedAt : latest;
      }, undefined as Date | undefined);

      // Determine usage trend
      const sortedStats = stats.sort((a, b) => a.date.getTime() - b.date.getTime());
      const firstHalf = sortedStats.slice(0, Math.floor(sortedStats.length / 2));
      const secondHalf = sortedStats.slice(Math.floor(sortedStats.length / 2));

      const firstHalfChecks = firstHalf.reduce((sum, s) => sum + s.totalChecks, 0);
      const secondHalfChecks = secondHalf.reduce((sum, s) => sum + s.totalChecks, 0);

      let usageTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (secondHalfChecks > firstHalfChecks * 1.1) {
        usageTrend = 'increasing';
      } else if (secondHalfChecks < firstHalfChecks * 0.9) {
        usageTrend = 'decreasing';
      }

      return {
        flagName,
        isUsed: totalChecks > 0,
        lastCheckedAt,
        totalChecks,
        avgLatencyMs,
        changeCount: changes.length,
        lastChangedAt: changes[0]?.changedAt,
        usageTrend,
      };
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to get flag health metrics');
      return null;
    }
  }

  /**
   * Get unused flags (flags that haven't been checked in the last N days)
   */
  async getUnusedFlags(days: number = 30): Promise<string[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const db = getDB();
      const collection = db.collection<FlagUsageStats>(COLLECTION_FLAG_USAGE_STATS);

      // Get all flags that have been checked
      const usedFlags = await collection
        .distinct('flagName', {
          lastCheckedAt: { $gte: cutoffDate },
        });

      // Get all flags from FeatureFlag model
      const allFlags = await db
        .collection('feature_flags')
        .distinct('name');

      // Find flags that are not in the used flags list
      const unusedFlags = allFlags.filter(flag => !usedFlags.includes(flag));

      return unusedFlags;
    } catch (error) {
      logger.error({ error }, '[FeatureFlagAnalytics] Failed to get unused flags');
      return [];
    }
  }

  /**
   * Get flag impact analysis (which services/workflows use which flags)
   */
  async getFlagImpactAnalysis(flagName: string, days: number = 30): Promise<{
    services: Record<string, number>;
    workflows: Record<string, number>;
    users: Record<string, number>;
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const checks = await this.getCheckHistory(flagName, startDate, endDate, 10000);

      const services: Record<string, number> = {};
      const workflows: Record<string, number> = {};
      const users: Record<string, number> = {};

      for (const check of checks) {
        if (check.service) {
          services[check.service] = (services[check.service] || 0) + 1;
        }
        if (check.workflow) {
          workflows[check.workflow] = (workflows[check.workflow] || 0) + 1;
        }
        if (check.userId) {
          users[check.userId] = (users[check.userId] || 0) + 1;
        }
      }

      return { services, workflows, users };
    } catch (error) {
      logger.error({ error, flagName }, '[FeatureFlagAnalytics] Failed to get flag impact analysis');
      return { services: {}, workflows: {}, users: {} };
    }
  }

  /**
   * Generate usage report
   */
  async generateUsageReport(
    startDate: Date,
    endDate: Date,
    flagNames?: string[]
  ): Promise<{
    period: { start: Date; end: Date };
    flags: Array<{
      flagName: string;
      totalChecks: number;
      enabledChecks: number;
      disabledChecks: number;
      avgLatencyMs: number;
      changeCount: number;
    }>;
    summary: {
      totalFlags: number;
      totalChecks: number;
      avgLatencyMs: number;
      totalChanges: number;
    };
  }> {
    try {
      const stats = await this.getUsageStats(undefined, startDate, endDate);
      const changes = await this.getChangeHistory(undefined, startDate, endDate);

      const filteredStats = flagNames
        ? stats.filter(s => flagNames.includes(s.flagName))
        : stats;

      const flagMap = new Map<string, {
        flagName: string;
        totalChecks: number;
        enabledChecks: number;
        disabledChecks: number;
        avgLatencyMs: number;
        changeCount: number;
      }>();

      for (const stat of filteredStats) {
        if (!flagMap.has(stat.flagName)) {
          flagMap.set(stat.flagName, {
            flagName: stat.flagName,
            totalChecks: 0,
            enabledChecks: 0,
            disabledChecks: 0,
            avgLatencyMs: 0,
            changeCount: 0,
          });
        }

        const entry = flagMap.get(stat.flagName)!;
        entry.totalChecks += stat.totalChecks;
        entry.enabledChecks += stat.enabledChecks;
        entry.disabledChecks += stat.disabledChecks;
        entry.avgLatencyMs = (entry.avgLatencyMs * (entry.totalChecks - stat.totalChecks) + stat.avgLatencyMs * stat.totalChecks) / entry.totalChecks;
      }

      for (const change of changes) {
        if (!flagNames || flagNames.includes(change.flagName)) {
          if (!flagMap.has(change.flagName)) {
            flagMap.set(change.flagName, {
              flagName: change.flagName,
              totalChecks: 0,
              enabledChecks: 0,
              disabledChecks: 0,
              avgLatencyMs: 0,
              changeCount: 0,
            });
          }
          flagMap.get(change.flagName)!.changeCount++;
        }
      }

      const flags = Array.from(flagMap.values());
      const totalChecks = flags.reduce((sum, f) => sum + f.totalChecks, 0);
      const totalLatency = flags.reduce((sum, f) => sum + f.avgLatencyMs * f.totalChecks, 0);
      const avgLatencyMs = totalChecks > 0 ? totalLatency / totalChecks : 0;
      const totalChanges = flags.reduce((sum, f) => sum + f.changeCount, 0);

      return {
        period: { start: startDate, end: endDate },
        flags,
        summary: {
          totalFlags: flags.length,
          totalChecks,
          avgLatencyMs,
          totalChanges,
        },
      };
    } catch (error) {
      logger.error({ error }, '[FeatureFlagAnalytics] Failed to generate usage report');
      throw error;
    }
  }
}

// Singleton instance
let analyticsServiceInstance: FeatureFlagAnalyticsService | null = null;

/**
 * Get the singleton instance of FeatureFlagAnalyticsService
 */
export function getFeatureFlagAnalyticsService(): FeatureFlagAnalyticsService {
  if (!analyticsServiceInstance) {
    analyticsServiceInstance = new FeatureFlagAnalyticsService();
  }
  return analyticsServiceInstance;
}

