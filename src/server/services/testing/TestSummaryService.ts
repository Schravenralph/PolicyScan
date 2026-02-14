import { getDB, isDBConnected, connectDB, ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { TestHistory, TestHistoryCreateInput, TestEnvironment, GitInfo } from '../../models/TestHistory.js';
import { getGitInfoAsync, getTestEnvironmentAsync, getCICDInfo } from '../../utils/testRunnerUtils.js';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';

const COLLECTION_NAME = 'test_summaries';

// Cache configuration
const CACHE_TTL = parseInt(process.env.TEST_SUMMARY_CACHE_TTL || '300000', 10); // 5 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.TEST_SUMMARY_CACHE_MAX_SIZE || '1000', 10);

/**
 * Lightweight test summary document (stored in MongoDB with 30-day TTL)
 * Only stores overview data, not detailed test results
 */
export interface TestSummaryDocument {
  _id?: string;
  runId: string; // Unique run identifier
  testType: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other';
  executionTimestamp: Date;
  duration: number; // Total duration in milliseconds
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number; // Percentage (0-100)
  };
  testRunner: string; // 'jest', 'playwright', etc.
  testCommand?: string; // Command used to run tests
  exitCode: number; // 0 = success, non-zero = failure
  environment: TestEnvironment;
  git: GitInfo;
  cicd?: ReturnType<typeof getCICDInfo>;
  expiresAt: Date; // TTL expiration date (30 days from creation)
  createdAt: Date;
}

/**
 * Service for saving lightweight test summaries to MongoDB
 * Summaries are automatically deleted after 30 days via TTL index
 */
export class TestSummaryService {
  private static instance: TestSummaryService | null = null;
  private cache: Cache<unknown>;

