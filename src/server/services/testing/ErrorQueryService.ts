/**
 * Error Query Service
 * 
 * Provides efficient querying of test errors from MongoDB with support for filtering
 * by category, pattern, message content, and other criteria.
 * 
 * This service uses MongoDB aggregation pipelines to efficiently extract and filter
 * errors from the test_history collection, which stores errors in nested structures.
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import type { TestHistoryDocument, TestFailure } from '../../models/TestHistory.js';
import type { ErrorCategory } from './ErrorCategorizationService.js';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';
import { Document } from 'mongodb';

// Cache configuration
const CACHE_TTL = parseInt(process.env.ERROR_QUERY_CACHE_TTL || '300000', 10); // 5 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.ERROR_QUERY_CACHE_MAX_SIZE || '1000', 10);

export interface ErrorQueryFilters {
  errorCategory?: ErrorCategory;
  errorPattern?: string;
  errorMessage?: string; // Text search in error message and stack trace
  minOccurrences?: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
  testFilePath?: string;
  testFileId?: string;
  testType?: TestHistoryDocument['testType'];
  errorSeverity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorQueryResult {
  error: TestFailure;
  testHistory: {
    _id: string;
    testFilePath: string;
    testFileId: string;
    testType: TestHistoryDocument['testType'];
    executionTimestamp: Date;
    git: TestHistoryDocument['git'];
    environment: TestHistoryDocument['environment'];
  };
}

export interface ErrorQueryResponse {
  errors: ErrorQueryResult[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Service for querying test errors efficiently
 */
export class ErrorQueryService {
  private static instance: ErrorQueryService | null = null;
  private cache: Cache<unknown>;

