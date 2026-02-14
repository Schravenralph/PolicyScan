/**
 * Unified Test Result Ingestion Service (Orchestrator)
 * 
 * Single entry point for all test result ingestion. Orchestrates test result
 * routing, normalization, and delegates storage to appropriate storage services.
 * 
 * Responsibilities:
 * - Validates input data
 * - Normalizes data format (runId, timestamps, etc.)
 * - Routes to appropriate storage services based on data type and requirements
 * - Coordinates sync operations (if needed)
 * 
 * Does NOT handle:
 * - Direct storage operations (delegated to storage services)
 * - Business logic (handled by specialized services)
 * 
 * @module src/server/services/testing/TestResultIngestionService
 */

import { logger } from '../../utils/logger.js';
import { ensureDBConnection } from '../../config/database.js';
import { TestHistoryCreateInput } from '../../models/TestHistory.js';
import { getTestSummaryService } from './TestSummaryService.js';
import { getTestCoverageService } from './TestCoverageService.js';
import { getTestHistoryStorageService } from './storage/TestHistoryStorageService.js';
import { getTestRunStorageService } from './storage/TestRunStorageService.js';
import { getTestLogStorageService } from './storage/TestLogStorageService.js';
import type { TestLogEntry, VerbosityLevel } from './TestLoggingService.js';
import { getGitInfoAsync, getTestEnvironmentAsync, getCICDInfo } from '../../utils/testRunnerUtils.js';
import type { TestRun } from './TestPerformanceAnalyticsService.js';

/**
 * Retry configuration for transient failures
 */
interface RetryConfig {
  maxRetries: number;
  retryDelay: number; // milliseconds
  backoffMultiplier: number;
  maxDelay: number; // maximum delay between retries
}

/**
 * Default retry configuration for test ingestion
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 500, // Start with 500ms
  backoffMultiplier: 2,
  maxDelay: 5000, // Max 5 seconds
};

/**
 * Check if an error is retryable (transient database or network error)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // MongoDB/Mongoose retryable errors
  const retryablePatterns = [
    'timeout',
    'connection',
    'network',
    'econnreset',
    'etimedout',
    'econnrefused',
    'socket',
    'pool',
    'transient',
    'temporary',
    'server selection',
    'topology',
    'mongonetworkerror',
    'mongoservererror',
    'mongotimeouterror',
    'write concern',
    'not connected',
    'connection closed',
  ];

  return retryablePatterns.some(pattern => 
    errorMessage.includes(pattern) || errorName.includes(pattern)
  );
}

/**
 * Execute an operation with retry logic for transient errors
 * 
 * @param operation Function to execute with retries
 * @param config Retry configuration
 * @param context Context string for logging
 * @returns Result of the operation
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string
): Promise<T> {
  let lastError: unknown;
  let delay = config.retryDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable and we haven't exceeded max retries
      if (attempt < config.maxRetries && isRetryableError(error)) {
        logger.debug(
          {
            attempt: attempt + 1,
            maxRetries: config.maxRetries + 1,
            delay,
            context,
            error: error instanceof Error ? error.message : String(error),
          },
          'Retrying test ingestion operation after transient error'
        );

        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        continue;
      }

      // Non-retryable error or max retries reached
      throw error;
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

/**
 * Input for ingesting a test run
 */
export interface TestRunIngestionInput {
  /** Unique run identifier (e.g., CI run ID, timestamp-based ID) */
  runId: string;
  /** Type of test suite */
  testType: 'unit' | 'integration' | 'e2e' | 'visual' | 'performance' | 'workflow-steps' | 'other';
  /** Test file path (optional - for single test file runs) */
  testFilePath?: string;
  /** Total execution duration in milliseconds */
  duration: number;
  /** Test result counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** Test failures with details (optional - only if failures exist) */
  failures?: Array<{
    test: string;
    file: string;
    error: string;
    stackTrace?: string;
  }>;
  /** Test runner used (e.g., 'playwright', 'vitest') */
  testRunner: string;
  /** Command used to run tests (optional) */
  testCommand?: string;
  /** Exit code (0 = success, non-zero = failure) */
  exitCode: number;
  /** Execution timestamp (defaults to now) */
  executionTimestamp?: Date;
  /** CI/CD run information (optional) */
  cicd?: {
    buildNumber?: string;
    buildId?: string;
    pipelineName?: string;
    pipelineStage?: string;
    environment?: string;
    runnerId?: string;
    workflowId?: string;
    workflowRunId?: string;
  };
}