  private constructor() {
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'test-summary-service');
  }

  static getInstance(): TestSummaryService {
    if (!TestSummaryService.instance) {
      TestSummaryService.instance = new TestSummaryService();
    }
    return TestSummaryService.instance;
  }

  /**
   * Ensure TTL index exists for automatic cleanup (30 days)
   */
  async ensureIndexes(): Promise<void> {
    const db = await ensureDBConnection();
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    try {
      // TTL index - documents expire 30 days after creation
      await collection.createIndex(
        { expiresAt: 1 },
        {
          expireAfterSeconds: 0, // Use expiresAt field value directly
          name: 'test_summaries_ttl_index',
          background: true,
        }
      );

      // Indexes for common queries
      await collection.createIndex({ executionTimestamp: -1 }, { background: true });
      await collection.createIndex({ testType: 1, executionTimestamp: -1 }, { background: true });
      await collection.createIndex({ 'git.branch': 1, executionTimestamp: -1 }, { background: true });
      await collection.createIndex({ runId: 1 }, { unique: true, background: true });
      await collection.createIndex({ exitCode: 1 }, { background: true });
      // Index for passRate filtering
      await collection.createIndex({ 'summary.passRate': 1 }, { background: true });
      // Compound index for common filter combinations
      await collection.createIndex(
        { testType: 1, 'git.branch': 1, executionTimestamp: -1 },
        { background: true }
      );

      logger.info('TestSummary indexes created/verified');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('already exists')) {
        logger.warn({ error }, 'Failed to create TestSummary indexes');
        throw error;
      }
      logger.debug('TestSummary indexes already exist');
    }
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `test-summary:${prefix}:${hash}`;
  }

  /**
   * Invalidate all cache entries (called when new data is saved)
   */
  private async invalidateCache(): Promise<void> {
    try {
      // Clear all cache entries - the Cache service doesn't support prefix-based clearing
      // so we clear the entire cache when new data is saved
      await this.cache.clear();
      logger.debug('Cache invalidated for test summaries');
    } catch (error) {
      logger.warn({ error }, 'Failed to invalidate cache');
    }
  }

  /**
   * Clear cache for test summaries
   * Useful when new test summaries are added and cache should be invalidated
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    logger.info('Test summary cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ReturnType<typeof this.cache.getStats> {
    return this.cache.getStats();
  }

  /**
   * Save a test summary to MongoDB
   * @param input Summary data to save
   * @returns The saved summary document
   */
  async saveSummary(input: {
    runId: string;
    testType: TestSummaryDocument['testType'];
    duration: number;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    testRunner: string;
    testCommand?: string;
    exitCode: number;
    executionTimestamp?: Date;
    git?: GitInfo;
    environment?: TestEnvironment;
  }): Promise<TestSummaryDocument> {
    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.error({ error }, 'Failed to ensure database connection before saving test summary');
      throw new Error('Database connection required to save test summary');
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    const now = new Date();
    const executionTimestamp = input.executionTimestamp || now;
    
    // Calculate expiration date (30 days from now)
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const git = input.git || await getGitInfoAsync();
    const environment = input.environment || await getTestEnvironmentAsync(input.testRunner);
    const cicd = getCICDInfo();

    const passRate = input.total > 0 ? (input.passed / input.total) * 100 : 0;

    const summary: TestSummaryDocument = {
      runId: input.runId,
      testType: input.testType,
      executionTimestamp,
      duration: input.duration,
      summary: {
        total: input.total,
        passed: input.passed,
        failed: input.failed,
        skipped: input.skipped,
        passRate,
      },
      testRunner: input.testRunner,
      testCommand: input.testCommand,
      exitCode: input.exitCode,
      environment,
      git,
      cicd,
      expiresAt,
      createdAt: now,
    };

    try {
      await collection.insertOne(summary);
      logger.debug({ runId: input.runId, testType: input.testType }, 'Test summary saved to MongoDB');
      
      // Invalidate cache after saving new summary
      await this.invalidateCache();
      
      return summary;
    } catch (error) {
      logger.error({ error, runId: input.runId }, 'Failed to save test summary to MongoDB');
      throw error;
    }
  }

  /**
   * Get recent test summaries
   * @param limit Maximum number of summaries to return
   * @param testType Optional filter by test type
   * @returns Array of test summaries
   */
  async getRecentSummaries(
    limit: number = 50,
    testType?: TestSummaryDocument['testType'],
    offset: number = 0
  ): Promise<{ summaries: TestSummaryDocument[]; total: number }> {
    // Generate cache key
    const cacheKey = this.getCacheKey('recent-summaries', { limit, testType, offset });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getRecentSummaries');
      return cached as { summaries: TestSummaryDocument[]; total: number };
    }

    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty array');
      return { summaries: [], total: 0 };
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    const filter: Record<string, unknown> = {};
    if (testType) {
      filter.testType = testType;
    }

    try {
      // Get total count for pagination metadata
      const total = await collection.countDocuments(filter);
      
      // Get paginated summaries
      const summaries = await collection
        .find(filter)
        .sort({ executionTimestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      const result = { summaries, total };

      // Store in cache
      await this.cache.set(cacheKey, result);
      logger.debug({ cacheKey }, 'Cache miss for getRecentSummaries, stored in cache');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to get recent test summaries');
      throw error;
    }
  }

  /**
   * Get total count of test summaries
   * @param testType Optional filter by test type
   * @returns Total count of summaries
   */
  async getTotalCount(testType?: TestSummaryDocument['testType']): Promise<number> {
    // Generate cache key
    const cacheKey = this.getCacheKey('total-count', { testType });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached !== undefined) {
      logger.debug({ cacheKey }, 'Cache hit for getTotalCount');
      return cached as number;
    }

    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning 0');
      return 0;
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    const filter: Record<string, unknown> = {};
    if (testType) {
      filter.testType = testType;
    }

    try {
      const count = await collection.countDocuments(filter);
      
      // Store in cache
      await this.cache.set(cacheKey, count);
      logger.debug({ cacheKey }, 'Cache miss for getTotalCount, stored in cache');

      return count;
    } catch (error) {
      logger.error({ error }, 'Failed to get total count of test summaries');
      throw error;
    }
  }

  /**
   * Get summary statistics
   */
  async getStatistics(timeRangeDays: number = 30): Promise<{
    totalRuns: number;
    totalPassed: number;
    totalFailed: number;
    passRate: number;
    byTestType: Record<string, number>;
  }> {
    // Generate cache key
    const cacheKey = this.getCacheKey('statistics', { timeRangeDays });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getStatistics');
      return cached as {
        totalRuns: number;
        totalPassed: number;
        totalFailed: number;
        passRate: number;
        byTestType: Record<string, number>;
      };
    }

    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty statistics');
      return {
        totalRuns: 0,
        totalPassed: 0,
        totalFailed: 0,
        passRate: 0,
        byTestType: {},
      };
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    const cutoffDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);

    try {
      const summaries = await collection
        .find({ executionTimestamp: { $gte: cutoffDate } })
        .toArray();

      const stats = {
        totalRuns: summaries.length,
        totalPassed: 0,
        totalFailed: 0,
        passRate: 0,
        byTestType: {} as Record<string, number>,
      };

      summaries.forEach((summary) => {
        stats.totalPassed += summary.summary.passed;
        stats.totalFailed += summary.summary.failed;
        stats.byTestType[summary.testType] = (stats.byTestType[summary.testType] || 0) + 1;
      });

      const totalTests = stats.totalPassed + stats.totalFailed;
      stats.passRate = totalTests > 0 ? (stats.totalPassed / totalTests) * 100 : 0;

      // Store in cache
      await this.cache.set(cacheKey, stats);
      logger.debug({ cacheKey }, 'Cache miss for getStatistics, stored in cache');

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get test summary statistics');
      throw error;
    }
  }

  /**
   * Get previous and next run IDs for navigation
   * @param runId The current run ID
   * @returns Previous and next run IDs
   */
  async getAdjacentRuns(
    runId: string
  ): Promise<{ previousRunId?: string; nextRunId?: string }> {
    const currentRun = await this.getSummaryByRunId(runId);
    if (!currentRun) return {};

    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty adjacent runs');
      return {};
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    // Filter by same testType
    const filter = { testType: currentRun.testType };

    try {
      // Find previous run (older)
      const [previous] = await collection
        .find({
          ...filter,
          executionTimestamp: { $lt: currentRun.executionTimestamp },
        })
        .sort({ executionTimestamp: -1 }) // Descending (nearest older run)
        .limit(1)
        .project({ runId: 1 })
        .toArray();

      // Find next run (newer)
      const [next] = await collection
        .find({
          ...filter,
          executionTimestamp: { $gt: currentRun.executionTimestamp },
        })
        .sort({ executionTimestamp: 1 }) // Ascending (nearest newer run)
        .limit(1)
        .project({ runId: 1 })
        .toArray();

      return {
        previousRunId: previous?.runId,
        nextRunId: next?.runId,
      };
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get adjacent runs');
      return {};
    }
  }

  /**
   * Get a test summary by runId
   * @param runId The run ID to search for
   * @returns The test summary document or null if not found
   */
  async getSummaryByRunId(runId: string): Promise<TestSummaryDocument | null> {
    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning null');
      return null;
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    try {
      const summary = await collection.findOne({ runId });
      return summary || null;
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get test summary by runId');
      throw error;
    }
  }

  /**
   * Get test summaries by test command (test file name)
   * @param testCommand The test command/file name to search for
   * @param limit Maximum number of summaries to return
   * @returns Array of test summaries matching the test command
   */
  async getSummariesByTestCommand(
    testCommand: string,
    limit: number = 100
  ): Promise<TestSummaryDocument[]> {
    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty array');
      return [];
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    try {
      // Use regex to match test command (case-insensitive, partial match)
      const summaries = await collection
        .find({
          testCommand: { $regex: testCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
        })
        .sort({ executionTimestamp: -1 })
        .limit(limit)
        .toArray();

      return summaries;
    } catch (error) {
      logger.error({ error, testCommand }, 'Failed to get test summaries by test command');
      throw error;
    }
  }

  /**
   * Get all test summaries with optional filters
   * @param filters Optional filters for querying
   * @param options Pagination and sorting options
   * @returns Array of test summaries matching the filters
   */
  async getAllSummaries(
    filters: {
      testType?: TestSummaryDocument['testType'];
      branch?: string;
      startDate?: Date;
      endDate?: Date;
      exitCode?: number;
      minPassRate?: number;
      maxPassRate?: number;
    } = {},
    options: {
      limit?: number;
      offset?: number;
      sortBy?: 'executionTimestamp' | 'duration' | 'passRate';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ summaries: TestSummaryDocument[]; total: number }> {
    const {
      limit = 1000,
      offset = 0,
      sortBy = 'executionTimestamp',
      sortOrder = 'desc',
    } = options;

    // Generate cache key
    const cacheKey = this.getCacheKey('all-summaries', { filters, options });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getAllSummaries');
      return cached as { summaries: TestSummaryDocument[]; total: number };
    }

    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty array');
      return { summaries: [], total: 0 };
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    // Build filter
    const filter: Record<string, unknown> = {};
    if (filters.testType) {
      filter.testType = filters.testType;
    }
    if (filters.branch) {
      filter['git.branch'] = filters.branch;
    }
    if (filters.startDate || filters.endDate) {
      const executionTimestampFilter: Record<string, Date> = {};
      if (filters.startDate) {
        executionTimestampFilter.$gte = filters.startDate;
      }
      if (filters.endDate) {
        executionTimestampFilter.$lte = filters.endDate;
      }
      filter.executionTimestamp = executionTimestampFilter;
    }
    if (filters.exitCode !== undefined) {
      filter.exitCode = filters.exitCode;
    }
    if (filters.minPassRate !== undefined || filters.maxPassRate !== undefined) {
      const passRateFilter: Record<string, number> = {};
      if (filters.minPassRate !== undefined) {
        passRateFilter.$gte = filters.minPassRate;
      }
      if (filters.maxPassRate !== undefined) {
        passRateFilter.$lte = filters.maxPassRate;
      }
      filter['summary.passRate'] = passRateFilter;
    }

    try {
      // Get total count for pagination metadata
      const total = await collection.countDocuments(filter);

      // Build sort object
      const sort: Record<string, 1 | -1> = {};
      const sortDirection = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'executionTimestamp') {
        sort.executionTimestamp = sortDirection;
      } else if (sortBy === 'duration') {
        sort.duration = sortDirection;
      } else if (sortBy === 'passRate') {
        sort['summary.passRate'] = sortDirection;
      }

      // Get paginated summaries
      const summaries = await collection
        .find(filter)
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .toArray();

      const result = { summaries, total };

      // Store in cache
      await this.cache.set(cacheKey, result);
      logger.debug({ cacheKey }, 'Cache miss for getAllSummaries, stored in cache');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to get all test summaries');
      throw error;
    }
  }

  /**
   * Get all unique test files (test commands) that have been run
   * @param filters Optional filters for test type, branch, date range
   * @returns Array of unique test files with their run counts and latest run info
   */
  async getAllUniqueTestFiles(filters: {
    testType?: TestSummaryDocument['testType'];
    branch?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<Array<{
    testFile: string;
    testCommand: string;
    totalRuns: number;
    latestRun: Date;
    testType: TestSummaryDocument['testType'];
    lastPassRate: number;
    avgPassRate: number;
  }>> {
    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty array');
      return [];
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    // Build filter
    const filter: Record<string, unknown> = {
      testCommand: { $exists: true, $ne: null },
    };
    // Add additional check for empty string
    filter.testCommand = { ...(filter.testCommand as Record<string, unknown>), $ne: '' };
    if (filters.testType) {
      filter.testType = filters.testType;
    }
    if (filters.branch) {
      filter['git.branch'] = filters.branch;
    }
    if (filters.startDate || filters.endDate) {
      const executionTimestampFilter: Record<string, Date> = {};
      if (filters.startDate) {
        executionTimestampFilter.$gte = filters.startDate;
      }
      if (filters.endDate) {
        executionTimestampFilter.$lte = filters.endDate;
      }
      filter.executionTimestamp = executionTimestampFilter;
    }

    try {
      // Use aggregation to group by testCommand and get statistics
      const pipeline = [
        { $match: filter },
        {
          $group: {
            _id: '$testCommand',
            totalRuns: { $sum: 1 },
            latestRun: { $max: '$executionTimestamp' },
            testType: { $first: '$testType' },
            lastPassRate: { $last: '$summary.passRate' },
            avgPassRate: { $avg: '$summary.passRate' },
            runs: { $push: '$$ROOT' },
          },
        },
        {
          $project: {
            _id: 0,
            testFile: '$_id',
            testCommand: '$_id',
            totalRuns: 1,
            latestRun: 1,
            testType: 1,
            lastPassRate: 1,
            avgPassRate: { $round: ['$avgPassRate', 2] },
          },
        },
        { $sort: { latestRun: -1 } },
      ];

      const results = await collection.aggregate(pipeline).toArray() as unknown as Array<{
        testFile?: string;
        testCommand?: string;
        totalRuns?: number;
        latestRun?: Date;
        testType?: TestSummaryDocument['testType'];
        lastPassRate?: number;
        avgPassRate?: number;
      }>;

      return results.map((result) => ({
        testFile: result.testFile || result.testCommand || '',
        testCommand: result.testCommand || '',
        totalRuns: result.totalRuns || 0,
        latestRun: result.latestRun || new Date(),
        testType: (result.testType || 'other') as TestSummaryDocument['testType'],
        lastPassRate: result.lastPassRate || 0,
        avgPassRate: result.avgPassRate || 0,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get all unique test files');
      throw error;
    }
  }

  /**
   * Enrich test summaries with failure details from TestHistory
   * @param summaries Test summaries to enrich
   * @returns Enriched summaries with failure details
   */
  async enrichSummariesWithFailures(
    summaries: TestSummaryDocument[]
  ): Promise<Array<TestSummaryDocument & { failures?: Array<{
    testName: string;
    filePath: string;
    errorMessage: string;
    stackTrace?: string;
  }> }>> {
    if (summaries.length === 0) {
      return [];
    }

    // Ensure database is connected
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning summaries without failures');
      return summaries;
    }

    const testHistoryCollection = db.collection('test_history');
    const runIds = summaries.map(s => s.runId).filter(Boolean);

    if (runIds.length === 0) {
      return summaries;
    }

    try {
      // Get test history entries for these runIds
      // Note: TestHistory doesn't store runId directly, so we match by testCommand and executionTimestamp
      const enrichedSummaries = await Promise.all(
        summaries.map(async (summary) => {
          // Try to find matching test history entry
          const historyEntry = await testHistoryCollection.findOne({
            testCommand: summary.testCommand,
            executionTimestamp: summary.executionTimestamp,
            'result.failed': { $gt: 0 },
          });

          if (historyEntry && historyEntry.result?.failures) {
            return {
              ...summary,
              failures: historyEntry.result.failures.map((f: {
                testName?: string;
                filePath?: string;
                errorMessage?: string;
                stackTrace?: string;
              }) => ({
                testName: f.testName || 'Unknown',
                filePath: f.filePath || summary.testCommand || 'Unknown',
                errorMessage: f.errorMessage || 'Unknown error',
                stackTrace: f.stackTrace,
              })),
            };
          }

          return summary;
        })
      );

      return enrichedSummaries;
    } catch (error) {
      logger.warn({ error }, 'Failed to enrich summaries with failures, returning summaries without failures');
      return summaries;
    }
  }

  /**
   * Get test summaries matching a test ID (can match runId or testCommand)
   * @param testId The test ID to search for (can be runId or test file name)
   * @param limit Maximum number of summaries to return
   * @param includeFailures Whether to include failure details from TestHistory
   * @returns Array of test summaries matching the test ID
   */
  async getSummariesByTestId(
    testId: string,
    limit: number = 100,
    includeFailures: boolean = false
  ): Promise<TestSummaryDocument[]> {
    // Ensure database is connected before accessing
    let db;
    try {
      db = await ensureDBConnection();
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure database connection, returning empty array');
      return [];
    }
    const collection = db.collection<TestSummaryDocument>(COLLECTION_NAME);

    try {
      // Try to match by runId first (exact match)
      const byRunId = await collection.findOne({ runId: testId });
      if (byRunId) {
        return [byRunId];
      }

      // If not found by runId, try to match by testCommand (partial match)
      // Normalize testId for matching (remove .spec.ts extension if present)
      const normalizedTestId = testId.replace(/\.spec\.ts$/, '');
      const regexPattern = normalizedTestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const summaries = await collection
        .find({
          $or: [
            { testCommand: { $regex: regexPattern, $options: 'i' } },
            { testCommand: { $regex: `${regexPattern}\\.spec\\.ts`, $options: 'i' } },
          ],
        })
        .sort({ executionTimestamp: -1 })
        .limit(limit)
        .toArray();

      return summaries;
    } catch (error) {
      logger.error({ error, testId }, 'Failed to get test summaries by test ID');
      throw error;
    }
  }
}

export function getTestSummaryService(): TestSummaryService {
  return TestSummaryService.getInstance();
}

