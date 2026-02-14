/**
 * Test Run Data Sync Service
 * 
 * Ensures test run data is consistently stored and retrieved across MongoDB and JSON file sources.
 * Provides synchronization, consistency verification, and repair utilities.
 * 
 * Created as part of WI-TEST-RUNS-003
 */

import { logger } from '../../utils/logger.js';
import { getTestSummaryService, type TestSummaryDocument } from './TestSummaryService.js';
import { getDashboardDataStorageService } from './storage/DashboardDataStorageService.js';
import { TestRun } from '../testing/TestPerformanceAnalyticsService.js';
import { ensureDBConnection } from '../../config/database.js';

/**
 * Consistency report for a test run
 */
export interface ConsistencyReport {
  runId: string;
  consistent: boolean;
  sources: {
    mongodb: {
      exists: boolean;
      data?: Partial<TestSummaryDocument>;
    };
    json: {
      exists: boolean;
      data?: Partial<TestRun>;
    };
  };
  inconsistencies: string[];
}

/**
 * Service for synchronizing test run data across multiple sources
 */
export class TestRunDataSyncService {
  private static instance: TestRunDataSyncService | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): TestRunDataSyncService {
    if (!TestRunDataSyncService.instance) {
      TestRunDataSyncService.instance = new TestRunDataSyncService();
    }
    return TestRunDataSyncService.instance;
  }

  /**
   * Sync a test run to all sources (MongoDB and JSON file)
   * 
   * @param run - The test run data to sync
   * @returns Promise that resolves when sync is complete (or failed gracefully)
   */
  async syncRunToAllSources(run: TestRun): Promise<void> {
    const errors: string[] = [];

    // 1. Sync to MongoDB (primary source)
    try {
      const summaryService = getTestSummaryService();
      // Check if summary already exists
      const existing = await summaryService.getSummaryByRunId(run.id || '');
      
      if (!existing && run.results) {
        // Create summary document from TestRun
        await summaryService.saveSummary({
          runId: run.id || '',
          testType: run.testType || 'other',
          duration: run.results.duration || 0,
          total: run.results.total || 0,
          passed: run.results.passed || 0,
          failed: run.results.failed || 0,
          skipped: run.results.skipped || 0,
          testRunner: 'unknown',
          testCommand: run.testFile,
          exitCode: (run.results.failed || 0) > 0 ? 1 : 0,
          executionTimestamp: run.timestamp ? new Date(run.timestamp) : new Date(),
        });
        logger.debug({ runId: run.id }, 'Test run synced to MongoDB');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`MongoDB sync failed: ${errorMessage}`);
      logger.warn({ error, runId: run.id }, 'Failed to sync test run to MongoDB (non-critical)');
    }

    // 2. Sync to JSON file (secondary source) using DashboardDataStorageService
    try {
      const dashboardService = getDashboardDataStorageService();
      await dashboardService.addRun(run, 1000); // Keep last 1000 runs
      logger.debug({ runId: run.id }, 'Test run synced to JSON file');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`JSON file sync failed: ${errorMessage}`);
      logger.warn({ error, runId: run.id }, 'Failed to sync test run to JSON file (non-critical)');
    }

    // Log any errors but don't throw (graceful degradation)
    if (errors.length > 0) {
      logger.warn({ runId: run.id, errors }, 'Some sync operations failed, but continuing');
    }
  }


  /**
   * Verify consistency of a test run across all sources
   * 
   * @param runId - The run ID to verify
   * @returns Consistency report
   */
  async verifyConsistency(runId: string): Promise<ConsistencyReport> {
    const report: ConsistencyReport = {
      runId,
      consistent: true,
      sources: {
        mongodb: { exists: false },
        json: { exists: false },
      },
      inconsistencies: [],
    };

    // Check MongoDB
    try {
      await ensureDBConnection();
      const summaryService = getTestSummaryService();
      const summary = await summaryService.getSummaryByRunId(runId);
      
      if (summary) {
        report.sources.mongodb.exists = true;
        report.sources.mongodb.data = {
          runId: summary.runId,
          testType: summary.testType,
          executionTimestamp: summary.executionTimestamp,
          duration: summary.duration,
          summary: summary.summary,
        };
      }
    } catch (error) {
      report.inconsistencies.push(`MongoDB check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Check JSON file using DashboardDataStorageService
    try {
      const dashboardService = getDashboardDataStorageService();
      const data = await dashboardService.load(false); // Load from test-results, not public
      
      if (data && data.recentRuns) {
        const run = data.recentRuns.find((r: TestRun) => r.id === runId);
        
        if (run) {
          report.sources.json.exists = true;
          report.sources.json.data = {
            id: run.id,
            timestamp: run.timestamp,
            testFile: run.testFile,
            testType: run.testType,
            results: run.results,
            summary: run.summary,
          };
        }
      }
    } catch (error) {
      report.inconsistencies.push(`JSON file check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Determine consistency
    if (report.sources.mongodb.exists && report.sources.json.exists) {
      // Both exist - check if data matches
      const mongoRunId = report.sources.mongodb.data?.runId;
      const jsonRunId = report.sources.json.data?.id;
      
      if (mongoRunId !== jsonRunId) {
        report.consistent = false;
        report.inconsistencies.push(`Run ID mismatch: MongoDB has ${mongoRunId}, JSON has ${jsonRunId}`);
      }
    } else if (!report.sources.mongodb.exists && !report.sources.json.exists) {
      // Neither exists
      report.consistent = false;
      report.inconsistencies.push('Run not found in any source');
    } else {
      // Only one exists
      report.consistent = false;
      const missingSource = report.sources.mongodb.exists ? 'JSON file' : 'MongoDB';
      report.inconsistencies.push(`Run exists in ${report.sources.mongodb.exists ? 'MongoDB' : 'JSON file'} but not in ${missingSource}`);
    }

    return report;
  }

  /**
   * Repair inconsistencies for a test run
   * Attempts to sync data from the source that has it to the source that doesn't
   * 
   * @param runId - The run ID to repair
   */
  async repairInconsistencies(runId: string): Promise<void> {
    const report = await this.verifyConsistency(runId);

    if (report.consistent) {
      logger.info({ runId }, 'Run is already consistent, no repair needed');
      return;
    }

    logger.info({ runId, inconsistencies: report.inconsistencies }, 'Repairing inconsistencies');

    // If MongoDB has it but JSON doesn't, sync to JSON
    if (report.sources.mongodb.exists && !report.sources.json.exists && report.sources.mongodb.data) {
      try {
        const summary = report.sources.mongodb.data;
        const run: TestRun = {
          id: summary.runId || runId,
          timestamp: summary.executionTimestamp?.toISOString() || new Date().toISOString(),
          testType: summary.testType || 'other',
          results: {
            timestamp: summary.executionTimestamp?.toISOString() || new Date().toISOString(),
            total: summary.summary?.total || 0,
            passed: summary.summary?.passed || 0,
            failed: summary.summary?.failed || 0,
            skipped: summary.summary?.skipped || 0,
            duration: summary.duration || 0,
          },
        };
        const dashboardService = getDashboardDataStorageService();
        await dashboardService.addRun(run, 1000);
        logger.info({ runId }, 'Repaired: Synced MongoDB data to JSON file');
      } catch (error) {
        logger.error({ error, runId }, 'Failed to repair: sync MongoDB to JSON');
        throw error;
      }
    }

    // If JSON has it but MongoDB doesn't, sync to MongoDB
    if (report.sources.json.exists && !report.sources.mongodb.exists && report.sources.json.data) {
      try {
        const run = report.sources.json.data as TestRun;
        await this.syncRunToAllSources(run);
        logger.info({ runId }, 'Repaired: Synced JSON data to MongoDB');
      } catch (error) {
        logger.error({ error, runId }, 'Failed to repair: sync JSON to MongoDB');
        throw error;
      }
    }
  }
}

/**
 * Get singleton instance of TestRunDataSyncService
 */
export function getTestRunDataSyncService(): TestRunDataSyncService {
  return TestRunDataSyncService.getInstance();
}


