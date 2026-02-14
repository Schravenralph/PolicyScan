/**
 * AI Usage Monitoring Service
 * 
 * Tracks AI API calls, cache hit rates, costs, and energy metrics.
 * Provides analytics and alerting for AI usage patterns.
 */

import { AIUsageMetric, type AIUsageMetricCreateInput, type AIUsageStats } from '../../models/AIUsageMetric.js';
import { logger } from '../../utils/logger.js';
import { ObjectId } from 'mongodb';

// Cost per 1K tokens for different models (USD)
// Source: OpenAI pricing as of 2025-01-28
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'text-embedding-ada-002': { input: 0.0001, output: 0 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },
  'text-embedding-3-large': { input: 0.00013, output: 0 },
};

// Carbon footprint per 1K tokens (kg CO2 equivalent)
// Estimates based on research: ~0.001-0.002 kg CO2 per 1K tokens for GPT models
const CARBON_FOOTPRINT_PER_1K_TOKENS = 0.0015; // kg CO2

// Default alert thresholds
const DEFAULT_ALERT_THRESHOLDS = {
  dailyCallSpike: 1.5, // 150% increase triggers alert
  dailyCostSpike: 1.5, // 150% increase triggers alert
  dailyTokenSpike: 1.5, // 150% increase triggers alert
  cacheHitRateLow: 0.3, // Alert if cache hit rate drops below 30%
};

export interface AIUsageAlert {
  type: 'spike' | 'low_cache_hit_rate' | 'high_error_rate' | 'cost_threshold';
  severity: 'warning' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export interface CarbonFootprintEstimate {
  totalCO2: number; // kg CO2
  totalTokens: number;
  averageCO2Per1KTokens: number;
  breakdownByProvider: Record<string, number>;
}

export class AIUsageMonitoringService {
  private alertThresholds: typeof DEFAULT_ALERT_THRESHOLDS;
  private alertCallbacks: Array<(alert: AIUsageAlert) => void> = [];

  constructor(alertThresholds?: Partial<typeof DEFAULT_ALERT_THRESHOLDS>) {
    this.alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...alertThresholds };
  }

  /**
   * Record an AI API call
   */
  async recordAPICall(input: {
    provider: 'openai' | 'anthropic' | 'local' | 'other';
    model: string;
    operation: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cacheHit: boolean;
    duration: number;
    success: boolean;
    error?: string;
    userId?: ObjectId;
    requestId?: string;
    metadata?: {
      endpoint?: string;
      queryId?: ObjectId;
      workflowId?: string;
      [key: string]: unknown;
    };
  }): Promise<void> {
    try {
      const cost = this.calculateCost(input.provider, input.model, input.promptTokens, input.completionTokens);

      const metricInput: AIUsageMetricCreateInput = {
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        cost,
        cacheHit: input.cacheHit,
        duration: input.duration,
        success: input.success,
        error: input.error,
        userId: input.userId,
        requestId: input.requestId,
        metadata: input.metadata,
      };

      await AIUsageMetric.create(metricInput);

      // Check for alerts asynchronously (don't block the API call)
      this.checkAlerts(input).catch((error) => {
        logger.warn({ error }, 'Error checking alerts for AI usage');
      });
    } catch (error) {
      logger.error({ error }, 'Error recording AI API call');
      // Don't throw - monitoring should not break the application
    }
  }

  /**
   * Calculate cost for an API call
   */
  private calculateCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    if (provider !== 'openai') {
      // Only OpenAI pricing is implemented for now
      return 0;
    }

    const costs = MODEL_COSTS[model];
    if (!costs) {
      // Unknown model, use gpt-4o-mini as default
      const defaultCosts = MODEL_COSTS['gpt-4o-mini'];
      return (promptTokens / 1000) * defaultCosts.input + (completionTokens / 1000) * defaultCosts.output;
    }

