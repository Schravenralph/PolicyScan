/**
 * Route Error Handler Utility
 * 
 * Provides standardized error handling utilities for Express routes
 * to reduce code duplication and ensure consistent error responses.
 */

import { Request, Response } from 'express';
import { logger } from './logger.js';
import { sanitizeErrorForResponse } from './errorSanitizer.js';
import { ObjectId } from 'mongodb';

/**
 * Standard error response format
 */
export interface StandardErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Handle errors in route handlers with standardized response
 * 
 * @param error - The error object
 * @param req - Express request object
 * @param res - Express response object
 * @param context - Additional context for logging (e.g., { queryId, userId })
 * @param defaultMessage - Default error message if error message is not available
 */
export function handleRouteError(
  error: unknown,
  req: Request,
  res: Response,
  context?: Record<string, unknown>,
  defaultMessage: string = 'An error occurred while processing your request'
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Log error with context
  logger.error({
    error: err,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ...context,
  }, 'Route error');

  // Sanitize error for client
  const sanitized = sanitizeErrorForResponse(
    err,
    process.env.NODE_ENV === 'development'
  );

  // Determine status code based on error type
  // Check for AppError types first (BadRequestError, NotFoundError, etc.)
  let statusCode = 500;
  if ('statusCode' in err && typeof err.statusCode === 'number') {
    // AppError types have statusCode property
    statusCode = err.statusCode;
  } else if (err.name === 'ValidationError' || err.name === 'BadRequestError') {
    statusCode = 400;
  } else if (err.name === 'AuthenticationError') {
    statusCode = 401;
  } else if (err.name === 'AuthorizationError') {
    statusCode = 403;
  } else if (err.message.includes('not found') || err.message.includes('Not Found')) {
    statusCode = 404;
  }

  const response: StandardErrorResponse = {
    error: sanitized.error,
    message: sanitized.message || defaultMessage,
  };

  // Include details in development
  if (process.env.NODE_ENV === 'development' && sanitized.details) {
    response.details = sanitized.details;
  }

  res.status(statusCode).json(response);
}

/**
 * Validate MongoDB ObjectId and return error response if invalid
 * 
 * @param id - The ID to validate
 * @param res - Express response object
 * @param fieldName - Name of the field being validated (for error message)
 * @returns true if valid, false if invalid (response already sent)
 */
export function validateObjectId(
  id: string,
  res: Response,
  fieldName: string = 'ID'
): boolean {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({
      error: 'Validation Error',
      message: `Invalid ${fieldName} format`,
    });
    return false;
  }
  return true;
}

/**
 * Handle async route handler with standardized error handling
 * 
 * Usage:
 * ```typescript
 * router.get('/endpoint', asyncRouteHandler(async (req, res) => {
 *   // Route logic here
 *   const result = await someOperation();
 *   res.json(result);
 * }));
 * ```
 * 
 * @param handler - The async route handler function
 * @returns Express route handler with error handling
 */
export function asyncRouteHandler(
  handler: (req: Request, res: Response) => Promise<void>
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      handleRouteError(error, req, res);
    }
  };
}

/**
 * Handle async route handler with context for logging
 * 
 * Usage:
 * ```typescript
 * router.get('/endpoint/:id', asyncRouteHandlerWithContext(async (req, res) => {
 *   const { id } = req.params;
 *   // Route logic here
 *   const result = await someOperation(id);
 *   res.json(result);
 * }, (req) => ({ itemId: req.params.id })));
 * ```
 * 
 * @param handler - The async route handler function
 * @param getContext - Function to extract context from request
 * @returns Express route handler with error handling
 */
export function asyncRouteHandlerWithContext(
  handler: (req: Request, res: Response) => Promise<void>,
  getContext: (req: Request) => Record<string, unknown> = () => ({})
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      const context = getContext(req);
      handleRouteError(error, req, res, context);
    }
  };
}

