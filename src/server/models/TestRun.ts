import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'test_runs';

export type TestSuite = 'unit' | 'component' | 'integration' | 'contract' | 'e2e' | 'smoke';
export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface TestRunDocument {
  _id?: ObjectId;
  run_id: string; // CI run identifier (e.g., GitHub Actions run ID)
  git_sha: string;
  branch: string;
  suite: TestSuite;
  status: TestStatus;
  duration: number; // milliseconds
  timestamp: Date;
  test_id?: string; // Individual test identifier (optional, for individual test tracking)
  correlation_ids: {
    run_id: string;
    test_id?: string;
    git_sha: string;
    branch: string;
    env: string; // e.g., 'ci', 'local', 'staging'
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  metadata?: Record<string, unknown>; // Additional metadata (e.g., CI job name, shard, etc.)
  createdAt: Date;
  updatedAt: Date;
}

export interface TestRunCreateInput {
  run_id: string;
  git_sha: string;
  branch: string;
  suite: TestSuite;
  status: TestStatus;
  duration: number;
  timestamp?: Date;
  test_id?: string;
  correlation_ids: {
    run_id: string;
    test_id?: string;
    git_sha: string;
    branch: string;
    env: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  metadata?: Record<string, unknown>;
}

export interface TestRunQueryFilters {
  run_id?: string;
  git_sha?: string;
  branch?: string;
  suite?: TestSuite;
  status?: TestStatus;
  test_id?: string;
  env?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * MongoDB model for test runs
 * 
 * Stores test execution history for long-term trend analysis, flake detection,
 * and "what broke when?" analysis across git history.
 */
export class TestRun {
  /**
   * Ensure indexes exist for efficient querying
   */
  static async ensureIndexes(): Promise<void> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);

    const indexes: Array<{ key: Record<string, 1 | -1>; name: string }> = [
      { key: { run_id: 1 }, name: 'idx_run_id' },
      { key: { git_sha: 1 }, name: 'idx_git_sha' },
      { key: { branch: 1 }, name: 'idx_branch' },
      { key: { suite: 1 }, name: 'idx_suite' },
      { key: { timestamp: -1 }, name: 'idx_timestamp' },
      { key: { 'correlation_ids.run_id': 1 }, name: 'idx_correlation_run_id' },
      { key: { 'correlation_ids.test_id': 1 }, name: 'idx_correlation_test_id' },
      { key: { 'correlation_ids.git_sha': 1 }, name: 'idx_correlation_git_sha' },
      { key: { 'correlation_ids.branch': 1 }, name: 'idx_correlation_branch' },
      { key: { 'correlation_ids.env': 1 }, name: 'idx_correlation_env' },
      // Compound indexes for common queries
      { key: { git_sha: 1, suite: 1, timestamp: -1 }, name: 'idx_git_sha_suite_timestamp' },
      { key: { branch: 1, suite: 1, timestamp: -1 }, name: 'idx_branch_suite_timestamp' },
      { key: { suite: 1, status: 1, timestamp: -1 }, name: 'idx_suite_status_timestamp' },
      { key: { test_id: 1, timestamp: -1 }, name: 'idx_test_id_timestamp' },
    ];

    try {
      for (const index of indexes) {
        await collection.createIndex(index.key, { name: index.name, background: true });
      }
      logger.debug('TestRun indexes created successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to create TestRun indexes');
      throw error;
    }
  }

  /**
   * Create a new test run
   */
  static async create(input: TestRunCreateInput): Promise<TestRunDocument> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);

    const now = new Date();
    const document: TestRunDocument = {
      ...input,
      timestamp: input.timestamp || now,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  /**
   * Find test runs by filters
   */
  static async find(filters: TestRunQueryFilters = {}): Promise<TestRunDocument[]> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);

    const query: Filter<TestRunDocument> = {};

    if (filters.run_id) {
      query.run_id = filters.run_id;
    }
    if (filters.git_sha) {
      query.git_sha = filters.git_sha;
    }
    if (filters.branch) {
      query.branch = filters.branch;
    }
    if (filters.suite) {
      query.suite = filters.suite;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.test_id) {
      query.test_id = filters.test_id;
    }
    if (filters.env) {
      query['correlation_ids.env'] = filters.env;
    }
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.timestamp.$lte = filters.endDate;
      }
    }

    // Limit to prevent memory exhaustion when loading test runs
    // Default limit: 5000 runs, configurable via environment variable
    const MAX_TEST_RUNS = parseInt(process.env.MAX_TEST_RUNS || '5000', 10);
    
    const runs = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(MAX_TEST_RUNS)
      .toArray();
    
    if (runs.length === MAX_TEST_RUNS) {
      console.warn(
        `[TestRun] find() query may have been truncated at ${MAX_TEST_RUNS} entries. ` +
        `Consider using date filters or increasing MAX_TEST_RUNS.`
      );
    }
    
    return runs;
  }

  /**
   * Find test runs by run_id
   */
  static async findByRunId(run_id: string): Promise<TestRunDocument[]> {
    return this.find({ run_id });
  }

  /**
   * Find test runs by git_sha
   */
  static async findByGitSha(git_sha: string): Promise<TestRunDocument[]> {
    return this.find({ git_sha });
  }

  /**
   * Find test runs by branch
   */
  static async findByBranch(branch: string, limit?: number): Promise<TestRunDocument[]> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);
    
    // Default limit to prevent memory exhaustion when limit is not provided
    // Default limit: 5000 runs, configurable via environment variable
    const MAX_TEST_RUNS = parseInt(process.env.MAX_TEST_RUNS || '5000', 10);
    const effectiveLimit = limit ?? MAX_TEST_RUNS;
    
    const runs = await collection
      .find({ branch })
      .sort({ timestamp: -1 })
      .limit(effectiveLimit)
      .toArray();
    
    if (!limit && runs.length === MAX_TEST_RUNS) {
      console.warn(
        `[TestRun] findByBranch() query may have been truncated at ${MAX_TEST_RUNS} entries. ` +
        `Consider providing a limit or increasing MAX_TEST_RUNS.`
      );
    }
    
    return runs;
  }

  /**
   * Find test runs by suite
   */
  static async findBySuite(suite: TestSuite, limit?: number): Promise<TestRunDocument[]> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);
    
    // Default limit to prevent memory exhaustion when limit is not provided
    // Default limit: 5000 runs, configurable via environment variable
    const MAX_TEST_RUNS = parseInt(process.env.MAX_TEST_RUNS || '5000', 10);
    const effectiveLimit = limit ?? MAX_TEST_RUNS;
    
    const runs = await collection
      .find({ suite })
      .sort({ timestamp: -1 })
      .limit(effectiveLimit)
      .toArray();
    
    if (!limit && runs.length === MAX_TEST_RUNS) {
      console.warn(
        `[TestRun] findBySuite() query may have been truncated at ${MAX_TEST_RUNS} entries. ` +
        `Consider providing a limit or increasing MAX_TEST_RUNS.`
      );
    }
    
    return runs;
  }

  /**
   * Find test runs by test_id (for individual test tracking)
   */
  static async findByTestId(test_id: string, limit?: number): Promise<TestRunDocument[]> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);
    
    // Default limit to prevent memory exhaustion when limit is not provided
    // Default limit: 5000 runs, configurable via environment variable
    const MAX_TEST_RUNS = parseInt(process.env.MAX_TEST_RUNS || '5000', 10);
    const effectiveLimit = limit ?? MAX_TEST_RUNS;
    
    const runs = await collection
      .find({ test_id })
      .sort({ timestamp: -1 })
      .limit(effectiveLimit)
      .toArray();
    
    if (!limit && runs.length === MAX_TEST_RUNS) {
      console.warn(
        `[TestRun] findByTestId() query may have been truncated at ${MAX_TEST_RUNS} entries. ` +
        `Consider providing a limit or increasing MAX_TEST_RUNS.`
      );
    }
    
    return runs;
  }

  /**
   * Get test run statistics for a time range
   */
  static async getStatistics(
    startDate: Date,
    endDate: Date,
    filters?: {
      suite?: TestSuite;
      branch?: string;
      env?: string;
    }
  ): Promise<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    averageDuration: number;
    bySuite: Record<TestSuite, { total: number; passed: number; failed: number; skipped: number }>;
  }> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);

    const query: Filter<TestRunDocument> = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    if (filters?.suite) {
      query.suite = filters.suite;
    }
    if (filters?.branch) {
      query.branch = filters.branch;
    }
    if (filters?.env) {
      query['correlation_ids.env'] = filters.env;
    }

    // Limit to prevent memory exhaustion when calculating statistics
    // Default limit: 10000 runs for stats calculation, configurable via environment variable
    const MAX_TEST_RUN_STATS = parseInt(process.env.MAX_TEST_RUN_STATS || '10000', 10);
    
    const runs = await collection
      .find(query)
      .limit(MAX_TEST_RUN_STATS)
      .toArray();
    
    if (runs.length === MAX_TEST_RUN_STATS) {
      console.warn(
        `[TestRun] getStatistics() query may have been truncated at ${MAX_TEST_RUN_STATS} entries. ` +
        `Statistics may be incomplete. Consider narrowing the date range or increasing MAX_TEST_RUN_STATS.`
      );
    }

    const stats = {
      total: runs.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      passRate: 0,
      averageDuration: 0,
      bySuite: {} as Record<TestSuite, { total: number; passed: number; failed: number; skipped: number }>,
    };

    let totalDuration = 0;

    for (const run of runs) {
      if (run.status === 'passed') stats.passed++;
      else if (run.status === 'failed') stats.failed++;
      else if (run.status === 'skipped') stats.skipped++;

      totalDuration += run.duration;

      // Aggregate by suite
      if (!stats.bySuite[run.suite]) {
        stats.bySuite[run.suite] = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }
      stats.bySuite[run.suite].total++;
      if (run.status === 'passed') stats.bySuite[run.suite].passed++;
      else if (run.status === 'failed') stats.bySuite[run.suite].failed++;
      else if (run.status === 'skipped') stats.bySuite[run.suite].skipped++;
    }

    if (runs.length > 0) {
      stats.passRate = stats.passed / runs.length;
      stats.averageDuration = totalDuration / runs.length;
    }

    return stats;
  }

  /**
   * Clean up old test runs (retention policy)
   */
  static async cleanupOldRuns(retentionDays: number = 90): Promise<number> {
    const db = await getDB();
    const collection = db.collection<TestRunDocument>(COLLECTION_NAME);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    logger.info(`Cleaned up ${result.deletedCount} test runs older than ${retentionDays} days`);
    return result.deletedCount;
  }
}

