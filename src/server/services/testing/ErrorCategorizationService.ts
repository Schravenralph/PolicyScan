/**
 * Error Categorization Service
 * 
 * Automatically categorizes test failures by analyzing error messages and stack traces.
 * Generates error patterns, fingerprints, and severity levels for test failures.
 * 
 * This service is used during test result collection to populate enhanced error fields
 * in the TestFailure interface (errorCategory, errorPattern, errorFingerprint, errorSeverity).
 * 
 * Features:
 * - Automatic error categorization based on error message patterns
 * - Error pattern normalization for matching similar errors
 * - Error fingerprinting for deduplication
 * - Severity assessment
 */

import { createHash } from 'crypto';
import { logger } from '../../utils/logger.js';

export type ErrorCategory =
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

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorCategorizationResult {
  category: ErrorCategory;
  pattern: string;
  fingerprint: string;
  severity: ErrorSeverity;
}

// Error type patterns for categorization
const ERROR_TYPE_PATTERNS: Array<{
  category: ErrorCategory;
  patterns: RegExp[];
  severity: ErrorSeverity;
}> = [
  {
    category: 'timeout',
    patterns: [
      /timeout|timed out|exceeded|deadline|waiting for|time.*limit/i,
      /Test timeout of \d+ms exceeded/i,
      /Navigation timeout of \d+ms exceeded/i,
    ],
    severity: 'high',
  },
  {
    category: 'network',
    patterns: [
      /network|fetch|request|connection|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
      /Failed to fetch|NetworkError|Connection refused/i,
      /getaddrinfo ENOTFOUND/i,
    ],
    severity: 'high',
  },
  {
    category: 'assertion',
    patterns: [
      /assertion|expect|assert|failed|not equal|not to be|Expected.*but received/i,
      /AssertionError|expect\(.*\)\.toBe\(|expect\(.*\)\.toEqual\(/i,
    ],
    severity: 'medium',
  },
  {
    category: 'database',
    patterns: [
      /database|mongodb|neo4j|connection.*db|query.*failed|MongoError|MongoServerError/i,
      /Connection.*closed|Connection.*refused|Cannot connect to.*database/i,
      /E11000.*duplicate key/i,
    ],
    severity: 'high',
  },
  {
    category: 'environment',
    patterns: [
      /CI|environment|NODE_ENV|process\.env/i,
      /Environment.*not.*configured|Missing.*environment.*variable/i,
    ],
    severity: 'medium',
  },
  {
    category: 'memory',
    patterns: [
      /memory|heap|out of memory|allocation|FATAL ERROR.*heap/i,
      /JavaScript heap out of memory/i,
      /Worker exited unexpectedly/i,
    ],
    severity: 'critical',
  },
  {
    category: 'type-error',
    patterns: [
      /type.*error|TypeError|undefined.*is not|cannot read property|Cannot read properties of/i,
      /is not a function|is not defined|Cannot access/i,
    ],
    severity: 'medium',
  },
  {
    category: 'permission',
    patterns: [
      /permission|unauthorized|403|forbidden|access denied|EACCES/i,
      /Permission denied|Access.*denied/i,
    ],
    severity: 'high',
  },
  {
    category: 'not-found',
    patterns: [
      /not found|404|ENOENT|cannot find|missing|File not found/i,
      /Cannot find module|Module not found/i,
    ],
    severity: 'medium',
  },
  {
    category: 'syntax',
    patterns: [
      /syntax|parse|invalid.*json|unexpected token|SyntaxError/i,
      /Unexpected token|Parse error/i,
    ],
    severity: 'medium',
  },
  {
    category: 'playwright',
    patterns: [
      /playwright|browser|page.*not found|element.*not found|locator/i,
      /Element.*not.*visible|Timeout.*waiting.*for.*selector/i,
    ],
    severity: 'medium',
  },
];

/**
 * Service for categorizing test errors
 */
export class ErrorCategorizationService {
  private static instance: ErrorCategorizationService;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): ErrorCategorizationService {
    if (!ErrorCategorizationService.instance) {
      ErrorCategorizationService.instance = new ErrorCategorizationService();
    }
    return ErrorCategorizationService.instance;
  }

  /**
   * Categorize an error based on error message and optional stack trace
   * 
   * @param errorMessage - The error message
   * @param stackTrace - Optional stack trace
   * @returns Categorization result with category, pattern, fingerprint, and severity
   */
  categorizeError(
    errorMessage: string,
    stackTrace?: string
  ): ErrorCategorizationResult {
    const category = this.matchErrorCategory(errorMessage, stackTrace);
    const pattern = this.generateErrorPattern(errorMessage, category);
    const fingerprint = this.generateFingerprint(errorMessage, stackTrace);
    const severity = this.determineSeverity(category, errorMessage);

    return {
      category,
      pattern,
      fingerprint,
      severity,
    };
  }

  /**
   * Match error message against known error patterns to determine category
   */
  private matchErrorCategory(
    errorMessage: string,
    stackTrace?: string
  ): ErrorCategory {
    const combined = `${errorMessage} ${stackTrace || ''}`.toLowerCase();

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
   * Generate normalized error pattern for matching similar errors
   * 
   * Normalizes the error message by:
   * - Removing variable parts (numbers, file paths, etc.)
   * - Normalizing whitespace
   * - Truncating to reasonable length
   */
  private generateErrorPattern(
    errorMessage: string,
    category: ErrorCategory
  ): string {
    const normalized = this.normalizeErrorMessage(errorMessage);
    const firstLine = normalized.split('\n')[0].trim();
    
    // Limit pattern length to 200 characters
    const pattern = firstLine.length > 200 
      ? firstLine.substring(0, 197) + '...'
      : firstLine;
    
    return `${category}: ${pattern}`;
  }

  /**
   * Generate deterministic fingerprint for error deduplication
   * 
   * Uses SHA-256 hash of normalized error message and stack trace
   * to create a unique identifier for similar errors.
   */
  private generateFingerprint(
    errorMessage: string,
    stackTrace?: string
  ): string {
    const normalized = this.normalizeErrorMessage(errorMessage);
    const normalizedStackTrace = stackTrace 
      ? this.normalizeErrorMessage(stackTrace)
      : '';
    
    const combined = `${normalized}\n${normalizedStackTrace}`;
    const hash = createHash('sha256');
    hash.update(combined);
    
    return hash.digest('hex').substring(0, 16); // Use first 16 chars for readability
  }

  /**
   * Determine error severity based on category and error message
   */
  private determineSeverity(
    category: ErrorCategory,
    errorMessage: string
  ): ErrorSeverity {
    // Find severity from pattern configuration
    const errorTypeConfig = ERROR_TYPE_PATTERNS.find(
      e => e.category === category
    );
    
    if (errorTypeConfig) {
      return errorTypeConfig.severity;
    }

    // Default severity based on category
    const defaultSeverities: Record<ErrorCategory, ErrorSeverity> = {
      timeout: 'high',
      network: 'high',
      assertion: 'medium',
      database: 'high',
      environment: 'medium',
      memory: 'critical',
      'type-error': 'medium',
      permission: 'high',
      'not-found': 'medium',
      syntax: 'medium',
      playwright: 'medium',
      other: 'low',
    };

    return defaultSeverities[category] || 'low';
  }

  /**
   * Normalize error message by removing variable parts
   * 
   * - Replaces numbers with 'N'
   * - Removes quotes
   * - Normalizes whitespace
   * - Removes file paths and line numbers
   */
  private normalizeErrorMessage(errorMessage: string): string {
    return errorMessage
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/['"]/g, '') // Remove quotes
      .replace(/\/[^\s]+/g, '/PATH') // Replace file paths
      .replace(/:\d+:\d+/g, ':N:N') // Replace line:column numbers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Match error message against a specific error pattern
   * 
   * @param errorMessage - The error message to match
   * @returns The matched category or null if no match
   */
  matchErrorPattern(errorMessage: string): ErrorCategory | null {
    const category = this.matchErrorCategory(errorMessage);
    return category !== 'other' ? category : null;
  }
}
