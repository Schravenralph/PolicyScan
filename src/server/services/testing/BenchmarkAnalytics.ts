/**
 * Benchmark Analytics Service
 * Handles analytics and result processing for benchmark runs
 */

import { ObjectId, type Filter } from 'mongodb';
import { getDB } from '../../config/database.js';
import type { BenchmarkRunDocument, BenchmarkResultDocument } from './BenchmarkRepository.js';

const BENCHMARK_RUNS_COLLECTION = 'benchmark_runs';
const BENCHMARK_RESULTS_COLLECTION = 'benchmark_results';

export interface StatisticalMetrics {
  avgExecutionTime: number;
  avgDocumentsFound: number;
  avgScore: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  stdDevExecutionTime: number;
  medianExecutionTime: number;
}

export interface AggregatedResult {
  workflowId?: string;
  workflowName?: string;
  query: string;
  runs: number;
  metrics: StatisticalMetrics;
  results: BenchmarkResultDocument[];
}

export interface ComparisonResult {
  workflowId: string;
  workflowName: string;
  query: string;
  runs: number;
  metrics: StatisticalMetrics;
  results: BenchmarkResultDocument[];
}

export interface StatisticalMetricsResult {
  configName: string;
  query: string;
  runs: number;
  metrics: StatisticalMetrics;
  results: BenchmarkResultDocument[];
}

/**
 * Service for benchmark analytics and result processing
 */
export class BenchmarkAnalytics {
  /**
   * Get results for a specific query
   */
  async getResultsForQuery(
    query?: string,
    benchmarkType?: string,
    configName?: string
  ): Promise<BenchmarkResultDocument[]> {
    const db = getDB();
    const runsCollection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);
    const resultsCollection = db.collection<BenchmarkResultDocument>(BENCHMARK_RESULTS_COLLECTION);

    // Build filter for runs
    const runFilter: Filter<BenchmarkRunDocument> = {};
    if (query) {
      runFilter.$or = [
        { query },
        { queries: query },
      ];
    }

    // Get all matching runs
    const maxBenchmarkRuns = parseInt(process.env.MAX_BENCHMARK_RUNS || '500', 10);
    const runs = await runsCollection
      .find(runFilter)
      .limit(maxBenchmarkRuns)
      .toArray();
    if (runs.length === 0) {
      return [];
    }

    const runIds = runs.map((r) => r._id!);

    // Build filter for results
    const resultFilter: Filter<BenchmarkResultDocument> = {
      benchmarkRunId: { $in: runIds },
    };
    if (benchmarkType) {
      resultFilter.benchmarkType = benchmarkType;
    }
    if (configName) {
      resultFilter.configName = configName;
    }

