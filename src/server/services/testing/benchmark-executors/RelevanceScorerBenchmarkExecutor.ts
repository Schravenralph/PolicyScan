/**
 * Relevance Scorer Benchmark Executor
 * Executes benchmarks comparing different relevance scorer weight configurations
 */

import { ObjectId, type Collection } from 'mongodb';
import type { BenchmarkResultDocument } from '../BenchmarkService.js';
import type { BenchmarkExecutor, BenchmarkExecutorDependencies } from './BaseBenchmarkExecutor.js';

// Type for documents that may have a score field
type DocumentWithScore = (import('../../infrastructure/types.js').ScrapedDocument | import('../../query/HybridRetrievalService.js').RetrievedDocument) & { 
  score?: number;
  _id?: { toString(): string } | string;
};

/**
 * Executor for relevance scorer benchmarks
 */
export class RelevanceScorerBenchmarkExecutor implements BenchmarkExecutor {
  constructor(private dependencies: BenchmarkExecutorDependencies) {}

  async execute(
    runId: string,
    query: string,
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void> {
    // Test with different relevance scorer configurations
    const configs = [
      { name: 'default', weights: { keyword: 0.5, semantic: 0.5 } },
      { name: 'keyword-heavy', weights: { keyword: 0.8, semantic: 0.2 } },
      { name: 'semantic-heavy', weights: { keyword: 0.2, semantic: 0.8 } },
    ];

    for (const config of configs) {
      const startTime = Date.now();
      const documents = await this.dependencies.executeSearchWithRelevanceConfig(query, config.weights);
      const executionTime = Date.now() - startTime;

      const result: BenchmarkResultDocument = {
        benchmarkRunId: new ObjectId(runId),
        benchmarkType: 'relevance-scorer',
        configName: config.name,
        configSnapshot: { ...config.weights, query },
        documents: documents.map((doc, index) => {
          const docWithScore = doc as DocumentWithScore;
          // Check if document is a RetrievedDocument by checking for finalScore property
          const isRetrievedDoc = 'finalScore' in doc;
          const retrievedDoc = isRetrievedDoc ? (doc as unknown as import('../../query/HybridRetrievalService.js').RetrievedDocument) : null;
          return {
            url: doc.url,
            titel: doc.titel || doc.url,
            samenvatting: doc.samenvatting || '',
            score: docWithScore.score ?? retrievedDoc?.finalScore ?? 0,
            rank: index + 1,
            documentId: typeof docWithScore._id === 'object' && docWithScore._id?.toString 
              ? docWithScore._id.toString() 
              : typeof docWithScore._id === 'string' 
                ? docWithScore._id 
                : undefined,
          };
        }),
        metrics: {
          documentsFound: documents.length,
          averageScore: documents.length > 0
            ? documents.reduce((sum, doc) => {
                const docWithScore = doc as DocumentWithScore;
                const isRetrievedDoc = 'finalScore' in doc;
                const retrievedDoc = isRetrievedDoc ? (doc as unknown as import('../../query/HybridRetrievalService.js').RetrievedDocument) : null;
                const score = docWithScore.score ?? retrievedDoc?.finalScore ?? 0;
                return sum + score;
              }, 0) / documents.length
            : 0,
          executionTimeMs: executionTime,
        },
        createdAt: new Date(),
      };

      await resultsCollection.insertOne(result);
    }
  }
}


