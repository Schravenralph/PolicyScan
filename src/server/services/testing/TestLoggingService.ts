/**
 * Test Logging Service
 * 
 * Provides structured test logging with categories, flags, and verbosity levels.
 * Categories: terminal output, description, screenshot, video
 * Flags: error, warning, info, success, debug
 * Verbosity levels: minimal, normal, detailed, verbose
 * 
 * Logs are persisted to MongoDB for durability across server restarts.
 * In-memory cache is used for active tests (performance), MongoDB for historical logs.
 */

import { TestLog } from '../../models/TestLog.js';
import { isDBInitialized } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export type LogCategory = 'terminal' | 'description' | 'screenshot' | 'video';
export type LogFlag = 'error' | 'warning' | 'info' | 'success' | 'debug';
export type VerbosityLevel = 'minimal' | 'normal' | 'detailed' | 'verbose';

export interface TestLogEntry {
  id: string;
  timestamp: string;
  category: LogCategory;
  flag?: LogFlag;
  message: string;
  data?: {
    terminalOutput?: string;
    description?: string;
    screenshotPath?: string;
    screenshotUrl?: string;
    videoPath?: string;
    videoUrl?: string;
    metadata?: Record<string, unknown>;
  };
  testId?: string;
  testFile?: string;
  stepIndex?: number;
}

export interface TestLogCollection {
  testId: string;
  testFile?: string;
  logs: TestLogEntry[];
  verbosity: VerbosityLevel;
  createdAt: string;
  updatedAt: string;
}

export class TestLoggingService {
  private static instance: TestLoggingService;
  private logs: Map<string, TestLogCollection> = new Map();
  private indexesEnsured = false;
  // Performance optimization: Limit in-memory log collection size
  private readonly MAX_LOG_ENTRIES_PER_TEST = 1000; // Maximum log entries per test in memory
  private readonly MAX_MEMORY_COLLECTIONS = 50; // Maximum number of test collections in memory

  private constructor() {
    // Ensure MongoDB indexes on first instantiation
    this.ensureIndexes().catch(err => {
      logger.warn({ error: err }, 'Failed to ensure TestLog indexes');
    });
  }

  static getInstance(): TestLoggingService {
    if (!TestLoggingService.instance) {
      TestLoggingService.instance = new TestLoggingService();
    }
    return TestLoggingService.instance;
  }

