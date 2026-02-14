import { TestRun, TestRunDocument, TestRunCreateInput, TestRunQueryFilters, TestSuite, TestStatus } from '../../models/TestRun.js';
import { logger } from '../../utils/logger.js';
import { PerformanceDriftService } from './PerformanceDriftService.js';
import { FlakeDetectionService } from './FlakeDetectionService.js';
import { FailurePatternAnalysisService } from './FailurePatternAnalysisService.js';

/**
 * Service for managing test run persistence and retrieval
 * 
 * Provides methods to persist test run summaries from CI/CD pipelines
 * and retrieve test run history for trend analysis and flake detection.
 */
export class TestRunService {
  private static instance: TestRunService;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): TestRunService {
    if (!TestRunService.instance) {
      TestRunService.instance = new TestRunService();
    }
    return TestRunService.instance;
  }

  /**
   * Initialize the service and ensure indexes exist
   */
  async initialize(): Promise<void> {
    try {
      await TestRun.ensureIndexes();
      logger.info('TestRunService initialized and indexes created');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize TestRunService');
      throw error;
    }
  }

  /**
   * Persist a test run summary
   * 
   * @param input Test run data to persist
   * @returns Created test run document
   */
  async persistTestRun(input: TestRunCreateInput): Promise<TestRunDocument> {
    try {
      const document = await TestRun.create(input);
      logger.debug({
        run_id: input.run_id,
        suite: input.suite,
        status: input.status,
        git_sha: input.git_sha,
      }, 'Test run persisted');

      // Invalidate caches that depend on test run data
      // Use Promise.allSettled to avoid failing if cache clearing fails
      await Promise.allSettled([
        PerformanceDriftService.getInstance().clearCache().catch(err => {
          logger.warn({ error: err }, 'Failed to clear PerformanceDriftService cache');
        }),
        FlakeDetectionService.getInstance().clearCache().catch(err => {
          logger.warn({ error: err }, 'Failed to clear FlakeDetectionService cache');
        }),
        FailurePatternAnalysisService.getInstance().clearCache().catch(err => {
          logger.warn({ error: err }, 'Failed to clear FailurePatternAnalysisService cache');
        }),
      ]);

      return document;
    } catch (error) {
      logger.error({ error, input }, 'Failed to persist test run');
      throw error;
    }
  }

  /**
   * Persist multiple test runs (bulk insert)
   * 
   * @param inputs Array of test run data to persist
   * @returns Array of created test run documents
   */
  async persistTestRuns(inputs: TestRunCreateInput[]): Promise<TestRunDocument[]> {
    try {
      const documents = await Promise.all(inputs.map(input => TestRun.create(input)));
      logger.debug(`Persisted ${documents.length} test runs`);

      // Invalidate caches after bulk insert
      // Check if any runs have failures
      const hasFailures = inputs.some(input => input.status === 'failed');
      
      await Promise.allSettled([
        PerformanceDriftService.getInstance().clearCache().catch(err => {
          logger.warn({ error: err }, 'Failed to clear PerformanceDriftService cache');
        }),
        FlakeDetectionService.getInstance().clearCache().catch(err => {
          logger.warn({ error: err }, 'Failed to clear FlakeDetectionService cache');
        }),
        hasFailures
          ? FailurePatternAnalysisService.getInstance().clearCache().catch(err => {
              logger.warn({ error: err }, 'Failed to clear FailurePatternAnalysisService cache');
            })
          : Promise.resolve(),
      ]);

      return documents;
    } catch (error) {
      logger.error({ error, count: inputs.length }, 'Failed to persist test runs');
      throw error;
    }
  }

  /**
   * Get test runs by filters
   * 
   * @param filters Query filters
   * @returns Array of test run documents
   */
  async getTestRuns(filters: TestRunQueryFilters = {}): Promise<TestRunDocument[]> {
    try {
      return await TestRun.find(filters);
    } catch (error) {
      logger.error({ error, filters }, 'Failed to get test runs');
      throw error;
    }
  }

  /**
   * Get test runs by run_id
   * 
   * @param run_id CI run identifier
   * @returns Array of test run documents for the run
   */
  async getTestRunsByRunId(run_id: string): Promise<TestRunDocument[]> {
    try {
      return await TestRun.findByRunId(run_id);
    } catch (error) {
      logger.error({ error, run_id }, 'Failed to get test runs by run_id');
      throw error;
    }
  }

  /**
   * Get test runs by git_sha
   * 
   * @param git_sha Git commit SHA
   * @returns Array of test run documents for the commit
   */
  async getTestRunsByGitSha(git_sha: string): Promise<TestRunDocument[]> {
    try {
      return await TestRun.findByGitSha(git_sha);
    } catch (error) {
      logger.error({ error, git_sha }, 'Failed to get test runs by git_sha');
      throw error;
    }
  }

  /**
   * Get test runs by branch
   * 
   * @param branch Branch name
   * @param limit Optional limit on number of results
   * @returns Array of test run documents for the branch
   */
  async getTestRunsByBranch(branch: string, limit?: number): Promise<TestRunDocument[]> {
    try {
      return await TestRun.findByBranch(branch, limit);
    } catch (error) {
      logger.error({ error, branch }, 'Failed to get test runs by branch');
      throw error;
    }
  }

  /**
   * Get test runs by suite
   * 
   * @param suite Test suite name
   * @param limit Optional limit on number of results
   * @returns Array of test run documents for the suite
   */
  async getTestRunsBySuite(suite: TestSuite, limit?: number): Promise<TestRunDocument[]> {
    try {
      return await TestRun.findBySuite(suite, limit);
    } catch (error) {
      logger.error({ error, suite }, 'Failed to get test runs by suite');
      throw error;
    }
  }

  /**
   * Get test runs by test_id (for individual test tracking)
   * 
   * @param test_id Individual test identifier
   * @param limit Optional limit on number of results
   * @returns Array of test run documents for the test
   */
  async getTestRunsByTestId(test_id: string, limit?: number): Promise<TestRunDocument[]> {
    try {
      return await TestRun.findByTestId(test_id, limit);
    } catch (error) {
      logger.error({ error, test_id }, 'Failed to get test runs by test_id');
      throw error;
    }
  }

  /**
   * Get test run statistics for a time range
   * 
   * @param startDate Start date for statistics
   * @param endDate End date for statistics
   * @param filters Optional filters (suite, branch, env)
   * @returns Statistics object
   */
  async getStatistics(
    startDate: Date,
    endDate: Date,
    filters?: {
      suite?: TestSuite;
      branch?: string;
      env?: string;
    }
  ) {
    try {
      return await TestRun.getStatistics(startDate, endDate, filters);
    } catch (error) {
      logger.error({ error, startDate, endDate, filters }, 'Failed to get test run statistics');
      throw error;
    }
  }

  /**
   * Clean up old test runs (retention policy)
   * 
   * @param retentionDays Number of days to retain (default: 90)
   * @returns Number of deleted test runs
   */
  async cleanupOldRuns(retentionDays: number = 90): Promise<number> {
    try {
      return await TestRun.cleanupOldRuns(retentionDays);
    } catch (error) {
      logger.error({ error, retentionDays }, 'Failed to cleanup old test runs');
      throw error;
    }
  }
}

export const testRunService = TestRunService.getInstance();