    const maxBenchmarkResults = parseInt(process.env.MAX_BENCHMARK_RESULTS || '1000', 10);
    return await resultsCollection
      .find(resultFilter)
      .limit(maxBenchmarkResults)
      .toArray();
  }

  /**
   * Calculate statistical metrics from a set of results
   */
  calculateStatisticalMetrics(results: BenchmarkResultDocument[]): StatisticalMetrics {
    if (results.length === 0) {
      return {
        avgExecutionTime: 0,
        avgDocumentsFound: 0,
        avgScore: 0,
        minExecutionTime: 0,
        maxExecutionTime: 0,
        stdDevExecutionTime: 0,
        medianExecutionTime: 0,
      };
    }

    const executionTimes = results.map((r) => r.metrics.executionTimeMs);
    const documentsFound = results.map((r) => r.metrics.documentsFound);
    const scores = results.map((r) => r.metrics.averageScore);

    // Calculate mean
    const avgExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
    const avgDocumentsFound = documentsFound.reduce((a, b) => a + b, 0) / documentsFound.length;
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Calculate min/max
    const minExecutionTime = Math.min(...executionTimes);
    const maxExecutionTime = Math.max(...executionTimes);

    // Calculate standard deviation
    const variance = executionTimes.reduce((sum, time) => {
      return sum + Math.pow(time - avgExecutionTime, 2);
    }, 0) / executionTimes.length;
    const stdDevExecutionTime = Math.sqrt(variance);

    // Calculate median
    const sortedTimes = [...executionTimes].sort((a, b) => a - b);
    const mid = Math.floor(sortedTimes.length / 2);
    const medianExecutionTime =
      sortedTimes.length % 2 === 0
        ? (sortedTimes[mid - 1] + sortedTimes[mid]) / 2
        : sortedTimes[mid];

    return {
      avgExecutionTime,
      avgDocumentsFound,
      avgScore,
      minExecutionTime,
      maxExecutionTime,
      stdDevExecutionTime,
      medianExecutionTime,
    };
  }

  /**
   * Aggregate results by workflow/query combination
   */
  async aggregateResultsByWorkflow(
    query?: string,
    benchmarkType?: string
  ): Promise<AggregatedResult[]> {
    const results = await this.getResultsForQuery(query, benchmarkType);

    // Group by workflow/query combination
    // For workflow benchmarks, group by workflowId from the run
    // For other benchmarks, group by query
    const db = getDB();
    const runsCollection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);

    // Optimize: Fetch all unique runs in one query to avoid N+1
    const runIds = new Set<string>();
    for (const result of results) {
      if (result.benchmarkRunId) {
        runIds.add(result.benchmarkRunId.toString());
      }
    }

    const runsMap = new Map<string, BenchmarkRunDocument>();
    if (runIds.size > 0) {
      const runs = await runsCollection
        .find({ _id: { $in: Array.from(runIds).map((id) => new ObjectId(id)) } })
        .toArray();

      for (const run of runs) {
        runsMap.set(run._id!.toString(), run);
      }
    }

    const grouped = new Map<string, BenchmarkResultDocument[]>();

    for (const result of results) {
      if (!result.benchmarkRunId) continue;
      const run = runsMap.get(result.benchmarkRunId.toString());
      if (!run) continue;

      // Create a key for grouping
      // For workflow benchmarks, use workflowId if available
      // Otherwise, use query
      let key: string;
      if (run.workflowIds && run.workflowIds.length > 0) {
        key = `workflow:${run.workflowIds[0]}:${run.query || run.queries?.[0] || 'unknown'}`;
      } else {
        key = `query:${run.query || run.queries?.[0] || 'unknown'}`;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(result);
    }

    // Calculate metrics for each group
    const aggregated: AggregatedResult[] = [];

    for (const [key, groupResults] of grouped.entries()) {
      const firstResult = groupResults[0];
      if (!firstResult.benchmarkRunId) continue;
      const run = runsMap.get(firstResult.benchmarkRunId.toString());
      if (!run) continue;

      const metrics = this.calculateStatisticalMetrics(groupResults);

      aggregated.push({
        workflowId: run.workflowIds?.[0],
        workflowName: run.name,
        query: run.query || run.queries?.[0] || 'unknown',
        runs: groupResults.length,
        metrics,
        results: groupResults,
      });
    }

    return aggregated;
  }

  /**
   * Compare multiple workflows side-by-side
   */
  async compareWorkflows(
    workflowIds: string[],
    query?: string
  ): Promise<ComparisonResult[]> {
    const db = getDB();
    const runsCollection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);
    const resultsCollection = db.collection<BenchmarkResultDocument>(BENCHMARK_RESULTS_COLLECTION);

    // Find all runs for the specified workflows
    const runFilter: Filter<BenchmarkRunDocument> = {
      workflowIds: { $in: workflowIds },
    };
    if (query) {
      runFilter.$or = [
        { query },
        { queries: query },
      ];
    }

    const maxBenchmarkRuns = parseInt(process.env.MAX_BENCHMARK_RUNS || '500', 10);
    const runs = await runsCollection
      .find(runFilter)
      .limit(maxBenchmarkRuns)
      .toArray();
    if (runs.length === 0) {
      return [];
    }

    const runIds = runs.map((r) => r._id!);
    const maxBenchmarkResults = parseInt(process.env.MAX_BENCHMARK_RESULTS || '1000', 10);
    const results = await resultsCollection
      .find({ benchmarkRunId: { $in: runIds } })
      .limit(maxBenchmarkResults)
      .toArray();

    // Group by workflowId
    const grouped = new Map<string, BenchmarkResultDocument[]>();
    for (const result of results) {
      const run = runs.find((r) => r._id!.equals(result.benchmarkRunId));
      if (!run || !run.workflowIds || run.workflowIds.length === 0) continue;

      const workflowId = run.workflowIds[0];
      if (!grouped.has(workflowId)) {
        grouped.set(workflowId, []);
      }
      grouped.get(workflowId)!.push(result);
    }

    // Calculate metrics for each workflow
    const comparisons: ComparisonResult[] = [];

    for (const [workflowId, groupResults] of grouped.entries()) {
      const run = runs.find((r) => r.workflowIds?.includes(workflowId));
      if (!run) continue;

      const metrics = this.calculateStatisticalMetrics(groupResults);

      comparisons.push({
        workflowId,
        workflowName: run.name,
        query: run.query || run.queries?.[0] || 'unknown',
        runs: groupResults.length,
        metrics,
        results: groupResults,
      });
    }

    return comparisons;
  }

  /**
   * Get statistical metrics for a specific config and query
   */
  async getStatisticalMetrics(
    configName: string,
    query?: string,
    benchmarkType?: string
  ): Promise<StatisticalMetricsResult | null> {
    const results = await this.getResultsForQuery(query, benchmarkType, configName);

    if (results.length === 0) {
      return null;
    }

    const metrics = this.calculateStatisticalMetrics(results);
    const firstResult = results[0];
    const db = getDB();
    const runsCollection = db.collection<BenchmarkRunDocument>(BENCHMARK_RUNS_COLLECTION);
    const run = await runsCollection.findOne({ _id: firstResult.benchmarkRunId });

    return {
      configName,
      query: run?.query || run?.queries?.[0] || 'unknown',
      runs: results.length,
      metrics,
      results,
    };
  }
}

