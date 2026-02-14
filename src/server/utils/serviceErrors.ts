/**
 * Service Error Types
 * 
 * Standardized error types for external service interactions.
 * Provides clear error messages and structured error information.
 */

/**
 * Error thrown when a service is not properly configured
 */
export class ServiceConfigurationError extends Error {
  constructor(
    public serviceName: string,
    public missingConfig: string[]
  ) {
    super(`${serviceName} not configured. Missing: ${missingConfig.join(', ')}`);
    this.name = 'ServiceConfigurationError';
  }
}

/**
 * Error thrown when a service connection fails
 */
export class ServiceConnectionError extends Error {
  constructor(
    public serviceName: string,
    public statusCode: number | undefined,
    message: string
  ) {
    super(`${serviceName} connection failed${statusCode ? ` (HTTP ${statusCode})` : ''}: ${message}`);
    this.name = 'ServiceConnectionError';
  }
}

/**
 * Error thrown when a service rate limit is exceeded
 */
export class ServiceRateLimitError extends Error {
  constructor(
    public serviceName: string,
    public retryAfterSeconds?: number
  ) {
    super(`${serviceName} rate limit exceeded${retryAfterSeconds ? `. Retry after ${retryAfterSeconds}s` : ''}`);
    this.name = 'ServiceRateLimitError';
  }
}
