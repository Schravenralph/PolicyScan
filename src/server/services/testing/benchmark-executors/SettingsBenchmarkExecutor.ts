/**
 * Settings Benchmark Executor
 * Executes benchmarks comparing different feature flag configurations
 */

import { ObjectId, type Collection } from 'mongodb';
import { logger } from '../../../utils/logger.js';
import type { BenchmarkResultDocument } from '../BenchmarkService.js';
import type { BenchmarkExecutor, BenchmarkExecutorDependencies } from './BaseBenchmarkExecutor.js';

// Benchmark configurations (moved from BenchmarkService)
interface BenchmarkConfig {
  name: string;
  description: string;
  settings: Partial<Record<string, boolean | number | string>>;
}

const BENCHMARK_CONFIGS: BenchmarkConfig[] = [
  {
    name: 'baseline',
    description: 'Baseline configuration - all features disabled',
    settings: {
      HYBRID_RETRIEVAL_ENABLED: false,
      EMBEDDING_ENABLED: false,
      DOCUMENT_EXTRACTION_OCR_ENABLED: false,
      SCORE_KEYWORD_WEIGHT: 0.5,
      SCORE_SEMANTIC_WEIGHT: 0.5,
    },
  },
  {
    name: 'full-hybrid',
    description: 'Full hybrid retrieval with embeddings',
    settings: {
      HYBRID_RETRIEVAL_ENABLED: true,
      EMBEDDING_ENABLED: true,
      SCORE_KEYWORD_WEIGHT: 0.5,
      SCORE_SEMANTIC_WEIGHT: 0.5,
    },
  },
  {
    name: 'with-ocr',
    description: 'Full hybrid with OCR enabled',
    settings: {
      HYBRID_RETRIEVAL_ENABLED: true,
      EMBEDDING_ENABLED: true,
      DOCUMENT_EXTRACTION_OCR_ENABLED: true,
      PDF_TO_IMAGE_ENABLED: true,
      SCORE_KEYWORD_WEIGHT: 0.5,
      SCORE_SEMANTIC_WEIGHT: 0.5,
    },
  },
];

/**
 * Executor for settings benchmarks
 */
export class SettingsBenchmarkExecutor implements BenchmarkExecutor {
  constructor(private dependencies: BenchmarkExecutorDependencies) {}

  async execute(
    runId: string,
    query: string,
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void> {
    // Validate database state before running benchmarks
    const validation = await this.dependencies.validateDatabaseState(query);
    if (!validation.valid) {
      logger.warn({ query, validation }, 'Database validation failed, but continuing with benchmark');
      // Continue anyway - user may want to see the results even if validation fails
    } else {
      logger.info({ query, documentCount: validation.documentCount, matchingCount: validation.matchingCount }, 'Database validation passed');
    }

    const configsToTest = [
      BENCHMARK_CONFIGS.find((c) => c.name === 'baseline'),
      BENCHMARK_CONFIGS.find((c) => c.name === 'full-hybrid'),
      BENCHMARK_CONFIGS.find((c) => c.name === 'with-ocr'),
    ].filter((c): c is BenchmarkConfig => c !== undefined);

    for (const config of configsToTest) {
      try {
        logger.debug({ config: config.name, query }, 'Running settings benchmark for config');
        const startTime = Date.now();
        const documents = await this.dependencies.executeSearchWithConfig(query, config);
        const executionTime = Date.now() - startTime;
        
        if (documents.length === 0) {
          logger.warn({ config: config.name, query }, 'Benchmark returned 0 documents');
        } else {
          logger.debug({ config: config.name, query, documentCount: documents.length }, 'Benchmark execution completed');
        }

        const result: BenchmarkResultDocument = {
          benchmarkRunId: new ObjectId(runId),
          benchmarkType: 'settings',
          configName: config.name,
          configSnapshot: { ...config.settings, query } as Record<string, unknown>,
          documents: documents.map((doc, index) => {
            // Type guard: check if doc is a RetrievedDocument
            const isRetrievedDoc = 'finalScore' in doc;
            const retrievedDoc = isRetrievedDoc ? doc as import('../../query/HybridRetrievalService.js').RetrievedDocument : null;
            
            return {
              url: doc.url,
              titel: doc.titel || doc.url,
              samenvatting: doc.samenvatting || '',
              score: retrievedDoc?.finalScore ?? 0,
              rank: index + 1,
              documentId: retrievedDoc?._id?.toString(),
            };
          }),
          metrics: {
            documentsFound: documents.length,
            averageScore: documents.length > 0
              ? documents.reduce((sum, doc) => {
                  const isRetrievedDoc = 'finalScore' in doc;
                  const retrievedDoc = isRetrievedDoc ? doc as import('../../query/HybridRetrievalService.js').RetrievedDocument : null;
                  return sum + (retrievedDoc?.finalScore ?? 0);
                }, 0) / documents.length
              : 0,
            executionTimeMs: executionTime,
          },
          createdAt: new Date(),
        };

        await resultsCollection.insertOne(result);
      } catch (error) {
        logger.error({ error, config: config.name, query }, 'Error executing benchmark for config');
        // Continue with other configs even if one fails
        const errorResult: BenchmarkResultDocument = {
          benchmarkRunId: new ObjectId(runId),
          benchmarkType: 'settings',
          configName: config.name,
          configSnapshot: { ...config.settings, query } as Record<string, unknown>,
          documents: [],
          metrics: {
            documentsFound: 0,
            averageScore: 0,
            executionTimeMs: 0,
          },
          createdAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
          errorDetails: {
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            query,
            config: config.name,
          },
        };
        await resultsCollection.insertOne(errorResult);
      }
    }
  }
}


