/**
 * Logging Configuration
 * 
 * Centralized configuration for structured logging with Pino.
 * Supports different log levels and formats for development and production.
 */

export interface LoggingConfig {
  level: string;
  isDevelopment: boolean;
  enablePrettyPrint: boolean;
  enableRequestLogging: boolean;
  enableErrorStackTraces: boolean;
  redactSensitiveFields: string[];
}

/**
 * Get logging configuration from environment variables
 */
export function getLoggingConfig(): LoggingConfig {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

  return {
    level: logLevel,
    isDevelopment,
    enablePrettyPrint: isDevelopment && process.env.LOG_PRETTY !== 'false',
    enableRequestLogging: process.env.LOG_REQUESTS !== 'false',
    enableErrorStackTraces: isDevelopment || process.env.LOG_STACK_TRACES === 'true',
    redactSensitiveFields: [
      'password',
      'passwordHash',
      'token',
      'authorization',
      'apiKey',
      'secret',
      'accessToken',
      'refreshToken',
      'email', // Optionally redact email in production
    ],
  };
}

/**
 * Check if a field should be redacted from logs
 */
export function shouldRedactField(fieldName: string, config: LoggingConfig): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return config.redactSensitiveFields.some(
    (redactField) => lowerFieldName.includes(redactField.toLowerCase())
  );
}

/**
 * Sanitize object for logging (remove sensitive fields)
 */
export function sanitizeForLogging(obj: Record<string, unknown>, config: LoggingConfig): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (shouldRedactField(key, config)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>, config);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

