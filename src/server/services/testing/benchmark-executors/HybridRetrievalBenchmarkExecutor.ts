/**
 * Hybrid Retrieval Benchmark Executor
 * Executes benchmarks comparing different hybrid retrieval weight configurations
 */

import { ObjectId, type Collection } from 'mongodb';
import type { BenchmarkResultDocument } from '../BenchmarkService.js';
import type { BenchmarkExecutor, BenchmarkExecutorDependencies } from './BaseBenchmarkExecutor.ts';

// Type for documents that may have a score field
type DocumentWithScore = (import('../../infrastructure/types.js').ScrapedDocument | import('../../query/HybridRetrievalService.js').RetrievedDocument) & { 
  score?: number;
  _id?: { toString(): string } | string;
};

/**
 * Executor for hybrid retrieval benchmarks
 */
export class HybridRetrievalBenchmarkExecutor implements BenchmarkExecutor {
  constructor(private dependencies: BenchmarkExecutorDependencies) {}

  async execute(
    runId: string,
    query: string,
    resultsCollection: Collection<BenchmarkResultDocument>
  ): Promise<void> {
    const configs = [
      { name: 'keyword-only', keywordWeight: 1.0, semanticWeight: 0.0 },
      { name: 'balanced', keywordWeight: 0.5, semanticWeight: 0.5 },
      { name: 'semantic-heavy', keywordWeight: 0.3, semanticWeight: 0.7 },
    ];

    for (const config of configs) {
      const startTime = Date.now();
      const documents = await this.dependencies.executeHybridSearch(query, config.keywordWeight, config.semanticWeight);
      const executionTime = Date.now() - startTime;

      const result: BenchmarkResultDocument = {
        benchmarkRunId: new ObjectId(runId),
        benchmarkType: 'hybrid-retrieval',
        configName: config.name,
        configSnapshot: { keywordWeight: config.keywordWeight, semanticWeight: config.semanticWeight, query },
        documents: documents.map((doc, index) => {
          const docWithScore = doc as DocumentWithScore;
          return {
            url: doc.url,
            titel: doc.titel || doc.url,
            samenvatting: doc.samenvatting || '',
            score: docWithScore.score ?? (doc as import('../../query/HybridRetrievalService.js').RetrievedDocument).finalScore ?? 0,
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
                const score = docWithScore.score ?? (doc as import('../../query/HybridRetrievalService.js').RetrievedDocument).finalScore ?? 0;
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