    return (promptTokens / 1000) * costs.input + (completionTokens / 1000) * costs.output;
  }

  /**
   * Get statistics for a time range
   */
  async getStats(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
      userId?: ObjectId;
    }
  ): Promise<AIUsageStats> {
    return AIUsageMetric.getStats(startDate, endDate, filters);
  }

  /**
   * Get daily metrics for a time range
   */
  async getDailyMetrics(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
    }
  ) {
    return AIUsageMetric.getDailyMetrics(startDate, endDate, filters);
  }

  /**
   * Calculate carbon footprint estimate
   */
  async getCarbonFootprint(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
    }
  ): Promise<CarbonFootprintEstimate> {
    const stats = await this.getStats(startDate, endDate, filters);

    const totalCO2 = (stats.totalTokens / 1000) * CARBON_FOOTPRINT_PER_1K_TOKENS;

    // Calculate breakdown by provider
    const breakdownByProvider: Record<string, number> = {};
    for (const [provider, tokens] of Object.entries(stats.tokensByProvider)) {
      breakdownByProvider[provider] = (tokens / 1000) * CARBON_FOOTPRINT_PER_1K_TOKENS;
    }

    return {
      totalCO2,
      totalTokens: stats.totalTokens,
      averageCO2Per1KTokens: CARBON_FOOTPRINT_PER_1K_TOKENS,
      breakdownByProvider,
    };
  }

  /**
   * Get cache hit/miss ratios
   */
  async getCacheStats(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
    }
  ): Promise<{
    hitRate: number;
    hits: number;
    misses: number;
    total: number;
    costSavings: number; // Estimated cost savings from caching
  }> {
    const stats = await this.getStats(startDate, endDate, filters);

    // Estimate cost savings: assume cached calls would have cost the same as non-cached
    // This is a simplification - in reality, cached calls might use different models
    const averageCostPerCall = stats.totalCalls > 0 ? stats.totalCost / stats.totalCalls : 0;
    const costSavings = stats.cacheHits * averageCostPerCall;

    return {
      hitRate: stats.cacheHitRate,
      hits: stats.cacheHits,
      misses: stats.cacheMisses,
      total: stats.totalCalls,
      costSavings,
    };
  }

  /**
   * Check for alerts based on usage patterns
   */
  private async checkAlerts(input: {
    provider: string;
    model: string;
    operation: string;
    totalTokens: number;
    cacheHit: boolean;
    success: boolean;
  }): Promise<void> {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date(now);
    dayBefore.setDate(dayBefore.getDate() - 2);

    // Get yesterday's stats
    const yesterdayStats = await this.getStats(yesterday, now);
    const dayBeforeStats = await this.getStats(dayBefore, yesterday);

    const alerts: AIUsageAlert[] = [];

    // Check for call spike
    if (dayBeforeStats.totalCalls > 0) {
      const callIncrease = (yesterdayStats.totalCalls - dayBeforeStats.totalCalls) / dayBeforeStats.totalCalls;
      if (callIncrease >= this.alertThresholds.dailyCallSpike) {
        alerts.push({
          type: 'spike',
          severity: callIncrease >= 2 ? 'critical' : 'warning',
          message: `AI API calls increased by ${(callIncrease * 100).toFixed(1)}%`,
          metric: 'calls',
          value: yesterdayStats.totalCalls,
          threshold: dayBeforeStats.totalCalls * (1 + this.alertThresholds.dailyCallSpike),
          timestamp: now,
        });
      }
    }

    // Check for cost spike
    if (dayBeforeStats.totalCost > 0) {
      const costIncrease = (yesterdayStats.totalCost - dayBeforeStats.totalCost) / dayBeforeStats.totalCost;
      if (costIncrease >= this.alertThresholds.dailyCostSpike) {
        alerts.push({
          type: 'spike',
          severity: costIncrease >= 2 ? 'critical' : 'warning',
          message: `AI API costs increased by ${(costIncrease * 100).toFixed(1)}%`,
          metric: 'cost',
          value: yesterdayStats.totalCost,
          threshold: dayBeforeStats.totalCost * (1 + this.alertThresholds.dailyCostSpike),
          timestamp: now,
        });
      }
    }

    // Check for low cache hit rate
    if (yesterdayStats.totalCalls > 10 && yesterdayStats.cacheHitRate < this.alertThresholds.cacheHitRateLow) {
      alerts.push({
        type: 'low_cache_hit_rate',
        severity: 'warning',
        message: `Cache hit rate is low: ${(yesterdayStats.cacheHitRate * 100).toFixed(1)}%`,
        metric: 'cache_hit_rate',
        value: yesterdayStats.cacheHitRate,
        threshold: this.alertThresholds.cacheHitRateLow,
        timestamp: now,
      });
    }

    // Check for high error rate
    if (yesterdayStats.totalCalls > 10 && yesterdayStats.errorRate > 0.1) {
      alerts.push({
        type: 'high_error_rate',
        severity: yesterdayStats.errorRate > 0.2 ? 'critical' : 'warning',
        message: `Error rate is high: ${(yesterdayStats.errorRate * 100).toFixed(1)}%`,
        metric: 'error_rate',
        value: yesterdayStats.errorRate,
        threshold: 0.1,
        timestamp: now,
      });
    }

    // Trigger alert callbacks
    for (const alert of alerts) {
      for (const callback of this.alertCallbacks) {
        try {
          callback(alert);
        } catch (error) {
          logger.warn({ error, alert }, 'Error in alert callback');
        }
      }
    }
  }

  /**
   * Register an alert callback
   */
  onAlert(callback: (alert: AIUsageAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Clean up old metrics (retention policy)
   */
  async cleanupOldMetrics(retentionDays: number = 90): Promise<number> {
    return AIUsageMetric.cleanupOldMetrics(retentionDays);
  }
}

// Singleton instance
export const aiUsageMonitoringService = new AIUsageMonitoringService();

