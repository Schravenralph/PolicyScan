import { MongoError, MongoServerError, MongoNetworkError } from 'mongodb';
import { logger } from './logger.js';
import { queryPerformanceMonitoring } from '../services/monitoring/QueryPerformanceMonitoringService.js';

/**
 * Custom error classes for database operations
 */
export class DatabaseValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'DatabaseValidationError';
  }
}

export class DatabaseConnectionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseQueryError extends Error {
  constructor(message: string, public readonly originalError?: Error, public readonly code?: number) {
    super(message);
    this.name = 'DatabaseQueryError';
  }
}

export class DatabaseNotFoundError extends Error {
  constructor(message: string, public readonly resource?: string) {
    super(message);
    this.name = 'DatabaseNotFoundError';
  }
}

/**
 * Error type classification
 */
export type DatabaseErrorType = 
  | 'validation'
  | 'connection'
  | 'query'
  | 'not_found'
  | 'duplicate'
  | 'unknown';

/**
 * Classify MongoDB error type
 */
export function classifyDatabaseError(error: unknown): {
  type: DatabaseErrorType;
  message: string;
  code?: number;
  isTransient: boolean;
} {
  if (!(error instanceof Error)) {
    return {
      type: 'unknown',
      message: 'An unknown error occurred',
      isTransient: false,
    };
  }

  // MongoDB duplicate key error (E11000)
  if (error instanceof MongoServerError && error.code === 11000) {
    return {
      type: 'duplicate',
      message: 'A record with this value already exists',
        code: typeof error.code === 'number' ? error.code : undefined,
      isTransient: false,
    };
  }

  // MongoDB network errors
  if (error instanceof MongoNetworkError) {
    return {
      type: 'connection',
      message: 'Database connection error occurred',
        code: typeof error.code === 'number' ? error.code : undefined,
      isTransient: true,
    };
  }

  // MongoDB server errors
  if (error instanceof MongoServerError) {
    // Validation errors (e.g., invalid ObjectId)
    if (error.code === 2 || error.message.includes('validation')) {
      return {
        type: 'validation',
        message: 'Invalid data provided',
        code: typeof error.code === 'number' ? error.code : undefined,
        isTransient: false,
      };
    }

    // Not found errors
    if (error.code === 26 || error.message.includes('not found')) {
      return {
        type: 'not_found',
        message: 'Resource not found',
        code: typeof error.code === 'number' ? error.code : undefined,
        isTransient: false,
      };
    }

    return {
      type: 'query',
      message: 'Database query error occurred',
      code: typeof error.code === 'number' ? error.code : undefined,
      isTransient: false,
    };
  }

  // Generic MongoDB errors
  if (error instanceof MongoError) {
    // Transient error codes
    const transientCodes = [6, 7, 89, 91, 11600, 11602];
    const isTransient = typeof error.code === 'number' && transientCodes.includes(error.code);

    return {
      type: 'connection',
      message: 'Database operation failed',
      code: typeof error.code === 'number' ? error.code : undefined,
      isTransient,
    };
  }

  // Check for connection-related error messages
  const errorMessage = error.message.toLowerCase();
  if (
    errorMessage.includes('connection') ||
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound')
  ) {
    return {
      type: 'connection',
      message: 'Database connection error occurred',
      isTransient: true,
    };
  }

  // Check for validation-related error messages
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return {
      type: 'validation',
      message: 'Invalid data provided',
      isTransient: false,
    };
  }

  return {
    type: 'unknown',
    message: 'An unexpected error occurred',
    isTransient: false,
  };
}

/**
 * Sanitize error message for logging and user display
 * Removes sensitive information like connection strings, credentials, etc.
 */
export function sanitizeErrorMessage(error: unknown, context?: string): string {
  if (!(error instanceof Error)) {
    return 'An unknown error occurred';
  }

  let message = error.message;

  // Remove connection strings
  message = message.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, 'mongodb://***');

  // Remove credentials
  message = message.replace(/:\/\/[^:]+:[^@]+@/g, '://***:***@');

  // Remove file paths (keep only filename)
  message = message.replace(/\/[^\s]+\.(ts|js|json)/g, (match) => {
    const parts = match.split('/');
    return parts[parts.length - 1];
  });

  // Add context if provided
  if (context) {
    return `${context}: ${message}`;
  }

  return message;
}

/**
 * Check if a database error is retryable (transient connection error)
 */
function isRetryableDatabaseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  
  // Retry on transient connection errors
  const retryablePatterns = [
    'connection',
    'timeout',
    'network',
    'econnreset',
    'etimedout',
    'econnrefused',
    'socket',
    'pool',
    'topology',
    'server selection',
    'not connected',
  ];
  
  // Check error message
  if (retryablePatterns.some(pattern => errorMessage.includes(pattern))) {
    return true;
  }
  
  // Check error name
  if (retryablePatterns.some(pattern => errorName.includes(pattern))) {
    return true;
  }
  
  // Check for MongoDB-specific connection errors
  if (error instanceof MongoServerError) {
    // Retry on network errors and timeouts
    if (error.code === 6 || error.code === 50 || error.code === 89) {
      return true;
    }
  }
  
  return false;
}

/**
 * Wrap database operation with error handling and retry logic for transient failures
 * 
 * @param operation - The database operation to execute
 * @param context - Context information for logging (e.g., 'Query.findById')
 * @param retryConfig - Optional retry configuration (default: 2 retries for transient errors)
 * @returns The result of the operation
 * @throws DatabaseValidationError | DatabaseConnectionError | DatabaseQueryError | DatabaseNotFoundError
 */
/**
 * Default slow query threshold in milliseconds
 * Queries exceeding this threshold will be logged as slow queries
 */
const DEFAULT_SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS || '1000',
  10
); // Default: 1 second

export async function handleDatabaseOperation<T>(
  operation: () => Promise<T>,
  context?: string,
  retryConfig?: { maxRetries?: number; retryDelay?: number; slowQueryThresholdMs?: number }
): Promise<T> {
  const maxRetries = retryConfig?.maxRetries ?? 2; // Default: 2 retries (3 total attempts)
  const retryDelay = retryConfig?.retryDelay ?? 1000; // Default: 1 second delay
  const slowQueryThreshold = retryConfig?.slowQueryThresholdMs ?? DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;
      
      // Record query performance metrics
      const operationName = context || 'unknown';
      try {
        queryPerformanceMonitoring.recordQuery(operationName, duration, context);
      } catch (error) {
        // Don't fail if monitoring service is unavailable
        logger.debug({ error }, 'Failed to record query performance metrics');
      }
      
      // Track slow queries for performance monitoring
      if (duration > slowQueryThreshold) {
        logger.warn(
          {
            duration,
            threshold: slowQueryThreshold,
            context,
            attempt: attempt + 1,
          },
          `Slow database query detected: ${duration}ms (threshold: ${slowQueryThreshold}ms) - ${context || 'operation'}`
        );
      } else if (process.env.VERBOSE_QUERY_MONITORING === 'true') {
        // Log all queries in verbose mode for debugging
        logger.debug(
          {
            duration,
            context,
            attempt: attempt + 1,
          },
          `Database query completed: ${duration}ms - ${context || 'operation'}`
        );
      }
      
      return result;
    } catch (error) {
      lastError = error;
      const classification = classifyDatabaseError(error);
      
      // Check if error is retryable and we haven't exhausted retries
      const isRetryable = isRetryableDatabaseError(error) && attempt < maxRetries;
      
      if (isRetryable) {
        // Log retry attempt
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            classification,
            context,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
          },
          `Database operation failed with retryable error, retrying... (${context || 'operation'})`
        );
        
        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-retryable error or max retries reached - handle error normally
      const sanitizedMessage = sanitizeErrorMessage(error, context);

      // Log the error with full details (for debugging)
      logger.error(
        {
          error: error instanceof Error ? error : new Error(String(error)),
          classification,
          context,
          code: classification.code,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
        },
        attempt >= maxRetries 
          ? `Database operation failed after ${maxRetries + 1} attempts`
          : 'Database operation failed'
      );

      // Throw appropriate error type
      switch (classification.type) {
        case 'validation':
          throw new DatabaseValidationError(
            classification.message,
            error instanceof MongoServerError ? 'data' : undefined
          );

        case 'connection':
          throw new DatabaseConnectionError(
            classification.message,
            error instanceof Error ? error : undefined
          );

        case 'not_found':
          throw new DatabaseNotFoundError(classification.message);

        case 'duplicate':
          throw new DatabaseValidationError(
            classification.message,
            error instanceof MongoServerError ? 'duplicate_key' : undefined
          );

        case 'query':
        default:
          throw new DatabaseQueryError(
            sanitizedMessage,
            error instanceof Error ? error : undefined,
            classification.code
          );
      }
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError;
}

/**
 * Check if an error is a database error
 */
export function isDatabaseError(error: unknown): boolean {
  return (
    error instanceof DatabaseValidationError ||
    error instanceof DatabaseConnectionError ||
    error instanceof DatabaseQueryError ||
    error instanceof DatabaseNotFoundError ||
    error instanceof MongoError
  );
}

/**
 * Check if an error is transient and should be retried
 */
export function isTransientDatabaseError(error: unknown): boolean {
  const classification = classifyDatabaseError(error);
  return classification.isTransient;
}

