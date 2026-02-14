/**
 * Error Sanitization Utility
 * 
 * Sanitizes error messages to prevent information disclosure in production
 * while maintaining detailed error logging server-side for debugging.
 */

/**
 * Check if we're in development mode
 * This is checked at runtime to allow tests to override NODE_ENV
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Patterns that indicate sensitive information in error messages
 */
const SENSITIVE_PATTERNS = [
  // File paths
  /\/[^\s]+/g,
  // Windows paths
  /[A-Z]:\\[^\s]+/g,
  // Database connection strings
  /mongodb:\/\/[^\s]+/gi,
  /mongodb\+srv:\/\/[^\s]+/gi,
  // Internal IDs (MongoDB ObjectIds, etc.)
  /\b[0-9a-f]{24}\b/gi,
  // Stack traces (should be handled separately)
  /at\s+[^\s]+\s+\([^)]+\)/g,
  // Environment variables
  /\$\{[A-Z_]+}/g,
  // Process IDs
  /pid:\s*\d+/gi,
  // Port numbers in error context
  /port\s+\d+/gi,
];

/**
 * Sanitize an error message for client-facing responses
 * 
 * @param errorMessage - The original error message
 * @param error - The error object (for additional context)
 * @returns Sanitized error message safe for client exposure
 */
export function sanitizeErrorMessage(errorMessage: string, _error?: Error): string {
  if (isDevelopment()) {
    // In development, return full error message for debugging
    return errorMessage;
  }

  // Security: Limit input length to prevent ReDoS attacks
  const MAX_INPUT_LENGTH = 10000;
  if (errorMessage.length > MAX_INPUT_LENGTH) {
    errorMessage = errorMessage.substring(0, MAX_INPUT_LENGTH) + '...[truncated]';
  }

  let sanitized = errorMessage;

  // Remove sensitive patterns with safer regex that avoids catastrophic backtracking
  // Use more specific patterns and limit iterations
  for (const pattern of SENSITIVE_PATTERNS) {
    // Apply regex with timeout protection by limiting string length
    try {
      // Create a non-global version for single replacement to avoid ReDoS
      const singlePattern = new RegExp(pattern.source.replace(/g$/, ''), pattern.flags.replace('g', ''));
      sanitized = sanitized.replace(singlePattern, '[redacted]');
    } catch {
      // If regex fails, skip this pattern
      continue;
    }
  }

  // Remove common sensitive keywords with their values (using safer patterns)
  // Limit match length to prevent ReDoS
  sanitized = sanitized.replace(/password[:\s=]+[^\s]{0,100}/gi, 'password: [redacted]');
  sanitized = sanitized.replace(/token[:\s=]+[^\s]{0,100}/gi, 'token: [redacted]');
  sanitized = sanitized.replace(/api[_-]?key[:\s=]+[^\s]{0,100}/gi, 'api_key: [redacted]');
  sanitized = sanitized.replace(/secret[:\s=]+[^\s]{0,100}/gi, 'secret: [redacted]');
  
  // Remove API keys that start with common prefixes (sk-, pk-, etc.)
  // Match keys with at least 10 characters after the prefix to avoid false positives
  sanitized = sanitized.replace(/\b(sk|pk|ak|tk)-[a-zA-Z0-9]{10,}\b/gi, '[redacted]');
  
  // Remove SQL queries (SELECT, INSERT, UPDATE, DELETE statements)
  // Split into specific patterns to avoid over-matching common English words like "create", "update"

  // 1. DDL commands (CREATE, DROP, ALTER) - usually followed by object type
  // Only match if followed by TABLE, INDEX, VIEW, DATABASE, USER, ROLE, PROCEDURE, FUNCTION, TRIGGER, SCHEMA
  sanitized = sanitized.replace(/\b(CREATE|DROP|ALTER)\s+(TABLE|INDEX|VIEW|DATABASE|USER|ROLE|PROCEDURE|FUNCTION|TRIGGER|SCHEMA)\b[^;]{0,500}/gi, '[SQL query redacted]');

  // 2. DML commands (INSERT, DELETE)
  // INSERT usually followed by INTO
  sanitized = sanitized.replace(/\bINSERT\s+INTO\b[^;]{0,500}/gi, '[SQL query redacted]');
  // DELETE usually followed by FROM
  sanitized = sanitized.replace(/\bDELETE\s+FROM\b[^;]{0,500}/gi, '[SQL query redacted]');

  // 3. SELECT - usually followed by columns and FROM
  // We look for SELECT ... FROM structure within reasonable distance
  // Use [\s\S] to match across newlines
  sanitized = sanitized.replace(/\bSELECT\s+[\s\S]+?\s+FROM\b[^;]{0,500}/gi, '[SQL query redacted]');

  // 4. UPDATE - followed by table name and SET
  // We look for UPDATE ... SET structure
  // Use [\s\S] to match across newlines
  sanitized = sanitized.replace(/\bUPDATE\s+[\s\S]+?\s+SET\b[^;]{0,500}/gi, '[SQL query redacted]');

  // Remove stack trace references (limit line length)
  sanitized = sanitized.replace(/at\s+.{0,200}/g, '');
  sanitized = sanitized.replace(/Error:\s*/g, '');

  // Clean up multiple spaces and newlines
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // If message is empty or too generic after sanitization, provide a user-friendly message
  if (!sanitized || sanitized.trim().length < 10) {
    return 'An error occurred while processing your request. Please try again or contact support if the problem persists.';
  }

  // If the sanitized message is only "[redacted]" or contains too many redactions, provide a generic message
  if (sanitized.trim() === '[redacted]' || (sanitized.includes('[redacted]') && sanitized.split('[redacted]').length > 2)) {
    return 'An error occurred while processing your request. Please try again or contact support if the problem persists.';
  }

  return sanitized;
}

