import { getDB, ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { TestHistoryDocument } from '../../models/TestHistory.js';
import { Filter } from 'mongodb';

export interface BreakageFilters {
  timeRangeDays?: number;
  suite?: string;
  branch?: string;
}

export interface BreakageEvent {
  testFile: string;
  testName?: string;
  testType?: string;
  breakageTime: string;
  commit?: string;
  branch?: string;
  previousStatus: 'passed' | 'skipped' | 'none';
  runId?: string;
}

export interface BreakageTimelineEntry {
  git_sha: string;
  branch: string;
  timestamp: string;
  failureCount: number;
  failures: Array<{
    test_id?: string;
    suite?: string;
  }>;
}

export interface BreakageReport {
  breakTimeline: BreakageTimelineEntry[];
  summary: {
    totalFailures: number;
    uniqueCommits: number;
    uniqueTests: number;
  };
}

export class TestBreakageService {
  private static instance: TestBreakageService;

  private constructor() {}

  public static getInstance(): TestBreakageService {
    if (!TestBreakageService.instance) {
      TestBreakageService.instance = new TestBreakageService();
    }
    return TestBreakageService.instance;
  }

  async analyzeBreakages(filters: BreakageFilters): Promise<BreakageReport> {
    try {
      await ensureDBConnection();
      const db = getDB();
      const historyCollection = db.collection<TestHistoryDocument>('test_history');

      const timeRangeDays = filters.timeRangeDays || 30;
      const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);

      // 1. Identify all tests that failed within the time window.
      let suiteFilter: Filter<TestHistoryDocument> = {};
      if (filters.suite) {
        const escapedSuite = filters.suite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        suiteFilter = {
          $or: [
            { testFilePath: { $regex: escapedSuite, $options: 'i' } },
            { testType: filters.suite as any }
          ]
        };
      }

      const matchFilter: Filter<TestHistoryDocument> = {
        executionTimestamp: { $gte: startDate },
        'result.failed': { $gt: 0 },
        ...suiteFilter
      };

      if (filters.branch) {
        matchFilter['git.branch'] = filters.branch;
      }

      // 2. Use aggregation to find the first failure event for each failing test
      // Optimized to avoid N+1 queries for fetching full history
      const firstFailures = await historyCollection.aggregate([
        { $match: matchFilter },
        { $sort: { executionTimestamp: 1 } },
        {
          $group: {
            _id: '$testFilePath',
            firstFailure: { $first: '$$ROOT' }
          }
        },
        { $replaceRoot: { newRoot: '$firstFailure' } }
      ]).toArray();

      if (firstFailures.length === 0) {
        return { 
          breakTimeline: [], 
          summary: { 
            totalFailures: 0,
            uniqueCommits: 0,
            uniqueTests: 0
          } 
        };
      }

      const breaks: BreakageEvent[] = [];

      // We still need to process per-file to handle the "previous status" logic correctly
      // which depends on strict time ordering and baseline checks.
      // However, we can optimize the query to fetch only relevant transitions.

      // Strategy: For each failing file, we need:
      // a. The first failure in the window (already fetched via aggregation)
      // b. The run immediately preceding that failure (to confirm it was passing)

      for (const firstFailure of firstFailures) {
        const testFilePath = firstFailure.testFilePath;

        // Find the run immediately preceding this failure
        const previousRun = await historyCollection.findOne(
          {
            testFilePath,
            executionTimestamp: { $lt: firstFailure.executionTimestamp },
            ...(filters.branch ? { 'git.branch': filters.branch } : {}),
            ...suiteFilter
          },
          {
            sort: { executionTimestamp: -1 }, // Latest preceding run
            projection: { 'result.failed': 1, 'result.passed': 1 }
          }
        );

        // Analyze transition
        let previousStatus: 'passed' | 'skipped' | 'failed' | 'none' = 'none';

        if (previousRun) {
          if (previousRun.result.failed > 0) {
            previousStatus = 'failed';
          } else {
            previousStatus = 'passed'; // Simplified: passed or skipped treated as non-failure
          }
        }

        // Only report if it's a new breakage (previous status was NOT failed)
        if (previousStatus !== 'failed') {
          breaks.push({
            testFile: String(testFilePath),
            testType: firstFailure.testType,
            breakageTime: firstFailure.executionTimestamp.toISOString(),
            commit: firstFailure.git?.commitHash || 'unknown',
            branch: firstFailure.git?.branch || 'unknown',
            previousStatus: previousStatus === 'none' ? 'passed' : (previousStatus as any), // Default 'none' to 'passed' to imply it broke from a clean state
            runId: firstFailure._id.toString()
          });
        }
      }

      // Group breaks by commit for the timeline
      const timelineMap = new Map<string, BreakageTimelineEntry>();

      for (const breakage of breaks) {
        // Group by commit hash if available, otherwise fallback to runId or timestamp
        const key = breakage.commit && breakage.commit !== 'unknown'
          ? breakage.commit
          : `${breakage.breakageTime}_${breakage.runId || 'unknown'}`;

        if (!timelineMap.has(key)) {
          timelineMap.set(key, {
            git_sha: breakage.commit || 'unknown',
            branch: breakage.branch || 'unknown',
            timestamp: breakage.breakageTime,
            failureCount: 0,
            failures: []
          });
        }

        const entry = timelineMap.get(key)!;
        entry.failureCount++;
        entry.failures.push({
          test_id: breakage.testFile,
          suite: breakage.testType
        });
      }

      // Sort timeline by timestamp (descending)
      const breakTimeline = Array.from(timelineMap.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return {
        breakTimeline,
        summary: {
          totalFailures: breaks.length,
          uniqueCommits: new Set(breaks.map(b => b.commit).filter(c => c && c !== 'unknown')).size,
          uniqueTests: new Set(breaks.map(b => b.testFile)).size
        }
      };

    } catch (error) {
      logger.error({ error }, 'Failed to analyze breakages');
      throw error;
    }
  }
}

// Export singleton instance getter
export const getTestBreakageService = () => TestBreakageService.getInstance();
