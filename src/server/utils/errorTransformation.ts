/**
 * Error transformation utilities
 * Converts various error types to standardized formats
 */
import type { Request } from 'express';
import {
  isAppError,
  toAppError,
  ErrorCode,
  ConflictError,
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
  RateLimitError,
} from '../types/errors.js';
import { AuthenticationError, AuthorizationError, ValidationError } from '../services/auth/AuthService.js';
import { sanitizeErrorForResponse, sanitizeErrorMessage } from './errorSanitizer.js';

interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  context?: Record<string, unknown>;
  stack?: string;
  runId?: string;
  quota?: Record<string, unknown>;
  [key: string]: unknown; // Allow additional properties
}

interface OpenApiValidationError {
  status: number;
  errors: Array<{
    path: string;
    message: string;
    errorCode?: string;
  }>;
  path?: string;
}

interface MongoError {
  name: string;
  code?: number;
  keyPattern?: Record<string, unknown>;
}

/**
 * Transform error to standardized error response
 */
export function transformErrorToResponse(
  error: unknown,
  req: Request,
  includeStack = false
): ErrorResponse {
  // Extract runId from path for graph stream routes
  const runIdMatch = req.path.match(/^\/api\/graph\/stream\/([^/]+)(?:\/update)?$/);
  const runId = runIdMatch ? runIdMatch[1] : undefined;

  // Check for NotFoundError or ReviewNotFoundError BEFORE converting to AppError to preserve type and message
  if (
    error instanceof NotFoundError ||
    (error instanceof Error && error.name === 'ReviewNotFoundError')
  ) {
    const errorMessage = error instanceof Error ? error.message : 'Not Found';
    const code = error instanceof NotFoundError ? error.code : 'NOT_FOUND';
    return {
      error: errorMessage,
      code: code,
      message: errorMessage,
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
      context: error instanceof NotFoundError ? error.context : undefined,
      ...(includeStack && error instanceof Error && error.stack ? { stack: error.stack } : {}),
      ...(runId && { runId }),
    };
  }

  // Check for RateLimitError BEFORE converting to AppError to preserve type
  if (error instanceof RateLimitError) {
    const errorMessage = error.message || 'Too Many Requests';
    const baseResponse: ErrorResponse = {
      error: errorMessage,
      code: error.code,
      message: errorMessage,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
    };

    // Flatten quota object from context to top level if present
    const finalResponse: ErrorResponse = {
      ...baseResponse,
    };

    if (error.context) {
      // If quota is in context, flatten it to top level
      if (error.context.quota && typeof error.context.quota === 'object') {
        finalResponse.quota = error.context.quota as Record<string, unknown>;
      }
      // Always include full context
      finalResponse.context = error.context;
    }

    return finalResponse;
  }

  const appError = toAppError(error);
  const sanitized = sanitizeErrorForResponse(appError, includeStack);

  // Handle BadRequestError early - check by code to handle module boundary issues
  // Check both the original error and appError to handle module boundary issues
  // toAppError preserves AppError instances, so appError should be BadRequestError if original was
  // IMPORTANT: Check appError.code FIRST since toAppError preserves AppError instances
  // This handles module boundary issues where instanceof might fail
  // Also check error.name as a fallback for module boundary issues
  const isBadRequest =
    (isAppError(appError) && appError.code === 'BAD_REQUEST' && appError.statusCode === 400) ||
    error instanceof BadRequestError ||
    (error instanceof Error && error.constructor.name === 'BadRequestError');

  if (isBadRequest) {
    // Use appError since toAppError preserves AppError instances
    // If original error was BadRequestError, appError is also BadRequestError
    // Prefer appError over original error to handle module boundary issues
    const badRequestError =
      isAppError(appError) && appError.code === 'BAD_REQUEST'
        ? appError
        : error instanceof BadRequestError
          ? error
          : appError;

    // Use the actual error message, not the sanitized one (BadRequestError messages are safe)
    const errorMessage = badRequestError instanceof Error ? badRequestError.message : 'Bad Request';

    // For validation errors, extract the first detailed message from context.details
    // This provides more specific error messages like "Invalid email format" instead of just "Validation failed"
    let finalMessage = errorMessage;
    if (
      isAppError(badRequestError) &&
      badRequestError.context?.details &&
      Array.isArray(badRequestError.context.details) &&
      badRequestError.context.details.length > 0
    ) {
      const firstDetail = badRequestError.context.details[0] as { message?: string };
      if (firstDetail?.message) {
        finalMessage = firstDetail.message;
      }
    } else if (isAppError(badRequestError) && badRequestError.context?.message) {
      // Fallback to context message if available
      finalMessage = badRequestError.context.message as string;
    }

    // Flatten context properties for easier test access (e.g., currentStatus, runId)
    // Keep context object for complex nested structures
    const baseResponse: ErrorResponse = {
      error: finalMessage,
      code: isAppError(badRequestError) ? badRequestError.code : 'BAD_REQUEST',
      message: finalMessage,
      statusCode: isAppError(badRequestError) ? badRequestError.statusCode : 400,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && badRequestError instanceof Error && badRequestError.stack
        ? { stack: badRequestError.stack }
        : {}),
    };

    // Flatten simple context properties (non-object, non-array) to top level
    // This makes it easier for tests to access properties like currentStatus, runId, etc.
    const flattenedProperties: Record<string, unknown> = {};
    if (isAppError(badRequestError) && badRequestError.context) {
      for (const [key, value] of Object.entries(badRequestError.context)) {
        // Only flatten simple values (not objects/arrays/details)
        // Allow strings, numbers, booleans, undefined
        const isSimpleValue =
          value === null ||
          value === undefined ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean';

        if (key !== 'details' && isSimpleValue) {
          flattenedProperties[key] = value;
        }
      }
    }

    // Combine base response with flattened properties
    // Return as plain object to allow additional properties beyond ErrorResponse interface
    const finalResponse: ErrorResponse = {
      ...baseResponse,
      ...flattenedProperties,
    };

    // Always include full context for complex structures
    if (isAppError(badRequestError) && badRequestError.context) {
      finalResponse.context = badRequestError.context;
    }

    return finalResponse;
  }

  // Check for RateLimitError by code after toAppError (in case instanceof didn't work)
  // This handles cases where the error was converted or module boundaries prevent instanceof
  // Use appError since toAppError preserves AppError instances
  if (isAppError(appError) && appError.code === 'RATE_LIMIT_EXCEEDED') {
    const errorMessage = appError.message || 'Too Many Requests';
    const finalResponse: ErrorResponse = {
      error: errorMessage,
      code: appError.code,
      message: errorMessage,
      statusCode: appError.statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && appError.stack ? { stack: appError.stack } : {}),
    };

    // Flatten quota from context if present
    if (appError.context) {
      if (appError.context.quota && typeof appError.context.quota === 'object') {
        finalResponse.quota = appError.context.quota as Record<string, unknown>;
      }
      // Always include full context
      finalResponse.context = appError.context;
    }

    return finalResponse;
  }

  // Handle specific error types
  if (error instanceof AuthenticationError) {
    // For AuthenticationError, use the original error message (it's safe and informative)
    // Don't use sanitized message which might be too generic
    const errorMessage = error.message || 'Authentication failed';
    return {
      error: 'Authentication Error',
      code: ErrorCode.AUTHENTICATION_ERROR,
      message: errorMessage,
      statusCode: 401,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && appError instanceof Error && appError.stack ? { stack: appError.stack } : {}),
    };
  }

  if (error instanceof AuthorizationError) {
    // For AuthorizationError, use the original error message (it's safe and informative)
    // Don't use sanitized message which might be too generic
    const errorMessage = error.message || 'Authorization Error';
    return {
      error: errorMessage,
      code: ErrorCode.AUTHORIZATION_ERROR,
      message: errorMessage,
      statusCode: 403,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && appError instanceof Error && appError.stack ? { stack: appError.stack } : {}),
    };
  }

  if (error instanceof ValidationError) {
    // For ValidationError, use the original error message (it's safe and informative)
    // Don't use sanitized message which might be too generic
    const errorMessage = error.message || 'Validation Error';
    return {
      error: errorMessage,
      code: ErrorCode.VALIDATION_ERROR,
      message: errorMessage,
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && appError instanceof Error && appError.stack ? { stack: appError.stack } : {}),
    };
  }

  // Handle OpenAPI validation errors from express-openapi-validator
  // These errors have status, errors, and path properties
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'errors' in error &&
    Array.isArray((error as OpenApiValidationError).errors)
  ) {
    const openApiError = error as OpenApiValidationError;
    const errorMessages = openApiError.errors.map(e => `${e.path}: ${e.message}`).join('; ');
    const firstError = openApiError.errors[0];
    // Use the first error message as the error property for better test compatibility
    const errorMessage = firstError ? firstError.message : 'OpenAPI Validation Error';
    return {
      error: errorMessage,
      code: ErrorCode.VALIDATION_ERROR,
      message: `Request validation failed: ${errorMessages}`,
      statusCode: openApiError.status || 400,
      timestamp: new Date().toISOString(),
      path: openApiError.path || req.path,
      context: {
        validationErrors: openApiError.errors.map(e => ({
          path: e.path,
          message: e.message,
          ...(e.errorCode && { errorCode: e.errorCode }),
        })),
      },
      ...(includeStack && appError instanceof Error && appError.stack ? { stack: appError.stack } : {}),
    };
  }

  // Handle MongoDB errors
  if (error && typeof error === 'object' && 'name' in error) {
    const mongoError = error as MongoError;
    if (mongoError.name === 'MongoServerError' && mongoError.code === 11000) {
      // Duplicate key error
      const conflictError = new ConflictError('A record with this value already exists', {
        keyPattern: mongoError.keyPattern,
      });
      return {
        error: 'Conflict Error',
        code: ErrorCode.CONFLICT,
        message: conflictError.message,
        statusCode: 409,
        timestamp: new Date().toISOString(),
        path: req.path,
        context: conflictError.context,
      };
    }
    if (mongoError.name === 'MongoServerError' && mongoError.code === 11001) {
      // Duplicate key error (alternative code)
      const conflictError = new ConflictError('A record with this value already exists');
      return {
        error: 'Conflict Error',
        code: ErrorCode.CONFLICT,
        message: conflictError.message,
        statusCode: 409,
        timestamp: new Date().toISOString(),
        path: req.path,
      };
    }
  }

  // Handle JSON parsing errors from Express (SyntaxError)
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return {
      error: 'Invalid JSON',
      code: ErrorCode.BAD_REQUEST,
      message: 'Invalid JSON in request body',
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(includeStack && appError instanceof Error && appError.stack ? { stack: appError.stack } : {}),
    };
  }

  // Handle NotFoundError by code (fallback for module boundary issues)
  // Check by code to handle module boundary issues (similar to BadRequestError)
  // IMPORTANT: Check this BEFORE the general AppError handling to ensure NotFoundError gets proper message
  const isNotFound =
    isAppError(appError) && appError.code === 'NOT_FOUND' && appError.statusCode === 404;

  if (isNotFound) {
    // Use the actual error message, not the sanitized one, to preserve the original message
    const errorMessage = appError.message || 'Not Found';
    return {
      error: errorMessage,
      code: appError.code,
      message: errorMessage,
      statusCode: appError.statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      context: appError.context,
      ...(includeStack && appError.stack ? { stack: appError.stack } : {}),
      ...(runId && { runId }),
    };
  }

  // Handle ServiceUnavailableError - use message as error property for better test compatibility
  if (error instanceof ServiceUnavailableError) {
    // Use the actual error message, not the sanitized one, to preserve the original message
    const errorMessage = error.message || 'Service Unavailable';
    return {
      error: errorMessage,
      code: error.code,
      message: errorMessage,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      context: error.context,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
    };
  }

  // Handle AppError instances (check for RateLimitError by code to handle quota)
  // Use appError since toAppError preserves AppError instances
  if (isAppError(appError)) {
    // Special handling for RateLimitError to flatten quota context
    // Check by code since instanceof might not work across module boundaries
    // Also check statusCode === 429 as an additional safeguard
    if (
      appError.code === 'RATE_LIMIT_EXCEEDED' ||
      (appError.statusCode === 429 && appError.context?.quota)
    ) {
      const errorMessage = appError.message || 'Too Many Requests';
      const finalResponse: ErrorResponse = {
        error: errorMessage,
        code: appError.code,
        message: errorMessage,
        statusCode: appError.statusCode,
        timestamp: new Date().toISOString(),
        path: req.path,
        ...(includeStack && appError.stack ? { stack: appError.stack } : {}),
      };

      // Flatten quota from context if present
      // The quota is added to context in workflowRunRoutes.ts after error creation
      if (appError.context) {
        if (appError.context.quota && typeof appError.context.quota === 'object') {
          finalResponse.quota = appError.context.quota as Record<string, unknown>;
        }
        // Always include full context
        finalResponse.context = appError.context;
      }

      return finalResponse;
    }

    // For all AppError instances, use message for error field if available, otherwise name
    // This ensures NotFoundError and other errors use their message instead of class name
    // Sanitize the error field to prevent sensitive information leakage
    const errorField = appError.message || appError.name;
    const sanitizedErrorField = sanitizeErrorMessage(
      errorField,
      appError instanceof Error ? appError : undefined
    );

    return {
      error: sanitizedErrorField,
      code: appError.code,
      message: sanitized.message,
      statusCode: appError.statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      context: appError.context,
      ...(includeStack && appError.stack ? { stack: appError.stack } : {}),
      ...(runId && { runId }),
    };
  }

  // Default error response
  // For generic errors, sanitize the error message to prevent sensitive information leakage
  const defaultError =
    sanitized instanceof Error ? sanitized : new Error(String(sanitized));
  const originalErrorMessage = defaultError.message || 'Internal Server Error';
  const sanitizedErrorMessage = sanitizeErrorMessage(originalErrorMessage, defaultError);

  return {
    error:
      sanitizedErrorMessage !== originalErrorMessage ? 'Internal Server Error' : sanitizedErrorMessage,
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: sanitized.message,
    statusCode: 500,
    timestamp: new Date().toISOString(),
    path: req.path,
    ...(includeStack && defaultError.stack ? { stack: defaultError.stack } : {}),
    ...(runId && { runId }),
  };
}

