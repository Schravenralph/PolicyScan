import { ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { getTestSummaryService, TestSummaryDocument } from './TestSummaryService.js';
import { TestRun, TestRunDocument } from '../../models/TestRun.js';
import { TestHistory, TestHistoryDocument } from '../../models/TestHistory.js';

/**
 * Unified test run data structure that normalizes across collections
 */
export interface UnifiedTestRun {
  id: string;
  timestamp: Date;
  testType: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
  duration: number;
  testRunner?: string;
  testCommand?: string;
  exitCode?: number;
  source: 'test_summaries' | 'test_runs' | 'test_history';
  // Additional fields from different sources
  git?: {
    commitHash?: string;
    branch?: string;
  };
  cicd?: {
    buildNumber?: string;
    buildId?: string;
    pipelineName?: string;
    environment?: string;
  };
}

/**
 * Query filters for test runs
 */
export interface TestRunQueryFilters {
  testType?: UnifiedTestRun['testType'];
  branch?: string;
  startDate?: Date;
  endDate?: Date;
  exitCode?: number;
  minPassRate?: number;
  maxPassRate?: number;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'duration' | 'passRate';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Query result with pagination metadata
 */
export interface TestRunQueryResult {
  runs: UnifiedTestRun[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Statistics for test runs
 */
export interface TestRunStatistics {
  totalRuns: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  totalTests: number;
  passRate: number;
  byTestType: Record<string, {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  }>;
  timeRangeDays: number;
}

/**
 * Test Run Query Service
 * 
 * Aggregates test runs from all collections (test_summaries, test_runs, test_history)
 * and provides a unified query interface for the dashboard.
 * 
 * This is a QUERY service only - it does NOT handle ingestion.
 * Ingestion is handled by TestResultIngestionService.
 */
export class TestRunQueryService {
  private static instance: TestRunQueryService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestRunQueryService {
    if (!TestRunQueryService.instance) {
      TestRunQueryService.instance = new TestRunQueryService();
    }
    return TestRunQueryService.instance;
  }

  /**
   * Normalize TestSummaryDocument to UnifiedTestRun
   */
  private normalizeSummary(summary: TestSummaryDocument): UnifiedTestRun {
    return {
      id: summary.runId,
      timestamp: summary.executionTimestamp,
      testType: summary.testType,
      summary: {
        total: summary.summary.total,
        passed: summary.summary.passed,
        failed: summary.summary.failed,
        skipped: summary.summary.skipped,
        passRate: summary.summary.passRate,
      },
      duration: summary.duration,
      testRunner: summary.testRunner,
      testCommand: summary.testCommand,
      exitCode: summary.exitCode,
      source: 'test_summaries',
      git: summary.git ? {
        commitHash: summary.git.commitHash,
        branch: summary.git.branch,
      } : undefined,
      cicd: summary.cicd ? {
        buildNumber: summary.cicd.buildNumber,
        buildId: summary.cicd.buildId,
        pipelineName: summary.cicd.pipelineName,
        environment: summary.cicd.environment,
      } : undefined,
    };
  }

  /**
   * Normalize TestRunDocument to UnifiedTestRun
   */
  private normalizeTestRun(run: TestRunDocument): UnifiedTestRun {
    const passRate = run.summary.total > 0
      ? (run.summary.passed / run.summary.total) * 100
      : 0;

    return {
      id: run.run_id,
      timestamp: run.timestamp,
      testType: this.mapSuiteToTestType(run.suite),
      summary: {
        total: run.summary.total,
        passed: run.summary.passed,
        failed: run.summary.failed,
        skipped: run.summary.skipped,
        passRate,
      },
      duration: run.duration,
      exitCode: run.status === 'passed' ? 0 : 1,
      source: 'test_runs',
      git: {
        commitHash: run.git_sha,
        branch: run.branch,
      },
      cicd: {
        environment: run.correlation_ids.env,
      },
    };
  }

  /**
   * Normalize TestHistoryDocument to UnifiedTestRun
   */
  private normalizeTestHistory(history: TestHistoryDocument): UnifiedTestRun {
    const passRate = history.result.total > 0
      ? (history.result.passed / history.result.total) * 100
      : 0;

    return {
      id: history.testFileId || history.testFilePath,
      timestamp: history.executionTimestamp,
      testType: history.testType,
      summary: {
        total: history.result.total,
        passed: history.result.passed,
        failed: history.result.failed,
        skipped: history.result.skipped,
        passRate,
      },
      duration: history.duration,
      testRunner: history.testRunner,
      testCommand: history.testCommand,
      exitCode: history.exitCode,
      source: 'test_history',
      git: history.git ? {
        commitHash: history.git.commitHash,
        branch: history.git.branch,
      } : undefined,
      cicd: history.cicd ? {
        buildNumber: history.cicd.buildNumber,
        buildId: history.cicd.buildId,
        pipelineName: history.cicd.pipelineName,
        environment: history.cicd.environment,
      } : undefined,
    };
  }

  /**
   * Map TestSuite to testType
   */
  private mapSuiteToTestType(suite: TestRunDocument['suite']): UnifiedTestRun['testType'] {
    const mapping: Record<TestRunDocument['suite'], UnifiedTestRun['testType']> = {
      'unit': 'unit',
      'component': 'unit',
      'integration': 'integration',
      'contract': 'integration',
      'e2e': 'e2e',
      'smoke': 'e2e',
    };
    return mapping[suite] || 'other';
  }

  /**
   * Deduplicate test runs by ID and timestamp
   * Prefers test_summaries > test_runs > test_history (in that order)
   */
  private deduplicateRuns(runs: UnifiedTestRun[]): UnifiedTestRun[] {
    const seen = new Map<string, UnifiedTestRun>();
    const sourcePriority: Record<UnifiedTestRun['source'], number> = {
      'test_summaries': 1,
      'test_runs': 2,
      'test_history': 3,
    };

    for (const run of runs) {
      const key = `${run.id}-${run.timestamp.getTime()}`;
      const existing = seen.get(key);

      if (!existing || sourcePriority[run.source] < sourcePriority[existing.source]) {
        seen.set(key, run);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Apply filters to unified test runs
   */
  private applyFilters(runs: UnifiedTestRun[], filters: TestRunQueryFilters): UnifiedTestRun[] {
    return runs.filter((run) => {
      if (filters.testType && run.testType !== filters.testType) {
        return false;
      }
      if (filters.branch && run.git?.branch !== filters.branch) {
        return false;
      }
      if (filters.startDate && run.timestamp < filters.startDate) {
        return false;
      }
      if (filters.endDate && run.timestamp > filters.endDate) {
        return false;
      }
      if (filters.exitCode !== undefined && run.exitCode !== filters.exitCode) {
        return false;
      }
      if (filters.minPassRate !== undefined && run.summary.passRate < filters.minPassRate) {
        return false;
      }
      if (filters.maxPassRate !== undefined && run.summary.passRate > filters.maxPassRate) {
        return false;
      }
      return true;
    });
  }

  /**
   * Sort unified test runs
   */
  private sortRuns(runs: UnifiedTestRun[], sortBy: PaginationOptions['sortBy'], sortOrder: PaginationOptions['sortOrder']): UnifiedTestRun[] {
    const sorted = [...runs];
    const order = sortOrder === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'timestamp':
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'duration':
          comparison = a.duration - b.duration;
          break;
        case 'passRate':
          comparison = a.summary.passRate - b.summary.passRate;
          break;
        default:
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
      }
      return comparison * order;
    });

    return sorted;
  }

  /**
   * Get all test runs with optional filters and pagination
   */
  async getAllTestRuns(
    filters: TestRunQueryFilters = {},
    options: PaginationOptions = {}
  ): Promise<TestRunQueryResult> {
    try {
      await ensureDBConnection();

      const {
        limit = 100,
        offset = 0,
        sortBy = 'timestamp',
        sortOrder = 'desc',
      } = options;

      // Query all collections in parallel
      const [summaries, testRuns, history] = await Promise.all([
        this.querySummaries(filters),
        this.queryTestRuns(filters),
        this.queryTestHistory(filters),
      ]);

      // Normalize all results
      const normalizedRuns: UnifiedTestRun[] = [
        ...summaries.map(s => this.normalizeSummary(s)),
        ...testRuns.map(r => this.normalizeTestRun(r)),
        ...history.map(h => this.normalizeTestHistory(h)),
      ];

      // Deduplicate
      const deduplicated = this.deduplicateRuns(normalizedRuns);

      // Apply filters (some may not have been applied at query level)
      const filtered = this.applyFilters(deduplicated, filters);

      // Sort
      const sorted = this.sortRuns(filtered, sortBy, sortOrder);

      // Apply pagination
      const total = sorted.length;
      const paginated = sorted.slice(offset, offset + limit);

      return {
        runs: paginated,
        total,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + paginated.length < total,
        },
      };
    } catch (error) {
      logger.error({ error, filters, options }, 'Failed to get all test runs');
      throw error;
    }
  }

  /**
   * Query test_summaries collection
   */
  private async querySummaries(filters: TestRunQueryFilters): Promise<TestSummaryDocument[]> {
    try {
      const summaryService = getTestSummaryService();
      const result = await summaryService.getAllSummaries(
        {
          testType: filters.testType,
          branch: filters.branch,
          startDate: filters.startDate,
          endDate: filters.endDate,
          exitCode: filters.exitCode,
          minPassRate: filters.minPassRate,
          maxPassRate: filters.maxPassRate,
        },
        {
          limit: 10000, // Get all matching summaries (will be deduplicated)
          offset: 0,
          sortBy: 'executionTimestamp',
          sortOrder: 'desc',
        }
      );
      return result.summaries;
    } catch (error) {
      logger.warn({ error }, 'Failed to query test_summaries, continuing with other collections');
      return [];
    }
  }

  /**
   * Query test_runs collection
   */
  private async queryTestRuns(filters: TestRunQueryFilters): Promise<TestRunDocument[]> {
    try {
      const queryFilters: Parameters<typeof TestRun.find>[0] = {
        branch: filters.branch,
        startDate: filters.startDate,
        endDate: filters.endDate,
      };

      // Map testType to suite if provided
      if (filters.testType) {
        const suiteMapping: Record<UnifiedTestRun['testType'], TestRunDocument['suite'] | undefined> = {
          'unit': 'unit',
          'integration': 'integration',
          'e2e': 'e2e',
          'visual': 'e2e',
          'performance': 'e2e',
          'workflow-steps': 'integration',
          'other': undefined,
        };
        const suite = suiteMapping[filters.testType];
        if (suite) {
          queryFilters.suite = suite;
        }
      }

      const runs = await TestRun.find(queryFilters);
      return runs;
    } catch (error) {
      logger.warn({ error }, 'Failed to query test_runs, continuing with other collections');
      return [];
    }
  }

  /**
   * Query test_history collection
   */
  private async queryTestHistory(filters: TestRunQueryFilters): Promise<TestHistoryDocument[]> {
    try {
      const queryFilters: Parameters<typeof TestHistory.find>[0] = {
        testType: filters.testType,
        gitBranch: filters.branch,
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: 10000, // Get all matching entries (will be deduplicated)
      };

      const result = await TestHistory.find(queryFilters);
      return result.entries;
    } catch (error) {
      logger.warn({ error }, 'Failed to query test_history, continuing with other collections');
      return [];
    }
  }

  /**
   * Get test run by ID
   */
  async getTestRunById(runId: string): Promise<UnifiedTestRun | null> {
    try {
      await ensureDBConnection();

      // Try to find in all collections
      const [summaries, testRuns, historyResult] = await Promise.all([
        this.querySummaries({}),
        TestRun.find({ run_id: runId }),
        TestHistory.find({ testFileId: runId }),
      ]);

      // Normalize and deduplicate
      const normalizedRuns: UnifiedTestRun[] = [
        ...summaries.filter(s => s.runId === runId).map(s => this.normalizeSummary(s)),
        ...testRuns.map(r => this.normalizeTestRun(r)),
        ...historyResult.entries.map(h => this.normalizeTestHistory(h)),
      ];

      if (normalizedRuns.length === 0) {
        return null;
      }

      // Deduplicate and return the highest priority one
      const deduplicated = this.deduplicateRuns(normalizedRuns);
      return deduplicated[0] || null;
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get test run by ID');
      throw error;
    }
  }

  /**
   * Get statistics for test runs
   */
  async getStatistics(timeRangeDays: number = 30): Promise<TestRunStatistics> {
    try {
      await ensureDBConnection();

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRangeDays);

      // Get all runs in time range
      const result = await this.getAllTestRuns(
        {
          startDate,
          endDate,
        },
        {
          limit: 100000, // Get all for statistics
          offset: 0,
        }
      );

      const runs = result.runs;

      // Calculate statistics
      let totalPassed = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      let totalTests = 0;
      const byTestType: Record<string, { total: number; passed: number; failed: number; skipped: number; passRate: number }> = {};

      for (const run of runs) {
        totalPassed += run.summary.passed;
        totalFailed += run.summary.failed;
        totalSkipped += run.summary.skipped || 0;
        totalTests += run.summary.total;

        if (!byTestType[run.testType]) {
          byTestType[run.testType] = { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 };
        }
        byTestType[run.testType].total += run.summary.total;
        byTestType[run.testType].passed += run.summary.passed;
        byTestType[run.testType].failed += run.summary.failed;
        byTestType[run.testType].skipped += run.summary.skipped || 0;
      }

      // Calculate pass rates (based on total tests, not just passed+failed)
      const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

      for (const type in byTestType) {
        const typeStats = byTestType[type];
        const typeTotal = typeStats.total;
        typeStats.passRate = typeTotal > 0 ? (typeStats.passed / typeTotal) * 100 : 0;
      }

      return {
        totalRuns: runs.length,
        totalPassed,
        totalFailed,
        totalSkipped,
        totalTests,
        passRate,
        byTestType,
        timeRangeDays,
      };
    } catch (error) {
      logger.error({ error, timeRangeDays }, 'Failed to get test run statistics');
      throw error;
    }
  }
}

/**
 * Get singleton instance of TestRunQueryService
 */
export function getTestRunQueryService(): TestRunQueryService {
  return TestRunQueryService.getInstance();
}
