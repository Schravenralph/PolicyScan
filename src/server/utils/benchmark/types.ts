/**
 * General Benchmarking System Framework
 * 
 * Provides standardized utilities for performance testing, metrics collection,
 * and result reporting across different services and components.
 */

/**
 * Result of a single benchmark iteration
 */
export interface BenchmarkIteration {
  /** Duration in milliseconds */
  duration: number;
  /** Whether the iteration succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Custom metadata for this iteration */
  metadata?: Record<string, unknown>;
  /** Memory usage before iteration */
  memoryBefore?: NodeJS.MemoryUsage;
  /** Memory usage after iteration */
  memoryAfter?: NodeJS.MemoryUsage;
  /** Memory delta (after - before) */
  memoryDelta?: number;
}

/**
 * Statistical summary of benchmark iterations
 */
export interface BenchmarkStatistics {
  /** Number of iterations */
  count: number;
  /** Minimum duration in milliseconds */
  min: number;
  /** Maximum duration in milliseconds */
  max: number;
  /** Average duration in milliseconds */
  avg: number;
  /** Median duration in milliseconds */
  median: number;
  /** 95th percentile duration in milliseconds */
  p95: number;
  /** 99th percentile duration in milliseconds */
  p99: number;
  /** Standard deviation */
  stdDev: number;
  /** Number of successful iterations */
  successCount: number;
  /** Number of failed iterations */
  errorCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total duration across all iterations */
  total: number;
}

/**
 * Memory usage statistics
 */
export interface MemoryStatistics {
  /** Initial memory usage in bytes */
  initial: number;
  /** Peak memory usage in bytes */
  peak: number;
  /** Final memory usage in bytes */
  final: number;
  /** Memory delta (final - initial) in bytes */
  delta: number;
  /** Average memory usage across iterations */
  avg: number;
}

/**
 * Complete benchmark result
 */
export interface BenchmarkResult {
  /** Benchmark name/identifier */
  name: string;
  /** Description of what was benchmarked */
  description?: string;
  /** Timestamp when benchmark started */
  startTime: Date;
  /** Timestamp when benchmark completed */
  endTime: Date;
  /** Total duration of benchmark run */
  totalDuration: number;
  /** Individual iteration results */
  iterations: BenchmarkIteration[];
  /** Statistical summary */
  statistics: BenchmarkStatistics;
  /** Memory statistics */
  memory?: MemoryStatistics;
  /** Custom metrics */
  customMetrics?: Record<string, number | string>;
  /** Tags for categorization */
  tags?: string[];
  /** Feature flag configuration used for this benchmark */
  featureFlags?: Record<string, boolean>;
}

/**
 * Configuration for running a benchmark
 */
export interface BenchmarkConfig {
  /** Name of the benchmark */
  name: string;
  /** Description */
  description?: string;
  /** Number of iterations to run */
  iterations?: number;
  /** Number of warmup iterations (not counted in results) */
  warmupIterations?: number;
  /** Whether to collect memory metrics */
  collectMemory?: boolean;
  /** Custom tags */
  tags?: string[];
  /** Timeout per iteration in milliseconds */
  timeout?: number;
  /** Feature flag configuration for this benchmark run */
  featureFlags?: Record<string, boolean>;
}

/**
 * Function to benchmark (can be sync or async)
 */
export type BenchmarkFunction = () => void | Promise<void>;

/**
 * Function with setup/teardown
 */
export interface BenchmarkSuite {
  /** Setup function called before benchmark */
  setup?: () => void | Promise<void>;
  /** Teardown function called after benchmark */
  teardown?: () => void | Promise<void>;
  /** The function to benchmark */
  benchmark: BenchmarkFunction;
  /** Custom metadata to include in results */
  metadata?: Record<string, unknown>;
}

/**
 * Comparison between two benchmark results
 */
export interface BenchmarkComparison {
  /** Baseline result */
  baseline: BenchmarkResult;
  /** Comparison result */
  comparison: BenchmarkResult;
  /** Performance difference in average duration (comparison - baseline) */
  avgDurationDelta: number;
  /** Performance difference as percentage */
  avgDurationDeltaPercent: number;
  /** Memory difference in bytes */
  memoryDelta?: number;
  /** Whether comparison is faster */
  isFaster: boolean;
  /** Speedup factor (baseline.avg / comparison.avg) */
  speedup?: number;
}

/**
 * Report format options
 */
export type ReportFormat = 'json' | 'table' | 'markdown' | 'csv';

/**
 * Reporter configuration
 */
export interface ReporterConfig {
  /** Output format */
  format?: ReportFormat | ReportFormat[];
  /** Output file path (optional) */
  outputFile?: string;
  /** Whether to include detailed iteration data */
  includeIterations?: boolean;
  /** Whether to include memory statistics */
  includeMemory?: boolean;
  /** Custom formatter function */
  customFormatter?: (result: BenchmarkResult) => string;
}