/**
 * Extract error code from error
 */
export function getErrorCode(error: unknown): string {
  if (isAppError(error)) {
    return error.code;
  }
  if (error instanceof AuthenticationError) {
    return ErrorCode.AUTHENTICATION_ERROR;
  }
  if (error instanceof AuthorizationError) {
    return ErrorCode.AUTHORIZATION_ERROR;
  }
  if (error instanceof ValidationError) {
    return ErrorCode.VALIDATION_ERROR;
  }

  // Handle OpenAPI validation errors
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'errors' in error
  ) {
    return ErrorCode.VALIDATION_ERROR;
  }

  return ErrorCode.INTERNAL_SERVER_ERROR;
}

/**
 * Extract status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (isAppError(error)) {
    return error.statusCode;
  }
  if (error instanceof AuthenticationError) {
    return 401;
  }
  if (error instanceof AuthorizationError) {
    return 403;
  }
  if (error instanceof ValidationError) {
    return 400;
  }

  // Handle OpenAPI validation errors
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'errors' in error
  ) {
    const openApiError = error as OpenApiValidationError;
    return openApiError.status || 400;
  }

  // Handle MongoDB errors
  if (error && typeof error === 'object' && 'name' in error) {
    const mongoError = error as MongoError;
    if (mongoError.name === 'MongoServerError' && mongoError.code === 11000) {
      return 409; // Conflict
    }
  }

  return 500;
}
