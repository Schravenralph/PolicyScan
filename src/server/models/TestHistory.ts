import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { ErrorCategorizationService } from '../services/testing/ErrorCategorizationService.js';
import { logger } from '../utils/logger.js';

/**
 * Test History Database Schema
 * 
 * Stores test run history with execution details, results, environment information,
 * Git commit details, and CI/CD run information.
 * 
 * Collection: test_history
 */

export interface TestEnvironment {
  os: string; // Operating system (e.g., "linux", "darwin", "win32")
  osVersion?: string; // OS version
  nodeVersion: string; // Node.js version
  playwrightVersion?: string; // Playwright version (for E2E tests)
  jestVersion?: string; // Jest version (for unit/integration tests)
  architecture?: string; // CPU architecture (e.g., "x64", "arm64")
}

export interface GitInfo {
  commitHash: string; // Full Git commit hash
  commitHashShort?: string; // Short commit hash (first 7 characters)
  branch: string; // Git branch name
  tag?: string; // Git tag if applicable
  remoteUrl?: string; // Remote repository URL
}

export interface CICDRunInfo {
  buildNumber?: string; // CI/CD build number (e.g., "1234", "2025.01.27.1")
  buildId?: string; // Unique build ID
  pipelineName?: string; // Pipeline name
  pipelineStage?: string; // Pipeline stage (e.g., "build", "test", "deploy")
  environment?: string; // Environment (e.g., "CI", "staging", "production")
  runnerId?: string; // CI/CD runner ID
  workflowId?: string; // GitHub Actions workflow ID or similar
  workflowRunId?: string; // GitHub Actions run ID or similar
}

export interface TestFailure {
  testName: string; // Name of the failing test
  filePath?: string; // File path of the failing test
  errorMessage?: string; // Error message
  stackTrace?: string; // Stack trace
  duration?: number; // Test duration in milliseconds
  failureType?: string; // Type of failure (e.g., "assertion", "timeout", "error")
  // Enhanced error analysis fields
  errorCategory?: string; // e.g., "timeout", "assertion", "network", "database"
  errorPattern?: string; // Normalized error pattern for matching
  errorFingerprint?: string; // Hash of normalized error for deduplication
  errorSeverity?: 'low' | 'medium' | 'high' | 'critical';
  firstSeen?: Date; // When this error pattern was first seen
  lastSeen?: Date; // When this error pattern was last seen
  occurrenceCount?: number; // How many times this error has occurred
}

export interface TestResult {
  passed: number; // Number of tests passed
  failed: number; // Number of tests failed
  skipped: number; // Number of tests skipped
  total: number; // Total number of tests
  failures?: TestFailure[]; // Details of failed tests
}

export interface TestHistoryMetadata {
  testRunner?: string;
  shard?: string;
  parallel?: boolean;
  coverageEnabled?: boolean;
  coverageData?: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
  };
  tags?: string[];
  [key: string]: unknown;
}

export interface TestHistoryDocument {
  _id?: ObjectId;
  testFilePath: string; // Path to the test file (e.g., "tests/e2e/search-page.spec.ts")
  testFileId: string; // Unique identifier for the test file (normalized, e.g., "search-page.spec.ts")
  testType: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other'; // Type of test
  executionTimestamp: Date; // When the test was executed
  duration: number; // Total execution duration in milliseconds
  result: TestResult; // Test results (passed/failed/skipped counts)
  environment: TestEnvironment; // Environment information
  git: GitInfo; // Git commit and branch information
  cicd?: CICDRunInfo; // CI/CD run information (if applicable)
  testRunner?: string; // Test runner used (e.g., "jest", "playwright", "vitest")
  testCommand?: string; // Command used to run the test
  exitCode?: number; // Exit code of the test run (0 = success, non-zero = failure)
  metadata?: TestHistoryMetadata; // Additional metadata including coverage data
  expiresAt?: Date; // TTL expiration date - 60 days for failures, 7 days for successes (configurable via env vars)
  createdAt: Date; // When the record was created
  updatedAt?: Date; // When the record was last updated
}

