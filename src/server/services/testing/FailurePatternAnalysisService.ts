/**
 * Failure Pattern Analysis Service
 * 
 * Analyzes test failures to identify patterns, group similar failures,
 * and provide root cause analysis suggestions.
 * 
 * Features:
 * - Failure grouping algorithm
 * - Pattern recognition for common failures (timeout, network, assertion, etc.)
 * - Environment-specific failure detection
 * - Root cause analysis suggestions
 */

import { TestHistory, TestHistoryDocument, TestFailure } from '../../models/TestHistory.js';
import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';
import { Filter } from 'mongodb';

// Cache configuration
const CACHE_TTL = parseInt(process.env.FAILURE_PATTERN_CACHE_TTL || '600000', 10); // 10 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.FAILURE_PATTERN_CACHE_MAX_SIZE || '500', 10);

export interface FailurePattern {
  id: string;
  pattern: string; // Pattern description (e.g., "Timeout in network requests")
  category: FailureCategory;
  errorMessagePattern?: RegExp;
  stackTracePattern?: RegExp;
  environmentPattern?: RegExp;
  frequency: number; // Number of occurrences
  affectedTests: string[]; // Test file paths
  affectedEnvironments: string[]; // Environment identifiers
  firstSeen: Date;
  lastSeen: Date;
  rootCauseSuggestions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type FailureCategory =
  | 'timeout'
  | 'network'
  | 'assertion'
  | 'database'
  | 'environment'
  | 'memory'
  | 'type-error'
  | 'permission'
  | 'not-found'
  | 'syntax'
  | 'playwright'
  | 'other';

export interface FailureGroup {
  patternId: string;
  failures: GroupedFailure[];
  pattern: FailurePattern;
  totalOccurrences: number;
  affectedTestFiles: Set<string>;
  affectedEnvironments: Set<string>;
  timeRange: {
    first: Date;
    last: Date;
  };
}

export interface GroupedFailure {
  testHistoryId: string;
  testFilePath: string;
  testName: string;
  errorMessage: string;
  stackTrace?: string;
  environment: string;
  timestamp: Date;
  gitCommit?: string;
  gitBranch?: string;
}

export interface FailurePatternAnalysisResult {
  timestamp: Date;
  totalFailures: number;
  patterns: FailurePattern[];
  groups: FailureGroup[];
  summary: {
    byCategory: Record<FailureCategory, number>;
    bySeverity: Record<string, number>;
    mostCommonPatterns: FailurePattern[];
    environmentSpecificFailures: FailurePattern[];
  };
  recommendations: string[];
}

// Error type patterns (expanded from select-tests.ts)
const ERROR_TYPE_PATTERNS: Array<{
  category: FailureCategory;
  patterns: RegExp[];
  severity: FailurePattern['severity'];
  rootCauseSuggestions: string[];
}> = [
  {
    category: 'timeout',
    patterns: [
      /timeout|timed out|exceeded|deadline|waiting for|time.*limit/i,
      /Test timeout of \d+ms exceeded/i,
      /Navigation timeout of \d+ms exceeded/i,
    ],
    severity: 'high',
    rootCauseSuggestions: [
      'Check if test is waiting for slow operations',
      'Review network request timeouts',
      'Consider increasing test timeout for slow operations',
      'Check for resource contention (CPU, memory, network)',
      'Verify database query performance',
    ],
  },
  {
    category: 'network',
    patterns: [
      /network|fetch|request|connection|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
      /Failed to fetch|NetworkError|Connection refused/i,
      /getaddrinfo ENOTFOUND/i,
    ],
    severity: 'high',
    rootCauseSuggestions: [
      'Verify network connectivity',
      'Check if external services are available',
      'Review API endpoint URLs',
      'Check firewall or proxy settings',
      'Verify DNS resolution',
    ],
  },
  {
    category: 'assertion',
    patterns: [
      /assertion|expect|assert|failed|not equal|not to be|Expected.*but received/i,
      /AssertionError|expect\(.*\)\.toBe\(|expect\(.*\)\.toEqual\(/i,
    ],
    severity: 'medium',
    rootCauseSuggestions: [
      'Review test expectations and actual values',
      'Check for data race conditions',
      'Verify test data setup',
      'Review recent code changes affecting test logic',
      'Check for timing issues in async operations',
    ],
  },
  {
    category: 'database',
    patterns: [
      /database|mongodb|neo4j|connection.*db|query.*failed|MongoError|MongoServerError/i,
      /Connection.*closed|Connection.*refused|Cannot connect to.*database/i,
      /E11000.*duplicate key/i,
    ],
    severity: 'high',
    rootCauseSuggestions: [
      'Verify database connection settings',
      'Check database server status',
      'Review connection pool configuration',
      'Check for database locks or deadlocks',
      'Verify database credentials',
    ],
  },
  {
    category: 'environment',
    patterns: [
      /CI|environment|NODE_ENV|process\.env/i,
      /Environment.*not.*configured|Missing.*environment.*variable/i,
    ],
    severity: 'medium',
    rootCauseSuggestions: [
      'Check environment variable configuration',
      'Verify CI/CD environment setup',
      'Review .env file configuration',
      'Check for missing environment-specific settings',
    ],
  },
  {
    category: 'memory',
    patterns: [
      /memory|heap|out of memory|allocation|FATAL ERROR.*heap/i,
      /JavaScript heap out of memory/i,
      /Worker exited unexpectedly/i,
    ],
    severity: 'critical',
    rootCauseSuggestions: [
      'Review memory-intensive operations',
      'Check for memory leaks',
      'Consider increasing Node.js heap size',
      'Review Jest worker memory limits',
      'Optimize large data processing',
    ],
  },
  {
    category: 'type-error',
    patterns: [
      /type.*error|TypeError|undefined.*is not|cannot read property|Cannot read properties of/i,
      /is not a function|is not defined|Cannot access/i,
    ],
    severity: 'medium',
    rootCauseSuggestions: [
      'Check for null/undefined values',
      'Review type definitions',
      'Verify object property access',
      'Check for missing imports or dependencies',
    ],
  },
  {
    category: 'permission',
    patterns: [
      /permission|unauthorized|403|forbidden|access denied|EACCES/i,
      /Permission denied|Access.*denied/i,
    ],
    severity: 'high',
    rootCauseSuggestions: [
      'Check file system permissions',
      'Verify API authentication',
      'Review user roles and permissions',
      'Check for missing authentication tokens',
    ],
  },
  {
    category: 'not-found',
    patterns: [
      /not found|404|ENOENT|cannot find|missing|File not found/i,
      /Cannot find module|Module not found/i,
    ],
    severity: 'medium',
    rootCauseSuggestions: [
      'Verify file paths are correct',
      'Check if files exist',
      'Review import paths',
      'Check for missing dependencies',
    ],
  },
  {
    category: 'syntax',
    patterns: [
      /syntax|parse|invalid.*json|unexpected token|SyntaxError/i,
      /Unexpected token|Parse error/i,
    ],
    severity: 'medium',
    rootCauseSuggestions: [
      'Check JSON syntax',
      'Review code syntax',
      'Verify file encoding',
      'Check for corrupted files',
    ],
  },
  {
    category: 'playwright',
    patterns: [
      /playwright|browser|page.*not found|element.*not found|locator/i,
      /Element.*not.*visible|Timeout.*waiting.*for.*selector/i,
    ],
    severity: 'medium',
    rootCauseSuggestions: [
      'Check if page elements exist',
      'Review selector strategies',
      'Verify page load timing',
      'Check for dynamic content loading',
    ],
  },
];

/**
 * Service for analyzing test failure patterns
 */
export class FailurePatternAnalysisService {
  private static instance: FailurePatternAnalysisService;
  private cache: Cache<unknown>;

  private constructor() {
    // Private constructor to enforce singleton pattern
    // Initialize cache with TTL and max size
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'failure-pattern-analysis-service');
  }

  public static getInstance(): FailurePatternAnalysisService {
    if (!FailurePatternAnalysisService.instance) {
      FailurePatternAnalysisService.instance = new FailurePatternAnalysisService();
    }
    return FailurePatternAnalysisService.instance;
  }

  /**
   * Generate cache key for a query
   */
  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `failure-pattern:${prefix}:${hash}`;
  }

  /**
   * Clear cache entries (called when new test failures are saved)
   */
  async clearCache(): Promise<void> {
    try {
      await this.cache.clear();
      logger.info('Cache cleared for FailurePatternAnalysisService');
    } catch (error) {
      logger.warn({ error }, 'Failed to clear cache');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ReturnType<typeof this.cache.getStats> {
    return this.cache.getStats();
  }

  /**
   * Analyze test failures and identify patterns
   * 
   * @param options Analysis options
   * @returns Failure pattern analysis result
   */
  async analyzeFailurePatterns(options: {
    timeWindowDays?: number;
    testType?: TestHistoryDocument['testType'];
    environment?: string;
    limit?: number;
  } = {}): Promise<FailurePatternAnalysisResult> {
    const {
      timeWindowDays = 30,
      testType,
      environment,
      limit = 1000,
    } = options;

    // Generate cache key
    const cacheKey = this.getCacheKey('analyzeFailurePatterns', {
      timeWindowDays,
      testType,
      environment,
      limit,
    });

    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit for failure pattern analysis');
      return cached as FailurePatternAnalysisResult;
    }

    logger.info({ options }, 'Analyzing failure patterns');

    // Get test history with failures
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

    const db = getDB();
    const collection = db.collection<TestHistoryDocument>('test_history');

    const query: Filter<TestHistoryDocument> = {
      'result.failed': { $gt: 0 },
      executionTimestamp: { $gte: cutoffDate },
    };

    if (testType) {
      query.testType = testType;
    }

    if (environment) {
      query['environment.os'] = environment;
    }

    const testHistories = await collection
      .find(query)
      .sort({ executionTimestamp: -1 })
      .limit(limit)
      .toArray();

    logger.info({ count: testHistories.length }, 'Found test histories with failures');

    // Extract all failures
    const allFailures: Array<{
      history: TestHistoryDocument;
      failure: TestFailure;
    }> = [];

    for (const history of testHistories) {
      if (history.result.failures) {
        for (const failure of history.result.failures) {
          allFailures.push({ history, failure });
        }
      }
    }

    logger.info({ count: allFailures.length }, 'Extracted failures');

    // Group failures by pattern
    const patterns = this.identifyPatterns(allFailures);
    const groups = this.groupFailures(allFailures, patterns);

    // Generate summary
    const summary = this.generateSummary(patterns, groups);
    const recommendations = this.generateRecommendations(patterns, summary);

    const result: FailurePatternAnalysisResult = {
      timestamp: new Date(),
      totalFailures: allFailures.length,
      patterns,
      groups,
      summary,
      recommendations,
    };

    // Cache the result
    await this.cache.set(cacheKey, result);
    logger.debug({ cacheKey }, 'Cached failure pattern analysis result');

    return result;
  }

  /**
   * Identify failure patterns from failures
   */
  private identifyPatterns(
    failures: Array<{ history: TestHistoryDocument; failure: TestFailure }>
  ): FailurePattern[] {
    const patternMap = new Map<string, FailurePattern>();

    for (const { history, failure } of failures) {
      const errorMessage = failure.errorMessage || '';
      const stackTrace = failure.stackTrace || '';
      const envKey = this.getEnvironmentKey(history.environment);

      // Categorize error
      const category = this.categorizeFailure(errorMessage, stackTrace);
      const errorTypeConfig = ERROR_TYPE_PATTERNS.find(e => e.category === category);

      // Create pattern key
      const patternKey = this.createPatternKey(category, errorMessage, stackTrace);

      if (!patternMap.has(patternKey)) {
        const pattern: FailurePattern = {
          id: patternKey,
          pattern: this.extractPatternDescription(errorMessage, category),
          category,
          errorMessagePattern: this.createRegexFromError(errorMessage),
          stackTracePattern: stackTrace ? this.createRegexFromError(stackTrace) : undefined,
          frequency: 0,
          affectedTests: [],
          affectedEnvironments: [],
          firstSeen: history.executionTimestamp,
          lastSeen: history.executionTimestamp,
          rootCauseSuggestions: errorTypeConfig?.rootCauseSuggestions || [],
          severity: errorTypeConfig?.severity || 'medium',
        };

        patternMap.set(patternKey, pattern);
      }

      const pattern = patternMap.get(patternKey)!;
      pattern.frequency += 1;

      if (failure.filePath && !pattern.affectedTests.includes(failure.filePath)) {
        pattern.affectedTests.push(failure.filePath);
      }

      if (!pattern.affectedEnvironments.includes(envKey)) {
        pattern.affectedEnvironments.push(envKey);
      }

      if (history.executionTimestamp < pattern.firstSeen) {
        pattern.firstSeen = history.executionTimestamp;
      }

      if (history.executionTimestamp > pattern.lastSeen) {
        pattern.lastSeen = history.executionTimestamp;
      }
    }

    return Array.from(patternMap.values());
  }

  /**
   * Group failures by pattern
   */
  private groupFailures(
    failures: Array<{ history: TestHistoryDocument; failure: TestFailure }>,
    patterns: FailurePattern[]
  ): FailureGroup[] {
    const groups: FailureGroup[] = [];

    for (const pattern of patterns) {
      const patternFailures: GroupedFailure[] = [];

      for (const { history, failure } of failures) {
        const errorMessage = failure.errorMessage || '';
        const stackTrace = failure.stackTrace || '';

        if (this.matchesPattern(errorMessage, stackTrace, pattern)) {
          patternFailures.push({
            testHistoryId: history._id?.toString() || '',
            testFilePath: failure.filePath || history.testFilePath,
            testName: failure.testName,
            errorMessage: errorMessage,
            stackTrace: stackTrace,
            environment: this.getEnvironmentKey(history.environment),
            timestamp: history.executionTimestamp,
            gitCommit: history.git.commitHashShort,
            gitBranch: history.git.branch,
          });
        }
      }

      if (patternFailures.length > 0) {
        const testFiles = new Set(patternFailures.map(f => f.testFilePath));
        const environments = new Set(patternFailures.map(f => f.environment));
        const timestamps = patternFailures.map(f => f.timestamp);

        groups.push({
          patternId: pattern.id,
          failures: patternFailures,
          pattern,
          totalOccurrences: patternFailures.length,
          affectedTestFiles: testFiles,
          affectedEnvironments: environments,
          timeRange: {
            first: new Date(Math.min(...timestamps.map(t => t.getTime()))),
            last: new Date(Math.max(...timestamps.map(t => t.getTime()))),
          },
        });
      }
    }

    return groups.sort((a, b) => b.totalOccurrences - a.totalOccurrences);
  }

  /**
   * Categorize failure based on error message and stack trace
   */
  private categorizeFailure(errorMessage: string, stackTrace: string): FailureCategory {
    const combined = `${errorMessage} ${stackTrace}`.toLowerCase();

    for (const errorType of ERROR_TYPE_PATTERNS) {
      for (const pattern of errorType.patterns) {
        if (pattern.test(combined)) {
          return errorType.category;
        }
      }
    }

    return 'other';
  }

  /**
   * Create pattern key for grouping
   */
  private createPatternKey(category: FailureCategory, errorMessage: string, stackTrace: string): string {
    // Normalize error message (remove variable parts)
    const normalized = this.normalizeErrorMessage(errorMessage);
    return `${category}:${normalized.substring(0, 100)}`;
  }

  /**
   * Normalize error message by removing variable parts
   */
  private normalizeErrorMessage(errorMessage: string): string {
    return errorMessage
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/['"]/g, '') // Remove quotes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract pattern description from error message
   */
  private extractPatternDescription(errorMessage: string, category: FailureCategory): string {
    const firstLine = errorMessage.split('\n')[0].trim();
    if (firstLine.length > 100) {
      return `${category}: ${firstLine.substring(0, 97)}...`;
    }
    return `${category}: ${firstLine}`;
  }

  /**
   * Create regex from error message
   */
  private createRegexFromError(error: string): RegExp {
    const normalized = this.normalizeErrorMessage(error);
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped.substring(0, 50), 'i');
  }

  /**
   * Check if failure matches pattern
   */
  private matchesPattern(
    errorMessage: string,
    stackTrace: string,
    pattern: FailurePattern
  ): boolean {
    if (pattern.errorMessagePattern && !pattern.errorMessagePattern.test(errorMessage)) {
      return false;
    }

    if (pattern.stackTracePattern && stackTrace && !pattern.stackTracePattern.test(stackTrace)) {
      return false;
    }

    return true;
  }

  /**
   * Get environment key
   */
  private getEnvironmentKey(environment: TestHistoryDocument['environment']): string {
    return `${environment.os}-${environment.nodeVersion}`;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    patterns: FailurePattern[],
    groups: FailureGroup[]
  ): FailurePatternAnalysisResult['summary'] {
    const byCategory: Record<FailureCategory, number> = {
      timeout: 0,
      network: 0,
      assertion: 0,
      database: 0,
      environment: 0,
      memory: 0,
      'type-error': 0,
      permission: 0,
      'not-found': 0,
      syntax: 0,
      playwright: 0,
      other: 0,
    };

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const pattern of patterns) {
      byCategory[pattern.category] += pattern.frequency;
      bySeverity[pattern.severity] += pattern.frequency;
    }

    const mostCommonPatterns = [...patterns]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const environmentSpecificFailures = patterns.filter(
      p => p.affectedEnvironments.length === 1
    );

    return {
      byCategory,
      bySeverity,
      mostCommonPatterns,
      environmentSpecificFailures,
    };
  }

  /**
   * Generate recommendations based on patterns
   */
  private generateRecommendations(
    patterns: FailurePattern[],
    summary: FailurePatternAnalysisResult['summary']
  ): string[] {
    const recommendations: string[] = [];

    // High frequency patterns
    const highFrequency = patterns.filter(p => p.frequency > 10);
    if (highFrequency.length > 0) {
      recommendations.push(
        `Found ${highFrequency.length} high-frequency failure patterns. Consider prioritizing fixes for these.`
      );
    }

    // Critical severity patterns
    const critical = patterns.filter(p => p.severity === 'critical');
    if (critical.length > 0) {
      recommendations.push(
        `Found ${critical.length} critical failure patterns. These should be addressed immediately.`
      );
    }

    // Environment-specific failures
    if (summary.environmentSpecificFailures.length > 0) {
      recommendations.push(
        `Found ${summary.environmentSpecificFailures.length} environment-specific failures. Review environment configuration.`
      );
    }

    // Category-specific recommendations
    if (summary.byCategory.timeout > 0) {
      recommendations.push(
        `High number of timeout failures (${summary.byCategory.timeout}). Review test timeouts and resource availability.`
      );
    }

    if (summary.byCategory.network > 0) {
      recommendations.push(
        `Network failures detected (${summary.byCategory.network}). Verify network connectivity and external service availability.`
      );
    }

    if (summary.byCategory.memory > 0) {
      recommendations.push(
        `Memory-related failures detected (${summary.byCategory.memory}). Review memory usage and limits.`
      );
    }

    return recommendations;
  }
}


