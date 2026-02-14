/**
 * Test History Storage Service
 * 
 * Handles storage of detailed test history records to MongoDB (test_history collection).
 * Only stores records when failures exist (60-day TTL for failures).
 * 
 * Single Responsibility: Store test history data to MongoDB only.
 * 
 * @module src/server/services/testing/storage/TestHistoryStorageService
 */

import { logger } from '../../../utils/logger.js';
import { ensureDBConnection } from '../../../config/database.js';
import { TestHistory, TestHistoryCreateInput, TestHistoryDocument } from '../../../models/TestHistory.js';

/**
 * Service for storing test history records
 * 
 * This service handles ONLY storage of test history data to MongoDB.
 * It does NOT handle:
 * - Routing decisions (handled by TestResultIngestionService)
 * - Data normalization (handled by TestResultIngestionService)
 * - Error processing (handled by ErrorCategorizationService)
 */
export class TestHistoryStorageService {
  private static instance: TestHistoryStorageService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestHistoryStorageService {
    if (!TestHistoryStorageService.instance) {
      TestHistoryStorageService.instance = new TestHistoryStorageService();
    }
    return TestHistoryStorageService.instance;
  }

  /**
   * Ensure database connection and indexes
   */
  async ensureIndexes(): Promise<void> {
    try {
      await ensureDBConnection();
      await TestHistory.ensureIndexes();
      logger.debug('TestHistoryStorageService indexes ensured');
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure TestHistoryStorageService indexes');
      throw error;
    }
  }

  /**
   * Sanitize and normalize test history input
   * 
   * Performs basic sanitization for defense in depth:
   * - Trims string fields
   * - Normalizes file paths
   * - Ensures required fields are present
   * 
   * @param input Test history data to sanitize
   * @returns Sanitized input
   */
  private sanitizeInput(input: TestHistoryCreateInput): TestHistoryCreateInput {
    // Sanitize test file path
    const testFilePath = typeof input.testFilePath === 'string' 
      ? input.testFilePath.trim().replace(/\\/g, '/') // Normalize path separators
      : input.testFilePath;

    // Sanitize test command if present
    const testCommand = input.testCommand 
      ? (typeof input.testCommand === 'string' ? input.testCommand.trim() : input.testCommand)
      : input.testCommand;

    // Sanitize test runner
    const testRunner = typeof input.testRunner === 'string'
      ? input.testRunner.trim()
      : input.testRunner;

    return {
      ...input,
      testFilePath,
      testCommand,
      testRunner,
    };
  }

  /**
   * Save test history record
   * 
   * @param input Test history data to save
   * @returns Created test history document
   */
  async save(input: TestHistoryCreateInput): Promise<TestHistoryDocument> {
    try {
      await ensureDBConnection();
      
      // Sanitize input for defense in depth
      const sanitizedInput = this.sanitizeInput(input);
      
      const document = await TestHistory.create(sanitizedInput);
      logger.debug({ testFilePath: sanitizedInput.testFilePath }, 'Test history saved');
      
      return document;
    } catch (error) {
      logger.error({ error, testFilePath: input.testFilePath }, 'Failed to save test history');
      throw error;
    }
  }
}

/**
 * Get singleton instance of TestHistoryStorageService
 */
export function getTestHistoryStorageService(): TestHistoryStorageService {
  return TestHistoryStorageService.getInstance();
}