  private constructor() {
    // Private constructor for singleton pattern
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'error-query-service');
  }

  public static getInstance(): ErrorQueryService {
    if (!ErrorQueryService.instance) {
      ErrorQueryService.instance = new ErrorQueryService();
    }
    return ErrorQueryService.instance;
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `error-query:${prefix}:${hash}`;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ReturnType<typeof this.cache.getStats> {
    return this.cache.getStats();
  }

  /**
   * Clear cache manually
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    logger.info('Cache cleared for ErrorQueryService');
  }

  /**
   * Find errors matching the specified filters
   * 
   * @param filters Query filters
   * @param options Pagination options
   * @returns Paginated error results
   */
  async findErrors(
    filters: ErrorQueryFilters = {},
    options: { limit?: number; skip?: number } = {}
  ): Promise<ErrorQueryResponse> {
    const { limit = 50, skip = 0 } = options;

    // Generate cache key
    const cacheKey = this.getCacheKey('find-errors', { filters, limit, skip });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for findErrors');
      return cached as ErrorQueryResponse;
    }

    logger.info({ filters, options }, 'Querying errors');

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    // Build aggregation pipeline
    const pipeline: Document[] = [];

    // Stage 1: Match test history documents with failures
    const matchStage: Record<string, unknown> = {
      'result.failed': { $gt: 0 },
      'result.failures': { $exists: true, $ne: [] },
    };

    // Apply date range filter
    if (filters.dateRange) {
      matchStage.executionTimestamp = {
        $gte: filters.dateRange.from,
        $lte: filters.dateRange.to,
      };
    } else {
      // Default: last 30 days if no date range specified
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 30);
      matchStage.executionTimestamp = { $gte: defaultFrom };
    }

    // Apply test file filters
    if (filters.testFilePath) {
      matchStage.testFilePath = filters.testFilePath;
    }
    if (filters.testFileId) {
      matchStage.testFileId = filters.testFileId;
    }
    if (filters.testType) {
      matchStage.testType = filters.testType;
    }

    pipeline.push({ $match: matchStage });

    // Stage 2: Unwind failures array to get individual errors
    pipeline.push({
      $unwind: {
        path: '$result.failures',
        preserveNullAndEmptyArrays: false,
      },
    });

    // Stage 3: Match error-level filters
    const errorMatchStage: Record<string, unknown> = {};

    if (filters.errorCategory) {
      errorMatchStage['result.failures.errorCategory'] = filters.errorCategory;
    }

    if (filters.errorPattern) {
      errorMatchStage['result.failures.errorPattern'] = {
        $regex: filters.errorPattern,
        $options: 'i',
      };
    }

    if (filters.errorSeverity) {
      errorMatchStage['result.failures.errorSeverity'] = filters.errorSeverity;
    }

    // Text search in error message and stack trace
    if (filters.errorMessage) {
      errorMatchStage.$or = [
        {
          'result.failures.errorMessage': {
            $regex: filters.errorMessage,
            $options: 'i',
          },
        },
        {
          'result.failures.stackTrace': {
            $regex: filters.errorMessage,
            $options: 'i',
          },
        },
      ];
    }

    // Filter by minimum occurrences
    if (filters.minOccurrences !== undefined) {
      errorMatchStage['result.failures.occurrenceCount'] = {
        $gte: filters.minOccurrences,
      };
    }

    if (Object.keys(errorMatchStage).length > 0) {
      pipeline.push({ $match: errorMatchStage });
    }

    // Stage 4: Project only needed fields
    pipeline.push({
      $project: {
        error: '$result.failures',
        testHistory: {
          _id: { $toString: '$_id' },
          testFilePath: 1,
          testFileId: 1,
          testType: 1,
          executionTimestamp: 1,
          git: 1,
          environment: 1,
        },
      },
    });

    // Stage 5: Get total count (before pagination)
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countCursor = collection.aggregate(countPipeline);
    const countResult = await countCursor.toArray();
    const total = countResult[0]?.total || 0;

    // Stage 6: Sort by execution timestamp (most recent first)
    pipeline.push({
      $sort: { 'testHistory.executionTimestamp': -1 },
    });

    // Stage 7: Apply pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Execute aggregation
    const cursor = collection.aggregate(pipeline);
    const results = await cursor.toArray();

    // Transform results to match ErrorQueryResult interface
    const errors: ErrorQueryResult[] = results.map((doc) => ({
      error: doc.error as TestFailure,
      testHistory: doc.testHistory as ErrorQueryResult['testHistory'],
    }));

    logger.info(
      { total, returned: errors.length, skip, limit },
      'Error query completed'
    );

    const result = {
      errors,
      total,
      page: Math.floor(skip / limit) + 1,
      limit,
      hasMore: skip + errors.length < total,
    };

    // Store in cache
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cache miss for findErrors, stored in cache');

    return result;
  }

  /**
   * Get error statistics grouped by category
   * 
   * @param filters Optional filters to apply
   * @returns Error statistics by category
   */
  async getErrorStatsByCategory(
    filters: ErrorQueryFilters = {}
  ): Promise<Array<{ category: ErrorCategory; count: number }>> {
    // Generate cache key
    const cacheKey = this.getCacheKey('error-stats-by-category', { filters });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getErrorStatsByCategory');
      return cached as Array<{ category: ErrorCategory; count: number }>;
    }

    logger.info({ filters }, 'Getting error stats by category');

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    const pipeline: Document[] = [];

    // Match stage (same as findErrors)
    const matchStage: Record<string, unknown> = {
      'result.failed': { $gt: 0 },
      'result.failures': { $exists: true, $ne: [] },
    };

    if (filters.dateRange) {
      matchStage.executionTimestamp = {
        $gte: filters.dateRange.from,
        $lte: filters.dateRange.to,
      };
    }

    if (filters.testFilePath) {
      matchStage.testFilePath = filters.testFilePath;
    }
    if (filters.testFileId) {
      matchStage.testFileId = filters.testFileId;
    }
    if (filters.testType) {
      matchStage.testType = filters.testType;
    }

    pipeline.push({ $match: matchStage });
    pipeline.push({
      $unwind: {
        path: '$result.failures',
        preserveNullAndEmptyArrays: false,
      },
    });

    // Group by category
    pipeline.push({
      $group: {
        _id: '$result.failures.errorCategory',
        count: { $sum: 1 },
      },
    });

    // Project and sort
    pipeline.push({
      $project: {
        category: '$_id',
        count: 1,
        _id: 0,
      },
    });

    pipeline.push({ $sort: { count: -1 } });

    const results = await collection.aggregate(pipeline).toArray();

    const stats = results.map((doc) => ({
      category: (doc.category || 'other') as ErrorCategory,
      count: doc.count as number,
    }));

    // Store in cache
    await this.cache.set(cacheKey, stats);
    logger.debug({ cacheKey }, 'Cache miss for getErrorStatsByCategory, stored in cache');

    return stats;
  }

  /**
   * Get error statistics by category with trends and severity breakdown
   * 
   * @param filters Optional filters to apply (dateRange is required for trends)
   * @returns Error statistics by category with trends and severity breakdown
   */
  async getErrorCategoriesWithTrends(
    filters: ErrorQueryFilters = {}
  ): Promise<{
    categories: Array<{
      category: ErrorCategory;
      count: number;
      percentage: number;
      trend: Array<{
        date: string;
        count: number;
      }>;
      severity: {
        low: number;
        medium: number;
        high: number;
        critical: number;
      };
    }>;
    summary: {
      totalErrors: number;
      totalCategories: number;
      dateRange: {
        from?: string;
        to?: string;
      };
    };
  }> {
    // Generate cache key
    const cacheKey = this.getCacheKey('error-categories-with-trends', { filters });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getErrorCategoriesWithTrends');
      return cached as {
        categories: Array<{
          category: ErrorCategory;
          count: number;
          percentage: number;
          trend: Array<{ date: string; count: number }>;
          severity: { low: number; medium: number; high: number; critical: number };
        }>;
        summary: {
          totalErrors: number;
          totalCategories: number;
          dateRange: { from?: string; to?: string };
        };
      };
    }

    logger.info({ filters }, 'Getting error categories with trends');

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    // Build match stage
    const matchStage: Record<string, unknown> = {
      'result.failed': { $gt: 0 },
      'result.failures': { $exists: true, $ne: [] },
    };

    if (filters.dateRange) {
      matchStage.executionTimestamp = {
        $gte: filters.dateRange.from,
        $lte: filters.dateRange.to,
      };
    } else {
      // Default: last 30 days if no date range specified
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 30);
      matchStage.executionTimestamp = { $gte: defaultFrom };
    }

    if (filters.testFilePath) {
      matchStage.testFilePath = filters.testFilePath;
    }
    if (filters.testFileId) {
      matchStage.testFileId = filters.testFileId;
    }
    if (filters.testType) {
      matchStage.testType = filters.testType;
    }

    // Pipeline to get category statistics with trends
    const pipeline: Document[] = [
      { $match: matchStage },
      {
        $unwind: {
          path: '$result.failures',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $group: {
          _id: {
            category: '$result.failures.errorCategory',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$executionTimestamp',
              },
            },
            severity: '$result.failures.errorSeverity',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.category',
          totalCount: { $sum: '$count' },
          dailyTrends: {
            $push: {
              date: '$_id.date',
              count: '$count',
            },
          },
          severityBreakdown: {
            $push: {
              severity: '$_id.severity',
              count: '$count',
            },
          },
        },
      },
      {
        $project: {
          category: '$_id',
          totalCount: 1,
          dailyTrends: 1,
          severityBreakdown: 1,
          _id: 0,
        },
      },
      { $sort: { totalCount: -1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    // Calculate total errors for percentage calculation
    const totalErrors = results.reduce(
      (sum, doc) => sum + (doc.totalCount as number),
      0
    );

    // Process results to format trends and severity breakdown
    const categories = results.map((doc) => {
      const category = (doc.category || 'other') as ErrorCategory;
      const count = doc.totalCount as number;
      const percentage = totalErrors > 0 ? (count / totalErrors) * 100 : 0;

      // Process daily trends - group by date and sum counts
      const dailyTrendsMap = new Map<string, number>();
      const dailyTrends = doc.dailyTrends as Array<{
        date: string;
        count: number;
      }>;
      dailyTrends.forEach((trend) => {
        const existing = dailyTrendsMap.get(trend.date) || 0;
        dailyTrendsMap.set(trend.date, existing + trend.count);
      });

      // Convert to array and sort by date
      const trend = Array.from(dailyTrendsMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Process severity breakdown
      const severityBreakdown = doc.severityBreakdown as Array<{
        severity: string;
        count: number;
      }>;
      const severity = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      severityBreakdown.forEach((item) => {
        const sev = item.severity as keyof typeof severity;
        if (sev in severity) {
          severity[sev] = (severity[sev] || 0) + item.count;
        }
      });

      return {
        category,
        count,
        percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
        trend,
        severity,
      };
    });

    const result = {
      categories,
      summary: {
        totalErrors,
        totalCategories: categories.length,
        dateRange: filters.dateRange
          ? {
              from: filters.dateRange.from.toISOString(),
              to: filters.dateRange.to.toISOString(),
            }
          : {},
      },
    };

    // Store in cache
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cache miss for getErrorCategoriesWithTrends, stored in cache');

    return result;
  }

  /**
   * Get error statistics grouped by pattern (fingerprint) with trends and affected test files
   * 
   * @param filters Optional filters to apply
   * @param options Options for limiting results
   * @returns Error statistics by pattern with trends and affected test files
   */
  async getErrorPatternsWithTrends(
    filters: ErrorQueryFilters = {},
    options: { limit?: number; minOccurrences?: number } = {}
  ): Promise<{
    patterns: Array<{
      fingerprint: string;
      pattern: string;
      category: ErrorCategory;
      severity: 'low' | 'medium' | 'high' | 'critical';
      occurrenceCount: number;
      affectedTestFiles: Array<{
        filePath: string;
        count: number;
      }>;
      trend: Array<{
        date: string;
        count: number;
      }>;
      firstSeen: string;
      lastSeen: string;
    }>;
    summary: {
      totalPatterns: number;
      totalOccurrences: number;
      dateRange: {
        from?: string;
        to?: string;
      };
    };
  }> {
    // Generate cache key
    const cacheKey = this.getCacheKey('error-patterns-with-trends', { filters, options });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for getErrorPatternsWithTrends');
      return cached as {
        patterns: Array<{
          fingerprint: string;
          pattern: string;
          category: ErrorCategory;
          severity: 'low' | 'medium' | 'high' | 'critical';
          occurrenceCount: number;
          affectedTestFiles: Array<{ filePath: string; count: number }>;
          trend: Array<{ date: string; count: number }>;
          firstSeen: string;
          lastSeen: string;
        }>;
        summary: {
          totalPatterns: number;
          totalOccurrences: number;
          dateRange: { from?: string; to?: string };
        };
      };
    }

    logger.info({ filters, options }, 'Getting error patterns with trends');

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    // Build match stage
    const matchStage: Record<string, unknown> = {
      'result.failed': { $gt: 0 },
      'result.failures': { $exists: true, $ne: [] },
    };

    if (filters.dateRange) {
      matchStage.executionTimestamp = {
        $gte: filters.dateRange.from,
        $lte: filters.dateRange.to,
      };
    } else {
      // Default: last 30 days if no date range specified
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - 30);
      matchStage.executionTimestamp = { $gte: defaultFrom };
    }

    if (filters.testFilePath) {
      matchStage.testFilePath = filters.testFilePath;
    }
    if (filters.testFileId) {
      matchStage.testFileId = filters.testFileId;
    }
    if (filters.testType) {
      matchStage.testType = filters.testType;
    }

    // Pipeline to get pattern statistics with trends
    const pipeline: Document[] = [
      { $match: matchStage },
      {
        $unwind: {
          path: '$result.failures',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $group: {
          _id: {
            fingerprint: '$result.failures.errorFingerprint',
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$executionTimestamp',
              },
            },
            testFilePath: '$testFilePath',
          },
          pattern: { $first: '$result.failures.errorPattern' },
          category: { $first: '$result.failures.errorCategory' },
          severity: { $first: '$result.failures.errorSeverity' },
          errorMessage: { $first: '$result.failures.errorMessage' },
          firstSeen: { $min: '$executionTimestamp' },
          lastSeen: { $max: '$executionTimestamp' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: {
            fingerprint: '$_id.fingerprint',
            date: '$_id.date',
          },
          pattern: { $first: '$pattern' },
          category: { $first: '$category' },
          severity: { $first: '$severity' },
          errorMessage: { $first: '$errorMessage' },
          firstSeen: { $min: '$firstSeen' },
          lastSeen: { $max: '$lastSeen' },
          dateCount: { $sum: '$count' },
          testFiles: {
            $push: {
              filePath: '$_id.testFilePath',
              count: '$count',
            },
          },
        },
      },
      {
        $unwind: '$testFiles',
      },
      {
        $group: {
          _id: {
            fingerprint: '$_id.fingerprint',
            filePath: '$testFiles.filePath',
          },
          pattern: { $first: '$pattern' },
          category: { $first: '$category' },
          severity: { $first: '$severity' },
          errorMessage: { $first: '$errorMessage' },
          firstSeen: { $min: '$firstSeen' },
          lastSeen: { $max: '$lastSeen' },
          fileCount: { $sum: '$testFiles.count' },
          dailyTrends: {
            $push: {
              date: '$_id.date',
              count: '$dateCount',
            },
          },
        },
      },
      {
        $group: {
          _id: '$_id.fingerprint',
          pattern: { $first: '$pattern' },
          category: { $first: '$category' },
          severity: { $first: '$severity' },
          errorMessage: { $first: '$errorMessage' },
          totalCount: { $sum: '$fileCount' },
          firstSeen: { $min: '$firstSeen' },
          lastSeen: { $max: '$lastSeen' },
          dailyTrends: {
            $push: {
              $arrayElemAt: ['$dailyTrends', 0],
            },
          },
          affectedTestFiles: {
            $push: {
              filePath: '$_id.filePath',
              count: '$fileCount',
            },
          },
        },
      },
      {
        $project: {
          fingerprint: '$_id',
          pattern: 1,
          category: 1,
          severity: 1,
          errorMessage: 1,
          totalCount: 1,
          firstSeen: 1,
          lastSeen: 1,
          dailyTrends: {
            $reduce: {
              input: '$dailyTrends',
              initialValue: [],
              in: {
                $concatArrays: ['$$value', '$$this'],
              },
            },
          },
          affectedTestFiles: 1,
          _id: 0,
        },
      },
    ];

    // Apply minOccurrences filter
    if (options.minOccurrences !== undefined) {
      pipeline.push({
        $match: {
          totalCount: { $gte: options.minOccurrences },
        },
      });
    }

    // Sort by occurrence count descending
    pipeline.push({ $sort: { totalCount: -1 } });

    // Apply limit
    if (options.limit !== undefined) {
      pipeline.push({ $limit: options.limit });
    }

    const results = await collection.aggregate(pipeline).toArray();

    // Calculate total occurrences
    const totalOccurrences = results.reduce(
      (sum, doc) => sum + (doc.totalCount as number),
      0
    );

    // Process results to format trends and affected test files
    const patterns = results.map((doc) => {
      const fingerprint = (doc.fingerprint || '') as string;
      const pattern = (doc.pattern || '') as string;
      const category = (doc.category || 'other') as ErrorCategory;
      const severity = (doc.severity || 'medium') as 'low' | 'medium' | 'high' | 'critical';
      const occurrenceCount = doc.totalCount as number;
      const firstSeen = doc.firstSeen as Date;
      const lastSeen = doc.lastSeen as Date;

      // Process daily trends - group by date and sum counts
      const dailyTrendsMap = new Map<string, number>();
      const dailyTrends = doc.dailyTrends as Array<{
        date: string;
        count: number;
      }>;
      dailyTrends.forEach((trend) => {
        const existing = dailyTrendsMap.get(trend.date) || 0;
        dailyTrendsMap.set(trend.date, existing + trend.count);
      });

      // Convert to array and sort by date
      const trend = Array.from(dailyTrendsMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Process affected test files - group by filePath and sum counts
      const testFilesMap = new Map<string, number>();
      const affectedTestFiles = doc.affectedTestFiles as Array<{
        filePath: string;
        count: number;
      }>;
      affectedTestFiles.forEach((file) => {
        const existing = testFilesMap.get(file.filePath) || 0;
        testFilesMap.set(file.filePath, existing + file.count);
      });

      // Convert to array and sort by count descending
      const affectedFiles = Array.from(testFilesMap.entries())
        .map(([filePath, count]) => ({ filePath, count }))
        .sort((a, b) => b.count - a.count);

      return {
        fingerprint,
        pattern,
        category,
        severity,
        occurrenceCount,
        affectedTestFiles: affectedFiles,
        trend,
        firstSeen: firstSeen.toISOString(),
        lastSeen: lastSeen.toISOString(),
      };
    });

    const result = {
      patterns,
      summary: {
        totalPatterns: patterns.length,
        totalOccurrences,
        dateRange: filters.dateRange
          ? {
              from: filters.dateRange.from.toISOString(),
              to: filters.dateRange.to.toISOString(),
            }
          : {},
      },
    };

    // Store in cache
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cache miss for getErrorPatternsWithTrends, stored in cache');

    return result;
  }

  /**
   * Get detailed information about a specific error pattern by fingerprint
   * 
   * @param fingerprint SHA-256 hash fingerprint of the error
   * @returns Detailed error information including occurrences, timeline, and related errors
   */
  async getErrorByFingerprint(
    fingerprint: string
  ): Promise<{
    fingerprint: string;
    pattern: string;
    category: ErrorCategory;
    severity: 'low' | 'medium' | 'high' | 'critical';
    errorMessage: string;
    stackTrace?: string;
    occurrenceCount: number;
    affectedTestFiles: Array<{
      filePath: string;
      count: number;
      firstSeen: string;
      lastSeen: string;
    }>;
    timeline: Array<{
      date: string;
      count: number;
      testFiles: string[];
    }>;
    occurrences: Array<{
      testFilePath: string;
      testName: string;
      executionTimestamp: string;
      duration?: number;
    }>;
    relatedErrors: Array<{
      fingerprint: string;
      pattern: string;
      category: ErrorCategory;
      occurrenceCount: number;
      similarity: number;
    }>;
    firstSeen: string;
    lastSeen: string;
  } | null> {
    // Generate cache key
    const cacheKey = this.getCacheKey('error-by-fingerprint', { fingerprint });

    // Try to get from cache
    const cached = await this.cache.get(cacheKey);
    if (cached !== undefined) {
      logger.debug({ cacheKey }, 'Cache hit for getErrorByFingerprint');
      return cached as {
        fingerprint: string;
        pattern: string;
        category: ErrorCategory;
        severity: 'low' | 'medium' | 'high' | 'critical';
        errorMessage: string;
        stackTrace?: string;
        occurrenceCount: number;
        affectedTestFiles: Array<{ filePath: string; count: number; firstSeen: string; lastSeen: string }>;
        timeline: Array<{ date: string; count: number; testFiles: string[] }>;
        occurrences: Array<{ testFilePath: string; testName: string; executionTimestamp: string; duration?: number }>;
        relatedErrors: Array<{ fingerprint: string; pattern: string; category: ErrorCategory; occurrenceCount: number; similarity: number }>;
        firstSeen: string;
        lastSeen: string;
      } | null;
    }

    logger.info({ fingerprint }, 'Getting error details by fingerprint');

    // Validate fingerprint format (SHA-256 hash, 64 hex characters)
    if (!fingerprint || !/^[a-f0-9]{64}$/i.test(fingerprint)) {
      logger.warn({ fingerprint }, 'Invalid fingerprint format');
      return null;
    }

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    // Pipeline to get all occurrences of this fingerprint
    const pipeline: Document[] = [
      {
        $match: {
          'result.failed': { $gt: 0 },
          'result.failures': { $exists: true, $ne: [] },
        },
      },
      {
        $unwind: {
          path: '$result.failures',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          'result.failures.errorFingerprint': fingerprint,
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$executionTimestamp',
              },
            },
            testFilePath: '$testFilePath',
            testName: '$result.failures.testName',
            executionTimestamp: '$executionTimestamp',
            duration: '$result.duration',
          },
          pattern: { $first: '$result.failures.errorPattern' },
          category: { $first: '$result.failures.errorCategory' },
          severity: { $first: '$result.failures.errorSeverity' },
          errorMessage: { $first: '$result.failures.errorMessage' },
          stackTrace: { $first: '$result.failures.stackTrace' },
          firstSeen: { $min: '$executionTimestamp' },
          lastSeen: { $max: '$executionTimestamp' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          pattern: { $first: '$pattern' },
          category: { $first: '$category' },
          severity: { $first: '$severity' },
          errorMessage: { $first: '$errorMessage' },
          stackTrace: { $first: '$stackTrace' },
          firstSeen: { $min: '$firstSeen' },
          lastSeen: { $max: '$lastSeen' },
          dateCount: { $sum: '$count' },
          testFiles: {
            $addToSet: '$_id.testFilePath',
          },
          occurrences: {
            $push: {
              testFilePath: '$_id.testFilePath',
              testName: '$_id.testName',
              executionTimestamp: '$_id.executionTimestamp',
              duration: '$_id.duration',
            },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    if (results.length === 0) {
      logger.info({ fingerprint }, 'No occurrences found for fingerprint');
      return null;
    }

    // Extract error details from first result
    const firstResult = results[0];
    const pattern = (firstResult.pattern || '') as string;
    const category = (firstResult.category || 'other') as ErrorCategory;
    const severity = (firstResult.severity || 'medium') as 'low' | 'medium' | 'high' | 'critical';
    const errorMessage = (firstResult.errorMessage || '') as string;
    const stackTrace = firstResult.stackTrace as string | undefined;
    const firstSeen = firstResult.firstSeen as Date;
    const lastSeen = firstResult.lastSeen as Date;

    // Build timeline
    const timeline = results.map((doc) => ({
      date: doc._id as string,
      count: doc.dateCount as number,
      testFiles: doc.testFiles as string[],
    }));

    // Aggregate all occurrences
    const allOccurrences: Array<{
      testFilePath: string;
      testName: string;
      executionTimestamp: Date;
      duration?: number;
    }> = [];
    results.forEach((doc) => {
      const occurrences = doc.occurrences as Array<{
        testFilePath: string;
        testName: string;
        executionTimestamp: Date;
        duration?: number;
      }>;
      allOccurrences.push(...occurrences);
    });

    // Sort occurrences by timestamp (most recent first)
    allOccurrences.sort((a, b) => b.executionTimestamp.getTime() - a.executionTimestamp.getTime());

    // Calculate affected test files with counts
    const testFileMap = new Map<string, { count: number; firstSeen: Date; lastSeen: Date }>();
    allOccurrences.forEach((occ) => {
      const existing = testFileMap.get(occ.testFilePath) || {
        count: 0,
        firstSeen: occ.executionTimestamp,
        lastSeen: occ.executionTimestamp,
      };
      existing.count += 1;
      if (occ.executionTimestamp < existing.firstSeen) {
        existing.firstSeen = occ.executionTimestamp;
      }
      if (occ.executionTimestamp > existing.lastSeen) {
        existing.lastSeen = occ.executionTimestamp;
      }
      testFileMap.set(occ.testFilePath, existing);
    });

    const affectedTestFiles = Array.from(testFileMap.entries())
      .map(([filePath, data]) => ({
        filePath,
        count: data.count,
        firstSeen: data.firstSeen.toISOString(),
        lastSeen: data.lastSeen.toISOString(),
      }))
      .sort((a, b) => b.count - a.count);

    // Find related errors (same category, different fingerprint)
    const relatedErrors = await this.findRelatedErrors(fingerprint, category);

    const result = {
      fingerprint,
      pattern,
      category,
      severity,
      errorMessage,
      stackTrace,
      occurrenceCount: allOccurrences.length,
      affectedTestFiles,
      timeline,
      occurrences: allOccurrences.map((occ) => ({
        testFilePath: occ.testFilePath,
        testName: occ.testName,
        executionTimestamp: occ.executionTimestamp.toISOString(),
        duration: occ.duration,
      })),
      relatedErrors,
      firstSeen: firstSeen.toISOString(),
      lastSeen: lastSeen.toISOString(),
    };

    // Store in cache (even if null, cache the null result to avoid repeated queries)
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cache miss for getErrorByFingerprint, stored in cache');

    return result;
  }

  /**
   * Find related errors (same category, different fingerprint)
   * 
   * @param fingerprint Current error fingerprint
   * @param category Error category
   * @returns Array of related errors with similarity scores
   */
  private async findRelatedErrors(
    fingerprint: string,
    category: ErrorCategory
  ): Promise<Array<{
    fingerprint: string;
    pattern: string;
    category: ErrorCategory;
    occurrenceCount: number;
    similarity: number;
  }>> {
    logger.info({ fingerprint, category }, 'Finding related errors');

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    // Get patterns with same category, different fingerprint
    const pipeline: Document[] = [
      {
        $match: {
          'result.failed': { $gt: 0 },
          'result.failures': { $exists: true, $ne: [] },
        },
      },
      {
        $unwind: {
          path: '$result.failures',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          'result.failures.errorCategory': category,
          'result.failures.errorFingerprint': { $ne: fingerprint },
        },
      },
      {
        $group: {
          _id: '$result.failures.errorFingerprint',
          pattern: { $first: '$result.failures.errorPattern' },
          category: { $first: '$result.failures.errorCategory' },
          occurrenceCount: { $sum: 1 },
        },
      },
      {
        $project: {
          fingerprint: '$_id',
          pattern: 1,
          category: 1,
          occurrenceCount: 1,
          _id: 0,
        },
      },
      {
        $sort: { occurrenceCount: -1 },
      },
      {
        $limit: 10, // Return top 10 related errors
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return results.map((doc) => ({
      fingerprint: (doc.fingerprint || '') as string,
      pattern: (doc.pattern || '') as string,
      category: (doc.category || 'other') as ErrorCategory,
      occurrenceCount: doc.occurrenceCount as number,
      similarity: 0.5, // Simple similarity: same category = 0.5 (could be enhanced with pattern matching)
    }));
  }
}
