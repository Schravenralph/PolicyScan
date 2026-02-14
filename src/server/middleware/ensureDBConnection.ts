import { Request, Response, NextFunction } from 'express';
import { ensureDBConnection } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

/**
 * Middleware to ensure MongoDB connection is active before processing the request
 * 
 * This middleware ensures that the database connection is active before the route handler
 * executes. If the connection is lost, it will attempt to reconnect automatically.
 * 
 * Use this middleware for routes that require database access to prevent operations
 * from failing due to connection loss.
 * 
 * @example
 * ```typescript
 * router.get('/api/data', ensureDBConnectionMiddleware, async (req, res) => {
 *   const db = getDB(); // Connection is guaranteed to be active
 *   // ... database operations
 * });
 * ```
 */
export function ensureDBConnectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use void to explicitly ignore the promise (non-blocking)
  // The middleware will call next() immediately, but operations will fail
  // if connection is not ready. For truly blocking behavior, use async middleware.
  ensureDBConnection()
    .then(() => {
      next();
    })
    .catch((error) => {
      logger.error(
        { error, path: req.path, method: req.method },
        'Database connection not available for request'
      );
      handleRouteError(
        new Error('Database connection unavailable. Please try again later.'),
        req,
        res,
        { context: 'ensureDBConnectionMiddleware' },
        'Database connection unavailable'
      );
    });
}

/**
 * Async middleware version that blocks until connection is ready
 * 
 * This version waits for the connection to be established before proceeding.
 * Use this for critical routes where you want to guarantee connection before processing.
 * 
 * @example
 * ```typescript
 * router.get('/api/critical', ensureDBConnectionAsync, async (req, res) => {
 *   const db = getDB(); // Connection is guaranteed to be active
 *   // ... database operations
 * });
 * ```
 */
export async function ensureDBConnectionAsync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDBConnection();
    next();
  } catch (error) {
    logger.error(
      { error, path: req.path, method: req.method },
      'Database connection not available for request'
    );
    handleRouteError(
      new Error('Database connection unavailable. Please try again later.'),
      req,
      res,
      { context: 'ensureDBConnectionAsync' },
      'Database connection unavailable'
    );
  }
}