export interface TestHistoryCreateInput {
  testFilePath: string;
  testFileId?: string; // Optional, will be derived from testFilePath if not provided
  testType: TestHistoryDocument['testType'];
  duration: number;
  result: TestResult;
  environment: TestEnvironment;
  git: GitInfo;
  cicd?: CICDRunInfo;
  testRunner?: string;
  testCommand?: string;
  exitCode?: number;
  executionTimestamp?: Date; // Optional, defaults to now
  metadata?: TestHistoryMetadata; // Optional metadata including coverage data
}

const COLLECTION_NAME = 'test_history';

/**
 * TestHistory model for MongoDB operations
 */
export class TestHistory {
  /**
   * Normalize test file path to create a consistent test file ID
   * Examples:
   *   "tests/e2e/search-page.spec.ts" -> "search-page.spec.ts"
   *   "./tests/unit/MyComponent.test.ts" -> "MyComponent.test.ts"
   */
  static normalizeTestFileId(testFilePath: string): string {
    // Remove leading ./ and normalize path separators
    const normalized = testFilePath.replace(/^\.\//, '').replace(/\\/g, '/');
    // Extract just the filename
    const parts = normalized.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Create a new test history entry
   *
   * @warning Do not use this directly. Use TestResultIngestionService.ingestTestRun instead
   * to ensure proper routing, side effects (summaries, active failures), and consistency.
   */
  static async create(input: TestHistoryCreateInput): Promise<TestHistoryDocument> {
    const db = getDB();
    const now = new Date();
    const testFileId = input.testFileId || this.normalizeTestFileId(input.testFilePath);

    // Normalize git commit hash (ensure we have short version)
    const gitInfo: GitInfo = {
      ...input.git,
      commitHashShort: input.git.commitHashShort || input.git.commitHash.substring(0, 7),
    };

    // Categorize errors if failures exist
    const categorizedResult = this.categorizeFailures(input.result, now);

    // Extract coverage data if available
    // This will be added to metadata after document creation
    const coverageData = await this.extractCoverageData();

    // Build metadata object
    const metadata: TestHistoryMetadata = {
      ...input.metadata,
      testRunner: input.testRunner || input.metadata?.testRunner,
      coverageEnabled: coverageData !== null,
      ...(coverageData && {
        coverageData: {
          statements: coverageData.summary.statements.percentage,
          branches: coverageData.summary.branches.percentage,
          functions: coverageData.summary.functions.percentage,
          lines: coverageData.summary.lines.percentage,
        },
      }),
    };

    // Set TTL expiration based on test result:
    // - Failures: 60 days (retain longer for debugging)
    // - Successes: 7 days (shorter retention for successful tests)
    // This ensures error details are retained longer, while successful test runs are cleaned up sooner
    const hasFailures = categorizedResult.failed > 0 && categorizedResult.failures && categorizedResult.failures.length > 0;
    const failureTTLDays = parseInt(process.env.TEST_HISTORY_FAILURE_TTL_DAYS || '60', 10);
    const successTTLDays = parseInt(process.env.TEST_HISTORY_SUCCESS_TTL_DAYS || '7', 10);
    
    const expiresAt = hasFailures
      ? new Date(now.getTime() + failureTTLDays * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + successTTLDays * 24 * 60 * 60 * 1000);

    const testHistoryDoc: TestHistoryDocument = {
      testFilePath: input.testFilePath,
      testFileId,
      testType: input.testType,
      executionTimestamp: input.executionTimestamp || now,
      duration: input.duration,
      result: categorizedResult,
      environment: input.environment,
      git: gitInfo,
      cicd: input.cicd,
      testRunner: input.testRunner,
      testCommand: input.testCommand,
      exitCode: input.exitCode,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db
      .collection<TestHistoryDocument>(COLLECTION_NAME)
      .insertOne(testHistoryDoc);

    const createdDoc = { ...testHistoryDoc, _id: result.insertedId };

    // Sync active failures (async, non-blocking)
    // This builds the derived view from test_history
    this.syncActiveFailures(createdDoc).catch((error) => {
      // Log but don't throw - we don't want to break test history creation if sync fails
      console.warn('[TestHistory] Failed to sync active failures:', error);
    });

    return createdDoc;
  }

  /**
   * Extract coverage data from coverage reports if available
   * This is called automatically during test history creation
   * 
   * @returns Coverage data if available, null otherwise
   */
  private static async extractCoverageData(): Promise<{
    summary: {
      statements: { percentage: number };
      branches: { percentage: number };
      functions: { percentage: number };
      lines: { percentage: number };
    };
  } | null> {
    try {
      // Lazy import to avoid loading coverage extractor if not needed
      // Note: Dynamic import is async, but extractCoverageData itself is synchronous
      const coverageExtractorModule = await import('../../../scripts/utils/coverage-extractor.js');
      const extractCoverageData = coverageExtractorModule.extractCoverageData;
      
      if (typeof extractCoverageData !== 'function') {
        return null;
      }

      const coverageData = extractCoverageData();
      
      if (!coverageData) {
        return null;
      }

      return {
        summary: {
          statements: { percentage: coverageData.summary.statements.percentage },
          branches: { percentage: coverageData.summary.branches.percentage },
          functions: { percentage: coverageData.summary.functions.percentage },
          lines: { percentage: coverageData.summary.lines.percentage },
        },
      };
    } catch (error) {
      // Log but don't throw - coverage extraction failure shouldn't break test history creation
      // Coverage data is optional and may not be available in all test runs
      if (error instanceof Error && !error.message.includes('not found')) {
        console.warn('[TestHistory] Warning: Could not extract coverage data:', error.message);
      }
      return null;
    }
  }

  /**
   * Sync active failures from test history (internal method)
   * This is called automatically after creating test history
   */
  private static async syncActiveFailures(testHistory: TestHistoryDocument): Promise<void> {
    try {
      // Lazy import to avoid circular dependencies
      const { getActiveFailureService } = await import('../services/testing/ActiveFailureService.js');
      const activeFailureService = getActiveFailureService();
      await activeFailureService.syncActiveFailures(testHistory);
    } catch (error) {
      // Log but don't throw - sync failure shouldn't break test history creation
      console.warn('[TestHistory] Error syncing active failures:', error);
    }
  }

  /**
   * Categorize test failures with error analysis metadata
   * 
   * @param result Test result with potential failures
   * @param timestamp Timestamp for firstSeen/lastSeen
   * @returns Test result with categorized failures
   */
  private static categorizeFailures(result: TestResult, timestamp: Date): TestResult {
    if (!result.failures || result.failures.length === 0) {
      return result;
    }

    const categorizationService = ErrorCategorizationService.getInstance();
    const categorizedFailures = result.failures.map((failure) => {
      // Only categorize if not already categorized
      if (
        failure.errorCategory &&
        failure.errorPattern &&
        failure.errorFingerprint
      ) {
        return failure;
      }

      const errorMessage = failure.errorMessage || '';
      const stackTrace = failure.stackTrace || '';

      const categorization = categorizationService.categorizeError(
        errorMessage,
        stackTrace
      );

      return {
        ...failure,
        errorCategory: categorization.category,
        errorPattern: categorization.pattern,
        errorFingerprint: categorization.fingerprint,
        errorSeverity: categorization.severity,
        firstSeen: failure.firstSeen || timestamp,
        lastSeen: timestamp,
        occurrenceCount: (failure.occurrenceCount || 0) + 1,
      };
    });

    return {
      ...result,
      failures: categorizedFailures,
    };
  }

  /**
   * Find test history entries by criteria
   */
  static async find(filters: {
    testFilePath?: string;
    testFileId?: string;
    testType?: TestHistoryDocument['testType'];
    gitCommitHash?: string;
    gitBranch?: string;
    cicdBuildNumber?: string;
    cicdEnvironment?: string;
    testCommand?: string;
    exitCode?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    // Error filters
    errorCategory?: string;
    errorPattern?: string;
    errorFingerprint?: string;
    errorSeverity?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<{ entries: TestHistoryDocument[]; total: number }> {
    const db = getDB();
    const {
      testFilePath,
      testFileId,
      testType,
      gitCommitHash,
      gitBranch,
      cicdBuildNumber,
      cicdEnvironment,
      testCommand,
      exitCode,
      startDate,
      endDate,
      limit = 100,
      skip = 0,
      sort = { executionTimestamp: -1 },
      errorCategory,
      errorPattern,
      errorFingerprint,
      errorSeverity,
    } = filters;

    // If error filters are present, use aggregation pipeline
    if (errorCategory || errorPattern || errorFingerprint || errorSeverity) {
      return this.findWithErrorFilters(filters);
    }

    // Otherwise, use simple query (backward compatible)
    const query: Filter<TestHistoryDocument> = {};

    if (testFilePath) query.testFilePath = testFilePath;
    if (testFileId) query.testFileId = testFileId;
    if (testType) query.testType = testType;
    if (exitCode !== undefined) query.exitCode = exitCode;

    if (gitCommitHash) {
      query.$or = [
        { 'git.commitHash': gitCommitHash },
        { 'git.commitHashShort': gitCommitHash },
      ];
    }
    if (gitBranch) query['git.branch'] = gitBranch;

    if (cicdBuildNumber) query['cicd.buildNumber'] = cicdBuildNumber;
    if (cicdEnvironment) query['cicd.environment'] = cicdEnvironment;
    if (testCommand) query.testCommand = testCommand;

    if (startDate || endDate) {
      query.executionTimestamp = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    const [entries, total] = await Promise.all([
      db
        .collection<TestHistoryDocument>(COLLECTION_NAME)
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<TestHistoryDocument>(COLLECTION_NAME).countDocuments(query),
    ]);

    return { entries, total };
  }

  /**
   * Find test history entries with error filters using aggregation pipeline
   */
  private static async findWithErrorFilters(filters: {
    testFilePath?: string;
    testFileId?: string;
    testType?: TestHistoryDocument['testType'];
    gitCommitHash?: string;
    gitBranch?: string;
    cicdBuildNumber?: string;
    cicdEnvironment?: string;
    exitCode?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
    errorCategory?: string;
    errorPattern?: string;
    errorFingerprint?: string;
    errorSeverity?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<{ entries: TestHistoryDocument[]; total: number }> {
    const db = getDB();
    const collection = db.collection<TestHistoryDocument>(COLLECTION_NAME);
    const {
      testFilePath,
      testFileId,
      testType,
      gitCommitHash,
      gitBranch,
      cicdBuildNumber,
      cicdEnvironment,
      exitCode,
      startDate,
      endDate,
      limit = 100,
      skip = 0,
      sort = { executionTimestamp: -1 },
      errorCategory,
      errorPattern,
      errorFingerprint,
      errorSeverity,
    } = filters;

    // Build match stage for non-error filters
    const matchStage: Record<string, unknown> = {
      'result.failed': { $gt: 0 },
      'result.failures': { $exists: true, $ne: [] },
    };

    if (testFilePath) matchStage.testFilePath = testFilePath;
    if (testFileId) matchStage.testFileId = testFileId;
    if (testType) matchStage.testType = testType;
    if (exitCode !== undefined) matchStage.exitCode = exitCode;

    if (gitCommitHash) {
      matchStage.$or = [
        { 'git.commitHash': gitCommitHash },
        { 'git.commitHashShort': gitCommitHash },
      ];
    }
    if (gitBranch) matchStage['git.branch'] = gitBranch;

    if (cicdBuildNumber) matchStage['cicd.buildNumber'] = cicdBuildNumber;
    if (cicdEnvironment) matchStage['cicd.environment'] = cicdEnvironment;

    if (startDate || endDate) {
      matchStage.executionTimestamp = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    // Build aggregation pipeline
    const pipeline: Array<Record<string, unknown>> = [
      { $match: matchStage },
      {
        $unwind: {
          path: '$result.failures',
          preserveNullAndEmptyArrays: false,
        },
      },
    ];

    // Add error filter match stage
    const errorMatchStage: Record<string, unknown> = {};
    if (errorCategory) {
      errorMatchStage['result.failures.errorCategory'] = errorCategory;
    }
    if (errorPattern) {
      errorMatchStage['result.failures.errorPattern'] = {
        $regex: errorPattern,
        $options: 'i',
      };
    }
    if (errorFingerprint) {
      errorMatchStage['result.failures.errorFingerprint'] = errorFingerprint;
    }
    if (errorSeverity) {
      errorMatchStage['result.failures.errorSeverity'] = errorSeverity;
    }

    if (Object.keys(errorMatchStage).length > 0) {
      pipeline.push({ $match: errorMatchStage });
    }

    // Group back to get unique test history entries
    // We need to reconstruct the document with all fields
    pipeline.push({
      $group: {
        _id: '$_id',
        testFilePath: { $first: '$testFilePath' },
        testFileId: { $first: '$testFileId' },
        testType: { $first: '$testType' },
        executionTimestamp: { $first: '$executionTimestamp' },
        duration: { $first: '$duration' },
        result: {
          $first: {
            passed: '$result.passed',
            failed: '$result.failed',
            skipped: '$result.skipped',
            total: '$result.total',
            failures: '$result.failures',
          },
        },
        environment: { $first: '$environment' },
        git: { $first: '$git' },
        cicd: { $first: '$cicd' },
        testRunner: { $first: '$testRunner' },
        testCommand: { $first: '$testCommand' },
        exitCode: { $first: '$exitCode' },
        createdAt: { $first: '$createdAt' },
        updatedAt: { $first: '$updatedAt' },
      },
    });

    // Restore _id field
    pipeline.push({
      $addFields: {
        _id: '$_id',
      },
    });

    // Get total count
    const countPipeline: Array<Record<string, unknown>> = [...pipeline, { $count: 'total' }];
    const countResult = await collection.aggregate(countPipeline).toArray();
    const total = countResult[0]?.total || 0;

    // Add sort, skip, and limit
    const sortObj: Record<string, 1 | -1> = {};
    for (const [key, value] of Object.entries(sort)) {
      sortObj[key] = value as 1 | -1;
    }
    pipeline.push({ $sort: sortObj });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const entries = await collection.aggregate(pipeline as Array<Record<string, unknown>>).toArray();

    return { entries: entries as TestHistoryDocument[], total };
  }

  /**
   * Find test history entry by ID
   */
  static async findById(id: string): Promise<TestHistoryDocument | null> {
    const db = getDB();
    return await db
      .collection<TestHistoryDocument>(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
  }

  /**
   * Find latest test history for a specific test file
   */
  static async findLatestByTestFile(
    testFilePath: string,
    limit: number = 10
  ): Promise<TestHistoryDocument[]> {
    const db = getDB();
    return await db
      .collection<TestHistoryDocument>(COLLECTION_NAME)
      .find({ testFilePath })
      .sort({ executionTimestamp: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get test history statistics
   */
  static async getStatistics(options: {
    startDate?: Date;
    endDate?: Date;
    testType?: TestHistoryDocument['testType'];
    testFilePath?: string;
    gitBranch?: string;
  }): Promise<{
    totalRuns: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    averageDuration: number;
    passRate: number;
    byTestType: Record<string, number>;
    byExitCode: Record<number, number>;
    recentFailures: Array<{
      testFilePath: string;
      executionTimestamp: Date;
      failureCount: number;
    }>;
  }> {
    const db = getDB();
    const { startDate, endDate, testType, testFilePath, gitBranch } = options;

    const query: Filter<TestHistoryDocument> = {};
    if (testType) query.testType = testType;
    if (testFilePath) query.testFilePath = testFilePath;
    if (gitBranch) query['git.branch'] = gitBranch;

    if (startDate || endDate) {
      query.executionTimestamp = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    // Limit to prevent memory exhaustion when calculating statistics
    // Default limit: 10000 entries, configurable via environment variable
    const MAX_TEST_HISTORY_STATS = parseInt(process.env.MAX_TEST_HISTORY_STATS || '10000', 10);

    const entries = await db
      .collection<TestHistoryDocument>(COLLECTION_NAME)
      .find(query)
      .limit(MAX_TEST_HISTORY_STATS)
      .toArray();

    // Log warning if query might have been truncated
    // Note: We can't know for sure without a count, but we can warn if we hit the limit
    if (entries.length === MAX_TEST_HISTORY_STATS) {
      console.warn(
        `[TestHistory] Statistics query may have been truncated at ${MAX_TEST_HISTORY_STATS} entries. ` +
        `Consider using date filters or increasing MAX_TEST_HISTORY_STATS.`
      );
    }

    const stats = {
      totalRuns: entries.length,
      totalPassed: 0,
      totalFailed: 0,
      totalSkipped: 0,
      totalDuration: 0,
      byTestType: {} as Record<string, number>,
      byExitCode: {} as Record<number, number>,
      failures: [] as Array<{
        testFilePath: string;
        executionTimestamp: Date;
        failureCount: number;
      }>,
    };

    entries.forEach((entry) => {
      stats.totalPassed += entry.result.passed;
      stats.totalFailed += entry.result.failed;
      stats.totalSkipped += entry.result.skipped;
      stats.totalDuration += entry.duration;

      // Count by test type
      stats.byTestType[entry.testType] = (stats.byTestType[entry.testType] || 0) + 1;

      // Count by exit code
      const exitCode = entry.exitCode ?? 0;
      stats.byExitCode[exitCode] = (stats.byExitCode[exitCode] || 0) + 1;

      // Track failures
      if (entry.result.failed > 0) {
        stats.failures.push({
          testFilePath: entry.testFilePath,
          executionTimestamp: entry.executionTimestamp,
          failureCount: entry.result.failed,
        });
      }
    });

    const averageDuration = stats.totalRuns > 0 ? stats.totalDuration / stats.totalRuns : 0;
    const totalTests = stats.totalPassed + stats.totalFailed + stats.totalSkipped;
    const passRate = totalTests > 0 ? stats.totalPassed / totalTests : 0;

    // Get recent failures (last 10)
    const recentFailures = stats.failures
      .sort((a, b) => b.executionTimestamp.getTime() - a.executionTimestamp.getTime())
      .slice(0, 10);

    return {
      totalRuns: stats.totalRuns,
      totalPassed: stats.totalPassed,
      totalFailed: stats.totalFailed,
      totalSkipped: stats.totalSkipped,
      averageDuration,
      passRate,
      byTestType: stats.byTestType,
      byExitCode: stats.byExitCode,
      recentFailures,
    };
  }

  /**
   * Ensure indexes exist for efficient queries
   * 
   * Creates indexes for common query patterns:
   * - executionTimestamp (descending) for time-based queries and sorting
   * - testFilePath for finding all runs of a specific test file
   * - testFileId for normalized test file lookups
   * - testType for filtering by test type
   * - git.commitHash and git.commitHashShort for Git commit lookups
   * - git.branch for branch-based queries
   * - cicd.buildNumber for CI/CD build lookups
   * - cicd.environment for CI/CD environment filtering
   * - exitCode for filtering by success/failure
   * - Compound indexes for common query combinations
   */
  static async ensureIndexes(): Promise<void> {
    const db = getDB();
    const collection = db.collection<TestHistoryDocument>(COLLECTION_NAME);

    try {
      // Primary index for time-based queries (most common)
      await collection.createIndex({ executionTimestamp: -1 }, { background: true });

      // Test file indexes
      await collection.createIndex({ testFilePath: 1 }, { background: true });
      await collection.createIndex({ testFileId: 1 }, { background: true });

      // Test type index
      await collection.createIndex({ testType: 1 }, { background: true });

      // Git indexes
      await collection.createIndex({ 'git.commitHash': 1 }, { background: true });
      await collection.createIndex({ 'git.commitHashShort': 1 }, { background: true });
      await collection.createIndex({ 'git.branch': 1 }, { background: true });

      // CI/CD indexes
      await collection.createIndex({ 'cicd.buildNumber': 1 }, { background: true, sparse: true });

      // Error analysis indexes for efficient error querying
      // Compound index for error-related queries
      await collection.createIndex(
        {
          'result.failures.errorCategory': 1,
          'result.failures.errorPattern': 1,
          'result.failures.errorFingerprint': 1,
          executionTimestamp: -1,
        },
        { background: true, name: 'idx_error_analysis' }
      );

      // Index for error category queries
      await collection.createIndex(
        { 'result.failures.errorCategory': 1, executionTimestamp: -1 },
        { background: true, name: 'idx_error_category' }
      );

      // Index for error fingerprint queries (for deduplication)
      await collection.createIndex(
        { 'result.failures.errorFingerprint': 1 },
        { background: true, name: 'idx_error_fingerprint', sparse: true }
      );

      // Index for error severity queries
      await collection.createIndex(
        { 'result.failures.errorSeverity': 1, executionTimestamp: -1 },
        { background: true, name: 'idx_error_severity', sparse: true }
      );
      await collection.createIndex({ 'cicd.environment': 1 }, { background: true, sparse: true });
      await collection.createIndex({ 'cicd.workflowId': 1 }, { background: true, sparse: true });

      // Exit code index
      await collection.createIndex({ exitCode: 1 }, { background: true });

      // Error-related indexes for efficient error queries
      await collection.createIndex(
        { 'result.failures.errorCategory': 1, executionTimestamp: -1 },
        { background: true, sparse: true }
      );
      await collection.createIndex(
        { 'result.failures.errorPattern': 1, executionTimestamp: -1 },
        { background: true, sparse: true }
      );
      await collection.createIndex(
        { 'result.failures.errorFingerprint': 1, executionTimestamp: -1 },
        { background: true, sparse: true }
      );
      await collection.createIndex(
        { 'result.failures.errorSeverity': 1, executionTimestamp: -1 },
        { background: true, sparse: true }
      );

      // Text index for error message search
      await collection.createIndex(
        {
          'result.failures.errorMessage': 'text',
          'result.failures.stackTrace': 'text',
        },
        { background: true, sparse: true }
      );

      // Compound indexes for common query patterns
      // Test file + timestamp (for test file history)
      await collection.createIndex(
        { testFilePath: 1, executionTimestamp: -1 },
        { background: true }
      );

      // Git commit + timestamp (for commit-based queries)
      await collection.createIndex(
        { 'git.commitHash': 1, executionTimestamp: -1 },
        { background: true }
      );

      // Git branch + timestamp (for branch-based queries)
      await collection.createIndex(
        { 'git.branch': 1, executionTimestamp: -1 },
        { background: true }
      );

      // Test type + timestamp (for type-based queries)
      await collection.createIndex(
        { testType: 1, executionTimestamp: -1 },
        { background: true }
      );

      // CI/CD environment + timestamp (for CI/CD queries)
      await collection.createIndex(
        { 'cicd.environment': 1, executionTimestamp: -1 },
        { background: true, sparse: true }
      );

      // TTL index for automatic deletion based on expiresAt field
      // - Failures: 60 days (configurable via TEST_HISTORY_FAILURE_TTL_DAYS)
      // - Successes: 7 days (configurable via TEST_HISTORY_SUCCESS_TTL_DAYS)
      // Only applies to documents with expiresAt field
      try {
        await collection.createIndex(
          { expiresAt: 1 },
          {
            expireAfterSeconds: 0, // Use expiresAt field value directly
            name: 'test_history_ttl_index',
            background: true,
            sparse: true, // Only index documents with expiresAt field
          }
        );
        logger.info('TestHistory TTL index created/verified');
      } catch (ttlError) {
        if (ttlError instanceof Error && !ttlError.message.includes('already exists')) {
          logger.warn({ error: ttlError }, 'Failed to create TestHistory TTL index');
        }
      }
    } catch (error) {
      // Index creation might fail if indexes already exist, which is fine
      // Log but don't throw to allow application to continue
      if (error instanceof Error && !error.message.includes('already exists')) {
        console.warn('[TestHistory] Warning: Could not create all indexes:', error);
      }
    }
  }
}
