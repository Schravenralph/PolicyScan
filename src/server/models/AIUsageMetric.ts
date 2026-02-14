import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';

const COLLECTION_NAME = 'ai_usage_metrics';

export interface AIUsageMetricDocument {
  _id?: ObjectId;
  provider: 'openai' | 'anthropic' | 'local' | 'other';
  model: string;
  operation: string; // e.g., 'generate', 'embed', 'label', 'answer'
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number; // Estimated cost in USD
  cacheHit: boolean; // Whether this was served from cache
  duration: number; // Duration in milliseconds
  success: boolean;
  error?: string;
  timestamp: Date;
  userId?: ObjectId;
  requestId?: string;
  metadata?: {
    endpoint?: string;
    queryId?: ObjectId;
    workflowId?: string;
    [key: string]: unknown;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AIUsageMetricCreateInput {
  provider: 'openai' | 'anthropic' | 'local' | 'other';
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  cacheHit: boolean;
  duration: number;
  success: boolean;
  error?: string;
  timestamp?: Date;
  userId?: ObjectId;
  requestId?: string;
  metadata?: {
    endpoint?: string;
    queryId?: ObjectId;
    workflowId?: string;
    [key: string]: unknown;
  };
}

export interface AIUsageStats {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  averageDuration: number;
  errorRate: number;
  callsByProvider: Record<string, number>;
  callsByModel: Record<string, number>;
  callsByOperation: Record<string, number>;
  tokensByProvider: Record<string, number>;
  costByProvider: Record<string, number>;
}

export class AIUsageMetric {
  /**
   * Create a new AI usage metric
   */
  static async create(input: AIUsageMetricCreateInput): Promise<AIUsageMetricDocument> {
    const db = await getDB();
    const collection = db.collection<AIUsageMetricDocument>(COLLECTION_NAME);
    
    const now = new Date();
    const document: AIUsageMetricDocument = {
      ...input,
      timestamp: input.timestamp ?? now,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  /**
   * Get metrics for a time range
   */
  static async getMetrics(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
      userId?: ObjectId;
    }
  ): Promise<AIUsageMetricDocument[]> {
    const db = await getDB();
    const collection = db.collection<AIUsageMetricDocument>(COLLECTION_NAME);

    const query: Filter<AIUsageMetricDocument> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (filters?.provider) {
      query.provider = filters.provider as 'openai' | 'anthropic' | 'local' | 'other';
    }
    if (filters?.model) {
      query.model = filters.model;
    }
    if (filters?.operation) {
      query.operation = filters.operation;
    }
    if (filters?.userId) {
      query.userId = filters.userId;
    }

    // Limit to prevent memory exhaustion when loading large datasets
    // Default limit: 10000 metrics, configurable via environment variable
    const MAX_AI_USAGE_METRICS = parseInt(process.env.MAX_AI_USAGE_METRICS || '10000', 10);

    const results = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(MAX_AI_USAGE_METRICS)
      .toArray();

    if (results.length === MAX_AI_USAGE_METRICS) {
      console.warn(
        `[AIUsageMetric] getMetrics() query may have been truncated at ${MAX_AI_USAGE_METRICS} entries. ` +
        `Consider narrowing the date range or increasing MAX_AI_USAGE_METRICS.`
      );
    }

    return results;
  }

  /**
   * Get aggregated statistics for a time range
   */
  static async getStats(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
      userId?: ObjectId;
    }
  ): Promise<AIUsageStats> {
    const db = await getDB();
    const collection = db.collection<AIUsageMetricDocument>(COLLECTION_NAME);

    const query: Filter<AIUsageMetricDocument> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (filters?.provider) {
      query.provider = filters.provider as 'openai' | 'anthropic' | 'local' | 'other';
    }
    if (filters?.model) {
      query.model = filters.model;
    }
    if (filters?.operation) {
      query.operation = filters.operation;
    }
    if (filters?.userId) {
      query.userId = filters.userId;
    }

    // Limit to prevent memory exhaustion when calculating statistics
    // Default limit: 50000 metrics for stats calculation (higher than getMetrics since this is for aggregation)
    // Configurable via environment variable
    const MAX_AI_USAGE_STATS = parseInt(process.env.MAX_AI_USAGE_STATS || '50000', 10);

    const metrics = await collection
      .find(query)
      .limit(MAX_AI_USAGE_STATS)
      .toArray();

    if (metrics.length === MAX_AI_USAGE_STATS) {
      console.warn(
        `[AIUsageMetric] getStats() query may have been truncated at ${MAX_AI_USAGE_STATS} entries. ` +
        `Statistics may be incomplete. Consider narrowing the date range or increasing MAX_AI_USAGE_STATS.`
      );
    }

    const stats: AIUsageStats = {
      totalCalls: metrics.length,
      totalTokens: 0,
      totalCost: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      averageDuration: 0,
      errorRate: 0,
      callsByProvider: {},
      callsByModel: {},
      callsByOperation: {},
      tokensByProvider: {},
      costByProvider: {},
    };

    let totalDuration = 0;
    let errorCount = 0;

    for (const metric of metrics) {
      stats.totalTokens += metric.totalTokens;
      if (metric.cost) {
        stats.totalCost += metric.cost;
      }
      if (metric.cacheHit) {
        stats.cacheHits++;
      } else {
        stats.cacheMisses++;
      }
      totalDuration += metric.duration;
      if (!metric.success) {
        errorCount++;
      }

      // Aggregate by provider
      stats.callsByProvider[metric.provider] = (stats.callsByProvider[metric.provider] || 0) + 1;
      stats.tokensByProvider[metric.provider] = (stats.tokensByProvider[metric.provider] || 0) + metric.totalTokens;
      if (metric.cost) {
        stats.costByProvider[metric.provider] = (stats.costByProvider[metric.provider] || 0) + metric.cost;
      }

      // Aggregate by model
      stats.callsByModel[metric.model] = (stats.callsByModel[metric.model] || 0) + 1;

      // Aggregate by operation
      stats.callsByOperation[metric.operation] = (stats.callsByOperation[metric.operation] || 0) + 1;
    }

    if (metrics.length > 0) {
      stats.cacheHitRate = stats.cacheHits / metrics.length;
      stats.averageDuration = totalDuration / metrics.length;
      stats.errorRate = errorCount / metrics.length;
    }

    return stats;
  }

  /**
   * Get daily metrics for a time range
   */
  static async getDailyMetrics(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
    }
  ): Promise<Array<{
    date: string;
    calls: number;
    tokens: number;
    cost: number;
    cacheHits: number;
    cacheMisses: number;
    errors: number;
  }>> {
    const db = await getDB();
    const collection = db.collection<AIUsageMetricDocument>(COLLECTION_NAME);

    const query: Filter<AIUsageMetricDocument> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (filters?.provider) {
      query.provider = filters.provider as 'openai' | 'anthropic' | 'local' | 'other';
    }
    if (filters?.model) {
      query.model = filters.model;
    }
    if (filters?.operation) {
      query.operation = filters.operation;
    }

    // Limit to prevent memory exhaustion when calculating daily metrics
    // Default limit: 50000 metrics for daily aggregation (higher since we group by date)
    // Configurable via environment variable
    const MAX_AI_USAGE_DAILY = parseInt(process.env.MAX_AI_USAGE_DAILY || '50000', 10);

    const metrics = await collection
      .find(query)
      .limit(MAX_AI_USAGE_DAILY)
      .toArray();

    if (metrics.length === MAX_AI_USAGE_DAILY) {
      console.warn(
        `[AIUsageMetric] getDailyMetrics() query may have been truncated at ${MAX_AI_USAGE_DAILY} entries. ` +
        `Daily metrics may be incomplete. Consider narrowing the date range or increasing MAX_AI_USAGE_DAILY.`
      );
    }

    // Group by date
    const dailyMap = new Map<string, {
      calls: number;
      tokens: number;
      cost: number;
      cacheHits: number;
      cacheMisses: number;
      errors: number;
    }>();

    for (const metric of metrics) {
      const dateKey = metric.timestamp.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || {
        calls: 0,
        tokens: 0,
        cost: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
      };

      existing.calls++;
      existing.tokens += metric.totalTokens;
      if (metric.cost) {
        existing.cost += metric.cost;
      }
      if (metric.cacheHit) {
        existing.cacheHits++;
      } else {
        existing.cacheMisses++;
      }
      if (!metric.success) {
        existing.errors++;
      }

      dailyMap.set(dateKey, existing);
    }

    // Convert to array and sort by date
    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Clean up old metrics (retention policy)
   */
  static async cleanupOldMetrics(retentionDays: number = 90): Promise<number> {
    const db = await getDB();
    const collection = db.collection<AIUsageMetricDocument>(COLLECTION_NAME);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    return result.deletedCount;
  }
}

