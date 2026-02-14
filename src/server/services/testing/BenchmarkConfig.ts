/**
 * Benchmark Configuration
 * Constants and configuration for benchmark operations
 */

/**
 * MongoDB collection names for benchmark data
 */
export const BENCHMARK_RUNS_COLLECTION = 'benchmark_runs';
export const BENCHMARK_RESULTS_COLLECTION = 'benchmark_results';

/**
 * Default benchmark configuration values
 */
export const DEFAULT_BENCHMARK_CONFIG = {
  maxAttempts: 900, // 30 minutes max (900 * 2 seconds = 1800 seconds)
  pollInterval: 2000, // Poll every 2 seconds
  timeoutMs: 30 * 60 * 1000, // 30 minutes timeout
  retentionDays: 7, // Default retention period for benchmark workflow runs
} as const;

