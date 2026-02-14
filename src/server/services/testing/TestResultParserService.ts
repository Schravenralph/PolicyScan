/**
 * Test Result Parser Service
 * 
 * Unified parser for test runner JSON outputs (Vitest, Playwright).
 * Converts test runner formats to TestRunIngestionInput for ingestion.
 * 
 * @module src/server/services/testing/TestResultParserService
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import type { TestRunIngestionInput } from './TestResultIngestionService.js';
import { generateTestRunId } from '../../utils/testRunIdGenerator.js';

/**
 * Vitest JSON output format
 */
interface VitestTestResult {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numPendingTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numSkippedTests?: number;
  startTime: number;
  success: boolean;
  testResults: Array<{
    filePath: string;
    file?: string; // Alternative field name
    numPassingTests: number;
    numFailingTests: number;
    numPendingTests: number;
    numTodoTests: number;
    testResults: Array<{
      title: string;
      name?: string; // Alternative field name
      status: 'passed' | 'failed' | 'pending' | 'todo' | 'skipped';
      failureMessages?: string[];
      errors?: Array<{
        message: string;
        stack?: string;
      }>;
      duration?: number;
    }>;
  }>;
}

/**
 * Playwright JSON output format
 */
interface PlaywrightTestResult {
  config?: unknown;
  suites?: Array<{
    title?: string;
    file?: string;
    specs?: Array<{
      title?: string;
      file?: string;
      tests?: Array<{
        title?: string;
        results?: Array<{
          status: 'passed' | 'failed' | 'skipped' | 'timedOut';
          duration?: number;
          error?: {
            message?: string;
            stack?: string;
          };
          errors?: Array<{
            message?: string;
            stack?: string;
          }>;
        }>;
      }>;
    }>;
  }>;
  stats?: {
    total?: number;
    expected?: number; // Playwright uses 'expected' for passed
    passed?: number;
    unexpected?: number; // Playwright uses 'unexpected' for failed
    failed?: number;
    skipped?: number;
    flaky?: number;
    duration?: number; // in seconds
  };
}

/**
 * Test Result Parser Service
 * 
 * Provides unified parsing for Vitest and Playwright JSON outputs.
 */
export class TestResultParserService {
  /**
   * Detect test runner from JSON file content
   */
  static detectTestRunner(jsonPath: string): 'vitest' | 'playwright' | null {
    try {
      if (!existsSync(jsonPath)) {
        logger.debug({ jsonPath }, 'JSON file does not exist for test runner detection');
        return null;
      }

      const content = readFileSync(jsonPath, 'utf-8');
      if (!content.trim()) {
        logger.debug({ jsonPath }, 'JSON file is empty');
        return null;
      }

      let data: any;
      try {
        data = JSON.parse(content);
      } catch (parseError) {
        logger.warn({ error: parseError, jsonPath }, 'Failed to parse JSON file');
        return null;
      }

      // Check for Playwright format (has suites array or stats object)
      if (Array.isArray(data) || (typeof data === 'object' && (data.suites || data.stats))) {
        logger.debug({ jsonPath }, 'Detected Playwright format');
        return 'playwright';
      }

      // Check for Vitest format - multiple patterns
      if (typeof data === 'object') {
        // Pattern 1: Has testResults array with filePath or file
        if (
          Array.isArray(data.testResults) &&
          data.testResults.length > 0 &&
          (data.testResults[0].filePath !== undefined || 
           data.testResults[0].file !== undefined ||
           data.testResults[0].name !== undefined)
        ) {
          logger.debug({ jsonPath }, 'Detected Vitest format (testResults pattern)');
          return 'vitest';
        }

        // Pattern 2: Has numTotalTests, numPassedTests, etc. (Vitest summary format)
        if (
          typeof data.numTotalTests === 'number' ||
          typeof data.numPassedTests === 'number' ||
          typeof data.numFailedTests === 'number' ||
          (data.testResults && Array.isArray(data.testResults))
        ) {
          logger.debug({ jsonPath }, 'Detected Vitest format (summary pattern)');
          return 'vitest';
        }

        // Pattern 3: Has assertionResults (Vitest detailed format)
        if (
          Array.isArray(data.testResults) &&
          data.testResults.length > 0 &&
          data.testResults[0].assertionResults &&
          Array.isArray(data.testResults[0].assertionResults)
        ) {
          logger.debug({ jsonPath }, 'Detected Vitest format (assertionResults pattern)');
          return 'vitest';
        }
      }

      logger.warn({ jsonPath, dataKeys: typeof data === 'object' ? Object.keys(data) : 'not an object' }, 'Could not detect test runner format');
      return null;
    } catch (error) {
      logger.warn({ error, jsonPath }, 'Failed to detect test runner from JSON file');
      return null;
    }
  }

