/**
 * Sustainability Metrics Service
 * 
 * Aggregates sustainability metrics from AI usage monitoring and caching infrastructure.
 * Calculates CO2 savings, energy cost savings, and other sustainability KPIs.
 */

import { aiUsageMonitoringService } from '../monitoring/AIUsageMonitoringService.js';
import { logger } from '../../utils/logger.js';

// Carbon footprint per 1K tokens (kg CO2 equivalent)
// Same constant as in AIUsageMonitoringService for consistency
const CARBON_FOOTPRINT_PER_1K_TOKENS = 0.0015; // kg CO2

// Energy cost per kWh (USD) - average US electricity price
const ENERGY_COST_PER_KWH = 0.12; // USD

// Estimated energy consumption per 1K tokens (kWh)
// Based on research: ~0.001 kWh per 1K tokens for GPT models
const ENERGY_CONSUMPTION_PER_1K_TOKENS = 0.001; // kWh

export interface SustainabilityMetrics {
  // Time period
  startDate: Date;
  endDate: Date;
  
  // AI API calls avoided through caching
  apiCallsAvoided: number;
  
  // CO2 savings (kg CO2 equivalent)
  co2Savings: number;
  
  // Energy cost savings (USD)
  energyCostSavings: number;
  
  // Cache effectiveness
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
  totalCacheRequests: number;
  
  // Cost savings from caching (USD)
  costSavings: number;
  
  // Total AI API calls (including cached)
  totalAPICalls: number;
  
  // Total tokens processed
  totalTokens: number;
  
  // Total CO2 emitted (for non-cached calls)
  totalCO2Emitted: number;
  
  // Total cost (for non-cached calls)
  totalCost: number;
  
  // Text reuse statistics (if available)
  textReuseStats?: {
    totalReused: number;
    reuseRate: number;
  };
}

export interface SustainabilityKPI {
  name: string;
  value: number;
  unit: string;
  target?: number;
  trend?: 'up' | 'down' | 'stable';
  description: string;
}

export interface BaselineComparison {
  period: string;
  current: SustainabilityMetrics;
  baseline: SustainabilityMetrics;
  improvement: {
    co2SavingsIncrease: number; // Percentage
    costSavingsIncrease: number; // Percentage
    cacheHitRateIncrease: number; // Percentage
  };
}

export class SustainabilityMetricsService {
  /**
   * Get sustainability metrics for a time period
   */
  async getMetrics(
    startDate: Date,
    endDate: Date,
    filters?: {
      provider?: string;
      model?: string;
      operation?: string;
    }
  ): Promise<SustainabilityMetrics> {
    try {
      // Get AI usage stats
      const stats = await aiUsageMonitoringService.getStats(startDate, endDate, filters);
      
      // Get cache stats
      const cacheStats = await aiUsageMonitoringService.getCacheStats(startDate, endDate, filters);
      
      // Handle case when there's no data
      if (stats.totalCalls === 0) {
        return {
          startDate,
          endDate,
          apiCallsAvoided: 0,
          co2Savings: 0,
          energyCostSavings: 0,
          cacheHitRate: 0,
          cacheHits: 0,
          cacheMisses: 0,
          totalCacheRequests: 0,
          costSavings: 0,
          totalAPICalls: 0,
          totalTokens: 0,
          totalCO2Emitted: 0,
          totalCost: 0,
        };
      }
      
      // Calculate CO2 savings from cached calls
      // Each cached call avoided CO2 emission
      const co2SavingsPerCall = (stats.totalTokens / stats.totalCalls) / 1000 * CARBON_FOOTPRINT_PER_1K_TOKENS;
      const co2Savings = cacheStats.hits * co2SavingsPerCall;
      
      // Calculate energy cost savings
      const energySavingsPerCall = (stats.totalTokens / stats.totalCalls) / 1000 * ENERGY_CONSUMPTION_PER_1K_TOKENS;
      const energyCostSavings = cacheStats.hits * energySavingsPerCall * ENERGY_COST_PER_KWH;
      
      // Calculate total CO2 emitted (for non-cached calls only)
      const totalCO2Emitted = (cacheStats.misses * co2SavingsPerCall);
      
      return {
        startDate,
        endDate,
        apiCallsAvoided: cacheStats.hits,
        co2Savings,
        energyCostSavings,
        cacheHitRate: cacheStats.hitRate,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        totalCacheRequests: cacheStats.total,
        costSavings: cacheStats.costSavings,
        totalAPICalls: stats.totalCalls,
        totalTokens: stats.totalTokens,
        totalCO2Emitted,
        totalCost: stats.totalCost - cacheStats.costSavings,
      };
    } catch (error) {
      logger.error({ error, startDate, endDate, filters }, 'Error getting sustainability metrics');
      throw error;
    }
  }

