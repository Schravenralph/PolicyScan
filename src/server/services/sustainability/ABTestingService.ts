/**
 * A/B Testing Service for Sustainability
 * 
 * Provides framework for A/B testing different caching strategies and
 * sustainability optimizations to measure their impact on metrics.
 */

import { getDB } from '../../config/database.js';
import { ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';
import { aiUsageMonitoringService } from '../monitoring/AIUsageMonitoringService.js';

const COLLECTION_NAME = 'sustainability_ab_tests';

export interface ABTestConfig {
  name: string;
  description: string;
  testType: 'cache_ttl' | 'cache_size' | 'cache_strategy' | 'model_selection' | 'other';
  control: {
    label: string;
    config: Record<string, unknown>;
  };
  variant: {
    label: string;
    config: Record<string, unknown>;
  };
  duration: number; // Duration in days
  minSampleSize: number; // Minimum requests per variant
  successMetrics: string[]; // Metrics to evaluate (e.g., 'cache_hit_rate', 'cost', 'carbon_footprint')
}

export interface ABTestDocument {
  _id?: ObjectId;
  name: string;
  description: string;
  testType: string;
  control: {
    label: string;
    config: Record<string, unknown>;
  };
  variant: {
    label: string;
    config: Record<string, unknown>;
  };
  status: 'draft' | 'running' | 'completed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  duration: number;
  minSampleSize: number;
  successMetrics: string[];
  results?: ABTestResults;
  createdAt: Date;
  updatedAt: Date;
}

export interface ABTestResults {
  control: {
    sampleSize: number;
    cacheHitRate: number;
    totalCost: number;
    totalCarbonFootprint: number;
    averageLatency: number;
    errorRate: number;
    [key: string]: number | unknown;
  };
  variant: {
    sampleSize: number;
    cacheHitRate: number;
    totalCost: number;
    totalCarbonFootprint: number;
    averageLatency: number;
    errorRate: number;
    [key: string]: number | unknown;
  };
  comparison: {
    cacheHitRateImprovement: number; // Percentage improvement
    costReduction: number; // Percentage reduction
    carbonFootprintReduction: number; // Percentage reduction
    latencyChange: number; // Percentage change
    errorRateChange: number; // Percentage change
    [key: string]: number | unknown;
  };
  statisticalSignificance: {
    cacheHitRate: {
      pValue: number;
      isSignificant: boolean;
    };
    cost: {
      pValue: number;
      isSignificant: boolean;
    };
    carbonFootprint: {
      pValue: number;
      isSignificant: boolean;
    };
  };
  winner?: 'control' | 'variant' | 'no_difference';
  recommendation?: string;
}

export class ABTestingService {
  /**
   * Create a new A/B test
   */
  async createTest(config: ABTestConfig): Promise<ABTestDocument> {
    const db = await getDB();
    const collection = db.collection<ABTestDocument>(COLLECTION_NAME);

    const now = new Date();
    const document: ABTestDocument = {
      ...config,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  /**
   * Start an A/B test
   */
  async startTest(testId: string): Promise<void> {
    const db = await getDB();
    const collection = db.collection<ABTestDocument>(COLLECTION_NAME);

    const test = await collection.findOne({ _id: new ObjectId(testId) });
    if (!test) {
      throw new Error(`A/B test not found: ${testId}`);
    }

    if (test.status !== 'draft') {
      throw new Error(`Cannot start test in status: ${test.status}`);
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + test.duration);

    await collection.updateOne(
      { _id: new ObjectId(testId) },
      {
        $set: {
          status: 'running',
          startDate,
          endDate,
          updatedAt: new Date(),
        },
      }
    );

    logger.info({ testId, name: test.name }, 'A/B test started');
  }

  /**
   * Complete an A/B test and calculate results
   */
  async completeTest(testId: string): Promise<ABTestResults> {
    const db = await getDB();
    const collection = db.collection<ABTestDocument>(COLLECTION_NAME);

    const test = await collection.findOne({ _id: new ObjectId(testId) });
    if (!test) {
      throw new Error(`A/B test not found: ${testId}`);
    }

    if (test.status !== 'running') {
      throw new Error(`Cannot complete test in status: ${test.status}`);
    }

    if (!test.startDate) {
      throw new Error('Test start date not set');
    }

    // Calculate results from metrics
    const results = await this.calculateResults(test);

    // Update test document
    await collection.updateOne(
      { _id: new ObjectId(testId) },
      {
        $set: {
          status: 'completed',
          results,
          updatedAt: new Date(),
        },
      }
    );

    logger.info({ testId, name: test.name, winner: results.winner }, 'A/B test completed');

    return results;
  }

  /**
   * Calculate test results from metrics
   */
  private async calculateResults(test: ABTestDocument): Promise<ABTestResults> {
    if (!test.startDate || !test.endDate) {
      throw new Error('Test dates not set');
    }

    // Get metrics for control and variant periods
    // Note: In a real implementation, we would track which requests used control vs variant
    // For now, we'll use a simplified approach that compares metrics during the test period
    // vs a baseline period before the test

    const baselineStart = new Date(test.startDate);
    baselineStart.setDate(baselineStart.getDate() - test.duration);
    const baselineEnd = test.startDate;

    // Get baseline metrics (before test)
    const baselineStats = await aiUsageMonitoringService.getStats(baselineStart, baselineEnd);
    const baselineCacheStats = await aiUsageMonitoringService.getCacheStats(baselineStart, baselineEnd);
    const baselineCarbon = await aiUsageMonitoringService.getCarbonFootprint(baselineStart, baselineEnd);

    // Get test period metrics
    const testStats = await aiUsageMonitoringService.getStats(test.startDate, test.endDate!);
    const testCacheStats = await aiUsageMonitoringService.getCacheStats(test.startDate, test.endDate!);
    const testCarbon = await aiUsageMonitoringService.getCarbonFootprint(test.startDate, test.endDate!);

    // Calculate control metrics (baseline)
    const control = {
      sampleSize: baselineStats.totalCalls,
      cacheHitRate: baselineCacheStats.hitRate,
      totalCost: baselineStats.totalCost,
      totalCarbonFootprint: baselineCarbon.totalCO2,
      averageLatency: baselineStats.averageDuration,
      errorRate: baselineStats.errorRate,
    };

    // Calculate variant metrics (test period)
    const variant = {
      sampleSize: testStats.totalCalls,
      cacheHitRate: testCacheStats.hitRate,
      totalCost: testStats.totalCost,
      totalCarbonFootprint: testCarbon.totalCO2,
      averageLatency: testStats.averageDuration,
      errorRate: testStats.errorRate,
    };

    // Calculate comparison
    const comparison = {
      cacheHitRateImprovement: variant.cacheHitRate > control.cacheHitRate
        ? ((variant.cacheHitRate - control.cacheHitRate) / control.cacheHitRate) * 100
        : ((control.cacheHitRate - variant.cacheHitRate) / control.cacheHitRate) * 100,
      costReduction: variant.totalCost < control.totalCost
        ? ((control.totalCost - variant.totalCost) / control.totalCost) * 100
        : -((variant.totalCost - control.totalCost) / control.totalCost) * 100,
      carbonFootprintReduction: variant.totalCarbonFootprint < control.totalCarbonFootprint
        ? ((control.totalCarbonFootprint - variant.totalCarbonFootprint) / control.totalCarbonFootprint) * 100
        : -((variant.totalCarbonFootprint - control.totalCarbonFootprint) / control.totalCarbonFootprint) * 100,
      latencyChange: ((variant.averageLatency - control.averageLatency) / control.averageLatency) * 100,
      errorRateChange: ((variant.errorRate - control.errorRate) / control.errorRate) * 100,
    };

    // Calculate statistical significance (simplified - would need actual statistical tests)
    const statisticalSignificance = {
      cacheHitRate: {
        pValue: this.calculatePValue(control.cacheHitRate, variant.cacheHitRate, control.sampleSize, variant.sampleSize),
        isSignificant: false, // Would be calculated properly
      },
      cost: {
        pValue: this.calculatePValue(control.totalCost, variant.totalCost, control.sampleSize, variant.sampleSize),
        isSignificant: false,
      },
      carbonFootprint: {
        pValue: this.calculatePValue(control.totalCarbonFootprint, variant.totalCarbonFootprint, control.sampleSize, variant.sampleSize),
        isSignificant: false,
      },
    };

    // Determine winner
    let winner: 'control' | 'variant' | 'no_difference' = 'no_difference';
    let recommendation: string | undefined;

    if (comparison.cacheHitRateImprovement > 5 && comparison.costReduction > 0 && comparison.carbonFootprintReduction > 0) {
      winner = 'variant';
      recommendation = `Variant shows improvement: ${comparison.cacheHitRateImprovement.toFixed(1)}% better cache hit rate, ${comparison.costReduction.toFixed(1)}% cost reduction, ${comparison.carbonFootprintReduction.toFixed(1)}% carbon reduction. Consider implementing variant.`;
    } else if (comparison.cacheHitRateImprovement < -5 || comparison.costReduction < 0 || comparison.carbonFootprintReduction < 0) {
      winner = 'control';
      recommendation = 'Control performs better. Keep current configuration.';
    } else {
      recommendation = 'No significant difference. Consider other factors or run longer test.';
    }

    return {
      control,
      variant,
      comparison,
      statisticalSignificance,
      winner,
      recommendation,
    };
  }

  /**
   * Simplified p-value calculation (placeholder - would use proper statistical test)
   */
  private calculatePValue(controlValue: number, variantValue: number, controlSize: number, variantSize: number): number {
    // Simplified calculation - in production, would use proper statistical tests
    // (e.g., t-test, chi-square test, etc.)
    const difference = Math.abs(variantValue - controlValue);
    const pooledStdDev = Math.sqrt((controlValue + variantValue) / (controlSize + variantSize));
    const standardError = pooledStdDev * Math.sqrt(1 / controlSize + 1 / variantSize);
    const zScore = difference / standardError;
    
    // Approximate p-value from z-score (two-tailed)
    // This is a simplified approximation
    return Math.min(1, 2 * (1 - this.normalCDF(Math.abs(zScore))));
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    // Approximation of standard normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Get all A/B tests
   */
  async getTests(filters?: {
    status?: string;
    testType?: string;
  }): Promise<ABTestDocument[]> {
    const db = await getDB();
    const collection = db.collection<ABTestDocument>(COLLECTION_NAME);

    const query: Record<string, unknown> = {};
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.testType) {
      query.testType = filters.testType;
    }

    return collection.find(query).sort({ createdAt: -1 }).toArray();
  }

  /**
   * Get a specific A/B test
   */
  async getTest(testId: string): Promise<ABTestDocument | null> {
    const db = await getDB();
    const collection = db.collection<ABTestDocument>(COLLECTION_NAME);

    return collection.findOne({ _id: new ObjectId(testId) });
  }

  /**
   * Cancel an A/B test
   */
  async cancelTest(testId: string): Promise<void> {
    const db = await getDB();
    const collection = db.collection<ABTestDocument>(COLLECTION_NAME);

    await collection.updateOne(
      { _id: new ObjectId(testId) },
      {
        $set: {
          status: 'cancelled',
          updatedAt: new Date(),
        },
      }
    );

    logger.info({ testId }, 'A/B test cancelled');
  }
}

// Singleton instance
export const abTestingService = new ABTestingService();

