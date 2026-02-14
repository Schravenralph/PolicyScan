/**
 * Test Run Storage Service
 * 
 * Handles storage of long-term test run trend data to MongoDB (test_runs collection).
 * Only stores records when CI/CD info is provided (no expiration).
 * 
 * Single Responsibility: Store test run trend data to MongoDB only.
 * 
 * @module src/server/services/testing/storage/TestRunStorageService
 */

import { logger } from '../../../utils/logger.js';
import { ensureDBConnection } from '../../../config/database.js';
import { TestRun as TestRunModel, TestRunCreateInput, TestRunDocument, TestSuite } from '../../../models/TestRun.js';

/**
 * Service for storing test run trend data
 * 
 * This service handles ONLY storage of test run data to MongoDB.
 * It does NOT handle:
 * - Routing decisions (handled by TestResultIngestionService)
 * - Data normalization (handled by TestResultIngestionService)
 * - CI/CD detection (handled by TestResultIngestionService)
 */
export class TestRunStorageService {
  private static instance: TestRunStorageService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestRunStorageService {
    if (!TestRunStorageService.instance) {
      TestRunStorageService.instance = new TestRunStorageService();
    }
    return TestRunStorageService.instance;
  }

  /**
   * Ensure database connection and indexes
   */
  async ensureIndexes(): Promise<void> {
    try {
      await ensureDBConnection();
      await TestRunModel.ensureIndexes();
      logger.debug('TestRunStorageService indexes ensured');
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure TestRunStorageService indexes');
      throw error;
    }
  }

  /**
   * Map test type to test suite
   */
  private mapTestTypeToSuite(testType: string): TestSuite {
    const suiteMap: Record<string, TestSuite> = {
      'unit': 'unit',
      'integration': 'integration',
      'e2e': 'e2e',
      'visual': 'e2e', // Visual tests are E2E
      'performance': 'e2e', // Performance tests are E2E
      'workflow-steps': 'e2e', // Workflow steps are E2E
      'other': 'unit', // Default to unit
    };
    return suiteMap[testType] || 'unit';
  }

  /**
   * Sanitize and normalize test run input
   * 
   * Performs basic sanitization for defense in depth:
   * - Trims string fields
   * - Normalizes IDs and paths
   * 
   * @param input Test run data to sanitize
   * @returns Sanitized input
   */
  private sanitizeInput(input: TestRunCreateInput): TestRunCreateInput {
    // Sanitize string fields
    const run_id = typeof input.run_id === 'string' ? input.run_id.trim() : input.run_id;
    const git_sha = typeof input.git_sha === 'string' ? input.git_sha.trim() : input.git_sha;
    const branch = typeof input.branch === 'string' ? input.branch.trim() : input.branch;

    // Sanitize correlation IDs
    const correlation_ids = input.correlation_ids ? {
      ...input.correlation_ids,
      run_id: typeof input.correlation_ids.run_id === 'string' 
        ? input.correlation_ids.run_id.trim() 
        : input.correlation_ids.run_id,
      git_sha: typeof input.correlation_ids.git_sha === 'string'
        ? input.correlation_ids.git_sha.trim()
        : input.correlation_ids.git_sha,
      branch: typeof input.correlation_ids.branch === 'string'
        ? input.correlation_ids.branch.trim()
        : input.correlation_ids.branch,
      env: typeof input.correlation_ids.env === 'string'
        ? input.correlation_ids.env.trim()
        : input.correlation_ids.env,
    } : input.correlation_ids;

    return {
      ...input,
      run_id,
      git_sha,
      branch,
      correlation_ids,
    };
  }

  /**
   * Save test run record
   * 
   * @param input Test run data to save
   * @returns Created test run document
   */
  async save(input: TestRunCreateInput): Promise<TestRunDocument> {
    try {
      await ensureDBConnection();
      
      // Sanitize input for defense in depth
      const sanitizedInput = this.sanitizeInput(input);
      
      const document = await TestRunModel.create(sanitizedInput);
      logger.debug({ run_id: sanitizedInput.run_id }, 'Test run saved for trend analysis');
      
      return document;
    } catch (error) {
      logger.error({ error, run_id: input.run_id }, 'Failed to save test run');
      throw error;
    }
  }

  /**
   * Create test run input from ingestion input
   * 
   * Helper method to convert from ingestion format to storage format.
   * This keeps the conversion logic in the storage service.
   */
  createInputFromIngestion(params: {
    runId: string;
    testType: string;
    gitSha: string;
    branch: string;
    status: 'passed' | 'failed';
    duration: number;
    timestamp: Date;
    summary: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    };
    cicd: {
      buildId?: string;
      workflowRunId?: string;
      environment?: string;
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
  }): TestRunCreateInput {
    return {
      run_id: params.cicd.buildId || params.cicd.workflowRunId || params.runId,
      git_sha: params.gitSha,
      branch: params.branch,
      suite: this.mapTestTypeToSuite(params.testType),
      status: params.status,
      duration: params.duration,
      timestamp: params.timestamp,
      correlation_ids: {
        run_id: params.runId,
        git_sha: params.gitSha,
        branch: params.branch,
        env: params.cicd.environment || 'local',
      },
      summary: params.summary,
      metadata: {
        ...params.metadata,
        ...params.cicd,
      },
    };
  }
}

/**
 * Get singleton instance of TestRunStorageService
 */
export function getTestRunStorageService(): TestRunStorageService {
  return TestRunStorageService.getInstance();
}
