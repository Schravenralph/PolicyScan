/**
 * Test Log Storage Service
 * 
 * Handles storage of structured test logs to MongoDB (test_logs collection).
 * Only stores logs for failed tests (30-day TTL).
 * 
 * Single Responsibility: Store test log data to MongoDB only.
 * 
 * @module src/server/services/testing/storage/TestLogStorageService
 */

import { logger } from '../../../utils/logger.js';
import { ensureDBConnection } from '../../../config/database.js';
import { TestLog } from '../../../models/TestLog.js';
import type { TestLogEntry, VerbosityLevel } from '../TestLoggingService.js';

/**
 * Input for saving test logs
 */
export interface TestLogStorageInput {
  /** Test ID or run ID */
  testId: string;
  /** Test file path */
  testFile: string;
  /** Structured log entries */
  logs: TestLogEntry[];
  /** Verbosity level */
  verbosity?: VerbosityLevel;
}

/**
 * Service for storing test logs
 * 
 * This service handles ONLY storage of test log data to MongoDB.
 * It does NOT handle:
 * - Routing decisions (handled by TestResultIngestionService)
 * - Log format conversion (handled by TestResultIngestionService)
 * - Log processing (handled by TestLoggingService)
 */
export class TestLogStorageService {
  private static instance: TestLogStorageService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestLogStorageService {
    if (!TestLogStorageService.instance) {
      TestLogStorageService.instance = new TestLogStorageService();
    }
    return TestLogStorageService.instance;
  }

  /**
   * Ensure database connection and indexes
   */
  async ensureIndexes(): Promise<void> {
    try {
      await ensureDBConnection();
      // TestLog model handles its own indexes
      logger.debug('TestLogStorageService indexes ensured');
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure TestLogStorageService indexes');
      throw error;
    }
  }

  /**
   * Sanitize and normalize test log input
   * 
   * Performs basic sanitization for defense in depth:
   * - Trims string fields
   * - Normalizes file paths
   * 
   * @param input Test log data to sanitize
   * @returns Sanitized input
   */
  private sanitizeInput(input: TestLogStorageInput): TestLogStorageInput {
    // Sanitize test ID
    const testId = typeof input.testId === 'string' ? input.testId.trim() : input.testId;

    // Sanitize test file path
    const testFile = typeof input.testFile === 'string'
      ? input.testFile.trim().replace(/\\/g, '/') // Normalize path separators
      : input.testFile;

    return {
      ...input,
      testId,
      testFile,
    };
  }

  /**
   * Save test logs
   * 
   * @param input Test log data to save
   */
  async save(input: TestLogStorageInput): Promise<void> {
    try {
      await ensureDBConnection();
      
      // Sanitize input for defense in depth
      const sanitizedInput = this.sanitizeInput(input);
      
      await TestLog.upsert({
        testId: sanitizedInput.testId,
        testFile: sanitizedInput.testFile,
        logs: sanitizedInput.logs,
        verbosity: sanitizedInput.verbosity || 'normal',
        updatedAt: new Date(),
      });

      logger.debug(
        { 
          testId: sanitizedInput.testId, 
          logCount: sanitizedInput.logs.length,
        },
        'Test logs saved'
      );
    } catch (error) {
      logger.error({ error, testId: input.testId }, 'Failed to save test logs');
      throw error;
    }
  }
}

/**
 * Get singleton instance of TestLogStorageService
 */
export function getTestLogStorageService(): TestLogStorageService {
  return TestLogStorageService.getInstance();
}
