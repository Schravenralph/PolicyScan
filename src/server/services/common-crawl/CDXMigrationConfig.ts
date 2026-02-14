/**
 * CDX Migration Configuration
 * 
 * Provides optimized configuration settings for CDX file migration
 * based on system resources and best practices.
 */

import * as os from 'os';

export interface MigrationConfig {
  download: {
    concurrency: number; // Number of parallel downloads
    timeout: number; // Download timeout in milliseconds
    retryAttempts: number; // Number of retry attempts
    retryDelay: number; // Delay between retries in milliseconds
  };
  processing: {
    concurrency: number; // Number of files to process in parallel
    batchSize: number; // Batch size for database inserts
    memoryLimitMB: number; // Memory limit per file processor
  };
  database: {
    writeConcern: 'majority' | 'acknowledged' | 'unacknowledged';
    ordered: boolean; // Use ordered bulk writes (slower but safer)
    maxPoolSize: number; // Maximum connection pool size
  };
}

/**
 * Get optimal configuration based on system resources
 */
export function getOptimalConfig(): MigrationConfig {
  const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
  const cpuCount = os.cpus().length;

  // Calculate optimal concurrency based on CPU cores
  // Use 2-3x CPU cores for downloads (I/O bound)
  // Use 1-2x CPU cores for processing (CPU bound)
  const downloadConcurrency = Math.min(
    Math.max(cpuCount * 2, 3),
    10 // Cap at 10 to avoid overwhelming the network
  );
  const processingConcurrency = Math.min(
    Math.max(cpuCount, 2),
    6 // Cap at 6 to avoid overwhelming the database
  );

  // Calculate optimal batch size based on available memory
  // Larger batches = fewer database round trips but more memory usage
  // Target: ~10-50MB per batch (assuming ~1KB per record)
  const batchSize = totalMemoryGB >= 16 ? 50000 : totalMemoryGB >= 8 ? 25000 : 10000;

  // Memory limit per processor (MB)
  // Reserve memory for other processes
  const availableMemoryGB = totalMemoryGB * 0.7; // Use 70% of total memory
  const memoryLimitMB = Math.floor((availableMemoryGB * 1024) / processingConcurrency);

  return {
    download: {
      concurrency: downloadConcurrency,
      timeout: 120000, // 2 minutes for large files
      retryAttempts: 3,
      retryDelay: 5000, // 5 seconds
    },
    processing: {
      concurrency: processingConcurrency,
      batchSize,
      memoryLimitMB,
    },
    database: {
      writeConcern: 'majority', // Ensure data durability
      ordered: false, // Unordered for better performance (duplicates handled by upsert)
      maxPoolSize: Math.min(processingConcurrency * 2, 20), // 2x processing concurrency, max 20
    },
  };
}

/**
 * Get conservative configuration (for low-resource systems)
 */
export function getConservativeConfig(): MigrationConfig {
  return {
    download: {
      concurrency: 2,
      timeout: 180000, // 3 minutes
      retryAttempts: 5,
      retryDelay: 10000, // 10 seconds
    },
    processing: {
      concurrency: 1, // Process one file at a time
      batchSize: 5000,
      memoryLimitMB: 512,
    },
    database: {
      writeConcern: 'majority',
      ordered: false,
      maxPoolSize: 5,
    },
  };
}

/**
 * Get aggressive configuration (for high-resource systems)
 */
export function getAggressiveConfig(): MigrationConfig {
  const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
  const cpuCount = os.cpus().length;

  return {
    download: {
      concurrency: Math.min(cpuCount * 3, 15),
      timeout: 120000,
      retryAttempts: 3,
      retryDelay: 3000,
    },
    processing: {
      concurrency: Math.min(cpuCount * 2, 10),
      batchSize: totalMemoryGB >= 32 ? 100000 : 50000,
      memoryLimitMB: Math.floor((totalMemoryGB * 1024 * 0.8) / Math.min(cpuCount * 2, 10)),
    },
    database: {
      writeConcern: 'majority',
      ordered: false,
      maxPoolSize: 30,
    },
  };
}

/**
 * Get configuration from environment variables or use optimal defaults
 */
export function getConfig(): MigrationConfig {
  // Check for environment variable to override config mode
  const configMode = process.env.CDX_MIGRATION_CONFIG_MODE || 'optimal';

  switch (configMode.toLowerCase()) {
    case 'conservative':
      return getConservativeConfig();
    case 'aggressive':
      return getAggressiveConfig();
    case 'optimal':
    default:
      return getOptimalConfig();
  }
}


