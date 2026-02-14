/**
 * MongoDB Cursor Utilities
 * 
 * Helper functions for memory-efficient MongoDB operations using cursors
 */

import { Collection, FindCursor, AggregationCursor, Filter } from 'mongodb';
import { logger } from './logger.js';
import { logMemoryUsage } from './memoryUtils.js';

/**
 * Process MongoDB find results using a cursor (memory-efficient)
 */
export async function processWithCursor<T>(
  cursor: FindCursor<T>,
  processor: (doc: T) => Promise<void> | void,
  options: {
    batchSize?: number;
    logProgress?: boolean;
    logInterval?: number; // Log every N documents
  } = {}
): Promise<number> {
  const { batchSize = 100, logProgress = false, logInterval = 1000 } = options;

  let processed = 0;
  let batch: T[] = [];

  try {
    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= batchSize) {
        await Promise.all(batch.map(processor));
        processed += batch.length;

        if (logProgress && processed % logInterval === 0) {
          logger.info({ processed }, `Processed ${processed} documents`);
          logMemoryUsage(`After processing ${processed} documents`);
        }

        batch = [];
      }
    }

    // Process remaining items
    if (batch.length > 0) {
      await Promise.all(batch.map(processor));
      processed += batch.length;
    }

    return processed;
  } finally {
    await cursor.close();
  }
}

/**
 * Process MongoDB aggregation results using a cursor
 */
export async function processAggregationWithCursor<T>(
  cursor: AggregationCursor<T>,
  processor: (doc: T) => Promise<void> | void,
  options: {
    batchSize?: number;
    logProgress?: boolean;
    logInterval?: number;
  } = {}
): Promise<number> {
  const { batchSize = 100, logProgress = false, logInterval = 1000 } = options;

  let processed = 0;
  let batch: T[] = [];

  try {
    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= batchSize) {
        await Promise.all(batch.map(processor));
        processed += batch.length;

        if (logProgress && processed % logInterval === 0) {
          logger.info({ processed }, `Processed ${processed} documents`);
          logMemoryUsage(`After processing ${processed} documents`);
        }

        batch = [];
      }
    }

    // Process remaining items
    if (batch.length > 0) {
      await Promise.all(batch.map(processor));
      processed += batch.length;
    }

    return processed;
  } finally {
    await cursor.close();
  }
}

/**
 * Get all results from a cursor in batches (more memory-efficient than toArray)
 */
export async function cursorToBatches<T>(
  cursor: FindCursor<T> | AggregationCursor<T>,
  batchSize = 1000
): Promise<T[][]> {
  const batches: T[][] = [];
  let currentBatch: T[] = [];

  try {
    for await (const doc of cursor) {
      currentBatch.push(doc);

      if (currentBatch.length >= batchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }
    }

    // Add remaining items
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  } finally {
    await cursor.close();
  }
}

/**
 * Count documents using a cursor (for large collections)
 */
export async function countWithCursor<T>(
  cursor: FindCursor<T> | AggregationCursor<T>
): Promise<number> {
  try {
    // Optimization: use server-side count if available (FindCursor)
    // Note: count() is deprecated in MongoDB driver v4+ but is the only way to get count from a cursor without iteration
    // or accessing internal properties to call countDocuments.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('count' in cursor && typeof (cursor as any).count === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (cursor as any).count({ applySkipLimit: true });
    }

    let count = 0;
    for await (const _doc of cursor) {
      count++;
    }
    return count;
  } finally {
    await cursor.close();
  }
}

/**
 * Create a memory-efficient find query with automatic batching
 */
export function createBatchedFindQuery<T extends { _id?: unknown }>(
  collection: Collection<T>,
  filter: Record<string, unknown>,
  options: {
    batchSize?: number;
    limit?: number;
    sort?: Record<string, 1 | -1>;
    projection?: Record<string, 0 | 1>;
  } = {}
) {
  const { batchSize = 100, limit, sort, projection } = options;

  let query = collection.find(filter as Filter<T>, { projection });

  if (sort) {
    query = query.sort(sort);
  }

  if (limit) {
    query = query.limit(limit);
  }

  return query.batchSize(batchSize);
}

/**
 * Process collection in batches with automatic pagination
 */
export async function processCollectionInBatches<T extends { _id?: unknown }>(
  collection: Collection<T>,
  filter: Record<string, unknown>,
  processor: (doc: T) => Promise<void> | void,
  options: {
    batchSize?: number;
    pageSize?: number;
    sort?: Record<string, 1 | -1>;
    projection?: Record<string, 0 | 1>;
    logProgress?: boolean;
  } = {}
): Promise<number> {
  const { batchSize = 100, pageSize = 1000, sort, projection, logProgress = false } = options;

  let skip = 0;
  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    let query = collection.find(filter as Filter<T>, { projection });

    if (sort) {
      query = query.sort(sort);
    }

    query = query.skip(skip).limit(pageSize).batchSize(batchSize);

    const cursor = query;
    const processed = await processWithCursor(cursor as FindCursor<T>, processor, {
      batchSize,
      logProgress,
    });

    totalProcessed += processed;

    if (logProgress) {
      logger.info({ totalProcessed }, `Processed ${totalProcessed} documents total`);
    }

    // If we got fewer results than requested, we're done
    if (processed < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
    }
  }

  return totalProcessed;
}