/**
 * Input for ingesting coverage data
 */
export interface CoverageIngestionInput {
  /** Unique run identifier (must match test run ID) */
  runId: string;
  /** Coverage metrics */
  coverage: {
    lines: { total: number; covered: number; skipped: number; pct: number };
    statements: { total: number; covered: number; skipped: number; pct: number };
    functions: { total: number; covered: number; skipped: number; pct: number };
    branches: { total: number; covered: number; skipped: number; pct: number };
  };
  /** Module-level coverage breakdown (optional) */
  modules?: Record<string, {
    lines: { total: number; covered: number; skipped: number; pct: number };
    statements: { total: number; covered: number; skipped: number; pct: number };
    functions: { total: number; covered: number; skipped: number; pct: number };
    branches: { total: number; covered: number; skipped: number; pct: number };
  }>;
  /** Timestamp for coverage data (defaults to now) */
  timestamp?: Date;
}

/**
 * Input for ingesting test logs
 */
export interface LogIngestionInput {
  /** Test ID or run ID */
  testId: string;
  /** Test file path */
  testFile: string;
  /** Structured log entries */
  logs: Array<{
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: Date;
    [key: string]: unknown;
  }>;
  /** Verbosity level */
  verbosity?: 'minimal' | 'normal' | 'verbose';
}

/**
 * Unified Test Result Ingestion Service (Orchestrator)
 * 
 * Routes test results to appropriate storage services:
 * - TestSummaryService: Lightweight summaries (30-day TTL)
 * - TestHistoryStorageService: Detailed history with failures (60-day TTL for failures)
 * - TestRunStorageService: Long-term trend analysis (no expiration)
 * - TestCoverageService: Coverage metrics (90-day TTL)
 * - TestLogStorageService: Failed test logs (30-day TTL)
 */
export class TestResultIngestionService {
  private static instance: TestResultIngestionService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestResultIngestionService {
    if (!TestResultIngestionService.instance) {
      TestResultIngestionService.instance = new TestResultIngestionService();
    }
    return TestResultIngestionService.instance;
  }

  /**
   * Ensure database connection and indexes
   */
  async initialize(): Promise<void> {
    try {
      await ensureDBConnection();
      
      // Ensure indexes for all storage services
      const summaryService = getTestSummaryService();
      await summaryService.ensureIndexes();
      
      const historyStorageService = getTestHistoryStorageService();
      await historyStorageService.ensureIndexes();
      
      const runStorageService = getTestRunStorageService();
      await runStorageService.ensureIndexes();
      
      const coverageService = getTestCoverageService();
      await coverageService.ensureIndexes();
      
      const logStorageService = getTestLogStorageService();
      await logStorageService.ensureIndexes();
      
      logger.debug('TestResultIngestionService initialized');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize TestResultIngestionService');
      throw error;
    }
  }