/**
 * Get a user-friendly error message based on error type
 * 
 * @param error - The error object
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: Error): string {
  // Handle known error types with user-friendly messages
  if (error.name === 'MongoServerError') {
    return 'A database error occurred. Please try again.';
  }

  if (error.name === 'ValidationError' || error.name === 'BadRequestError') {
    return error.message || 'Invalid input provided. Please check your data and try again.';
  }

  if (error.name === 'AuthenticationError') {
    return 'Authentication failed. Please check your credentials and try again.';
  }

  if (error.name === 'AuthorizationError') {
    return 'You do not have permission to perform this action.';
  }

  if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
    return 'The request timed out. Please try again.';
  }

  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    // Provide actionable troubleshooting steps for connection refused errors
    // This helps link connection failures to startup issues (missing exports, database failures, etc.)
    if (isDevelopment()) {
      return 'Backend connection refused. The backend server may not be running or may have failed to start.\n' +
        'Troubleshooting steps:\n' +
        '1. Check backend logs: docker logs beleidsscan-backend (if using Docker) or check server console\n' +
        '2. Verify backend is healthy: docker ps | grep backend (if using Docker) or check process status\n' +
        '3. Common causes: missing exports, database connection failures, startup validation errors\n' +
        '4. Check health endpoint: curl http://localhost:4000/health\n' +
        '5. Review startup logs for missing export errors or database connection issues';
    }
    return 'Unable to connect to the service. The backend server may not be running or may have failed to start. Please check server logs or contact support.';
  }

  // Handle socket hang up errors (connection closed unexpectedly)
  if (error.message.includes('socket hang up') || 
      error.message.includes('ECONNRESET') || 
      error.message.includes('socket hangup')) {
    return 'The connection was closed unexpectedly. Please try again.';
  }

  // Default user-friendly message
  return 'An error occurred while processing your request. Please try again or contact support if the problem persists.';
}

/**
 * Sanitize error for client response
 * 
 * @param error - The error object
 * @param includeDetails - Whether to include sanitized details (default: false in production)
 * @returns Sanitized error response object
 */
export function sanitizeErrorForResponse(
  error: Error,
  includeDetails: boolean = isDevelopment()
): { error: string; message: string; details?: string } {
  const userFriendlyMessage = getUserFriendlyErrorMessage(error);
  const sanitizedMessage = sanitizeErrorMessage(error.message, error);

  const response: { error: string; message: string; details?: string } = {
    error: error.name || 'Error',
    message: includeDetails ? sanitizedMessage : userFriendlyMessage,
  };

  // Only include sanitized details in development or if explicitly requested
  if (includeDetails && sanitizedMessage !== userFriendlyMessage) {
    response.details = sanitizedMessage;
  }

  return response;
}

/**
 * Sanitize text to remove secrets and sensitive information without aggressive truncation
 * or removal of non-sensitive context (like file paths or stack traces).
 * Useful for logging streams or raw output.
 *
 * @param text - The text to sanitize
 * @returns Sanitized text with secrets redacted
 */
export function sanitizeSecrets(text: string): string {
  if (!text) return text;
  let sanitized = text;

  // MongoDB connection strings
  sanitized = sanitized.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, 'mongodb://[REDACTED]');

  // Generic URL credentials (protocol://user:pass@host)
  sanitized = sanitized.replace(/([a-z]+:\/\/[^:\s]+):[^\s]+@/gi, '$1:[REDACTED]@');

  // Common secret keys (key=value or key: value)
  // key followed by = or : or space, then value (alphanumeric, dash, underscore, min 8 chars)
  // Use regex that matches common credential patterns but avoids false positives
  sanitized = sanitized.replace(/\b(password|token|key|secret|auth|access_token|refresh_token|api_key|client_secret|client_id)(\s*[:=]+\s*)([^\s]{8,})/gi, '$1$2[REDACTED]');

  // API Keys with common prefixes (sk-, pk-, etc.)
  sanitized = sanitized.replace(/\b(sk|pk|ak|tk)-[a-zA-Z0-9]{10,}\b/gi, '[REDACTED]');

  return sanitized;
}