  /**
   * Parse Vitest JSON output to TestRunIngestionInput
   */
  static parseVitestResults(
    jsonPath: string,
    options?: {
      testType?: TestRunIngestionInput['testType'];
      testCommand?: string;
      runId?: string;
    }
  ): TestRunIngestionInput {
    if (!existsSync(jsonPath)) {
      throw new Error(`Vitest results file not found: ${jsonPath}`);
    }

    const content = readFileSync(jsonPath, 'utf-8');
    const data: VitestTestResult = JSON.parse(content);

    const failures: TestRunIngestionInput['failures'] = [];

    // Extract failures from test results
    // Handle different Vitest JSON formats
    const testResults = Array.isArray(data.testResults) ? data.testResults : [];
    
    for (const testFile of testResults) {
      const filePath = testFile.filePath || testFile.file || 'unknown';
      
      // Handle different test result structures
      let testCases: any[] = [];
      
      // Pattern 1: testFile.testResults (array of test cases) - Vitest format
      if (Array.isArray(testFile.testResults)) {
        testCases = testFile.testResults;
      }
      // Pattern 2: testFile.assertionResults (Jest format - not in VitestTestResult interface)
      // This is handled via type assertion for compatibility with Jest outputs
      else if (Array.isArray((testFile as any).assertionResults)) {
        testCases = (testFile as any).assertionResults;
      }
      // Pattern 3: testFile is the test case itself (flat structure - not standard Vitest)
      // This is handled via type assertion for compatibility with other formats
      else if ((testFile as any).status || (testFile as any).title || (testFile as any).name) {
        testCases = [testFile];
      }
      
      for (const test of testCases) {
        const status = test.status || (test.failureMessages && test.failureMessages.length > 0 ? 'failed' : 'passed');
        
        if (status === 'failed' || (test.failureMessages && test.failureMessages.length > 0)) {
          const testName = test.title || test.name || test.ancestorTitles?.join(' > ') || 'Unknown test';
          let errorMessage = 'Test failed';
          let stackTrace: string | undefined;

          // Try to get error from failureMessages (Vitest format)
          if (test.failureMessages && Array.isArray(test.failureMessages) && test.failureMessages.length > 0) {
            errorMessage = test.failureMessages[0];
            stackTrace = test.failureMessages.join('\n');
          }
          // Try to get error from errors array (alternative Vitest format)
          else if (test.errors && Array.isArray(test.errors) && test.errors.length > 0) {
            errorMessage = test.errors[0].message || test.errors[0] || 'Test failed';
            stackTrace = test.errors.map((e: any) => e.stack || e.message || e).join('\n');
          }
          // Try to get error from failureDetails
          else if (test.failureDetails) {
            errorMessage = String(test.failureDetails);
            stackTrace = String(test.failureDetails);
          }

          failures.push({
            test: testName,
            file: filePath,
            error: errorMessage,
            stackTrace,
          });
        }
      }
    }

    // Calculate duration (Vitest provides startTime in milliseconds)
    // If startTime and endTime are provided, use the difference; otherwise estimate
    let duration = 0;
    const dataWithExtras = data as VitestTestResult & { endTime?: number; duration?: number };
    if (data.startTime && dataWithExtras.endTime) {
      duration = dataWithExtras.endTime - data.startTime;
    } else if (data.startTime) {
      duration = Date.now() - data.startTime;
    } else if (typeof dataWithExtras.duration === 'number') {
      duration = dataWithExtras.duration;
    }

    // Determine test type from file paths if not provided
    let testType: TestRunIngestionInput['testType'] = options?.testType || 'other';
    const testResultsArray = Array.isArray(data.testResults) ? data.testResults : [];
    if (!options?.testType && testResultsArray.length > 0) {
      const firstTestFile = testResultsArray[0];
      const firstFilePath = firstTestFile?.filePath || firstTestFile?.file || '';
      if (firstFilePath.includes('/unit/') || firstFilePath.includes('__tests__') || firstFilePath.includes('/server/unit/') || firstFilePath.includes('/client/unit/')) {
        testType = 'unit';
      } else if (firstFilePath.includes('/integration/') || firstFilePath.includes('.integration.test.')) {
        testType = 'integration';
      } else if (firstFilePath.includes('/e2e/')) {
        testType = 'e2e';
      }
    }

    // Generate runId if not provided - use unified format
    const runId = options?.runId || generateTestRunId(testType);

    // Calculate summary from data or from test results
    let total = data.numTotalTests ?? 0;
    let passed = data.numPassedTests ?? 0;
    let failed = data.numFailedTests ?? failures.length;
    let skipped = (data.numPendingTests || 0) + (data.numTodoTests || 0) + (data.numSkippedTests || 0);
    
    // If summary not in root, calculate from test results
    if (total === 0 && testResultsArray.length > 0) {
      for (const testFile of testResultsArray) {
        const testCases = Array.isArray(testFile.testResults) ? testFile.testResults : 
                         Array.isArray((testFile as any).assertionResults) ? (testFile as any).assertionResults : [];
        for (const test of testCases) {
          total++;
          const status = test.status || (test.failureMessages?.length > 0 ? 'failed' : 'passed');
          if (status === 'passed') {
            passed++;
          } else if (status === 'failed') {
            failed++;
          } else {
            skipped++;
          }
        }
      }
    }

    return {
      runId,
      testType,
      duration,
      summary: {
        total: total || 1, // Ensure at least 1 to avoid division by zero
        passed: passed || 0,
        failed: failed || 0,
        skipped: skipped || 0,
      },
      failures: failures.length > 0 ? failures : undefined,
      testRunner: 'vitest',
      testCommand: options?.testCommand,
      exitCode: data.success === false ? 1 : (failed > 0 ? 1 : 0),
      executionTimestamp: data.startTime ? new Date(data.startTime) : new Date(),
    };
  }