  /**
   * Validate test run input data
   * 
   * Ensures data integrity before ingestion:
   * - Required fields are present
   * - Counts are non-negative
   * - Totals are consistent
   * - Failures match failed count
   * 
   * @param input Test run data to validate
   * @throws Error if validation fails
   */
  private validateTestRunInput(input: TestRunIngestionInput): void {
    // Validate required fields
    if (!input.runId || typeof input.runId !== 'string') {
      throw new Error('runId is required and must be a string');
    }
    if (!input.testType || !['unit', 'integration', 'e2e', 'visual', 'performance', 'workflow-steps', 'other'].includes(input.testType)) {
      throw new Error(`testType is required and must be one of: unit, integration, e2e, visual, performance, workflow-steps, other`);
    }
    if (!input.testRunner || typeof input.testRunner !== 'string') {
      throw new Error('testRunner is required and must be a string');
    }
    if (typeof input.exitCode !== 'number') {
      throw new Error('exitCode is required and must be a number');
    }

    // Validate summary
    if (!input.summary) {
      throw new Error('summary is required');
    }
    const { total, passed, failed, skipped } = input.summary;

    // Validate counts are non-negative
    if (typeof total !== 'number' || total < 0) {
      throw new Error(`summary.total must be a non-negative number, got: ${total}`);
    }
    if (typeof passed !== 'number' || passed < 0) {
      throw new Error(`summary.passed must be a non-negative number, got: ${passed}`);
    }
    if (typeof failed !== 'number' || failed < 0) {
      throw new Error(`summary.failed must be a non-negative number, got: ${failed}`);
    }
    if (typeof skipped !== 'number' || skipped < 0) {
      throw new Error(`summary.skipped must be a non-negative number, got: ${skipped}`);
    }

    // Validate totals are consistent (allow some flexibility for test runners that may not report perfectly)
    const sum = passed + failed + skipped;
    if (total > 0 && sum > total * 1.1) {
      // Allow 10% tolerance for test runners that may double-count or have timing issues
      logger.warn(
        { total, passed, failed, skipped, sum },
        'Test count mismatch: sum of passed/failed/skipped significantly exceeds total'
      );
    }

    // Validate duration is non-negative
    if (typeof input.duration !== 'number' || input.duration < 0) {
      throw new Error(`duration must be a non-negative number, got: ${input.duration}`);
    }

    // Validate failures array matches failed count (if provided)
    if (input.failures) {
      if (!Array.isArray(input.failures)) {
        throw new Error('failures must be an array if provided');
      }
      if (failed > 0 && input.failures.length === 0) {
        logger.warn(
          { failed, failuresLength: input.failures.length },
          'Failed count > 0 but failures array is empty'
        );
      }
      if (failed === 0 && input.failures.length > 0) {
        logger.warn(
          { failed, failuresLength: input.failures.length },
          'Failed count is 0 but failures array is not empty'
        );
      }
      // Validate failure structure
      for (let i = 0; i < input.failures.length; i++) {
        const failure = input.failures[i];
        if (!failure.test || typeof failure.test !== 'string') {
          throw new Error(`failures[${i}].test is required and must be a string`);
        }
        if (!failure.file || typeof failure.file !== 'string') {
          throw new Error(`failures[${i}].file is required and must be a string`);
        }
        if (!failure.error || typeof failure.error !== 'string') {
          throw new Error(`failures[${i}].error is required and must be a string`);
        }
      }
    }
  }

