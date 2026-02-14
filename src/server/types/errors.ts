/**
 * Centralized error type definitions for Beleidsscan
 * Provides a consistent error hierarchy and error codes
 */

import { AuthenticationError, AuthorizationError, ValidationError } from '../services/auth/AuthService.js';

// Re-export auth errors for convenience
export { AuthenticationError, AuthorizationError, ValidationError };

/**
 * Base error class for all application errors
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Domain-specific error types
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, additionalContext?: Record<string, unknown>) {
    // Use custom message from additionalContext if provided, otherwise use default format
    const customMessage = additionalContext?.message as string | undefined;
    const message = customMessage 
      ? customMessage
      : (identifier ? `${resource} with identifier '${identifier}' not found` : `${resource} not found`);
    
    super(
      message,
      'NOT_FOUND',
      404,
      true,
      { resource, identifier, ...additionalContext }
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, context);
  }
}

export class RevisionConflictError extends ConflictError {
  constructor(message: string = 'Document modified by another process', context?: Record<string, unknown>) {
    super(message, context);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BAD_REQUEST', 400, true, context);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'UNPROCESSABLE_ENTITY', 422, true, context);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', context?: Record<string, unknown>) {
    super(message, 'SERVICE_UNAVAILABLE', 503, true, context);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, false, context);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, context?: Record<string, unknown>) {
    super(
      `External service error (${service}): ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      true,
      { service, ...context }
    );
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfterOrContext?: number | Record<string, unknown>) {
    const context = typeof retryAfterOrContext === 'number' 
      ? { retryAfter: retryAfterOrContext }
      : retryAfterOrContext;
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, context);
  }
}

export class RequestTimeoutError extends AppError {
  constructor(message: string = 'Request timeout', context?: Record<string, unknown>) {
    super(message, 'REQUEST_TIMEOUT', 408, true, context);
  }
}

// Alias for backward compatibility
export const TooManyRequestsError = RateLimitError;

/**
 * Error code enumeration for consistent error handling
 */
export enum ErrorCode {
  // Authentication & Authorization
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * Standardized error response format
 */
export interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
  context?: Record<string, unknown>;
  stack?: string; // Only in development
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if error is an operational error
 */
export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}

/**
 * Convert any error to AppError
 */
export function toAppError(error: unknown, defaultMessage: string = 'An unexpected error occurred'): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof AuthenticationError) {
    return new AppError(error.message, ErrorCode.AUTHENTICATION_ERROR, 401, true);
  }

  if (error instanceof AuthorizationError) {
    return new AppError(error.message, ErrorCode.AUTHORIZATION_ERROR, 403, true);
  }

  if (error instanceof ValidationError) {
    return new AppError(error.message, ErrorCode.VALIDATION_ERROR, 400, true);
  }

  if (error instanceof Error) {
    return new AppError(error.message, ErrorCode.INTERNAL_SERVER_ERROR, 500, false);
  }

  return new AppError(defaultMessage, ErrorCode.INTERNAL_SERVER_ERROR, 500, false);
}