  /**
   * Parse Playwright JSON output to TestRunIngestionInput
   */
  static parsePlaywrightResults(
    jsonPath: string,
    options?: {
      testType?: TestRunIngestionInput['testType'];
      testCommand?: string;
      runId?: string;
    }
  ): TestRunIngestionInput {
    if (!existsSync(jsonPath)) {
      throw new Error(`Playwright results file not found: ${jsonPath}`);
    }

    const content = readFileSync(jsonPath, 'utf-8');
    let data: PlaywrightTestResult;

    // Handle both array format and object format
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      data = { suites: parsed };
    } else {
      data = parsed;
    }

    const failures: TestRunIngestionInput['failures'] = [];
    const suites = data.suites || [];

    // Extract failures from test results
    suites.forEach((suite) => {
      const suiteFile = suite.file || 'unknown';
      (suite.specs || []).forEach((spec) => {
        const specFile = spec.file || suiteFile;
        (spec.tests || []).forEach((test) => {
          const testTitle = test.title || 'Unknown test';
          const results = test.results || [];
          
          // Check all results (for retries)
          results.forEach((result) => {
            if (result.status === 'failed' || result.status === 'timedOut') {
              const error = result.error || (result.errors && result.errors[0]);
              const errorMessage = error?.message || error?.stack || 'Test failed';
              const stackTrace = error?.stack || errorMessage;

              failures.push({
                test: testTitle,
                file: specFile,
                error: errorMessage,
                stackTrace,
              });
            }
          });
        });
      });
    });

    // Calculate stats from Playwright format
    let total = data.stats?.total || 0;
    let passed = data.stats?.expected || data.stats?.passed || 0;
    let failed = data.stats?.unexpected || data.stats?.failed || 0;
    let skipped = data.stats?.skipped || 0;
    let duration = 0;

    // Convert duration from seconds to milliseconds
    if (data.stats?.duration) {
      duration = Math.round(data.stats.duration * 1000);
    }

    // If stats not available, calculate from suites
    if (total === 0 && suites.length > 0) {
      suites.forEach((suite: any) => {
        (suite.specs || []).forEach((spec: any) => {
          (spec.tests || []).forEach((test: any) => {
            total++;
            const results = test.results || [];
            const lastResult = results[results.length - 1];
            if (lastResult) {
              if (lastResult.status === 'passed') passed++;
              else if (lastResult.status === 'failed' || lastResult.status === 'timedOut') failed++;
              else if (lastResult.status === 'skipped') skipped++;
              if (lastResult.duration) {
                duration += Math.round(lastResult.duration * 1000);
              }
            }
          });
        });
      });
    } else if (total === 0 && (passed > 0 || failed > 0 || skipped > 0)) {
      // Calculate total from individual counts
      total = passed + failed + skipped + (data.stats?.flaky || 0);
    }

    // Determine test type (Playwright is typically E2E)
    const testType: TestRunIngestionInput['testType'] = options?.testType || 'e2e';

    // Generate runId if not provided - use unified format
    const runId = options?.runId || generateTestRunId(testType);

    return {
      runId,
      testType,
      duration,
      summary: {
        total,
        passed,
        failed,
        skipped,
      },
      failures: failures.length > 0 ? failures : undefined,
      testRunner: 'playwright',
      testCommand: options?.testCommand,
      exitCode: failed > 0 ? 1 : 0,
      executionTimestamp: new Date(),
    };
  }

  /**
   * Parse test results from file, auto-detecting the test runner
   */
  static parseFromFile(
    jsonPath: string,
    options?: {
      testType?: TestRunIngestionInput['testType'];
      testCommand?: string;
      runId?: string;
    }
  ): TestRunIngestionInput {
    const runner = this.detectTestRunner(jsonPath);

    if (!runner) {
      throw new Error(`Could not detect test runner from JSON file: ${jsonPath}`);
    }

    switch (runner) {
      case 'vitest':
        return this.parseVitestResults(jsonPath, options);
      case 'playwright':
        return this.parsePlaywrightResults(jsonPath, options);
      default:
        throw new Error(`Unsupported test runner: ${runner}`);
    }
  }
}

/**
 * Get singleton instance (for consistency with other services)
 */
export function getTestResultParserService(): typeof TestResultParserService {
  return TestResultParserService;
}