  /**
   * Ingest a test run - routes to appropriate collections
   * 
   * This is the main entry point for test result ingestion.
   * It automatically routes data to:
   * - test_summaries (always)
   * - test_history (if failures exist)
   * - test_runs (if CI/CD info provided)
   * 
   * @param input Test run data to ingest
   */
  async ingestTestRun(input: TestRunIngestionInput): Promise<void> {
    try {
      // Validate input data first
      this.validateTestRunInput(input);

      await this.initialize();

      // Ensure runId is in unified format (generate if not provided or invalid)
      const { ensureTestRunId } = await import('../../utils/testRunIdGenerator.js');
      const runId = ensureTestRunId(input.testType, input.runId);

      const summaryService = getTestSummaryService();
      const executionTimestamp = input.executionTimestamp || new Date();

      // 1. Always save lightweight summary (test_summaries collection)
      // Use retry logic for transient database failures
      await withRetry(
        async () => {
          await summaryService.saveSummary({
            runId: runId,
            testType: input.testType,
            duration: input.duration,
            total: input.summary.total,
            passed: input.summary.passed,
            failed: input.summary.failed,
            skipped: input.summary.skipped,
            testRunner: input.testRunner,
            testCommand: input.testCommand,
            exitCode: input.exitCode,
            executionTimestamp,
          });
        },
        DEFAULT_RETRY_CONFIG,
        `saving test summary for runId: ${runId}`
      );

      logger.debug({ runId }, 'Test summary saved');

      // 2. Sync to all sources (MongoDB already done, now sync to JSON file)
      try {
        const { getTestRunDataSyncService } = await import('./TestRunDataSyncService.js');
        const syncService = getTestRunDataSyncService();
        
        // Create TestRun object from input for sync
        const run: TestRun = {
          id: runId,
          timestamp: executionTimestamp.toISOString(),
          testType: input.testType,
          testFile: input.testCommand,
          results: {
            timestamp: executionTimestamp.toISOString(),
            total: input.summary.total,
            passed: input.summary.passed,
            failed: input.summary.failed,
            skipped: input.summary.skipped,
            duration: input.duration,
          },
          summary: {
            passRate: input.summary.total > 0 
              ? (input.summary.passed / input.summary.total) * 100 
              : 0,
          },
        };
        
        // Sync to JSON file (MongoDB already synced above)
        await syncService.syncRunToAllSources(run);
        logger.debug({ runId }, 'Test run synced to all sources');
      } catch (error) {
        // Don't fail ingestion if sync fails - log and continue
        logger.warn({ error, runId }, 'Failed to sync test run to all sources (non-critical)');
      }

      // 3. Save detailed history for all test runs (test_history collection)
      // Always log test results - failures get longer TTL (60 days), successes get shorter TTL (7 days)
      const git = await getGitInfoAsync();
      const environment = await getTestEnvironmentAsync(input.testRunner);
      const cicd = input.cicd || getCICDInfo();

      // Map failures if they exist
      const testFailures = input.failures && input.failures.length > 0
        ? input.failures.map((failure) => ({
            testName: failure.test,
            filePath: failure.file,
            errorMessage: failure.error,
            stackTrace: failure.stackTrace || failure.error,
          }))
        : undefined;

      const testHistoryInput: TestHistoryCreateInput = {
        testFilePath: input.testFilePath || 'all-tests',
        testType: input.testType,
        duration: input.duration,
        result: {
          passed: input.summary.passed,
          failed: input.summary.failed,
          skipped: input.summary.skipped,
          total: input.summary.total,
          failures: testFailures,
        },
        environment,
        git,
        cicd,
        testRunner: input.testRunner,
        testCommand: input.testCommand,
        exitCode: input.exitCode,
        executionTimestamp,
      };

      const historyStorageService = getTestHistoryStorageService();
      // Use retry logic for transient database failures
      await withRetry(
        async () => {
          await historyStorageService.save(testHistoryInput);
        },
        DEFAULT_RETRY_CONFIG,
        `saving test history for runId: ${runId}`
      );
      logger.debug({ 
        runId, 
        hasFailures: (input.failures?.length || 0) > 0,
        failureCount: input.failures?.length || 0,
        totalTests: input.summary.total 
      }, 'Test history saved');

      // 4. Save to test_runs if CI/CD info provided (for long-term trend analysis)
      if (input.cicd && (input.cicd.buildId || input.cicd.workflowRunId)) {
        const git = await getGitInfoAsync();
        const cicd = input.cicd || getCICDInfo();
        
        const runStorageService = getTestRunStorageService();
        const testRunInput = runStorageService.createInputFromIngestion({
          runId,
          testType: input.testType,
          gitSha: git.commitHash,
          branch: git.branch,
          status: input.summary.failed > 0 ? 'failed' : 'passed',
          duration: input.duration,
          timestamp: executionTimestamp,
          summary: input.summary,
          cicd,
          metadata: {
            testRunner: input.testRunner,
            testCommand: input.testCommand,
            testType: input.testType,
          },
        });

        // Use retry logic for transient database failures
        await withRetry(
          async () => {
            await runStorageService.save(testRunInput);
          },
          DEFAULT_RETRY_CONFIG,
          `saving test run for trend analysis, runId: ${runId}`
        );
        logger.debug({ runId }, 'Test run saved for trend analysis');
      }

      logger.info(
        { 
          runId: runId, 
          testType: input.testType,
          passed: input.summary.passed,
          failed: input.summary.failed,
        },
        'Test run ingested successfully'
      );
    } catch (error) {
      logger.error({ error, runId: input.runId || 'unknown' }, 'Failed to ingest test run');
      throw error;
    }
  }

