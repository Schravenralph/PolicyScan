/**
 * Error handling utilities for route handlers
 * Provides reusable functions to reduce duplicate error handling code
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import {
  NotFoundError,
  isAppError,
  ErrorCode,
} from '../types/errors.js';

/**
 * Wraps an async route handler to automatically catch errors and pass them to Express error middleware
 * 
 * Usage:
 * ```typescript
 * router.get('/:id', asyncHandler(async (req, res) => {
 *   const data = await service.getData(req.params.id);
 *   res.json(data);
 * }));
 * ```
 * 
 * Instead of:
 * ```typescript
 * router.get('/:id', async (req, res, next) => {
 *   try {
 *     const data = await service.getData(req.params.id);
 *     res.json(data);
 *   } catch (error) {
 *     next(error);
 *   }
 * });
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Helper to throw NotFoundError if resource is null/undefined
 * 
 * Usage:
 * ```typescript
 * const query = await queryService.getQueryById(id);
 * throwIfNotFound(query, 'Query', id);
 * res.json(query);
 * ```
 */
export function throwIfNotFound<T>(
  resource: T | null | undefined,
  resourceName: string,
  identifier?: string
): asserts resource is T {
  if (!resource) {
    throw new NotFoundError(resourceName, identifier);
  }
}

/**
 * Helper to create a standardized 404 response
 * Note: Prefer throwing NotFoundError and using asyncHandler instead
 * 
 * @deprecated Use throwIfNotFound() with asyncHandler() instead
 */
export function sendNotFound(res: Response, resource: string, identifier?: string): void {
  res.status(404).json({
    error: 'Not Found',
    code: ErrorCode.NOT_FOUND,
    message: identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Helper to create a standardized 400 Bad Request response
 * Note: Prefer throwing BadRequestError and using asyncHandler instead
 * 
 * @deprecated Use throw new BadRequestError() with asyncHandler() instead
 */
export function sendBadRequest(res: Response, message: string, context?: Record<string, unknown>): void {
  res.status(400).json({
    error: 'Bad Request',
    code: ErrorCode.BAD_REQUEST,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { context }),
  });
}

/**
 * Helper to create a standardized 500 Internal Server Error response
 * Note: Prefer letting errors bubble up to error middleware instead
 * 
 * @deprecated Use asyncHandler() and let errors bubble up to error middleware
 */
export function sendInternalError(
  res: Response,
  message: string = 'Internal server error',
  error?: unknown
): void {
  if (error) {
    logger.error({ error }, message);
  }
  res.status(500).json({
    error: 'Internal Server Error',
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Helper to create a standardized 503 Service Unavailable response
 * Note: Prefer throwing ServiceUnavailableError and using asyncHandler instead
 * 
 * @deprecated Use throw new ServiceUnavailableError() with asyncHandler() instead
 */
export function sendServiceUnavailable(
  res: Response,
  message: string = 'Service temporarily unavailable',
  context?: Record<string, unknown>
): void {
  res.status(503).json({
    error: 'Service Unavailable',
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { context }),
  });
}

/**
 * Logs an error with context information
 * This is automatically done by the error middleware, but can be used
 * for additional logging in specific scenarios
 */
export function logError(error: unknown, context: Record<string, unknown> = {}): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error(
    {
      error,
      message: errorMessage,
      stack: errorStack,
      ...context,
    },
    'Error occurred'
  );
}

/**
 * Checks if an error is a known operational error that should be handled gracefully
 */
export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}

/**
 * Creates a standardized error response object (for use in routes that can't use asyncHandler)
 * Note: Prefer using asyncHandler() and throwing AppError instances instead
 * 
 * @deprecated Use asyncHandler() and throw AppError instances instead
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = 'An error occurred',
  defaultStatusCode: number = 500
): { statusCode: number; body: Record<string, unknown> } {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.name,
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        ...(error.context && { context: error.context }),
      },
    };
  }

  const message = error instanceof Error ? error.message : defaultMessage;
  return {
    statusCode: defaultStatusCode,
    body: {
      error: 'Internal Server Error',
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message,
      timestamp: new Date().toISOString(),
    },
  };
}














