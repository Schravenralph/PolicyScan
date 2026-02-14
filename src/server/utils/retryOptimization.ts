/**
 * Retry Optimization Utilities
 * 
 * Provides optimized retry configurations and strategies to reduce unnecessary retries
 * and improve performance.
 */

import { logger } from './logger.js';

/**
 * Operation types for retry optimization
 */
export type RetryOperationType =
  | 'database'
  | 'api'
  | 'scraping'
  | 'file-io'
  | 'network'
  | 'computation'
  | 'external-service';

/**
 * Optimized retry configuration based on operation type
 */
export interface OptimizedRetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: boolean; // Add random jitter to prevent thundering herd
  jitterPercent: number; // Percentage of delay to jitter (0-1)
}

/**
 * Retry configurations optimized for different operation types
 */
const RETRY_CONFIGS: Record<RetryOperationType, OptimizedRetryConfig> = {
  // Database operations: Fast failures, moderate retries
  database: {
    maxAttempts: 3,
    initialDelay: 500, // 0.5s - databases usually respond quickly
    maxDelay: 10000, // 10s max
    multiplier: 2,
    jitter: true,
    jitterPercent: 0.1, // 10% jitter
  },

  // API calls: Moderate retries, respect rate limits
  api: {
    maxAttempts: 3,
    initialDelay: 1000, // 1s - APIs may have rate limits
    maxDelay: 30000, // 30s max
    multiplier: 2,
    jitter: true,
    jitterPercent: 0.2, // 20% jitter for rate limit protection
  },

  // Scraping: More retries, longer delays (sites may be slow)
  scraping: {
    maxAttempts: 3, // Reduced from 5 (was excessive)
    initialDelay: 2000, // 2s - websites may be slow
    maxDelay: 20000, // 20s max
    multiplier: 2,
    jitter: true,
    jitterPercent: 0.15, // 15% jitter
  },

  // File I/O: Fast failures, few retries
  'file-io': {
    maxAttempts: 2, // File operations usually fail fast
    initialDelay: 500, // 0.5s
    maxDelay: 5000, // 5s max
    multiplier: 2,
    jitter: false, // No jitter needed for file operations
    jitterPercent: 0,
  },

  // Network operations: Moderate retries, respect network conditions
  network: {
    maxAttempts: 3,
    initialDelay: 1000, // 1s
    maxDelay: 30000, // 30s max
    multiplier: 2,
    jitter: true,
    jitterPercent: 0.25, // 25% jitter for network operations
  },

  // Computation: Very few retries (usually deterministic)
  computation: {
    maxAttempts: 1, // Computation errors are usually not transient
    initialDelay: 0,
    maxDelay: 0,
    multiplier: 1,
    jitter: false,
    jitterPercent: 0,
  },

  // External services: Moderate retries, respect service limits
  'external-service': {
    maxAttempts: 3,
    initialDelay: 1500, // 1.5s - external services may be slower
    maxDelay: 30000, // 30s max
    multiplier: 2,
    jitter: true,
    jitterPercent: 0.2, // 20% jitter
  },
};

/**
 * Get optimized retry configuration for an operation type
 */
export function getOptimizedRetryConfig(
  operationType: RetryOperationType,
  overrides?: Partial<OptimizedRetryConfig>
): OptimizedRetryConfig {
  const baseConfig = RETRY_CONFIGS[operationType];
  return {
    ...baseConfig,
    ...overrides,
  };
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: OptimizedRetryConfig
): number {
  // Calculate base exponential backoff
  const baseDelay = config.initialDelay * Math.pow(config.multiplier, attempt);
  const delay = Math.min(baseDelay, config.maxDelay);

  // Add jitter if enabled (prevents thundering herd problem)
  if (config.jitter && config.jitterPercent > 0) {
    const jitterAmount = delay * config.jitterPercent;
    const jitter = (Math.random() * 2 - 1) * jitterAmount; // Random between -jitterAmount and +jitterAmount
    return Math.max(0, delay + jitter);
  }

  return delay;
}

/**
 * Check if an error should trigger a retry based on operation type
 */
export function shouldRetryForOperationType(
  error: unknown,
  operationType: RetryOperationType
): boolean {
  // Computation errors are usually not retryable
  if (operationType === 'computation') {
    return false;
  }

  // Check for HTTP status codes
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    const status = response?.status;

    if (status !== undefined) {
      // Rate limit (429) - always retryable
      if (status === 429) {
        return true;
      }

      // Server errors (5xx) - retryable for most operations
      if (status >= 500 && status < 600) {
        return true; // All operation types are retryable for server errors
      }

      // Client errors (4xx) - usually not retryable (except 429)
      if (status >= 400 && status < 500) {
        return false;
      }
    }
  }

  // Network errors - retryable for network/API/scraping operations
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    const networkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'];

    if (code && networkErrors.includes(code)) {
      return ['network', 'api', 'scraping', 'external-service'].includes(operationType);
    }
  }

  // Check error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Timeout errors - retryable for most operations
    if (message.includes('timeout') || message.includes('timed out')) {
      return true; // All operation types are retryable for timeout errors
    }

    // Connection errors - retryable for network operations
    if (message.includes('connection') || message.includes('network')) {
      return ['network', 'api', 'scraping', 'external-service'].includes(operationType);
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Get recommended retry configuration for a specific service
 */
export function getServiceRetryConfig(serviceName: string): OptimizedRetryConfig {
  // Map service names to operation types
  const serviceTypeMap: Record<string, RetryOperationType> = {
    // Database services
    'database': 'database',
    'mongodb': 'database',
    'postgres': 'database',

    // API services
    'dso': 'api',
    'google': 'api',
    'openai': 'api',
    'rechtspraak': 'api',

    // Scraping services
    'iplo': 'scraping',
    'website': 'scraping',
    'scraper': 'scraping',

    // External services
    'external': 'external-service',
  };

  const serviceLower = serviceName.toLowerCase();

  // Find matching service type
  for (const [key, type] of Object.entries(serviceTypeMap)) {
    if (serviceLower.includes(key)) {
      return getOptimizedRetryConfig(type);
    }
  }

  // Default to API configuration
  return getOptimizedRetryConfig('api');
}

/**
 * Log retry attempt with context
 */
export function logRetryAttempt(
  operationType: RetryOperationType,
  attempt: number,
  maxAttempts: number,
  delay: number,
  error: unknown,
  context?: string
): void {
  const contextStr = context ? ` [${context}]` : '';
  logger.warn(
    {
      operationType,
      attempt: attempt + 1,
      maxAttempts: maxAttempts + 1,
      delay,
      error: error instanceof Error ? error.message : String(error),
      context,
    },
    `Retrying ${operationType} operation${contextStr} (attempt ${attempt + 1}/${maxAttempts + 1})`
  );

  // Record metrics (async, fire-and-forget)
  // @ts-expect-error - Dynamic import for optional metrics service
  import('../../services/monitoring/OptimizationMetricsService.js')
    .then(({ getOptimizationMetricsService }) => {
      // Note: We don't know if the retry will succeed yet, so we'll record it as an attempt
      // The actual success/failure will be tracked when the retry completes
      getOptimizationMetricsService().recordRetryAttempt(operationType, delay, false); // Will be updated on success
    })
    .catch(() => {
      // Ignore errors - metrics are optional
    });
}