  /**
   * Validate coverage input data
   * 
   * @param input Coverage data to validate
   * @throws Error if validation fails
   */
  private validateCoverageInput(input: CoverageIngestionInput): void {
    if (!input.runId || typeof input.runId !== 'string') {
      throw new Error('runId is required and must be a string');
    }
    if (!input.coverage) {
      throw new Error('coverage is required');
    }
    const { lines, statements, functions, branches } = input.coverage;
    
    // Validate coverage metrics structure
    const validateMetric = (metric: { total: number; covered: number; skipped: number; pct: number }, name: string) => {
      if (typeof metric.total !== 'number' || metric.total < 0) {
        throw new Error(`${name}.total must be a non-negative number`);
      }
      if (typeof metric.covered !== 'number' || metric.covered < 0) {
        throw new Error(`${name}.covered must be a non-negative number`);
      }
      if (typeof metric.skipped !== 'number' || metric.skipped < 0) {
        throw new Error(`${name}.skipped must be a non-negative number`);
      }
      if (typeof metric.pct !== 'number' || metric.pct < 0 || metric.pct > 100) {
        throw new Error(`${name}.pct must be a number between 0 and 100`);
      }
    };
    
    validateMetric(lines, 'coverage.lines');
    validateMetric(statements, 'coverage.statements');
    validateMetric(functions, 'coverage.functions');
    validateMetric(branches, 'coverage.branches');
  }

  /**
   * Ingest coverage data - routes to test_coverage collection
   * 
   * This method ingests coverage data directly into the test_coverage collection.
   * It uses TestCoverageService.ingestCoverageDirectly() to persist the data.
   * 
   * @param input Coverage data to ingest
   */
  async ingestCoverage(input: CoverageIngestionInput): Promise<void> {
    try {
      // Validate input data first
      this.validateCoverageInput(input);

      await this.initialize();

      const coverageService = getTestCoverageService();
      await coverageService.ensureIndexes();

      // Use retry logic for transient database failures
      await withRetry(
        async () => {
          await coverageService.ingestCoverageDirectly({
            runId: input.runId,
            timestamp: input.timestamp || new Date(),
            summary: input.coverage,
            modules: input.modules || {},
          });
        },
        DEFAULT_RETRY_CONFIG,
        `ingesting coverage data for runId: ${input.runId}`
      );

      logger.info({ runId: input.runId }, 'Coverage data ingested successfully');
    } catch (error) {
      logger.error({ error, runId: input.runId }, 'Failed to ingest coverage data');
      throw error;
    }
  }

  /**
   * Validate log input data
   * 
   * @param input Log data to validate
   * @throws Error if validation fails
   */
  private validateLogInput(input: LogIngestionInput): void {
    if (!input.testId || typeof input.testId !== 'string') {
      throw new Error('testId is required and must be a string');
    }
    if (!input.testFile || typeof input.testFile !== 'string') {
      throw new Error('testFile is required and must be a string');
    }
    if (!input.logs || !Array.isArray(input.logs)) {
      throw new Error('logs is required and must be an array');
    }
    if (input.logs.length === 0) {
      throw new Error('logs array must not be empty');
    }
    
    // Validate each log entry
    for (let i = 0; i < input.logs.length; i++) {
      const log = input.logs[i];
      if (!log.level || !['error', 'warn', 'info', 'debug'].includes(log.level)) {
        throw new Error(`logs[${i}].level must be one of: error, warn, info, debug`);
      }
      if (!log.message || typeof log.message !== 'string') {
        throw new Error(`logs[${i}].message is required and must be a string`);
      }
      if (!log.timestamp || !(log.timestamp instanceof Date)) {
        throw new Error(`logs[${i}].timestamp is required and must be a Date`);
      }
    }
  }

