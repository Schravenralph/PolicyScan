/**
 * Memory Utilities
 * 
 * Helper functions for memory-efficient operations and monitoring
 */

import { memoryUsage } from 'process';
import { logger } from './logger.js';

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
}

/**
 * Get current memory usage in a structured format
 */
export function getMemoryUsage(): MemoryUsage {
  const usage = memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    rss: usage.rss,
    external: usage.external,
  };
}

/**
 * Format memory usage as human-readable strings
 */
export function formatMemoryUsage(usage?: MemoryUsage): Record<string, string> {
  const mem = usage || getMemoryUsage();
  return {
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
    external: `${Math.round(mem.external / 1024 / 1024)}MB`,
  };
}

/**
 * Log current memory usage
 */
export function logMemoryUsage(label: string, usage?: MemoryUsage): void {
  const mem = usage || getMemoryUsage();
  const formatted = formatMemoryUsage(mem);
  logger.info({ memory: formatted }, `[Memory] ${label}`);
}

/**
 * Check if memory usage is above threshold
 */
export function isMemoryUsageHigh(thresholdMB = 4096): boolean {
  const usage = getMemoryUsage();
  return usage.heapUsed / 1024 / 1024 > thresholdMB;
}

/**
 * Process items in batches to avoid memory issues
 */
export async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  options: {
    onBatchComplete?: (batchIndex: number, batchSize: number) => void;
    onProgress?: (processed: number, total: number) => void;
    forceGC?: boolean; // Only works if --expose-gc is enabled
  } = {}
): Promise<R[]> {
  const results: R[] = [];
  const { onBatchComplete, onProgress, forceGC } = options;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (onBatchComplete) {
      onBatchComplete(Math.floor(i / batchSize), batch.length);
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }

    // Force garbage collection every 10 batches (if enabled)
    if (forceGC && global.gc && (i / batchSize) % 10 === 0) {
      global.gc();
      logger.debug('Forced garbage collection');
    }
  }

  return results;
}

/**
 * Process items in batches with memory monitoring
 */
export async function processInBatchesWithMonitoring<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  options: {
    logMemory?: boolean;
    memoryThresholdMB?: number;
  } = {}
): Promise<R[]> {
  const { logMemory = false, memoryThresholdMB = 3072 } = options;

  if (logMemory) {
    logMemoryUsage('Before batch processing');
  }

  const results = await processInBatches(items, batchSize, processor, {
    onBatchComplete: (batchIndex, batchSize) => {
      if (logMemory && batchIndex % 10 === 0) {
        const usage = getMemoryUsage();
        logMemoryUsage(`After batch ${batchIndex} (${batchSize} items)`);

        if (usage.heapUsed / 1024 / 1024 > memoryThresholdMB) {
          logger.warn(
            { memory: formatMemoryUsage(usage) },
            `Memory usage above threshold (${memoryThresholdMB}MB)`
          );
        }
      }
    },
    forceGC: true,
  });

  if (logMemory) {
    logMemoryUsage('After batch processing');
  }

  return results;
}

/**
 * Create a paginated iterator for MongoDB-like queries
 */
export async function* paginatedQuery<T>(
  queryFn: (skip: number, limit: number) => Promise<T[]>,
  pageSize = 100
): AsyncGenerator<T, void, unknown> {
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await queryFn(skip, pageSize);

    if (batch.length === 0) {
      hasMore = false;
    } else {
      for (const item of batch) {
        yield item;
      }

      // If we got fewer items than requested, we're done
      if (batch.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }
  }
}

/**
 * Stream process items from a generator
 */
export async function streamProcess<T, R>(
  generator: AsyncGenerator<T, void, unknown>,
  processor: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    onProgress?: (processed: number) => void;
  } = {}
): Promise<R[]> {
  const { batchSize = 10, onProgress } = options;
  const results: R[] = [];
  let processed = 0;
  let batch: T[] = [];

  for await (const item of generator) {
    batch.push(item);

    if (batch.length >= batchSize) {
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
      processed += batch.length;

      if (onProgress) {
        onProgress(processed);
      }

      batch = [];
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    processed += batch.length;

    if (onProgress) {
      onProgress(processed);
    }
  }

  return results;
}

/**
 * Memory-efficient array chunking
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Get memory usage statistics
 */
export function getMemoryStats(): {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  heapUsagePercent: number;
} {
  const usage = getMemoryUsage();
  return {
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024),
    heapUsagePercent: Math.round((usage.heapUsed / usage.heapTotal) * 100),
  };
}
