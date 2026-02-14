/**
 * BenchmarkRunner - Core benchmarking execution engine
 * 
 * Executes benchmarks with statistical analysis, memory tracking, and error handling.
 */

import type {
  BenchmarkConfig,
  BenchmarkFunction,
  BenchmarkResult,
  BenchmarkIteration,
  BenchmarkStatistics,
  MemoryStatistics,
  BenchmarkSuite,
} from './types.js';
import { performance } from 'node:perf_hooks';
import { FeatureFlag } from '../../models/FeatureFlag.js';

/**
 * Get feature flag configuration for benchmarking
 * This allows benchmarks to record which KG features were enabled during the run
 */
function getFeatureFlagConfig(): Record<string, boolean> | undefined {
  try {
    const config = FeatureFlag.getBenchmarkConfig();
    // Convert number | boolean to boolean
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(config || {})) {
      result[key] = Boolean(value);
    }
    return result;
  } catch (error) {
    // Feature flags not available - return undefined
    return undefined;
  }
}

export class BenchmarkRunner {
  /**
   * Run a benchmark with the given configuration
   */
  async run(
    config: BenchmarkConfig,
    benchmarkFn: BenchmarkFunction | BenchmarkSuite
  ): Promise<BenchmarkResult> {
    const startTime = new Date();
    const suite = this.normalizeSuite(benchmarkFn);
    const iterations = config.iterations ?? 10;
    const warmupIterations = config.warmupIterations ?? 2;
    const collectMemory = config.collectMemory ?? true;
    const timeout = config.timeout;

    // Setup
    if (suite.setup) {
      await suite.setup();
    }

    // Warmup iterations
    for (let i = 0; i < warmupIterations; i++) {
      try {
        await this.executeWithTimeout(suite.benchmark, timeout);
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Initial memory measurement
    const initialMemory = collectMemory ? process.memoryUsage() : undefined;
    let peakMemory = initialMemory ? { ...initialMemory } : undefined;

    // Run benchmark iterations
    const iterationResults: BenchmarkIteration[] = [];
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const iteration = await this.runIteration(
        suite.benchmark,
        collectMemory,
        timeout,
        suite.metadata
      );

      iterationResults.push(iteration);
      if (iteration.success) {
        durations.push(iteration.duration);
      }

      // Track peak memory
      if (collectMemory && iteration.memoryAfter) {
        if (!peakMemory || iteration.memoryAfter.heapUsed > peakMemory.heapUsed) {
          peakMemory = { ...iteration.memoryAfter };
        }
      }
    }

    // Final memory measurement
    if (global.gc) {
      global.gc();
    }
    const finalMemory = collectMemory ? process.memoryUsage() : undefined;

    // Teardown
    if (suite.teardown) {
      await suite.teardown();
    }

    const endTime = new Date();
    const totalDuration = endTime.getTime() - startTime.getTime();

    // Calculate statistics
    const statistics = this.calculateStatistics(iterationResults, durations);

    // Calculate memory statistics
    const memory = collectMemory && initialMemory && finalMemory
      ? this.calculateMemoryStatistics(initialMemory, finalMemory, peakMemory!, iterationResults)
      : undefined;

    // Include feature flag configuration in result metadata
    // Use config.featureFlags if provided, otherwise get current state
    const featureFlagConfig = config.featureFlags || getFeatureFlagConfig();

    return {
      name: config.name,
      description: config.description,
      startTime,
      endTime,
      totalDuration,
      iterations: iterationResults,
      statistics,
      memory,
      tags: config.tags,
      featureFlags: featureFlagConfig,
    };
  }

  /**
   * Run multiple benchmarks and return all results
   */
  async runSuite(
    benchmarks: Array<{ config: BenchmarkConfig; fn: BenchmarkFunction | BenchmarkSuite }>
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (const { config, fn } of benchmarks) {
      const result = await this.run(config, fn);
      results.push(result);
    }

    return results;
  }

  /**
   * Normalize benchmark function or suite to a suite
   */
  private normalizeSuite(fn: BenchmarkFunction | BenchmarkSuite): BenchmarkSuite {
    if (typeof fn === 'function') {
      return { benchmark: fn };
    }
    return fn;
  }

  /**
   * Run a single iteration
   */
  private async runIteration(
    benchmarkFn: BenchmarkFunction,
    collectMemory: boolean,
    timeout?: number,
    metadata?: Record<string, unknown>
  ): Promise<BenchmarkIteration> {
    const memoryBefore = collectMemory ? process.memoryUsage() : undefined;
    const startTime = performance.now();

    try {
      await this.executeWithTimeout(benchmarkFn, timeout);
      const endTime = performance.now();
      const duration = endTime - startTime;

      const memoryAfter = collectMemory ? process.memoryUsage() : undefined;
      const memoryDelta = memoryBefore && memoryAfter
        ? memoryAfter.heapUsed - memoryBefore.heapUsed
        : undefined;

      return {
        duration,
        success: true,
        memoryBefore,
        memoryAfter,
        memoryDelta,
        metadata,
      };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      return {
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata,
      };
    }
  }

  /**
   * Execute function with optional timeout
   */
  private async executeWithTimeout(
    fn: BenchmarkFunction,
    timeout?: number
  ): Promise<void> {
    if (!timeout) {
      await Promise.resolve(fn());
      return;
    }

    return Promise.race([
      Promise.resolve(fn()),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`Benchmark timeout after ${timeout}ms`)), timeout)
      ),
    ]);
  }

  /**
   * Calculate statistical summary
   */
  private calculateStatistics(
    iterations: BenchmarkIteration[],
    durations: number[]
  ): BenchmarkStatistics {
    const successCount = iterations.filter((i) => i.success).length;
    const errorCount = iterations.length - successCount;
    const successRate = iterations.length > 0 ? successCount / iterations.length : 0;

    if (durations.length === 0) {
      return {
        count: iterations.length,
        min: 0,
        max: 0,
        avg: 0,
        median: 0,
        p95: 0,
        p99: 0,
        stdDev: 0,
        successCount,
        errorCount,
        successRate,
        total: 0,
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const successfulCount = sorted.length;
    const min = sorted[0];
    const max = sorted[successfulCount - 1];
    const total = sorted.reduce((sum, val) => sum + val, 0);
    const avg = total / successfulCount;
    const median = this.percentile(sorted, 50);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    // Calculate standard deviation
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / successfulCount;
    const stdDev = Math.sqrt(variance);

    return {
      count: iterations.length, // Total iterations, not just successful ones
      min,
      max,
      avg,
      median,
      p95,
      p99,
      stdDev,
      successCount,
      errorCount,
      successRate,
      total,
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Calculate memory statistics
   */
  private calculateMemoryStatistics(
    initial: NodeJS.MemoryUsage,
    final: NodeJS.MemoryUsage,
    peak: NodeJS.MemoryUsage,
    iterations: BenchmarkIteration[]
  ): MemoryStatistics {
    const memoryValues = iterations
      .filter((i) => i.memoryAfter)
      .map((i) => i.memoryAfter!.heapUsed);

    const avg = memoryValues.length > 0
      ? memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length
      : initial.heapUsed;

    return {
      initial: initial.heapUsed,
      peak: peak.heapUsed,
      final: final.heapUsed,
      delta: final.heapUsed - initial.heapUsed,
      avg,
    };
  }
}

