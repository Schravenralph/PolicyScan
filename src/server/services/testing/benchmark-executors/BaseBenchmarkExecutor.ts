/**
 * Base interface for benchmark executors
 * Defines the contract for all benchmark executor implementations
 */

import type { Collection } from 'mongodb';
import type { BenchmarkResultDocument } from '../BenchmarkService.js';

/**
 * Dependencies required by benchmark executors
 */
export interface BenchmarkExecutorDependencies {
  validateDatabaseState: (query: string) => Promise<{ valid: boolean; message?: string; documentCount?: number; matchingCount?: number }>;
  executeSearchWithConfig: (query: string, config: { name: string; description: string; settings: Partial<Record<string, boolean | number | string>> }) => Promise<Array<import('../../infrastructure/types.js').ScrapedDocument | import('../../query/HybridRetrievalService.js').RetrievedDocument>>;
  executeSearchWithRelevanceConfig: (query: string, weights: { keyword: number; semantic: number }) => Promise<Array<import('../../infrastructure/types.js').ScrapedDocument>>;
  executeSearchWithReranker: (query: string, useReranker: boolean) => Promise<Array<import('../../infrastructure/types.js').ScrapedDocument>>;
  executeHybridSearch: (query: string, keywordWeight: number, semanticWeight: number) => Promise<Array<import('../../infrastructure/types.js').ScrapedDocument | import('../../query/HybridRetrievalService.js').RetrievedDocument>>;
}

/**
 * Interface for benchmark executors
 */
export interface BenchmarkExecutor {
  /**
   * Execute the benchmark
   */
  execute(
    runId: string,
    query: string,
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void>;
}

