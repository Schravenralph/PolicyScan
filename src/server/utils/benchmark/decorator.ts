/**
 * Benchmark Decorator
 * 
 * Provides a decorator for automatically benchmarking methods.
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @benchmark({ iterations: 10, name: 'processData' })
 *   async processData(data: unknown) {
 *     // Method implementation
 *   }
 * }
 * ```
 */

import { BenchmarkRunner, BenchmarkReporter } from './index.js';
import type { BenchmarkConfig, BenchmarkResult } from './types.js';

// Store for benchmark results
const benchmarkResults = new Map<string, BenchmarkResult>();

/**
 * Benchmark decorator for methods
 * 
 * Automatically benchmarks method execution and stores results.
 */
export function benchmark(config: BenchmarkConfig) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const runner = new BenchmarkRunner();
    const reporter = new BenchmarkReporter();

    descriptor.value = async function (...args: unknown[]) {
      const targetObj = target as { constructor: { name: string } };
      // Run benchmark
      const result = await runner.run(
        {
          ...config,
          name: config.name || `${targetObj.constructor.name}.${propertyKey}`,
        },
        async () => {
          return await originalMethod.apply(this, args);
        }
      );

      // Store result
      const key = `${targetObj.constructor.name}.${propertyKey}`;
      benchmarkResults.set(key, result);

      // Log result if configured (check if logResults exists in config)
      if ((config as { logResults?: boolean }).logResults !== false) {
        console.log(reporter.generateReport(result, { format: 'table' }));
      }

      // Return original result
      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Get benchmark results for a method
 */
export function getBenchmarkResult(className: string, methodName: string): BenchmarkResult | undefined {
  return benchmarkResults.get(`${className}.${methodName}`);
}

/**
 * Get all benchmark results
 */
export function getAllBenchmarkResults(): Map<string, BenchmarkResult> {
  return new Map(benchmarkResults);
}

/**
 * Clear all benchmark results
 */
export function clearBenchmarkResults(): void {
  benchmarkResults.clear();
}

