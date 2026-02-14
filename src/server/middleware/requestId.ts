import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { requestContext, bindLogger } from '../utils/logger.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to generate and attach request ID to each request
 * Also sets up async context for logging
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or use existing request ID
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  
  // Set request ID in response header
  res.setHeader('X-Request-ID', requestId);

  // Extract user ID from request if authenticated
  const userId = req.user?.userId;

  // Create request context
  const context: Record<string, unknown> = {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
  };

  if (userId) {
    context.userId = userId;
  }

  // Run request in async context
  requestContext.run(context, () => {
    // Log request start
    logger.info({
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    }, 'Incoming request');

    // Attach logger to request for use in route handlers
    // Type assertion needed because Express Request doesn't include logger by default
    (req as Request & { logger?: ReturnType<typeof bindLogger> }).logger = bindLogger(context);
    
    next();
  });
}