  /**
   * Get sustainability KPIs
   */
  async getKPIs(
    startDate: Date,
    endDate: Date,
    baselineStartDate?: Date,
    baselineEndDate?: Date
  ): Promise<SustainabilityKPI[]> {
    const metrics = await this.getMetrics(startDate, endDate);
    const kpis: SustainabilityKPI[] = [];

    // CO2 Savings KPI
    kpis.push({
      name: 'CO2 Savings',
      value: metrics.co2Savings,
      unit: 'kg CO2',
      description: 'Total CO2 emissions avoided through caching',
      trend: 'up',
    });

    // Cost Savings KPI
    kpis.push({
      name: 'Cost Savings',
      value: metrics.costSavings,
      unit: 'USD',
      description: 'Total cost savings from caching',
      trend: 'up',
    });

    // Cache Hit Rate KPI
    kpis.push({
      name: 'Cache Hit Rate',
      value: metrics.cacheHitRate * 100,
      unit: '%',
      target: 70, // Target: 70% cache hit rate
      description: 'Percentage of API calls served from cache',
      trend: metrics.cacheHitRate >= 0.7 ? 'up' : 'down',
    });

    // API Calls Avoided KPI
    kpis.push({
      name: 'API Calls Avoided',
      value: metrics.apiCallsAvoided,
      unit: 'calls',
      description: 'Total number of API calls avoided through caching',
      trend: 'up',
    });

    // Energy Cost Savings KPI
    kpis.push({
      name: 'Energy Cost Savings',
      value: metrics.energyCostSavings,
      unit: 'USD',
      description: 'Estimated energy cost savings from reduced API calls',
      trend: 'up',
    });

    // If baseline is provided, calculate improvements
    if (baselineStartDate && baselineEndDate) {
      const baselineMetrics = await this.getMetrics(baselineStartDate, baselineEndDate);
      
      const co2Improvement = baselineMetrics.co2Savings > 0
        ? ((metrics.co2Savings - baselineMetrics.co2Savings) / baselineMetrics.co2Savings) * 100
        : 0;
      
      const costImprovement = baselineMetrics.costSavings > 0
        ? ((metrics.costSavings - baselineMetrics.costSavings) / baselineMetrics.costSavings) * 100
        : 0;
      
      const cacheHitRateImprovement = baselineMetrics.cacheHitRate > 0
        ? ((metrics.cacheHitRate - baselineMetrics.cacheHitRate) / baselineMetrics.cacheHitRate) * 100
        : 0;

      kpis.push({
        name: 'CO2 Savings Improvement',
        value: co2Improvement,
        unit: '%',
        description: 'Improvement in CO2 savings compared to baseline period',
        trend: co2Improvement > 0 ? 'up' : 'down',
      });

      kpis.push({
        name: 'Cost Savings Improvement',
        value: costImprovement,
        unit: '%',
        description: 'Improvement in cost savings compared to baseline period',
        trend: costImprovement > 0 ? 'up' : 'down',
      });

      kpis.push({
        name: 'Cache Hit Rate Improvement',
        value: cacheHitRateImprovement,
        unit: '%',
        description: 'Improvement in cache hit rate compared to baseline period',
        trend: cacheHitRateImprovement > 0 ? 'up' : 'down',
      });
    }

    return kpis;
  }

  /**
   * Compare current metrics with baseline period
   */
  async compareWithBaseline(
    currentStartDate: Date,
    currentEndDate: Date,
    baselineStartDate: Date,
    baselineEndDate: Date
  ): Promise<BaselineComparison> {
    const currentMetrics = await this.getMetrics(currentStartDate, currentEndDate);
    const baselineMetrics = await this.getMetrics(baselineStartDate, baselineEndDate);

    const co2SavingsIncrease = baselineMetrics.co2Savings > 0
      ? ((currentMetrics.co2Savings - baselineMetrics.co2Savings) / baselineMetrics.co2Savings) * 100
      : 0;

    const costSavingsIncrease = baselineMetrics.costSavings > 0
      ? ((currentMetrics.costSavings - baselineMetrics.costSavings) / baselineMetrics.costSavings) * 100
      : 0;

    const cacheHitRateIncrease = baselineMetrics.cacheHitRate > 0
      ? ((currentMetrics.cacheHitRate - baselineMetrics.cacheHitRate) / baselineMetrics.cacheHitRate) * 100
      : 0;

    return {
      period: `${baselineStartDate.toISOString().split('T')[0]} to ${baselineEndDate.toISOString().split('T')[0]}`,
      current: currentMetrics,
      baseline: baselineMetrics,
      improvement: {
        co2SavingsIncrease,
        costSavingsIncrease,
        cacheHitRateIncrease,
      },
    };
  }

  /**
   * Get monthly sustainability metrics
   */
  async getMonthlyMetrics(year: number, month: number): Promise<SustainabilityMetrics> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    return this.getMetrics(startDate, endDate);
  }

  /**
   * Get quarterly sustainability metrics
   */
  async getQuarterlyMetrics(year: number, quarter: 1 | 2 | 3 | 4): Promise<SustainabilityMetrics> {
    const startMonth = (quarter - 1) * 3 + 1;
    const startDate = new Date(year, startMonth - 1, 1);
    const endMonth = startMonth + 2;
    const endDate = new Date(year, endMonth, 0, 23, 59, 59, 999);
    return this.getMetrics(startDate, endDate);
  }
}

// Singleton instance
export const sustainabilityMetricsService = new SustainabilityMetricsService();