  /**
   * Ingest test logs - routes to test_logs collection
   * 
   * Note: Currently, test logs are only persisted for failed tests.
   * This method can be extended to support other log ingestion patterns.
   * 
   * @param input Log data to ingest
   */
  async ingestLogs(input: LogIngestionInput): Promise<void> {
    try {
      // Validate input data first
      this.validateLogInput(input);

      await this.initialize();

      // Convert input logs to TestLogEntry format
      const mappedLogs: TestLogEntry[] = input.logs.map((log, index) => {
        // Extract known fields
        const { level, message, timestamp, ...metadata } = log;

        // Map level to flag
        let flag: 'error' | 'warning' | 'info' | 'debug' = 'info';
        if (level === 'error') flag = 'error';
        else if (level === 'warn') flag = 'warning';
        else if (level === 'debug') flag = 'debug';

        // Extract special fields from metadata if they exist
        const category = (metadata.category as any) || 'terminal';
        const description = metadata.description as string | undefined;
        const screenshotPath = metadata.screenshotPath as string | undefined;
        const screenshotUrl = metadata.screenshotUrl as string | undefined;
        const videoPath = metadata.videoPath as string | undefined;
        const videoUrl = metadata.videoUrl as string | undefined;
        const terminalOutput = metadata.terminalOutput as string | undefined;

        // Remove extracted fields from metadata to avoid duplication
        const cleanMetadata = { ...metadata };
        delete (cleanMetadata as any).category;
        delete (cleanMetadata as any).description;
        delete (cleanMetadata as any).screenshotPath;
        delete (cleanMetadata as any).screenshotUrl;
        delete (cleanMetadata as any).videoPath;
        delete (cleanMetadata as any).videoUrl;
        delete (cleanMetadata as any).terminalOutput;

        return {
          id: `${input.testId}-${timestamp.getTime()}-${index}`,
          timestamp: timestamp.toISOString(),
          category,
          flag,
          message,
          data: {
            terminalOutput,
            description,
            screenshotPath,
            screenshotUrl,
            videoPath,
            videoUrl,
            metadata: Object.keys(cleanMetadata).length > 0 ? cleanMetadata : undefined,
          },
          testId: input.testId,
          testFile: input.testFile,
        };
      });

      // Save logs using storage service
      // Use retry logic for transient database failures
      const logStorageService = getTestLogStorageService();
      await withRetry(
        async () => {
          await logStorageService.save({
            testId: input.testId,
            testFile: input.testFile,
            logs: mappedLogs,
            verbosity: (input.verbosity as VerbosityLevel) || 'normal',
          });
        },
        DEFAULT_RETRY_CONFIG,
        `saving test logs for testId: ${input.testId}`
      );

      logger.debug(
        { 
          testId: input.testId, 
          logCount: mappedLogs.length,
        },
        'Logs ingested successfully'
      );
    } catch (error) {
      logger.error({ error, testId: input.testId }, 'Failed to ingest logs');
      throw error;
    }
  }

  /**
   * Ingest complete test run with all data types
   * 
   * Convenience method that ingests test run, coverage, and logs in one call.
   * 
   * @param runInput Test run data
   * @param coverageInput Coverage data (optional)
   * @param logInput Log data (optional)
   */
  async ingestComplete(
    runInput: TestRunIngestionInput,
    coverageInput?: CoverageIngestionInput,
    logInput?: LogIngestionInput
  ): Promise<void> {
    try {
      // Ingest test run first (main data)
      await this.ingestTestRun(runInput);

      // Ingest coverage if provided
      if (coverageInput) {
        // Ensure runId matches
        if (coverageInput.runId !== runInput.runId) {
          logger.warn(
            { runId: runInput.runId, coverageRunId: coverageInput.runId },
            'Coverage runId does not match test run runId'
          );
        }
        await this.ingestCoverage(coverageInput);
      }

      // Ingest logs if provided
      if (logInput) {
        await this.ingestLogs(logInput);
      }

      logger.info({ runId: runInput.runId }, 'Complete test run ingested successfully');
    } catch (error) {
      logger.error({ error, runId: runInput.runId }, 'Failed to ingest complete test run');
      throw error;
    }
  }
}

/**
 * Get singleton instance of TestResultIngestionService
 */
export function getTestResultIngestionService(): TestResultIngestionService {
  return TestResultIngestionService.getInstance();
}