  /**
   * Ensure MongoDB indexes are created
   */
  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) {
      return;
    }
    try {
      await TestLog.ensureIndexes();
      this.indexesEnsured = true;
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure TestLog indexes');
    }
  }

  /**
   * Create a new log entry
   */
  createLogEntry(
    testId: string,
    category: LogCategory,
    message: string,
    options?: {
      flag?: LogFlag;
      terminalOutput?: string;
      description?: string;
      screenshotPath?: string;
      screenshotUrl?: string;
      videoPath?: string;
      videoUrl?: string;
      metadata?: Record<string, unknown>;
      testFile?: string;
      stepIndex?: number;
    }
  ): TestLogEntry {
    const entry: TestLogEntry = {
      id: `${testId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      category,
      flag: options?.flag || 'info',
      message,
      data: {
        terminalOutput: options?.terminalOutput,
        description: options?.description,
        screenshotPath: options?.screenshotPath,
        screenshotUrl: options?.screenshotUrl,
        videoPath: options?.videoPath,
        videoUrl: options?.videoUrl,
        metadata: options?.metadata,
      },
      testId,
      testFile: options?.testFile,
      stepIndex: options?.stepIndex,
    };

    // Add to collection
    this.addLogEntry(testId, entry, options?.testFile);

    return entry;
  }

  /**
   * Add a log entry to a test's log collection
   * Updates in-memory cache only (MongoDB persistence happens only for failed tests)
   * Performance optimization: Limits in-memory collection size
   */
  addLogEntry(testId: string, entry: TestLogEntry, testFile?: string): void {
    let collection = this.logs.get(testId);
    
    if (!collection) {
      // Limit total number of collections in memory
      if (this.logs.size >= this.MAX_MEMORY_COLLECTIONS) {
        // Remove oldest collection (FIFO)
        const firstKey = this.logs.keys().next().value;
        if (firstKey) {
          this.logs.delete(firstKey);
        }
      }

      collection = {
        testId,
        testFile,
        logs: [],
        verbosity: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.logs.set(testId, collection);
    }

    collection.logs.push(entry);
    
    // Limit log entries per test to prevent memory bloat
    if (collection.logs.length > this.MAX_LOG_ENTRIES_PER_TEST) {
      // Keep most recent entries, remove oldest
      const excess = collection.logs.length - this.MAX_LOG_ENTRIES_PER_TEST;
      collection.logs = collection.logs.slice(excess);
    }
    
    collection.updatedAt = new Date().toISOString();
    if (testFile) {
      collection.testFile = testFile;
    }

    // Note: MongoDB persistence is now selective - only for failed tests
    // See persistToMongoDB() method
  }

  /**
   * Set verbosity level for a test
   * Updates in-memory cache only (verbosity is a runtime setting, not persisted)
   */
  setVerbosity(testId: string, verbosity: VerbosityLevel): void {
    const collection = this.logs.get(testId);
    if (collection) {
      collection.verbosity = verbosity;
      collection.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Get logs for a test, filtered by verbosity level
   * Reads from MongoDB if not in memory (for historical logs)
   */
  async getLogs(testId: string, verbosity?: VerbosityLevel): Promise<TestLogEntry[]> {
    let collection = this.logs.get(testId);
    
    // If not in memory, try to load from MongoDB
    if (!collection && isDBInitialized()) {
      try {
        const doc = await TestLog.findByTestId(testId);
        if (doc) {
          // doc is already a TestLogCollection (documentToCollection converts it)
          collection = doc;
          // Cache in memory for future access
          this.logs.set(testId, collection);
        }
      } catch (error) {
        logger.warn({ error, testId }, 'Failed to load test logs from MongoDB');
      }
    }

    if (!collection) {
      return [];
    }

    const effectiveVerbosity = verbosity || collection.verbosity;
    return this.filterByVerbosity(collection.logs, effectiveVerbosity);
  }

  /**
   * Get full log collection for a test
   * Reads from MongoDB if not in memory (for historical logs)
   */
  async getLogCollection(testId: string): Promise<TestLogCollection | undefined> {
    let collection = this.logs.get(testId);
    
    // If not in memory, try to load from MongoDB
    if (!collection && isDBInitialized()) {
      try {
        const doc = await TestLog.findByTestId(testId);
        if (doc) {
          // doc is already a TestLogCollection (documentToCollection converts it)
          collection = doc;
          // Cache in memory for future access
          this.logs.set(testId, collection);
        }
      } catch (error) {
        logger.warn({ error, testId }, 'Failed to load test log collection from MongoDB');
      }
    }

    return collection;
  }

  /**
   * Get all log collections
   */
  getAllLogCollections(): TestLogCollection[] {
    return Array.from(this.logs.values());
  }

  /**
   * Filter logs by verbosity level
   */
  private filterByVerbosity(logs: TestLogEntry[], verbosity: VerbosityLevel): TestLogEntry[] {
    switch (verbosity) {
      case 'minimal':
        // Only errors and terminal output
        return logs.filter(log => {
          const flag = log.flag as string | undefined;
          return flag === 'error' || 
            (log.category === 'terminal' && (flag === 'error' || flag === 'warning'));
        });
      
      case 'normal':
        // Terminal output, errors, warnings, and success messages
        return logs.filter(log => 
          log.category === 'terminal' || 
          log.flag === 'error' || 
          log.flag === 'warning' || 
          log.flag === 'success'
        );
      
      case 'detailed':
        // Everything except debug, includes descriptions and screenshots
        return logs.filter(log => 
          log.flag !== 'debug' &&
          (log.category === 'terminal' || 
           log.category === 'description' || 
           log.category === 'screenshot')
        );
      
      case 'verbose':
        // Everything including debug and videos
        return logs;
      
      default:
        return logs;
    }
  }

  /**
   * Clear logs for a test
   * Removes from both in-memory cache and MongoDB
   */
  async clearLogs(testId: string): Promise<void> {
    this.logs.delete(testId);
    
    // Also delete from MongoDB (non-blocking)
    if (isDBInitialized()) {
      TestLog.delete(testId).catch((error) => {
        logger.warn({ error, testId }, 'Failed to delete test logs from MongoDB');
      });
    }
  }

  /**
   * Clear all logs
   */
  clearAllLogs(): void {
    this.logs.clear();
  }

  /**
   * Get logs by category
   */
  async getLogsByCategory(testId: string, category: LogCategory, verbosity?: VerbosityLevel): Promise<TestLogEntry[]> {
    const allLogs = await this.getLogs(testId, verbosity);
    return allLogs.filter(log => log.category === category);
  }

  /**
   * Get logs by flag
   */
  async getLogsByFlag(testId: string, flag: LogFlag, verbosity?: VerbosityLevel): Promise<TestLogEntry[]> {
    const allLogs = await this.getLogs(testId, verbosity);
    return allLogs.filter(log => log.flag === flag);
  }

  /**
   * Export logs to JSON
   */
  exportLogs(testId: string): string {
    const collection = this.logs.get(testId);
    if (!collection) {
      return JSON.stringify({ testId, logs: [] });
    }
    return JSON.stringify(collection, null, 2);
  }

  /**
   * Determine test type from test file path
   */
  private determineTestType(testFile?: string): 'unit' | 'integration' | 'e2e' {
    if (!testFile) return 'unit';
    
    if (testFile.includes('e2e') || testFile.includes('.spec.ts')) {
      return 'e2e';
    }
    if (testFile.includes('integration') || testFile.includes('.int.test.')) {
      return 'integration';
    }
    return 'unit';
  }

  /**
   * Persist logs to MongoDB (only for failed tests)
   * This method should be called after test completion if tests failed
   */
  async persistToMongoDB(
    testRunId: string,
    hasFailures: boolean,
    executionTimestamp?: Date
  ): Promise<void> {
    // Don't persist logs for passing tests
    if (!hasFailures) {
      return;
    }
    
    const collection = this.logs.get(testRunId);
    if (!collection || collection.logs.length === 0) {
      return;
    }
    
    if (!isDBInitialized()) {
      logger.warn({ testRunId }, 'MongoDB not initialized, skipping log persistence');
      return;
    }
    
    try {
      // Use TestLog.upsert to persist the entire collection
      await TestLog.upsert({
        testId: testRunId,
        testFile: collection.testFile,
        logs: collection.logs,
        verbosity: collection.verbosity,
        createdAt: executionTimestamp ? new Date(executionTimestamp) : new Date(collection.createdAt),
        updatedAt: new Date(collection.updatedAt),
      });
      
      logger.info({ testRunId, logCount: collection.logs.length }, 'Persisted failed test logs to MongoDB');
    } catch (error) {
      // Don't fail test execution if log persistence fails
      logger.error({ error, testRunId }, 'Failed to persist test logs to MongoDB');
    }
  }
}

export const getTestLoggingService = () => TestLoggingService.getInstance();
