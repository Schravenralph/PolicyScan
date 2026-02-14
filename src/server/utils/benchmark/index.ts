/**
 * General Benchmarking System Framework
 * 
 * Provides standardized utilities for performance testing, metrics collection,
 * and result reporting across different services and components.
 * 
 * @example
 * ```typescript
 * import { BenchmarkRunner, BenchmarkReporter } from './benchmark';
 * 
 * const runner = new BenchmarkRunner();
 * const result = await runner.run(
 *   { name: 'MyBenchmark', iterations: 10 },
 *   async () => {
 *     // Code to benchmark
 *   }
 * );
 * 
 * const reporter = new BenchmarkReporter();
 * console.log(reporter.generateReport(result, { format: 'table' }));
 * ```
 */

export * from './types.js';
export { BenchmarkRunner } from './BenchmarkRunner.js';
export { BenchmarkReporter, compareBenchmarks } from './BenchmarkReporter.js';

