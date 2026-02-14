/**
 * Shared constants used across client and server
 *
 * These constants are safe to use in both environments.
 */
/**
 * HTTP Status Codes
 * Standard HTTP status codes for consistent use across the application
 */
export const HTTP_STATUS = {
  // Success
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  // Client Error
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  // Server Error
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Pagination Defaults
 * Default values for pagination across the application
 */
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 1000,
  MIN_LIMIT: 1,
} as const;

/**
 * Common Timeouts (in milliseconds)
 * Standard timeout values for various operations
 */
export const TIMEOUTS = {
  SHORT: 5000, // 5 seconds
  MEDIUM: 30000, // 30 seconds
  LONG: 60000, // 1 minute
  VERY_LONG: 300000, // 5 minutes
  HTTP_REQUEST: 30000, // 30 seconds for HTTP requests
  EMBEDDING_INITIALIZATION: 60000, // 1 minute for embedding provider initialization
} as const;

/**
 * Common Delays (in milliseconds)
 * Standard delay values for retries, polling, etc.
 */
export const DELAYS = {
  SHORT: 100, // 100ms
  MEDIUM: 500, // 500ms
  LONG: 1000, // 1 second
  VERY_LONG: 5000, // 5 seconds
} as const;

/**
 * Retry Configuration
 * Default retry values for operations
 */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 30000, // 30 seconds
} as const;

/**
 * Common String Constants
 * Frequently used string values
 */
export const STRINGS = {
  EMPTY: '',
  SPACE: ' ',
  COMMA: ',',
  SEMICOLON: ';',
  COLON: ':',
  DASH: '-',
  UNDERSCORE: '_',
} as const;

/**
 * Common Error Messages
 * Standard error messages for consistency
 */
export const ERROR_MESSAGES = {
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  BAD_REQUEST: 'Bad request',
  INTERNAL_ERROR: 'Internal server error',
  VALIDATION_FAILED: 'Validation failed',
} as const;
